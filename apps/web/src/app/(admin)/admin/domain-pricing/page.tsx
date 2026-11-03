import { DomainWorkspaceTabs } from '../../../../components/domains/domain-workspace-tabs';
import { TldManager } from '../../../../components/domains/tld-manager';
import { authorizeAdminPage } from '../../../../lib/server-admin-access';
export const metadata = { title: 'Domain pricing and TLDs' };
export default async function Page() {
  const identity = await authorizeAdminPage('/admin/domain-pricing');
  return identity ? (
    <div className="space-y-6">
      <DomainWorkspaceTabs active="/admin/domain-pricing" />
      <TldManager />
    </div>
  ) : null;
}
