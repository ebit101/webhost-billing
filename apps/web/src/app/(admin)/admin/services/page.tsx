import type { Metadata } from 'next';
import { AdminServicesWorkspace } from '../../../../components/services/admin-services-workspace';
import { parseAdminCustomerFilter } from '../../../../lib/admin-customer-filter';
export const metadata: Metadata = { title: 'Services' };
export default async function Page({
  searchParams,
}: PageProps<'/admin/services'>) {
  const { customerId } = await searchParams;
  return (
    <AdminServicesWorkspace
      customerFilter={parseAdminCustomerFilter(customerId)}
    />
  );
}
