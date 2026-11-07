import type { Metadata } from 'next';
import { AdminReports } from '../../../../components/dashboard/admin-reports';
import { authorizeAdminPage } from '../../../../lib/server-admin-access';

export const metadata: Metadata = { title: 'Reports' };

export default async function Page({
  searchParams,
}: PageProps<'/admin/reports'>) {
  const identity = await authorizeAdminPage('/admin/reports');
  if (!identity) return null;
  const { tab } = await searchParams;
  return (
    <AdminReports
      tab={
        tab === 'billing' || tab === 'exports' || tab === 'operations'
          ? tab
          : 'overview'
      }
    />
  );
}
