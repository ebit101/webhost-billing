import { AdminCustomerDetail } from '../../../../../../components/customers/admin-customer-detail';
import { authorizeAdminPage } from '../../../../../../lib/server-admin-access';
import { AdminServiceManager } from '../../../../../../components/services/admin-service-manager';
import { readAdminServiceQuery } from '../../../../../../lib/admin-service-ledger-query';
import { clientRecordHref } from '../../../../../../lib/client-record-href';
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ customerId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { customerId } = await params;
  if (!(await authorizeAdminPage('/admin/services'))) return null;
  const selection = readAdminServiceQuery({
    ...(await searchParams),
    customerId,
  });
  return (
    <AdminCustomerDetail customerId={customerId} section="services">
      <AdminServiceManager
        key={customerId}
        selection={selection}
        embedded
        basePath={clientRecordHref(customerId, 'services')}
      />
    </AdminCustomerDetail>
  );
}
