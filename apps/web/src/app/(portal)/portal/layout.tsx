import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import {
  WorkspaceShell,
  type WorkspaceNavigationItem,
} from '../../../components/layout/workspace-shell';
import {
  getCustomerDisplayName,
  requireWorkspaceRole,
} from '../../../lib/server-auth';
import { getBrandTitle } from '../../../lib/web-branding';

export const metadata: Metadata = {
  title: getBrandTitle('Customer portal'),
};

const navigation: WorkspaceNavigationItem[] = [
  { href: '/portal', label: 'Overview', icon: 'dashboard' },
  { href: '/portal/orders', label: 'My orders', icon: 'order' },
  { href: '/portal/domains', label: 'Domains', icon: 'server' },
  {
    href: '/portal/services',
    label: 'My services',
    icon: 'server',
  },
  { href: '/portal/invoices', label: 'Invoices', icon: 'invoice' },
  { href: '/portal/support', label: 'Support', icon: 'support' },
  { href: '/portal/notifications', label: 'Notifications', icon: 'bell' },
  { href: '/portal/profile', label: 'Profile & security', icon: 'user' },
];

export default async function PortalLayout({
  children,
}: {
  children: ReactNode;
}) {
  const identity = await requireWorkspaceRole('CUSTOMER');
  const userName =
    identity.role === 'CUSTOMER'
      ? await getCustomerDisplayName(identity.customerId)
      : 'Customer';

  return (
    <WorkspaceShell
      mode="portal"
      navigation={navigation}
      userName={userName}
      userDetail="Customer account"
    >
      {children}
    </WorkspaceShell>
  );
}
