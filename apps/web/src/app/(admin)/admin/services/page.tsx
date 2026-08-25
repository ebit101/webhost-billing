import type { Metadata } from 'next';
import { AdminServiceManager } from '../../../../components/services/admin-service-manager';
import { AdminHostingOperationManager } from '../../../../components/services/admin-hosting-operation-manager';
export const metadata: Metadata = { title: 'Services' };
export default function Page() {
  return (
    <div className="grid gap-8">
      <AdminServiceManager />
      <AdminHostingOperationManager />
    </div>
  );
}
