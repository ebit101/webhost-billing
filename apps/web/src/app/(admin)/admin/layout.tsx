import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import {
  WorkspaceShell,
  type WorkspaceNavigationItem,
} from '../../../components/layout/workspace-shell';

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

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <WorkspaceShell
      mode="admin"
      navigation={navigation}
      userName="Nadia Karim"
      userDetail="Owner administrator"
    >
      {children}
    </WorkspaceShell>
  );
}
