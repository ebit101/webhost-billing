import { DomainDefaults } from '../../../../../components/domains/domain-defaults';
import { authorizeAdminPage } from '../../../../../lib/server-admin-access';
export const metadata = { title: 'Domain DNS defaults and policies' };
export default async function Page() {
  const identity = await authorizeAdminPage('/admin/settings/domain-defaults');
  return identity ? <DomainDefaults /> : null;
}
