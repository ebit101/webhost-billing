import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { AuthShell } from '../../../components/auth/auth-shell';
import { LoginForm } from '../../../components/auth/login-form';
import {
  WorkspaceShell,
  type WorkspaceNavigationItem,
} from '../../../components/layout/workspace-shell';
import { getAuthenticatedIdentity } from '../../../lib/server-auth';

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
  const identity = await getAuthenticatedIdentity();

  if (!identity) {
    return (
      <AuthShell
        title="Administrator sign in"
        description="Authorized staff can access billing operations and system settings here."
      >
        <LoginForm audience="admin" />
      </AuthShell>
    );
  }

  if (identity.role !== 'ADMIN') {
    redirect('/portal');
  }

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
