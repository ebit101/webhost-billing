import {
  adminInvoiceListQuerySchema,
  invoiceSchema,
  paginatedApiSuccessResponseSchema,
  type AdminInvoiceListQuery,
} from '@webhost-billing/shared';
import {
  parseAdminCustomerFilter,
  type AdminCustomerFilter,
} from './admin-customer-filter';
import { readInvoiceLedgerQuery } from './invoice-ledger-query';

type Input = URLSearchParams | Record<string, string | string[] | undefined>;
export interface AdminInvoiceSelection {
  query: AdminInvoiceListQuery;
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
  const aging = Object.fromEntries(
    agingFields.map((field) => {
      if (!(input instanceof URLSearchParams)) return [field, input[field]];
      const values = input.getAll(field);
      return [field, values.length > 1 ? values : values[0]];
    }),
  );
  const base = { ...ledger.query, customerId: customerFilter.customerId };
  const parsed = adminInvoiceListQuerySchema.safeParse({
    ...base,
    ...aging,
  });
  return {
    query: parsed.success ? parsed.data : base,
    invalid: ledger.invalid || !parsed.success,
    customerFilter,
  };
}

const agingFields = ['agingBucket', 'agingAsOf', 'agingCurrency'] as const;

export function adminInvoiceQueryString(query: AdminInvoiceListQuery): string {
  const validated = adminInvoiceListQuerySchema.parse(query);
  const params = new URLSearchParams({
    page: String(validated.page),
    pageSize: String(validated.pageSize),
  });
  if (validated.search) params.set('search', validated.search);
  if (validated.status) params.set('status', validated.status);
  if (validated.customerId) params.set('customerId', validated.customerId);
  for (const field of agingFields) {
    const value = validated[field];
    if (value) params.set(field, value);
  }
  if (readAdminInvoiceQuery(params).invalid)
    throw new Error('Invalid invoice query.');
  return params.toString();
}

export function adminInvoiceHref(query: AdminInvoiceListQuery): string {
  return `/admin/invoices?${adminInvoiceQueryString(query)}`;
}

const responseSchema = paginatedApiSuccessResponseSchema(invoiceSchema);
export function parseAdminInvoicePage(
  response: unknown,
  query: AdminInvoiceListQuery,
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
