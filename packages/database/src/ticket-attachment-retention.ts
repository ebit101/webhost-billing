import type { PrismaClient } from './generated/prisma/client';

/** Retain message metadata; remove private content in bounded, serialized batches. */
export async function purgeExpiredTicketAttachments(
  prisma: PrismaClient,
  now = new Date(),
  batchSize = 100,
): Promise<number> {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<
      Array<{ id: string; blob_id: string | null }>
    >`SELECT id, blob_id FROM ticket_attachments WHERE expires_at <= ${now} AND status <> 'EXPIRED' ORDER BY expires_at, id LIMIT ${Math.min(100, Math.max(1, batchSize))} FOR UPDATE SKIP LOCKED`;
    for (const row of rows) {
      await tx.ticketAttachment.update({
        where: { id: row.id },
        data: {
          status: 'EXPIRED',
          blobId: null,
          claimToken: null,
          leaseUntil: null,
        },
      });
      if (row.blob_id)
        await tx.ticketAttachmentBlob.delete({ where: { id: row.blob_id } });
    }
    return rows.length;
  });
}
