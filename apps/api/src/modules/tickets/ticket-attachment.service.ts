import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import type { Request } from 'express';
import type { ApiEnvironment } from '@webhost-billing/config';
import { Prisma, type PrismaClient } from '@webhost-billing/database';
import {
  TICKET_ATTACHMENT_MAX_BYTES,
  ticketAttachmentSchema,
  type CreateTicketAttachment,
} from '@webhost-billing/shared';
import { API_ENVIRONMENT } from '../../infrastructure/environment/environment.module';
import { PRISMA_CLIENT } from '../../infrastructure/database/database.module';
import { ApplicationException } from '../../common/errors/application.exception';
import type { SecurityRequestContext } from '../../common/http/request-context';
import type { AuthRequestContext } from '../auth/auth.types';
import { TicketService } from './ticket.service';
import {
  normalizeTicketAttachment,
  scanAttachment,
} from './ticket-attachment-content';

@Injectable()
export class TicketAttachmentService {
  private active = 0;
  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient,
    @Inject(API_ENVIRONMENT) private readonly env: ApiEnvironment,
    private readonly tickets: TicketService,
  ) {}

  policy() {
    return {
      enabled: this.env.TICKET_ATTACHMENT_SCANNER !== 'disabled',
      maxBytes: TICKET_ATTACHMENT_MAX_BYTES,
      maxFiles: 3,
      allowed: ['.png', '.jpg', '.jpeg', '.txt', '.log'],
    };
  }

  async create(
    input: CreateTicketAttachment,
    actor: AuthRequestContext,
    context: SecurityRequestContext,
  ) {
    if (!this.policy().enabled)
      throw problem(
        'Attachment uploads are unavailable until malware screening is configured.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${actor.identity.userId}::uuid FOR NO KEY UPDATE`;
      const departmentId = await this.tickets.attachmentTarget(
        tx,
        input.ticketId,
        input.departmentId,
        actor,
        true,
      );
      const existing = await tx.ticketAttachment.findUnique({
        where: { id: input.submissionKey },
      });
      if (existing) {
        if (
          existing.uploaderUserId !== actor.identity.userId ||
          existing.messageSubmissionKey !== input.messageSubmissionKey ||
          existing.filename !== input.filename ||
          existing.mediaType !== input.mediaType ||
          existing.declaredSize !== input.sizeBytes ||
          (existing.ticketId !== (input.ticketId ?? null) &&
            !(
              existing.status === 'ATTACHED' &&
              !input.ticketId &&
              existing.ticketId === input.messageSubmissionKey
            )) ||
          existing.departmentId !== departmentId
        )
          throw problem(
            'This upload key was already used.',
            HttpStatus.CONFLICT,
          );
        return metadata(existing);
      }
      const [total, drafts, messageFiles] = await Promise.all([
        tx.ticketAttachment.count({
          where: {
            uploaderUserId: actor.identity.userId,
            expiresAt: { gt: new Date() },
            status: { notIn: ['REJECTED', 'EXPIRED'] },
          },
        }),
        tx.ticketAttachment.count({
          where: {
            uploaderUserId: actor.identity.userId,
            expiresAt: { gt: new Date() },
            status: { in: ['PENDING', 'UPLOADING', 'READY', 'QUARANTINED'] },
          },
        }),
        tx.ticketAttachment.count({
          where: {
            uploaderUserId: actor.identity.userId,
            messageSubmissionKey: input.messageSubmissionKey,
            expiresAt: { gt: new Date() },
            status: { notIn: ['REJECTED', 'EXPIRED'] },
          },
        }),
      ]);
      if (total >= 50 || drafts >= 10 || messageFiles >= 10)
        throw problem(
          'The attachment limit has been reached. Remove a selection or contact support.',
          HttpStatus.CONFLICT,
        );
      const file = await tx.ticketAttachment.create({
        data: {
          id: input.submissionKey,
          uploaderUserId: actor.identity.userId,
          messageSubmissionKey: input.messageSubmissionKey,
          departmentId,
          ticketId: input.ticketId ?? null,
          filename: input.filename,
          mediaType: input.mediaType,
          declaredSize: input.sizeBytes,
          expiresAt: new Date(Date.now() + 86400000),
        },
      });
      await audit(
        tx,
        actor,
        file.id,
        'TICKET_ATTACHMENT_UPLOAD_CREATED',
        context,
      );
      return metadata(file);
    });
  }

  async status(id: string, actor: AuthRequestContext) {
    const file = await this.prisma.ticketAttachment.findUnique({
      where: { id },
    });
    if (!file || file.uploaderUserId !== actor.identity.userId)
      throw problem('Attachment unavailable.', HttpStatus.NOT_FOUND);
    await this.prisma.$transaction((tx) =>
      this.tickets.attachmentTarget(
        tx,
        file.ticketId ?? undefined,
        file.departmentId,
        actor,
        false,
      ),
    );
    return metadata(file);
  }

  async upload(
    id: string,
    request: Request,
    actor: AuthRequestContext,
    context: SecurityRequestContext,
  ) {
    if (!this.policy().enabled || this.active >= 4)
      throw problem(
        'Attachment uploads are temporarily unavailable.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    this.active++;
    try {
      return await this.performUpload(id, request, actor, context);
    } finally {
      this.active--;
    }
  }

  private async performUpload(
    id: string,
    request: Request,
    actor: AuthRequestContext,
    context: SecurityRequestContext,
  ) {
    if (
      request.headers['content-type']?.split(';')[0] !==
      'application/octet-stream'
    )
      throw problem('Send the file as binary content.');
    const claimed = await this.prisma.$transaction(async (tx) => {
      const candidate = await tx.ticketAttachment.findUnique({ where: { id } });
      if (!candidate || candidate.uploaderUserId !== actor.identity.userId)
        throw problem('Attachment unavailable.', HttpStatus.NOT_FOUND);
      await this.tickets.attachmentTarget(
        tx,
        candidate.ticketId ?? undefined,
        candidate.departmentId,
        actor,
        true,
      );
      await tx.$queryRaw`SELECT id FROM ticket_attachments WHERE id = ${id}::uuid FOR UPDATE`;
      const file = await tx.ticketAttachment.findUniqueOrThrow({
        where: { id },
      });
      if (
        file.expiresAt <= new Date() ||
        !(
          ['PENDING', 'QUARANTINED'].includes(file.status) ||
          (file.status === 'UPLOADING' &&
            file.leaseUntil &&
            file.leaseUntil <= new Date())
        )
      )
        throw problem(
          'This upload is no longer writable.',
          HttpStatus.CONFLICT,
        );
      const length = request.headers['content-length'];
      if (
        length !== undefined &&
        (!/^\d+$/.test(length) ||
          Number(length) !== file.declaredSize ||
          Number(length) > TICKET_ATTACHMENT_MAX_BYTES)
      )
        throw problem(
          'The file size does not match the upload.',
          HttpStatus.PAYLOAD_TOO_LARGE,
        );
      return tx.ticketAttachment.update({
        where: { id },
        data: {
          status: 'UPLOADING',
          claimToken: randomUUID(),
          leaseUntil: new Date(Date.now() + 90000),
        },
      });
    });
    let failure: 'REJECTED' | 'QUARANTINED' = 'QUARANTINED';
    const timer = setTimeout(() => request.destroy(), 30000);
    try {
      const chunks: Buffer[] = [];
      let count = 0;
      for await (const value of request) {
        if (!Buffer.isBuffer(value))
          throw problem('The file could not be read.');
        count += value.length;
        if (
          count > claimed.declaredSize ||
          count > TICKET_ATTACHMENT_MAX_BYTES
        ) {
          failure = 'REJECTED';
          throw problem(
            'The file exceeds the upload limit.',
            HttpStatus.PAYLOAD_TOO_LARGE,
          );
        }
        chunks.push(value);
      }
      clearTimeout(timer);
      if (request.aborted || count !== claimed.declaredSize)
        throw problem('Upload interrupted. Select the file and retry.');
      const original = Buffer.concat(chunks, count);
      const scan = await scanAttachment(
        original,
        this.env.TICKET_ATTACHMENT_SCANNER,
        this.env.NODE_ENV === 'production',
        this.env.TICKET_ATTACHMENT_CLAMAV_HOST,
        this.env.TICKET_ATTACHMENT_CLAMAV_PORT,
      );
      if (scan !== 'CLEAN') {
        failure = scan === 'MALWARE' ? 'REJECTED' : 'QUARANTINED';
        throw problem(
          scan === 'MALWARE'
            ? 'This file was rejected by malware screening.'
            : 'Malware screening is unavailable. The file cannot be attached.',
          scan === 'MALWARE'
            ? HttpStatus.UNPROCESSABLE_ENTITY
            : HttpStatus.SERVICE_UNAVAILABLE,
        );
      }
      let content: Buffer;
      try {
        content = await normalizeTicketAttachment(
          original,
          claimed.mediaType,
          claimed.filename,
        );
      } catch {
        failure = 'REJECTED';
        throw problem('The file content does not match an allowed format.');
      }
      const normalizedScan = await scanAttachment(
        content,
        this.env.TICKET_ATTACHMENT_SCANNER,
        this.env.NODE_ENV === 'production',
        this.env.TICKET_ATTACHMENT_CLAMAV_HOST,
        this.env.TICKET_ATTACHMENT_CLAMAV_PORT,
      );
      if (normalizedScan !== 'CLEAN') {
        failure = normalizedScan === 'MALWARE' ? 'REJECTED' : 'QUARANTINED';
        throw problem(
          'The normalized file could not pass malware screening.',
          normalizedScan === 'MALWARE'
            ? HttpStatus.UNPROCESSABLE_ENTITY
            : HttpStatus.SERVICE_UNAVAILABLE,
        );
      }
      return await this.prisma.$transaction(async (tx) => {
        await this.tickets.attachmentTarget(
          tx,
          claimed.ticketId ?? undefined,
          claimed.departmentId,
          actor,
          true,
        );
        await tx.$queryRaw`SELECT id FROM ticket_attachments WHERE id = ${id}::uuid FOR UPDATE`;
        const file = await tx.ticketAttachment.findUniqueOrThrow({
          where: { id },
        });
        if (
          file.status !== 'UPLOADING' ||
          file.claimToken !== claimed.claimToken ||
          file.expiresAt <= new Date() ||
          !file.leaseUntil ||
          file.leaseUntil <= new Date()
        )
          throw problem(
            'The upload expired. Start a new upload.',
            HttpStatus.CONFLICT,
          );
        const blob = await tx.ticketAttachmentBlob.create({
          data: { content: new Uint8Array(content) },
        });
        const ready = await tx.ticketAttachment.update({
          where: { id },
          data: {
            status: 'READY',
            blobId: blob.id,
            sizeBytes: content.length,
            sha256: createHash('sha256').update(content).digest('hex'),
            scanner: this.env.TICKET_ATTACHMENT_SCANNER,
            claimToken: null,
            leaseUntil: null,
          },
        });
        await audit(tx, actor, id, 'TICKET_ATTACHMENT_SCAN_ACCEPTED', context);
        return metadata(ready);
      });
    } catch (error) {
      await this.prisma.$transaction(async (tx) => {
        const changed = await tx.ticketAttachment.updateMany({
          where: { id, status: 'UPLOADING', claimToken: claimed.claimToken },
          data: { status: failure, claimToken: null, leaseUntil: null },
        });
        if (changed.count)
          await audit(
            tx,
            actor,
            id,
            failure === 'REJECTED'
              ? 'TICKET_ATTACHMENT_REJECTED'
              : 'TICKET_ATTACHMENT_QUARANTINED',
            context,
          );
      });
      if (error instanceof ApplicationException) throw error;
      throw problem('Upload interrupted. Select the file and retry.');
    } finally {
      clearTimeout(timer);
    }
  }

  async download(
    id: string,
    actor: AuthRequestContext,
    context: SecurityRequestContext,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const file = await tx.ticketAttachment.findUnique({ where: { id } });
      if (!file?.ticketId || !file.messageId)
        throw problem('Attachment unavailable.', HttpStatus.NOT_FOUND);
      await this.tickets.attachmentTarget(
        tx,
        file.ticketId,
        undefined,
        actor,
        false,
      );
      await tx.$queryRaw`SELECT id FROM ticket_attachments WHERE id = ${id}::uuid FOR UPDATE`;
      const current = await tx.ticketAttachment.findUniqueOrThrow({
        where: { id },
        include: { message: true, blob: true },
      });
      if (
        actor.identity.role === 'CUSTOMER' &&
        current.message?.kind === 'SYSTEM'
      )
        throw problem('Attachment unavailable.', HttpStatus.NOT_FOUND);
      if (
        current.expiresAt <= new Date() ||
        current.status !== 'ATTACHED' ||
        !current.blob ||
        (this.env.NODE_ENV === 'production' && current.scanner !== 'clamav')
      )
        throw problem(
          'This attachment has expired or is unavailable.',
          HttpStatus.GONE,
        );
      const content = Buffer.from(current.blob.content);
      if (createHash('sha256').update(content).digest('hex') !== current.sha256)
        throw problem('Attachment unavailable.', HttpStatus.GONE);
      await audit(tx, actor, id, 'TICKET_ATTACHMENT_DOWNLOADED', context);
      return { filename: current.filename, content };
    });
  }
}

