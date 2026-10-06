import type { Metadata } from 'next';
import { AdminDashboard } from '../../../components/dashboard/admin-dashboard';
import { authorizeAdminPage } from '../../../lib/server-admin-access';

export const metadata: Metadata = { title: 'Admin dashboard' };

export default async function AdminDashboardPage() {
  const identity = await authorizeAdminPage('/admin');
  if (!identity) return null;
  return <AdminDashboard />;
}
