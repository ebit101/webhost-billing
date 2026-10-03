import {
  invoiceListQuerySchema,
  type InvoiceListQuery,
} from '@webhost-billing/shared';

export type InvoiceLedgerQuery = Omit<InvoiceListQuery, 'customerId'>;
export type InvoiceLedgerSelection = {
  query: InvoiceLedgerQuery;
  invalid: boolean;
};
type QueryInput =
  URLSearchParams | Record<string, string | string[] | undefined>;
const schema = invoiceListQuerySchema.omit({ customerId: true });
const fields = ['search', 'status', 'page', 'pageSize'] as const;
// Prisma's skip is a signed 32-bit integer; do not produce an overflowing offset.
const maxOffset = 2_147_483_647;

export function readInvoiceLedgerQuery(
  input: QueryInput,
): InvoiceLedgerSelection {
  const candidate: Record<string, string | undefined> = {};
  for (const field of fields) {
    const value =
      input instanceof URLSearchParams ? input.getAll(field) : input[field];
    if (Array.isArray(value)) {
      if (input instanceof URLSearchParams && value.length === 0) continue;
      if (!(input instanceof URLSearchParams) || value.length !== 1)
        return fallback();
      candidate[field] = value[0];
    } else candidate[field] = value;
  }
  if (candidate.search === '') delete candidate.search;
  if (candidate.status === '') delete candidate.status;
  for (const field of ['page', 'pageSize'] as const) {
    const value = candidate[field];
    if (
      value !== undefined &&
      (!/^[1-9]\d{0,9}$/.test(value) || Number(value) > maxOffset)
    )
      return fallback();
  }
  const parsed = schema.safeParse(candidate);
  if (
    !parsed.success ||
    (parsed.data.page - 1) * parsed.data.pageSize > maxOffset
  )
    return fallback();
  return { query: parsed.data, invalid: false };
}

function fallback(): InvoiceLedgerSelection {
  return { query: { page: 1, pageSize: 20 }, invalid: true };
}

export function invoiceLedgerQueryString(query: InvoiceLedgerQuery): string {
  const params = new URLSearchParams({
    page: String(query.page),
    pageSize: String(query.pageSize),
  });
  if (query.search) params.set('search', query.search);
  if (query.status) params.set('status', query.status);
  const validated = readInvoiceLedgerQuery(params).query;
  const safe = new URLSearchParams({
    page: String(validated.page),
    pageSize: String(validated.pageSize),
  });
  if (validated.search) safe.set('search', validated.search);
  if (validated.status) safe.set('status', validated.status);
  return safe.toString();
}

export function invoiceLedgerHref(query: InvoiceLedgerQuery): string {
  return `/portal/invoices?${invoiceLedgerQueryString(query)}`;
}
