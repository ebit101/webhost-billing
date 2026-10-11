import { DomainManager } from '../../../../components/domains/domain-manager';
import { authorizeAdminPage } from '../../../../lib/server-admin-access';
export default async function Page() {
  await authorizeAdminPage('/admin/domains');
  return <DomainManager administrator />;
}
