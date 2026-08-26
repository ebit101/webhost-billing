import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import {
  WorkspaceShell,
  type WorkspaceNavigationItem,
} from '../../../components/layout/workspace-shell';
import { requireWorkspaceRole } from '../../../lib/server-auth';

export const metadata: Metadata = {
  title: {
    default: 'Customer portal · Webhost Billing',
    template: '%s · Customer portal · Webhost Billing',
  },
};

const navigation: WorkspaceNavigationItem[] = [
  { href: '/portal', label: 'Overview', icon: 'dashboard' },
  { href: '/portal/orders', label: 'My orders', icon: 'order' },
  {
    href: '/portal/services',
    label: 'My services',
    icon: 'server',
    badge: '2',
  },
  { href: '/portal/invoices', label: 'Invoices', icon: 'invoice', badge: '1' },
  { href: '/portal/support', label: 'Support', icon: 'support' },
  { href: '/portal/profile', label: 'Profile & security', icon: 'user' },
];

export default async function PortalLayout({
  children,
}: {
  children: ReactNode;
}) {
  const identity = await requireWorkspaceRole('CUSTOMER');

  return (
    <WorkspaceShell
      mode="portal"
      navigation={navigation}
      userName={identity.email}
      userDetail="Customer account"
    >
      {children}
    </WorkspaceShell>
  );
}
