import { TldManager } from '../../../../components/domains/tld-manager';
import { authorizeAdminPage } from '../../../../lib/server-admin-access';
export const metadata = { title: 'Domain pricing and TLDs' };
export default async function Page() {
  const identity = await authorizeAdminPage('/admin/domain-pricing');
  return identity ? <TldManager /> : null;
}
