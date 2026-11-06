import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Request } from 'express';
import type { ApiEnvironment } from '@webhost-billing/config';
import { type PrismaClient } from '@webhost-billing/database';
import { ticketMessageBodySchema } from '@webhost-billing/shared';
import {
  SUPPORT_EMAIL_MAX_BYTES,
  inboundSupportEmailSchema,
  supportEmailHash,
  supportThreadId,
  supportEmailText,
  verifySupportDelivery,
  type InboundSupportEmail,
} from '@webhost-billing/shared/support-email';
import { API_ENVIRONMENT } from '../../infrastructure/environment/environment.module';
import { PRISMA_CLIENT } from '../../infrastructure/database/database.module';
import { ApplicationException } from '../../common/errors/application.exception';
import type { SecurityRequestContext } from '../../common/http/request-context';
import {
  normalizeTicketAttachment,
  scanAttachment,
} from './ticket-attachment-content';

type PreparedFile = { filename: string; mediaType: string; content: Buffer };
@Injectable()
export class SupportEmailService {
  private active = 0;
  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient,
    @Inject(API_ENVIRONMENT) private readonly env: ApiEnvironment,
  ) {}

  async receive(request: Request, context: SecurityRequestContext) {
    if (
      this.env.SUPPORT_EMAIL_MODE === 'disabled' ||
      !this.env.SUPPORT_EMAIL_SECRET ||
      !this.env.SUPPORT_EMAIL_DOMAIN
    )
      throw error(HttpStatus.SERVICE_UNAVAILABLE);
    if (
      this.env.SUPPORT_EMAIL_MODE === 'local' &&
      !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(
        request.socket.remoteAddress ?? '',
      )
    )
      throw error(HttpStatus.FORBIDDEN);
    const timestamp = request.get('x-support-timestamp') ?? '';
    const signature = request.get('x-support-signature') ?? '';
    // Fail cheaply before reading a body. The signature itself covers the exact bytes.
    if (
      request.get('content-type') !== 'application/octet-stream' ||
      !/^\d{13}$/.test(timestamp) ||
      Math.abs(Date.now() - Number(timestamp)) > 300000 ||
      !/^[a-f0-9]{64}$/.test(signature)
    )
      throw error(HttpStatus.UNAUTHORIZED);
    if (this.active >= 2) throw error(HttpStatus.SERVICE_UNAVAILABLE);
    this.active++;
    const timer = setTimeout(() => request.destroy(), 30000);
    try {
      let size = 0;
      const chunks: Buffer[] = [];
      try {
        for await (const chunk of request) {
          if (!Buffer.isBuffer(chunk)) throw error(HttpStatus.BAD_REQUEST);
          size += chunk.length;
          if (size > SUPPORT_EMAIL_MAX_BYTES)
            throw error(HttpStatus.PAYLOAD_TOO_LARGE);
          chunks.push(chunk);
        }
      } catch (caught) {
        if (caught instanceof ApplicationException) throw caught;
        throw error(HttpStatus.BAD_REQUEST);
      }
      clearTimeout(timer);
      const bytes = Buffer.concat(chunks);
      if (
        request.aborted ||
        !verifySupportDelivery(
          bytes,
          timestamp,
          signature,
          this.env.SUPPORT_EMAIL_SECRET,
        )
      )
        throw error(HttpStatus.UNAUTHORIZED);
      let decoded: unknown;
      try {
        decoded = JSON.parse(
          new TextDecoder('utf-8', { fatal: true }).decode(bytes),
        );
      } catch {
        throw error(HttpStatus.BAD_REQUEST);
      }
      const parsed = inboundSupportEmailSchema.safeParse(decoded);
      if (!parsed.success) throw error(HttpStatus.UNPROCESSABLE_ENTITY);
      return await this.import(parsed.data, context);
    } finally {
      clearTimeout(timer);
      this.active--;
    }
  }

  private async import(
    mail: InboundSupportEmail,
    context: SecurityRequestContext,
  ) {
    const payloadHash = supportEmailHash(JSON.stringify(mail));
    const messageKey = supportEmailHash(mail.messageId.toLowerCase());
    const deliveryKey = supportEmailHash(
      `${messageKey}:${mail.recipient}:${mail.from}`,
    );
    const existing = await this.prisma.supportEmailReceipt.findUnique({
      where: { deliveryKey },
    });
    if (existing) return replay(existing, payloadHash);
    const id = supportThreadId(
      mail.recipient,
      this.env.SUPPORT_EMAIL_SECRET!,
      this.env.SUPPORT_EMAIL_DOMAIN!,
    );
    const thread = id
      ? await this.prisma.supportEmailThread.findUnique({ where: { id } })
      : null;
    let reason = !thread ? 'INVALID_ROUTE' : undefined;
    if (
      !reason &&
      (mail.envelopeFrom === null ||
        mail.deliveryReport ||
        mail.autoSubmitted !== 'no' ||
        mail.bulk)
    )
      reason = 'AUTOMATED_MESSAGE';
    if (
      !reason &&
      (mail.senderVerification.dmarc !== 'pass' ||
        !mail.senderVerification.alignedDkim ||
        mail.senderVerification.verifiedAddress !== mail.from ||
        supportEmailHash(mail.from) !== thread!.senderHash)
    )
      reason = 'UNVERIFIED_SENDER';
    const body = ticketMessageBodySchema.safeParse(supportEmailText(mail));
    if (!reason && !body.success) reason = 'INVALID_TEXT';
    const prepared: PreparedFile[] = [];
    if (!reason) {
      for (const file of mail.attachments) {
        const original = Buffer.from(file.contentBase64, 'base64');
        if (
          original.toString('base64') !== file.contentBase64 ||
          !original.length ||
          original.length > 2097152
        ) {
          reason = 'INVALID_ATTACHMENT';
          break;
        }
        const scan = await this.scan(original);
        if (scan === 'UNAVAILABLE') throw error(HttpStatus.SERVICE_UNAVAILABLE);
        if (scan !== 'CLEAN') {
          reason = 'REJECTED_ATTACHMENT';
          break;
        }
        let content: Buffer;
        try {
          content = await normalizeTicketAttachment(
            original,
            file.mediaType,
            file.filename,
          );
        } catch {
          reason = 'INVALID_ATTACHMENT';
          break;
        }
        const normalized = await this.scan(content);
        if (normalized === 'UNAVAILABLE')
          throw error(HttpStatus.SERVICE_UNAVAILABLE);
        if (normalized !== 'CLEAN') {
          reason = 'REJECTED_ATTACHMENT';
          break;
        }
        prepared.push({
          filename: file.filename,
          mediaType: file.mediaType,
          content,
        });
      }
    }
    try {
      return await this.prisma.$transaction(async (tx) => {
        if (thread) {
          // Serialize with account deactivation, ticket routing, closure and other imports.
          await tx.$queryRaw`SELECT id FROM users WHERE id = ${thread.recipientUserId}::uuid FOR NO KEY UPDATE`;
          await tx.$queryRaw`SELECT id FROM tickets WHERE id = ${thread.ticketId}::uuid FOR UPDATE`;
        }
        const raced = await tx.supportEmailReceipt.findUnique({
          where: { deliveryKey },
        });
        if (raced) return replay(raced, payloadHash);
        if (
          await tx.supportEmailReceipt.findUnique({
            where: { acceptedMessageKey: messageKey },
          })
        )
          reason = 'DUPLICATE_MESSAGE';
        const ticket = thread
          ? await tx.ticket.findUnique({
              where: { id: thread.ticketId },
              include: { customer: { include: { user: true } } },
            })
          : null;
        const user = ticket?.customer.user;
        if (
          !reason &&
          (!ticket ||
            !user ||
            user.id !== thread!.recipientUserId ||
            user.role !== 'CUSTOMER' ||
            user.status !== 'ACTIVE' ||
            user.deletedAt ||
            !user.emailVerifiedAt ||
            ticket.customer.status !== 'ACTIVE' ||
            supportEmailHash(user.email.toLowerCase()) !== thread!.senderHash ||
            thread!.expiresAt <= new Date())
        )
          reason = 'INELIGIBLE_ACCOUNT';
        if (!reason && ticket?.status === 'CLOSED') reason = 'CLOSED_TICKET';
        if (!reason && ticket) {
          await tx.$queryRaw`SELECT id FROM support_departments WHERE id = ${ticket.departmentId}::uuid FOR UPDATE`;
          const count = await tx.supportEmailReceipt.count({
            where: {
              threadId: thread!.id,
              createdAt: { gte: new Date(Date.now() - 3600000) },
            },
          });
          if (count >= 20) throw error(HttpStatus.TOO_MANY_REQUESTS);
          const files = await tx.ticketAttachment.count({
            where: {
              uploaderUserId: user!.id,
              expiresAt: { gt: new Date() },
              status: { notIn: ['REJECTED', 'EXPIRED'] },
            },
          });
          if (files + prepared.length > 50) reason = 'ATTACHMENT_CAPACITY';
        }
        const messageId = !reason ? randomUUID() : undefined;
        if (messageId && ticket && user && body.success) {
          await tx.ticketMessage.create({
            data: {
              id: messageId,
              ticketId: ticket.id,
              authorUserId: user.id,
              kind: 'CUSTOMER',
              body: body.data,
            },
          });
          for (const file of prepared) {
            const blob = await tx.ticketAttachmentBlob.create({
              data: { content: new Uint8Array(file.content) },
            });
            await tx.ticketAttachment.create({
              data: {
                id: randomUUID(),
                uploaderUserId: user.id,
                messageSubmissionKey: messageId,
                departmentId: ticket.departmentId,
                ticketId: ticket.id,
                messageId,
                blobId: blob.id,
                filename: file.filename,
                mediaType: file.mediaType,
                declaredSize: file.content.length,
                sizeBytes: file.content.length,
                sha256: supportEmailHash(file.content),
                scanner: this.env.TICKET_ATTACHMENT_SCANNER,
                status: 'ATTACHED',
                expiresAt: new Date(Date.now() + 365 * 86400000),
              },
            });
          }
          await tx.ticket.update({
            where: { id: ticket.id },
            data: { status: 'WAITING_FOR_STAFF', lastReplyAt: new Date() },
          });
          await tx.outboxEvent.create({
            data: {
              aggregateType: 'TICKET',
              aggregateId: ticket.id,
              eventType: 'EMAIL_TICKET_REPLY',
              idempotencyKey: `email:ticket-reply:${messageId}`,
              payload: { schemaVersion: 1, ticketId: ticket.id, messageId },
            },
          });
        }
        const receipt = await tx.supportEmailReceipt.create({
          data: {
            deliveryKey,
            payloadHash,
            threadId: thread?.id,
            messageId,
            acceptedMessageKey: messageId ? messageKey : null,
            outcome: messageId
              ? 'ACCEPTED'
              : reason === 'AUTOMATED_MESSAGE' || reason === 'DUPLICATE_MESSAGE'
                ? 'IGNORED'
                : 'REJECTED',
            reason: reason ?? 'IMPORTED',
          },
        });
        await tx.activityLog.create({
          data: {
            actorUserId: null,
            action: 'SUPPORT_EMAIL_RECEIVED',
            entityType: 'SUPPORT_EMAIL_RECEIPT',
            entityId: receipt.id,
            ipAddressHash: context.ipAddressHash,
            metadata: {
              outcome: receipt.outcome,
              reason: receipt.reason,
              ...(messageId ? { messageId } : {}),
            },
          },
        });
        return { received: true, outcome: receipt.outcome };
      });
    } catch (caught) {
      // A globally repeated Message-ID may race through different valid routes.
      if (isUnique(caught)) {
        const raced = await this.prisma.supportEmailReceipt.findUnique({
          where: { deliveryKey },
        });
        if (raced) return replay(raced, payloadHash);
        if (
          await this.prisma.supportEmailReceipt.findUnique({
            where: { acceptedMessageKey: messageKey },
          })
        )
          return { received: true, outcome: 'IGNORED' };
      }
      throw caught;
    }
  }
  private scan(bytes: Buffer) {
    return scanAttachment(
      bytes,
      this.env.TICKET_ATTACHMENT_SCANNER,
      this.env.NODE_ENV === 'production',
      this.env.TICKET_ATTACHMENT_CLAMAV_HOST,
      this.env.TICKET_ATTACHMENT_CLAMAV_PORT,
    );
  }
}
function replay(
  receipt: { payloadHash: string; outcome: string },
  hash: string,
) {
  if (receipt.payloadHash !== hash) throw error(HttpStatus.CONFLICT);
  return { received: true, outcome: receipt.outcome };
}
function isUnique(value: unknown) {
  return (
    typeof value === 'object' &&
    value !== null &&
    'code' in value &&
    value.code === 'P2002'
  );
}
function error(status: HttpStatus) {
  return new ApplicationException({
    status,
    code:
      status === HttpStatus.UNAUTHORIZED
        ? 'AUTHENTICATION_REQUIRED'
        : 'BAD_REQUEST',
    message: 'Support email delivery could not be accepted.',
  });
}
