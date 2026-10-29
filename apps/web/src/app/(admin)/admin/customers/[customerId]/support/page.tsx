import { redirect } from 'next/navigation';
import { AdminCustomerDetail } from '../../../../../../components/customers/admin-customer-detail';
import { authorizeAdminPage } from '../../../../../../lib/server-admin-access';
import { ClientActivityRecords } from '../../../../../../components/customers/client-activity-records';
export default async function Page({
  params,
}: {
  params: Promise<{ customerId: string }>;
}) {
  const { customerId } = await params;
  const identity = await authorizeAdminPage('/admin/support');
  if (!identity) return null;
  if (identity.staffRole !== 'FULL_ADMINISTRATOR')
    redirect(`/admin/customers/${encodeURIComponent(customerId)}`);
  return (
    <AdminCustomerDetail customerId={customerId} section="support">
      <ClientActivityRecords customerId={customerId} kind="support" />
    </AdminCustomerDetail>
  );
}
