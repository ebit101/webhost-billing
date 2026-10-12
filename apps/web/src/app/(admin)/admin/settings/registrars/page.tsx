import { RegistrarConnections } from '../../../../../components/domains/registrar-connections';
import { authorizeAdminPage } from '../../../../../lib/server-admin-access';
export const metadata = { title: 'Domain registrars' };
export default async function Page() {
  const identity = await authorizeAdminPage('/admin/settings/registrars');
  return identity ? <RegistrarConnections /> : null;
}
