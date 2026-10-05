import { describe, expect, it } from 'vitest';
import {
  customerOrderHref,
  customerOrderQueryString,
  parseCustomerOrderPage,
  readCustomerOrderQuery,
} from './customer-order-ledger-query';

describe('customer order history URL boundary', () => {
  it('round trips only supported filters and never forwards identity or return destinations', () => {
    const selection = readCustomerOrderQuery({
      search: '  old domain  ',
      status: 'CANCELLED',
      page: '6',
      pageSize: '20',
      customerId: 'another-account',
      next: 'javascript:alert(1)',
      returnTo: 'https://example.test',
      amount: '100',
    });
    expect(selection).toEqual({
      query: {
        search: 'old domain',
        status: 'CANCELLED',
        page: 6,
        pageSize: 20,
      },
      invalid: false,
    });
    const href = customerOrderHref(selection.query);
    expect(href.startsWith('/portal/orders?')).toBe(true);
    expect(
      readCustomerOrderQuery(new URLSearchParams(href.split('?')[1])),
    ).toEqual(selection);
    expect(href).not.toMatch(
      /customerId|next|returnTo|amount|javascript|https/,
    );
    expect(
      customerOrderQueryString({
        ...selection.query,
        ...{ customerId: 'another-account' },
      }),
    ).not.toContain('customerId');
  });
  it.each([
    'page=0',
    'page=-1',
    'page=1.1',
    'page=1e2',
    'page=01',
    'page=+1',
    'page=2147483648',
    'page=2147483647&pageSize=100',
    'pageSize=101',
    'pageSize=0',
    'status=ACTIVE',
    'status=cancelled',
    'search=' + 'a'.repeat(201),
    'search=a&search=b',
    'status=PAID&status=PAID',
    'page=1&page=2',
    'pageSize=20&pageSize=20',
  ])('blocks malformed/duplicate owned query %s', (input) => {
    expect(readCustomerOrderQuery(new URLSearchParams(input))).toEqual({
      query: { page: 1, pageSize: 20 },
      invalid: true,
    });
  });
  it.each(['search', 'status', 'page', 'pageSize'])(
    'rejects server array for %s',
    (field) => {
      expect(readCustomerOrderQuery({ [field]: ['1'] }).invalid).toBe(true);
    },
  );
  it('accepts defaults/empty optional filters and ignores all unrelated parameters', () => {
    expect(
      readCustomerOrderQuery(
        new URLSearchParams(
          'search=&status=&customerId=bad&customerId=other&invoiceId=bad&serverId=bad',
        ),
      ),
    ).toEqual({ query: { page: 1, pageSize: 20 }, invalid: false });
    expect(() =>
      customerOrderQueryString({ page: 2147483647, pageSize: 100 }),
    ).toThrow();
    expect(
      readCustomerOrderQuery({ page: '2147483647', pageSize: '1' }).invalid,
    ).toBe(false);
  });
  it('retains requested empty out-of-range page and rejects unsafe or inconsistent metadata', () => {
    const response = {
      success: true,
      data: [],
      pagination: { page: 8, pageSize: 20, totalItems: 140, totalPages: 7 },
    };
    expect(parseCustomerOrderPage(response, { page: 8, pageSize: 20 })).toEqual(
      response,
    );
    for (const pagination of [
      { ...response.pagination, page: 1 },
      { ...response.pagination, pageSize: 100 },
      { ...response.pagination, totalPages: 8 },
      { ...response.pagination, totalItems: Number.MAX_SAFE_INTEGER + 1 },
    ])
      expect(() =>
        parseCustomerOrderPage(
          { ...response, pagination },
          { page: 8, pageSize: 20 },
        ),
      ).toThrow();
  });
});
