import { describe, expect, it } from 'vitest';
import {
  invoiceLedgerHref,
  readInvoiceLedgerQuery,
} from './invoice-ledger-query';

describe('customer invoice query allowlist', () => {
  it('uses safe API defaults and fixed local destinations', () => {
    expect(readInvoiceLedgerQuery({})).toEqual({
      query: { page: 1, pageSize: 20 },
      invalid: false,
    });
    const selected = readInvoiceLedgerQuery(
      new URLSearchParams(
        'page=6&pageSize=20&search=%20Hosting%20&status=PAID&customerId=foreign&next=//evil.example&amount=1',
      ),
    );
    expect(selected).toEqual({
      query: { page: 6, pageSize: 20, search: 'Hosting', status: 'PAID' },
      invalid: false,
    });
    expect(invoiceLedgerHref(selected.query)).toBe(
      '/portal/invoices?page=6&pageSize=20&search=Hosting&status=PAID',
    );
    expect(
      readInvoiceLedgerQuery({
        customerId: 'foreign',
        returnTo: '//evil.example',
      }).query,
    ).toEqual({ page: 1, pageSize: 20 });
  });
  it.each([
    'page=0',
    'page=-1',
    'page=1.5',
    'page=1e2',
    'page=',
    'page=01',
    'page=%20',
    'page=NaN',
    'page=Infinity',
    'page=2147483648',
    'page=2147483647&pageSize=100',
    'pageSize=101',
    'pageSize=0',
    'status=OTHER',
    'page=1&page=1',
    'pageSize=20&pageSize=20',
    'search=a&search=b',
    'status=PAID&status=PAID',
    `search=${'x'.repeat(201)}`,
  ])('drops invalid or ambiguous allowed query %s', (query) => {
    expect(readInvoiceLedgerQuery(new URLSearchParams(query))).toEqual({
      query: { page: 1, pageSize: 20 },
      invalid: true,
    });
  });
  it('rejects server arrays and accepts empty filters and safe boundary offsets', () => {
    expect(readInvoiceLedgerQuery({ search: ['one'] }).invalid).toBe(true);
    expect(readInvoiceLedgerQuery({ status: '', search: '' }).invalid).toBe(
      false,
    );
    expect(
      readInvoiceLedgerQuery({ page: '107374183', pageSize: '20' }).invalid,
    ).toBe(false);
    expect(
      readInvoiceLedgerQuery({ page: '107374184', pageSize: '20' }).invalid,
    ).toBe(true);
  });
  it('revalidates typed link arguments rather than forwarding foreign fields', () => {
    expect(invoiceLedgerHref({ page: 1, pageSize: 101 })).toBe(
      '/portal/invoices?page=1&pageSize=20',
    );
    expect(
      invoiceLedgerHref({
        page: 1,
        pageSize: 20,
        search: '//evil.example?amount=1',
      }),
    ).toBe(
      '/portal/invoices?page=1&pageSize=20&search=%2F%2Fevil.example%3Famount%3D1',
    );
  });
});
