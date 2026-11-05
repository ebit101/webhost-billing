import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { domainWorkspaceTabs } from '../../../components/domains/domain-workspace-tabs';
import { billingWorkspaceTabs } from '../../../components/invoices/billing-workspace-tabs';
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
import { accountDisplayName } from '../../../lib/account-display';

export const metadata: Metadata = {
  title: getBrandTitle('Administrator'),
};

const navigation: WorkspaceNavigationItem[] = [
  { href: '/admin', label: 'Dashboard', icon: 'dashboard' },
  { href: '/admin/customers', label: 'Customers', icon: 'users' },
  { href: '/admin/products', label: 'Products', icon: 'product' },
  { href: '/admin/orders', label: 'Orders', icon: 'order', badge: '4' },
  { href: '/admin/services', label: 'Services', icon: 'cloud' },
  { href: '/admin/servers', label: 'Servers', icon: 'server' },
  {
    ...domainWorkspaceTabs[0],
    icon: 'globe',
    activePaths: domainWorkspaceTabs.slice(1).map(({ href }) => href),
  },
  {
    href: billingWorkspaceTabs[0].href,
    label: 'Billing',
    icon: 'invoice',
    badge: '7',
    activePaths: [billingWorkspaceTabs[1].href],
  },
  { href: '/admin/reports', label: 'Reports', icon: 'bar-chart' },
  { href: '/admin/support', label: 'Support', icon: 'support', badge: '3' },
  { href: '/admin/automation', label: 'Automation', icon: 'bolt' },
  { href: '/admin/email', label: 'Email delivery', icon: 'send' },
  { href: '/admin/notifications', label: 'Notifications', icon: 'bell' },
  { href: '/admin/settings', label: 'Settings', icon: 'settings' },
  { href: '/admin/staff', label: 'Administrators', icon: 'shield' },
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
      userName={accountDisplayName(identity)}
      userDetail={staffRoleLabels[identity.staffRole]}
    >
      {children}
    </WorkspaceShell>
  );
}
