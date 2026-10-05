import type { Metadata } from 'next';
import { AdminOrderManager } from '../../../../components/orders/admin-order-manager';
import { readAdminOrderQuery } from '../../../../lib/admin-order-ledger-query';
export const metadata: Metadata = { title: 'Orders' };
export default async function Page({
  searchParams,
}: PageProps<'/admin/orders'>) {
  const selection = readAdminOrderQuery(await searchParams);
  return <AdminOrderManager selection={selection} />;
}
