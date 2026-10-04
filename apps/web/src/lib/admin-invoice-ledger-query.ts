import {
  invoiceListQuerySchema,
  invoiceSchema,
  paginatedApiSuccessResponseSchema,
  type InvoiceListQuery,
} from '@webhost-billing/shared';
import {
  parseAdminCustomerFilter,
  type AdminCustomerFilter,
} from './admin-customer-filter';
import { readInvoiceLedgerQuery } from './invoice-ledger-query';

type Input = URLSearchParams | Record<string, string | string[] | undefined>;
export interface AdminInvoiceSelection {
  query: InvoiceListQuery;
  invalid: boolean;
  customerFilter: AdminCustomerFilter;
}

export function readAdminInvoiceQuery(input: Input): AdminInvoiceSelection {
  const values =
    input instanceof URLSearchParams
      ? input.getAll('customerId')
      : input.customerId;
  const customerFilter = parseAdminCustomerFilter(
    input instanceof URLSearchParams
      ? !values?.length
        ? undefined
        : values.length === 1
          ? values[0]
          : values
      : values,
  );
  const ledger = readInvoiceLedgerQuery(input);
  const query = invoiceListQuerySchema.parse({
    ...ledger.query,
    customerId: customerFilter.customerId,
  });
  return { query, invalid: ledger.invalid, customerFilter };
}

export function adminInvoiceQueryString(query: InvoiceListQuery): string {
  const validated = invoiceListQuerySchema.parse(query);
  const params = new URLSearchParams({
    page: String(validated.page),
    pageSize: String(validated.pageSize),
  });
  if (validated.search) params.set('search', validated.search);
  if (validated.status) params.set('status', validated.status);
  if (validated.customerId) params.set('customerId', validated.customerId);
  if (readAdminInvoiceQuery(params).invalid)
    throw new Error('Invalid invoice query.');
  return params.toString();
}

export function adminInvoiceHref(query: InvoiceListQuery): string {
  return `/admin/invoices?${adminInvoiceQueryString(query)}`;
}

const responseSchema = paginatedApiSuccessResponseSchema(invoiceSchema);
export function parseAdminInvoicePage(
  response: unknown,
  query: InvoiceListQuery,
) {
  const parsed = responseSchema.safeParse(response);
  if (!parsed.success)
    throw new Error(
      'The invoice ledger returned an invalid response. Please retry.',
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
    new Set(data.map((row) => row.id)).size !== data.length ||
    data.some(
      (row) =>
        (query.customerId &&
          row.customerId.toLowerCase() !== query.customerId.toLowerCase()) ||
        (query.status && row.status !== query.status),
    )
  )
    throw new Error(
      'The invoice ledger returned inconsistent results. Please retry.',
    );
  return parsed.data;
}
