import { domainQuoteRequestSchema } from '@webhost-billing/shared';
import type { SelectionQuery } from './checkout-intent';
export const DOMAIN_INTENT_HEADER = 'x-webhost-domain-intent';
export type DomainIntent = { domainOfferId: string; domainName: string };
export function readDomainIntent(
  query: URLSearchParams | SelectionQuery,
): DomainIntent | undefined {
  const one = (key: string) =>
    query instanceof URLSearchParams
      ? query.getAll(key).length === 1
        ? query.get(key)
        : undefined
      : query[key];
  const parsed = domainQuoteRequestSchema
    .pick({ offerId: true, domainName: true })
    .safeParse({
      offerId: one('domainOfferId'),
      domainName: one('domainName'),
    });
  return parsed.success
    ? { domainOfferId: parsed.data.offerId, domainName: parsed.data.domainName }
    : undefined;
}
export function domainEntryHref(
  entry: '/login' | '/portal/domains',
  intent?: DomainIntent,
) {
  const valid = intent && readDomainIntent(intent);
  return valid ? `${entry}?${new URLSearchParams(valid)}` : entry;
}
