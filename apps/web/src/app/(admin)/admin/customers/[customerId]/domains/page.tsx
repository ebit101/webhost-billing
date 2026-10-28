import { AdminCustomerDetail } from '../../../../../../components/customers/admin-customer-detail';
import { authorizeAdminPage } from '../../../../../../lib/server-admin-access';
import { ClientRecords } from '../../../../../../components/customers/client-records';
export default async function Page({
  params,
}: {
  params: Promise<{ customerId: string }>;
}) {
  const { customerId } = await params;
  if (!(await authorizeAdminPage('/admin/domains'))) return null;
  return (
    <AdminCustomerDetail customerId={customerId} section="domains">
      <ClientRecords customerId={customerId} kind="domains" />
    </AdminCustomerDetail>
  );
}
