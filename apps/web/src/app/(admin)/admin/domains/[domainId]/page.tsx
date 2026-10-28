import { DomainOwnerRedirect } from '../../../../../components/domains/domain-owner-redirect';
import { authorizeAdminPage } from '../../../../../lib/server-admin-access';
export default async function Page({
  params,
}: {
  params: Promise<{ domainId: string }>;
}) {
  if (!(await authorizeAdminPage('/admin/domains'))) return null;
  return <DomainOwnerRedirect domainId={(await params).domainId} />;
}
