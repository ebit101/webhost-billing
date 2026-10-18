import type { Prisma } from './index';

export async function orderFulfillmentComplete(
  tx: Prisma.TransactionClient,
  orderId: string,
): Promise<boolean> {
  // Serialize completion checks when registrar and hosting callbacks finish together.
  await tx.$queryRaw`SELECT id FROM orders WHERE id=${orderId}::uuid FOR UPDATE`;
  const items = await tx.orderItem.findMany({
    where: { orderId },
    select: { id: true, kind: true, service: { select: { status: true } } },
  });
  if (items.length === 0) return false;
  if (
    items.some(
      (item) => item.kind === 'HOSTING' && item.service?.status !== 'ACTIVE',
    )
  )
    return false;
  const domainIds = items
    .filter((item) => item.kind === 'DOMAIN')
    .map((item) => item.id);
  if (domainIds.length === 0) return true;
  const registered = await tx.domain.count({
    where: { orderItemId: { in: domainIds }, state: 'REGISTERED' },
  });
  return registered === domainIds.length;
}
