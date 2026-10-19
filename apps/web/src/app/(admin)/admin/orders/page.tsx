import type { Metadata } from 'next';
import { AdminOrderManager } from '../../../../components/orders/admin-order-manager';
import { readAdminOrderQuery } from '../../../../lib/admin-order-ledger-query';
import { readAdminOrderIntent } from '../../../../lib/checkout-intent';
export const metadata: Metadata = { title: 'Orders' };
export default async function Page({
  searchParams,
}: PageProps<'/admin/orders'>) {
  const query = await searchParams;
  const selection = readAdminOrderQuery(query);
  return (
    <AdminOrderManager
      selection={selection}
      checkoutIntent={readAdminOrderIntent(query)}
    />
  );
}
