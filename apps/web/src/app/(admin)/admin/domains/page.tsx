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
      <nav
        className="flex flex-wrap gap-4 text-sm underline"
        aria-label="Domain configuration"
      >
        <Link href="/admin/domain-pricing">Domain pricing and TLDs</Link>
        <Link href="/admin/settings/registrars">Registrar connections</Link>
        <Link href="/admin/settings/domain-defaults">
          DNS defaults and policies
        </Link>
      </nav>
      <DomainManager
        administrator
        inventorySelection={readAdminDomainQuery(await searchParams)}
      />
    </div>
  );
}
