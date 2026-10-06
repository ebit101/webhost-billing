import type { Metadata } from 'next';
import { AdminCustomerManager } from '../../../../components/customers/admin-customer-manager';
import { authorizeAdminPage } from '../../../../lib/server-admin-access';
export const metadata: Metadata = { title: 'Customers' };
export default async function Page() {
  const identity = await authorizeAdminPage('/admin/customers');
  if (!identity) return null;
  return (
    <AdminCustomerManager
      readOnly={identity.staffRole !== 'FULL_ADMINISTRATOR'}
    />
  );
}
