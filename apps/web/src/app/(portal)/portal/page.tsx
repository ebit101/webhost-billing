import type { Metadata } from 'next';
import { CustomerPortalOverview } from '../../../components/dashboard/customer-portal-overview';
import { requireWorkspaceRole } from '../../../lib/server-auth';

export const metadata: Metadata = { title: 'Portal overview' };

export default async function PortalDashboard() {
  const identity = await requireWorkspaceRole('CUSTOMER');
  if (identity.role !== 'CUSTOMER') throw new Error('Unreachable role');

  return <CustomerPortalOverview customerId={identity.customerId} />;
}
