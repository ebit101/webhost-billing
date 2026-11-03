import { DomainWorkspaceTabs } from '../../../../components/domains/domain-workspace-tabs';
import { DomainManager } from '../../../../components/domains/domain-manager';
import { authorizeAdminPage } from '../../../../lib/server-admin-access';
import Link from 'next/link';
import { readAdminDomainQuery } from '../../../../lib/admin-domain-inventory-query';
export default async function Page({
  searchParams,
}: PageProps<'/admin/domains'>) {
  const identity = await authorizeAdminPage('/admin/domains');
  if (!identity) return null;
  return (
    <div className="space-y-6">
      <DomainWorkspaceTabs active="/admin/domains" />
      <Link
        className="inline-block text-sm font-semibold text-brand-700 hover:underline"
        href="/admin/settings/domain-defaults"
      >
        DNS defaults and policies
      </Link>
      <DomainManager
        administrator
        inventorySelection={readAdminDomainQuery(await searchParams)}
      />
    </div>
  );
}
