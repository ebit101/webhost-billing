import type { ReactNode } from 'react';
import { BillingWorkspaceTabs } from '../../../../components/invoices/billing-workspace-tabs';
import { authorizeAdminPage } from '../../../../lib/server-admin-access';

export default async function Layout({ children }: { children: ReactNode }) {
  const identity = await authorizeAdminPage('/admin/invoices');
  if (!identity) return null;
  return (
    <div className="grid min-w-0 gap-6">
      <BillingWorkspaceTabs
        active="/admin/invoices"
        staffRole={identity.staffRole}
      />
      {children}
    </div>
  );
}