function metadata(file: {
  id: string;
  filename: string;
  mediaType: string;
  sizeBytes: number;
  status: string;
  expiresAt: Date;
}) {
  return ticketAttachmentSchema.parse({
    id: file.id,
    filename: file.filename,
    mediaType: file.mediaType,
    sizeBytes: file.sizeBytes,
    status: file.status,
    expiresAt: file.expiresAt.toISOString(),
  });
}
function audit(
  tx: Prisma.TransactionClient,
  actor: AuthRequestContext,
  id: string,
  action: string,
  context: SecurityRequestContext,
) {
  return tx.activityLog.create({
    data: {
      actorUserId: actor.supportAdministratorId ?? actor.identity.userId,
      action,
      entityType: 'TICKET_ATTACHMENT',
      entityId: id,
      ipAddressHash: context.ipAddressHash,
    },
  });
}
function problem(
  message: string,
  status: HttpStatus = HttpStatus.UNPROCESSABLE_ENTITY,
) {
  return new ApplicationException({
    status,
    code:
      status === HttpStatus.NOT_FOUND
        ? 'RESOURCE_NOT_FOUND'
        : status === HttpStatus.CONFLICT
          ? 'CONFLICT'
          : status === HttpStatus.FORBIDDEN
            ? 'FORBIDDEN'
            : 'UNPROCESSABLE_ENTITY',
    message,
  });
}
