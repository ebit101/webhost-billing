import {
  orderListQuerySchema,
  orderSchema,
  paginatedApiSuccessResponseSchema,
  type OrderListQuery,
} from '@webhost-billing/shared';

const querySchema = orderListQuerySchema.omit({ customerId: true });
export type CustomerOrderQuery = Omit<OrderListQuery, 'customerId'>;
export interface CustomerOrderSelection {
  query: CustomerOrderQuery;
  invalid: boolean;
}
type Input = URLSearchParams | Record<string, string | string[] | undefined>;
const maxOffset = 2_147_483_647;

export function readCustomerOrderQuery(input: Input): CustomerOrderSelection {
  const candidate: Record<string, string | undefined> = {};
  const fallback = (): CustomerOrderSelection => ({
    query: { page: 1, pageSize: 20 },
    invalid: true,
  });
  for (const field of ['search', 'status', 'page', 'pageSize'] as const) {
    const found =
      input instanceof URLSearchParams ? input.getAll(field) : input[field];
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
  const parsed = querySchema.safeParse(candidate);
  if (
    !parsed.success ||
    (parsed.data.page - 1) * parsed.data.pageSize > maxOffset
  )
    return fallback();
  return { query: parsed.data, invalid: false };
}

export function customerOrderQueryString(query: CustomerOrderQuery): string {
  // Build from the customer-only schema, never spread identity/navigation input.
  const validated = querySchema.parse({
    page: query.page,
    pageSize: query.pageSize,
    search: query.search,
    status: query.status,
  });
  const params = new URLSearchParams({
    page: String(validated.page),
    pageSize: String(validated.pageSize),
  });
  if (validated.search) params.set('search', validated.search);
  if (validated.status) params.set('status', validated.status);
  if (readCustomerOrderQuery(params).invalid)
    throw new Error('Invalid customer order query.');
  return params.toString();
}

export function customerOrderHref(query: CustomerOrderQuery): string {
  return `/portal/orders?${customerOrderQueryString(query)}`;
}

const responseSchema = paginatedApiSuccessResponseSchema(orderSchema);
export function parseCustomerOrderPage(
  response: unknown,
  query: CustomerOrderQuery,
) {
  const parsed = responseSchema.safeParse(response);
  if (!parsed.success)
    throw new Error(
      'Order history returned an invalid response. Please retry.',
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
    data.some((row) => query.status && row.status !== query.status)
  )
    throw new Error(
      'Order history returned inconsistent results. Please retry.',
    );
  return parsed.data;
}
