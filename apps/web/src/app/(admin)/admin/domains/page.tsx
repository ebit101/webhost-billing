import { DomainManager } from '../../../../components/domains/domain-manager';
import { authorizeAdminPage } from '../../../../lib/server-admin-access';
import { ResellbizSettingsPanel } from '../../../../components/domains/resellbiz-settings';
export default async function Page() {
  await authorizeAdminPage('/admin/domains');
  return (
    <div className="space-y-6">
      <ResellbizSettingsPanel />
      <DomainManager administrator />
    </div>
  );
}
