import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import {
  WorkspaceShell,
  type WorkspaceNavigationItem,
} from '../../../components/layout/workspace-shell';

export const metadata: Metadata = {
  title: {
    default: 'Customer portal · Webhost Billing',
    template: '%s · Customer portal · Webhost Billing',
  },
};

const navigation: WorkspaceNavigationItem[] = [
  { href: '/portal', label: 'Overview', icon: 'dashboard' },
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

export default function PortalLayout({ children }: { children: ReactNode }) {
  return (
    <WorkspaceShell
      mode="portal"
      navigation={navigation}
      userName="Amina Rahman"
      userDetail="amina@example.test"
    >
      {children}
    </WorkspaceShell>
  );
}
