import type { Metadata } from 'next';
import { AdminPaymentManager } from '../../../../components/payments/admin-payment-manager';
import { parseAdminCustomerFilter } from '../../../../lib/admin-customer-filter';
import { authorizeAdminPage } from '../../../../lib/server-admin-access';
export const metadata: Metadata = { title: 'Payments' };
export default async function Page({
  searchParams,
}: PageProps<'/admin/payments'>) {
  const { customerId } = await searchParams;
  const identity = await authorizeAdminPage('/admin/payments');
  if (!identity) return null;
  return (
    <AdminPaymentManager
      customerFilter={parseAdminCustomerFilter(customerId)}
      fullAdministrator={identity.staffRole === 'FULL_ADMINISTRATOR'}
    />
  );
}
