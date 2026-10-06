import type { Metadata } from 'next';
import { AdminTicketManager } from '../../../../components/support/admin-ticket-manager';
import { parseAdminCustomerFilter } from '../../../../lib/admin-customer-filter';
import { authorizeAdminPage } from '../../../../lib/server-admin-access';
export const metadata: Metadata = { title: 'Support' };
export default async function Page({
  searchParams,
}: PageProps<'/admin/support'>) {
  const { customerId } = await searchParams;
  const identity = await authorizeAdminPage('/admin/support');
  if (!identity) return null;
  return (
    <AdminTicketManager
      customerFilter={parseAdminCustomerFilter(customerId)}
      canReadCustomerContext={identity.staffRole === 'FULL_ADMINISTRATOR'}
    />
  );
}
