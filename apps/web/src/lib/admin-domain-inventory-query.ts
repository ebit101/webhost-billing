import {
  domainInventoryQuerySchema,
  domainInventoryResponseSchema,
  type DomainInventoryQuery,
} from '@webhost-billing/shared';

type Input = URLSearchParams | Record<string, string | string[] | undefined>;
export interface AdminDomainSelection {
  query: DomainInventoryQuery;
  invalid: boolean;
}
const fields = [
  'page',
  'pageSize',
  'search',
  'state',
  'origin',
  'customerId',
] as const;
export function readAdminDomainQuery(input: Input): AdminDomainSelection {
  const candidate: Record<string, string | undefined> = {};
  let invalid = false;
  const keys =
    input instanceof URLSearchParams ? [...input.keys()] : Object.keys(input);
  if (keys.some((key) => !fields.some((field) => field === key)))
    invalid = true;
  for (const field of fields) {
    const value =
      input instanceof URLSearchParams ? input.getAll(field) : input[field];
    if (Array.isArray(value)) {
      if (input instanceof URLSearchParams && value.length === 0) continue;
      if (!(input instanceof URLSearchParams) || value.length !== 1) {
        invalid = true;
        continue;
      }
      candidate[field] = value[0];
    } else candidate[field] = value;
  }
  for (const field of ['search', 'state', 'origin'] as const)
    if (candidate[field] === '') delete candidate[field];
  for (const field of ['page', 'pageSize'] as const)
    if (
      candidate[field] !== undefined &&
      !/^[1-9]\d{0,9}$/.test(candidate[field])
    )
      invalid = true;
  const parsed = domainInventoryQuerySchema.safeParse(candidate);
  if (parsed.success && !invalid) return { query: parsed.data, invalid: false };
  const scoped = domainInventoryQuerySchema.safeParse({
    customerId: candidate.customerId,
  });
  return {
    query: {
      page: 1,
      pageSize: 20,
      ...(scoped.success && scoped.data.customerId
        ? { customerId: scoped.data.customerId }
        : {}),
    },
    invalid: true,
  };
}
export function adminDomainQueryString(query: DomainInventoryQuery): string {
  const parsed = domainInventoryQuerySchema.parse(query);
  const params = new URLSearchParams({
    page: String(parsed.page),
    pageSize: String(parsed.pageSize),
  });
  for (const key of ['search', 'state', 'origin', 'customerId'] as const)
    if (parsed[key]) params.set(key, parsed[key]);
  if (readAdminDomainQuery(params).invalid)
    throw new Error('Invalid domain filters.');
  return params.toString();
}
export function adminDomainHref(query: DomainInventoryQuery): string {
  return '/admin/domains?' + adminDomainQueryString(query);
}
export function parseAdminDomainPage(
  response: unknown,
  query: DomainInventoryQuery,
) {
  const result = domainInventoryResponseSchema.parse(response);
  const { data, pagination: meta, summary } = result;
  const expected = Math.min(
    query.pageSize,
    Math.max(0, meta.totalItems - (query.page - 1) * query.pageSize),
  );
  if (
    ![meta.page, meta.pageSize, meta.totalItems, meta.totalPages].every(
      Number.isSafeInteger,
    ) ||
    meta.page !== query.page ||
    meta.pageSize !== query.pageSize ||
    meta.totalPages !== Math.ceil(meta.totalItems / query.pageSize) ||
    Object.values(summary).reduce((sum, value) => sum + value, 0) !==
      meta.totalItems ||
    data.length !== expected ||
    new Set(data.map((row) => row.id.toLowerCase())).size !== data.length ||
    data.some(
      (row, index) =>
        (query.customerId &&
          row.customerId.toLowerCase() !== query.customerId.toLowerCase()) ||
        (query.state && row.state !== query.state) ||
        (query.origin && row.origin !== query.origin) ||
        (index > 0 &&
          (Date.parse(row.requestedAt) >
            Date.parse(data[index - 1]!.requestedAt) ||
            (Date.parse(row.requestedAt) ===
              Date.parse(data[index - 1]!.requestedAt) &&
              row.id.toLowerCase() > data[index - 1]!.id.toLowerCase()))),
    ) ||
    Object.entries(summary).some(
      ([state, count]) =>
        data.filter((row) => row.state === state).length > count,
    )
  )
    throw new Error('The domain inventory returned inconsistent results.');
  return result;
}
