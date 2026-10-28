import { domainDetailSchema, serviceSchema } from '@webhost-billing/shared';
export type ClientRecordSection =
  'summary' | 'profile' | 'domains' | 'services';
export function clientRecordHref(
  customerId: string,
  section: ClientRecordSection = 'summary',
  recordId?: string,
) {
  if (!serviceSchema.shape.customerId.safeParse(customerId).success)
    throw new Error('Invalid client context.');
  const root = `/admin/customers/${encodeURIComponent(customerId)}`;
  if (section === 'summary') return root;
  if (section === 'profile') return root + '?tab=profile';
  if (recordId && !serviceSchema.shape.id.safeParse(recordId).success)
    throw new Error('Invalid record context.');
  return `${root}/${section}${recordId ? '/' + encodeURIComponent(recordId) : ''}`;
}
export function domainRecordHref(
  domain: Pick<
    import('@webhost-billing/shared').DomainDetail,
    'id' | 'customerId'
  >,
  administrator: boolean,
) {
  if (!domainDetailSchema.shape.id.safeParse(domain.id).success)
    throw new Error('Invalid domain context.');
  return administrator
    ? domain.customerId
      ? clientRecordHref(domain.customerId, 'domains', domain.id)
      : `/admin/domains/${domain.id}`
    : `/portal/domains/${domain.id}`;
}
