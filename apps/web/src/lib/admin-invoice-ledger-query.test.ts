import { describe, expect, it } from 'vitest';
import {
  adminInvoiceHref,
  adminInvoiceQueryString,
  readAdminInvoiceQuery,
} from './admin-invoice-ledger-query';

const customerId = '85000000-0000-4000-8000-000000000001';
describe('administrator invoice query boundary', () => {
  it('defaults to a bounded ledger with no customer context', () => {
    expect(readAdminInvoiceQuery({})).toEqual({
      query: { page: 1, pageSize: 20 },
      invalid: false,
      customerFilter: { invalid: false },
    });
  });
  it('combines all supported filters and treats search as data', () => {
    const selection = readAdminInvoiceQuery({
      customerId,
      search: ' invoice & status=PAID <b> ',
      status: 'UNPAID',
      page: '6',
      pageSize: '20',
      next: 'https://example.test',
    });
    expect(selection.invalid).toBe(false);
    expect(selection.query).toEqual({
      customerId,
      search: 'invoice & status=PAID <b>',
      status: 'UNPAID',
      page: 6,
      pageSize: 20,
    });
    const href = adminInvoiceHref(selection.query);
    expect(href.startsWith('/admin/invoices?')).toBe(true);
    expect(
      readAdminInvoiceQuery(new URLSearchParams(href.split('?')[1])),
    ).toEqual(selection);
    expect(
      new URLSearchParams(adminInvoiceQueryString(selection.query)).getAll(
        'status',
      ),
    ).toEqual(['UNPAID']);
  });
  it.each([
    { page: ['1', '2'] },
    { pageSize: ['20'] },
    { search: ['a', 'b'] },
    { status: ['PAID', 'UNPAID'] },
    { page: '0' },
    { page: '-1' },
    { page: '1.5' },
    { page: '1e2' },
    { page: '01' },
    { page: 'Infinity' },
    { page: '2147483648' },
    { page: '2147483647', pageSize: '100' },
    { pageSize: '101' },
    { status: 'pending' },
    { search: 'a'.repeat(201) },
  ])(
    'rejects malformed ledger input without losing valid customer scope: %j',
    (input) => {
      const selection = readAdminInvoiceQuery({ ...input, customerId });
      expect(selection.invalid).toBe(true);
      expect(selection.query.customerId).toBe(customerId);
    },
  );
  it('rejects URL duplicates but accepts a single URL value', () => {
    expect(
      readAdminInvoiceQuery(new URLSearchParams('page=1&page=2')).invalid,
    ).toBe(true);
    expect(
      readAdminInvoiceQuery(new URLSearchParams('page=2')).query.page,
    ).toBe(2);
  });
  it.each(['foreign', '', [customerId, customerId]])(
    'does not infer malformed customer context: %j',
    (value) => {
      const result = readAdminInvoiceQuery({ customerId: value, page: '2' });
      expect(result.customerFilter).toEqual({ invalid: true });
      expect(result.query.customerId).toBeUndefined();
      expect(result.invalid).toBe(false);
    },
  );
  it('allows the last signed integer offset and rejects the next page', () => {
    expect(
      readAdminInvoiceQuery({ page: '2147483647', pageSize: '1' }).invalid,
    ).toBe(false);
    expect(
      readAdminInvoiceQuery({ page: '2147483648', pageSize: '1' }).invalid,
    ).toBe(true);
  });
});
