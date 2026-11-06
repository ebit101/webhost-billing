import { HttpStatus } from '@nestjs/common';
import type { Prisma } from '@webhost-billing/database';
import { ApplicationException } from '../../common/errors/application.exception';

export async function claimTicketAttachments(
  tx: Prisma.TransactionClient,
  ids: string[] | undefined,
  actorUserId: string,
  submissionKey: string,
  ticketId: string,
  messageId: string,
  departmentId: string,
  initial: boolean,
  production: boolean,
) {
  if ((ids?.length ?? 0) > 3 || new Set(ids).size !== (ids?.length ?? 0))
    throw new ApplicationException({
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      code: 'UNPROCESSABLE_ENTITY',
      message: 'Choose no more than three distinct attachments.',
    });
  for (const id of [...(ids ?? [])].sort()) {
    await tx.$queryRaw`SELECT id FROM ticket_attachments WHERE id = ${id}::uuid FOR UPDATE`;
    const file = await tx.ticketAttachment.findUnique({ where: { id } });
    if (
      !file ||
      file.uploaderUserId !== actorUserId ||
      file.messageSubmissionKey !== submissionKey ||
      file.status !== 'READY' ||
      file.expiresAt <= new Date() ||
      !file.blobId ||
      (production && file.scanner !== 'clamav') ||
      (initial
        ? file.ticketId !== null || file.departmentId !== departmentId
        : file.ticketId !== ticketId)
    )
      throw new ApplicationException({
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        code: 'UNPROCESSABLE_ENTITY',
        message:
          'An attachment is unavailable or does not belong to this message. Upload it again before sending.',
      });
    await tx.ticketAttachment.update({
      where: { id },
      data: {
        ticketId,
        messageId,
        status: 'ATTACHED',
        expiresAt: new Date(Date.now() + 365 * 86400000),
      },
    });
  }
}

export function sameAttachmentIds(
  stored: { id: string }[],
  requested: string[] | undefined,
) {
  return (
    stored
      .map((file) => file.id)
      .sort()
      .join(',') === [...(requested ?? [])].sort().join(',')
  );
}
