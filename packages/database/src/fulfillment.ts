import type { Prisma } from './index';

export async function orderFulfillmentComplete(
  tx: Prisma.TransactionClient,
  orderId: string,
): Promise<boolean> {
  // Serialize completion checks when registrar and hosting callbacks finish together.
  await tx.$queryRaw`SELECT id FROM orders WHERE id=${orderId}::uuid FOR UPDATE`;
  const items = await tx.orderItem.findMany({
    where: { orderId },
    select: {
      id: true,
      kind: true,
      provisioningSnapshot: true,
      service: { select: { status: true } },
    },
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
  const existingIds = items
    .filter(
      (item) =>
        item.kind === 'DOMAIN' &&
        item.provisioningSnapshot &&
        typeof item.provisioningSnapshot === 'object' &&
        !Array.isArray(item.provisioningSnapshot) &&
        item.provisioningSnapshot.adminDomainAction === 'EXISTING',
    )
    .map((item) => item.id);
  const existing = existingIds.length
    ? await tx.existingDomainOrder.findMany({
        where: { orderItemId: { in: existingIds } },
        select: { domainId: true },
      })
    : [];
  const linked = existing.length
    ? await tx.domain.count({
        where: {
          id: { in: existing.map((entry) => entry.domainId) },
          origin: 'EXISTING',
          state: 'REGISTERED',
        },
      })
    : 0;
  return registered + linked === domainIds.length;
}
