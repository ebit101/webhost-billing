import type { ReactNode } from 'react';
import { authorizeAdminPage } from '../../../../lib/server-admin-access';

export default async function Layout({ children }: { children: ReactNode }) {
  const identity = await authorizeAdminPage('/admin/settings');
  return identity ? children : null;
}
