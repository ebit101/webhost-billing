import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import {
  WorkspaceShell,
  type WorkspaceNavigationItem,
} from '../../../components/layout/workspace-shell';
import { requireWorkspaceRole } from '../../../lib/server-auth';

export const metadata: Metadata = {
  title: {
    default: 'Administrator · Webhost Billing',
    template: '%s · Administrator · Webhost Billing',
  },
};

const navigation: WorkspaceNavigationItem[] = [
  { href: '/admin', label: 'Dashboard', icon: 'dashboard' },
  { href: '/admin/customers', label: 'Customers', icon: 'users' },
  { href: '/admin/products', label: 'Products', icon: 'product' },
  { href: '/admin/orders', label: 'Orders', icon: 'order', badge: '4' },
  { href: '/admin/services', label: 'Services', icon: 'server' },
  { href: '/admin/invoices', label: 'Invoices', icon: 'invoice', badge: '7' },
  { href: '/admin/payments', label: 'Payments', icon: 'payment' },
  { href: '/admin/support', label: 'Support', icon: 'support', badge: '3' },
  { href: '/admin/automation', label: 'Automation', icon: 'activity' },
  { href: '/admin/email', label: 'Email delivery', icon: 'bell' },
  { href: '/admin/settings', label: 'Settings', icon: 'settings' },
];

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const identity = await requireWorkspaceRole('ADMIN');

  return (
    <WorkspaceShell
      mode="admin"
      navigation={navigation}
      userName={identity.email}
      userDetail="Administrator"
    >
      {children}
    </WorkspaceShell>
  );
}
