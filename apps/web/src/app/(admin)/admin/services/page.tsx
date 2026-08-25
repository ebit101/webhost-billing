import type { Metadata } from 'next';
import { AdminServiceManager } from '../../../../components/services/admin-service-manager';
export const metadata: Metadata = { title: 'Services' };
export default function Page() {
  return <AdminServiceManager />;
}
