import type { Metadata } from 'next';
import { AdminOrderManager } from '../../../../components/orders/admin-order-manager';
import { parseAdminCustomerFilter } from '../../../../lib/admin-customer-filter';
export const metadata: Metadata = { title: 'Orders' };
export default async function Page({
  searchParams,
}: PageProps<'/admin/orders'>) {
  const { customerId } = await searchParams;
  return (
    <AdminOrderManager customerFilter={parseAdminCustomerFilter(customerId)} />
  );
}
