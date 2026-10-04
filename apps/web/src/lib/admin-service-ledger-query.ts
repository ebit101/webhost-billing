import {
  serviceListQuerySchema,
  serviceSchema,
  paginatedApiSuccessResponseSchema,
  type ServiceListQuery,
} from '@webhost-billing/shared';
import {
  parseAdminCustomerFilter,
  type AdminCustomerFilter,
} from './admin-customer-filter';

type Input = URLSearchParams | Record<string, string | string[] | undefined>;
export interface AdminServiceSelection {
  query: ServiceListQuery;
  invalid: boolean;
  customerFilter: AdminCustomerFilter;
}
const maxOffset = 2_147_483_647;
export function readAdminServiceQuery(input: Input): AdminServiceSelection {
  const value = (field: string) =>
    input instanceof URLSearchParams ? input.getAll(field) : input[field];
  const customer = value('customerId');
  const customerFilter = parseAdminCustomerFilter(
    input instanceof URLSearchParams && Array.isArray(customer)
      ? customer.length === 0
        ? undefined
        : customer.length === 1
          ? customer[0]
          : customer
      : customer,
  );
  const fallback = (): AdminServiceSelection => ({
    query: { page: 1, pageSize: 20, customerId: customerFilter.customerId },
    invalid: true,
    customerFilter,
  });
  const candidate: Record<string, string | undefined> = {
    customerId: customerFilter.customerId,
  };
  for (const field of ['search', 'status', 'page', 'pageSize'] as const) {
    const found = value(field);
    if (Array.isArray(found)) {
      if (input instanceof URLSearchParams && !found.length) continue;
      if (!(input instanceof URLSearchParams) || found.length !== 1)
        return fallback();
      candidate[field] = found[0];
    } else candidate[field] = found;
  }
  if (candidate.search === '') delete candidate.search;
  if (candidate.status === '') delete candidate.status;
  for (const field of ['page', 'pageSize'] as const) {
    const number = candidate[field];
    if (
      number !== undefined &&
      (!/^[1-9]\d{0,9}$/.test(number) || Number(number) > maxOffset)
    )
      return fallback();
  }
  // serverId is an API filter but is not supported by this inventory UI.
  const server = value('serverId');
  if (server !== undefined && (!Array.isArray(server) || server.length))
    return fallback();
  const parsed = serviceListQuerySchema.safeParse(candidate);
  if (
    !parsed.success ||
    (parsed.data.page - 1) * parsed.data.pageSize > maxOffset
  )
    return fallback();
  return { query: parsed.data, invalid: false, customerFilter };
}
export function adminServiceQueryString(query: ServiceListQuery): string {
  const validated = serviceListQuerySchema.parse(query);
  const params = new URLSearchParams({
    page: String(validated.page),
    pageSize: String(validated.pageSize),
  });
  if (validated.search) params.set('search', validated.search);
  if (validated.status) params.set('status', validated.status);
  if (validated.customerId) params.set('customerId', validated.customerId);
  if (validated.serverId || readAdminServiceQuery(params).invalid)
    throw new Error('Invalid service query.');
  return params.toString();
}
export function adminServiceHref(query: ServiceListQuery): string {
  return `/admin/services?${adminServiceQueryString(query)}`;
}
const responseSchema = paginatedApiSuccessResponseSchema(serviceSchema);
export function parseAdminServicePage(
  response: unknown,
  query: ServiceListQuery,
) {
  const parsed = responseSchema.safeParse(response);
  if (!parsed.success)
    throw new Error(
      'The service inventory returned an invalid response. Please retry.',
    );
  const { data, pagination: meta } = parsed.data;
  const offset = (query.page - 1) * query.pageSize;
  const expected = Math.min(
    query.pageSize,
    Math.max(0, meta.totalItems - offset),
  );
  if (
    ![meta.page, meta.pageSize, meta.totalItems, meta.totalPages].every(
      Number.isSafeInteger,
    ) ||
    meta.page !== query.page ||
    meta.pageSize !== query.pageSize ||
    meta.totalPages !== Math.ceil(meta.totalItems / query.pageSize) ||
    data.length !== expected ||
    new Set(data.map((row) => row.id.toLowerCase())).size !== data.length ||
    data.some(
      (row) =>
        (query.customerId &&
          row.customerId.toLowerCase() !== query.customerId.toLowerCase()) ||
        (query.status && row.status !== query.status),
    )
  )
    throw new Error(
      'The service inventory returned inconsistent results. Please retry.',
    );
  return parsed.data;
}
