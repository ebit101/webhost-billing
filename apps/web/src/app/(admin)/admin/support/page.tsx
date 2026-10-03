import type { Metadata } from 'next';
import { AdminTicketManager } from '../../../../components/support/admin-ticket-manager';
import { parseAdminCustomerFilter } from '../../../../lib/admin-customer-filter';
export const metadata: Metadata = { title: 'Support' };
export default async function Page({
  searchParams,
}: PageProps<'/admin/support'>) {
  const { customerId } = await searchParams;
  return (
    <AdminTicketManager customerFilter={parseAdminCustomerFilter(customerId)} />
  );
}
