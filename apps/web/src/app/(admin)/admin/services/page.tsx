import type { Metadata } from 'next';
import { AdminServiceManager } from '../../../../components/services/admin-service-manager';
import { AdminHostingOperationManager } from '../../../../components/services/admin-hosting-operation-manager';
import { parseAdminCustomerFilter } from '../../../../lib/admin-customer-filter';
export const metadata: Metadata = { title: 'Services' };
export default async function Page({
  searchParams,
}: PageProps<'/admin/services'>) {
  const { customerId } = await searchParams;
  return (
    <div className="grid gap-8">
      <AdminServiceManager
        customerFilter={parseAdminCustomerFilter(customerId)}
      />
      <AdminHostingOperationManager />
    </div>
  );
}
