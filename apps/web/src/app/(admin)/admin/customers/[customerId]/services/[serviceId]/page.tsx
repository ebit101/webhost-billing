import { AdminCustomerDetail } from '../../../../../../../components/customers/admin-customer-detail';
import { authorizeAdminPage } from '../../../../../../../lib/server-admin-access';
import { ClientRecords } from '../../../../../../../components/customers/client-records';
export default async function Page({
  params,
}: {
  params: Promise<{ customerId: string; serviceId: string }>;
}) {
  const { customerId, serviceId } = await params;
  if (!(await authorizeAdminPage('/admin/services'))) return null;
  return (
    <AdminCustomerDetail customerId={customerId} section="services">
      <ClientRecords
        customerId={customerId}
        kind="services"
        recordId={serviceId}
      />
    </AdminCustomerDetail>
  );
}
