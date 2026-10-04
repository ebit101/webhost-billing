import type { Metadata } from 'next';
import { AdminServicesWorkspace } from '../../../../components/services/admin-services-workspace';
import { readAdminServiceQuery } from '../../../../lib/admin-service-ledger-query';
export const metadata: Metadata = { title: 'Services' };
export default async function Page({
  searchParams,
}: PageProps<'/admin/services'>) {
  const selection = readAdminServiceQuery(await searchParams);
  return <AdminServicesWorkspace selection={selection} />;
}
