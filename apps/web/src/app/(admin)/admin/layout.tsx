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
import { getBrandTitle } from '../../../lib/web-branding';
import { staffRoleLabels } from '@webhost-billing/shared';
import { canAccessAdminPath } from '../../../lib/admin-access';

export const metadata: Metadata = {
  title: getBrandTitle('Administrator'),
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
  { href: '/admin/staff', label: 'Administrators', icon: 'users' },
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
      navigation={navigation.filter((item) =>
        canAccessAdminPath(identity.staffRole, item.href),
      )}
      userName={identity.email}
      userDetail={staffRoleLabels[identity.staffRole]}
    >
      {children}
    </WorkspaceShell>
  );
}
