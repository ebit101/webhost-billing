import type { PrismaClient } from './generated/prisma/client';
import {
  supportEmailHash,
  supportReplyAddress,
} from '@webhost-billing/shared/support-email';

/** Issue only customer reply routes, never staff/private-note routes. */
export async function issueSupportReplyAddress(
  prisma: PrismaClient,
  ticketId: string,
  sourceMessageId: string,
  secret: string,
  domain: string,
): Promise<string | undefined> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM tickets WHERE id = ${ticketId}::uuid FOR UPDATE`;
    const ticket = await tx.ticket.findUnique({
      where: { id: ticketId },
      include: { customer: { include: { user: true } } },
    });
    const source = await tx.ticketMessage.findUnique({
      where: { id: sourceMessageId },
    });
    const user = ticket?.customer.user;
    if (
      !ticket ||
      !user ||
      ticket.status === 'CLOSED' ||
      source?.ticketId !== ticketId ||
      source.kind !== 'ADMIN' ||
      user.role !== 'CUSTOMER' ||
      user.status !== 'ACTIVE' ||
      user.deletedAt ||
      !user.emailVerifiedAt ||
      ticket.customer.status !== 'ACTIVE'
    )
      return undefined;
    const thread = await tx.supportEmailThread.upsert({
      where: {
        sourceMessageId_recipientUserId: {
          sourceMessageId,
          recipientUserId: user.id,
        },
      },
      create: {
        ticketId,
        sourceMessageId,
        recipientUserId: user.id,
        senderHash: supportEmailHash(user.email.toLowerCase()),
        expiresAt: new Date(Date.now() + 30 * 86400000),
      },
      update: {},
    });
    if (
      thread.expiresAt <= new Date() ||
      thread.senderHash !== supportEmailHash(user.email.toLowerCase())
    )
      return undefined;
    return supportReplyAddress(thread.id, secret, domain);
  });
}
