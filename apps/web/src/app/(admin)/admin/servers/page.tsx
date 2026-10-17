import type { Metadata } from 'next';
import { AdminWhmServerManager } from '../../../../components/services/admin-whm-server-manager';

export const metadata: Metadata = { title: 'cPanel and WHM servers' };

export default function Page() {
  return <AdminWhmServerManager />;
}
