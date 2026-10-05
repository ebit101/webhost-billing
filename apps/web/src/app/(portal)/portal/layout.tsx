import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import {
  WorkspaceShell,
  type WorkspaceNavigationItem,
} from '../../../components/layout/workspace-shell';
import { requireWorkspaceRole } from '../../../lib/server-auth';
import { getBrandTitle } from '../../../lib/web-branding';

export const metadata: Metadata = {
  title: getBrandTitle('Customer portal'),
};

const navigation: WorkspaceNavigationItem[] = [
  { href: '/portal', label: 'Overview', icon: 'dashboard' },
  { href: '/portal/orders', label: 'My orders', icon: 'order' },
  {
    href: '/portal/services',
    label: 'My services',
    icon: 'server',
  },
  { href: '/portal/invoices', label: 'Invoices', icon: 'invoice' },
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
