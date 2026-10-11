import { DomainManager } from '../../../../components/domains/domain-manager';
import { readDomainIntent } from '../../../../lib/domain-intent';
export default async function Page({
  searchParams,
}: PageProps<'/portal/domains'>) {
  return <DomainManager initialIntent={readDomainIntent(await searchParams)} />;
}
