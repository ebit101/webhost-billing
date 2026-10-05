import { describe, expect, it } from 'vitest';
import {
  customerServiceHref,
  customerServiceQueryString,
  parseCustomerServicePage,
  readCustomerServiceQuery,
} from './customer-service-ledger-query';

describe('customer service history URL boundary', () => {
  it('round trips only supported filters and never forwards identity or return destinations', () => {
    const selection = readCustomerServiceQuery({
      search: '  old domain  ',
      status: 'CANCELLED',
      page: '6',
      pageSize: '20',
      customerId: 'another-account',
      serverId: 'another-server',
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
    const href = customerServiceHref(selection.query);
    expect(href.startsWith('/portal/services?')).toBe(true);
    expect(
      readCustomerServiceQuery(new URLSearchParams(href.split('?')[1])),
    ).toEqual(selection);
    expect(href).not.toMatch(
      /customerId|serverId|next|returnTo|amount|javascript|https/,
    );
    expect(
      customerServiceQueryString({
        ...selection.query,
        ...{ customerId: 'another-account', serverId: 'another-server' },
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
    'status=PAID',
    'status=cancelled',
    'search=' + 'a'.repeat(201),
    'search=a&search=b',
    'status=ACTIVE&status=ACTIVE',
    'page=1&page=2',
    'pageSize=20&pageSize=20',
  ])('blocks malformed/duplicate owned query %s', (input) => {
    expect(readCustomerServiceQuery(new URLSearchParams(input))).toEqual({
      query: { page: 1, pageSize: 20 },
      invalid: true,
    });
  });
  it.each(['search', 'status', 'page', 'pageSize'])(
    'rejects server array for %s',
    (field) => {
      expect(readCustomerServiceQuery({ [field]: ['1'] }).invalid).toBe(true);
    },
  );
  it('accepts defaults/empty optional filters and ignores all unrelated parameters', () => {
    expect(
      readCustomerServiceQuery(
        new URLSearchParams(
          'search=&status=&customerId=bad&customerId=other&invoiceId=bad&serverId=bad',
        ),
      ),
    ).toEqual({ query: { page: 1, pageSize: 20 }, invalid: false });
    expect(() =>
      customerServiceQueryString({ page: 2147483647, pageSize: 100 }),
    ).toThrow();
    expect(
      readCustomerServiceQuery({ page: '2147483647', pageSize: '1' }).invalid,
    ).toBe(false);
  });
  it('retains requested empty out-of-range page and rejects unsafe or inconsistent metadata', () => {
    const response = {
      success: true,
      data: [],
      pagination: { page: 8, pageSize: 20, totalItems: 140, totalPages: 7 },
    };
    expect(
      parseCustomerServicePage(response, { page: 8, pageSize: 20 }),
    ).toEqual(response);
    for (const pagination of [
      { ...response.pagination, page: 1 },
      { ...response.pagination, pageSize: 100 },
      { ...response.pagination, totalPages: 8 },
      { ...response.pagination, totalItems: Number.MAX_SAFE_INTEGER + 1 },
    ])
      expect(() =>
        parseCustomerServicePage(
          { ...response, pagination },
          { page: 8, pageSize: 20 },
        ),
      ).toThrow();
  });
});
