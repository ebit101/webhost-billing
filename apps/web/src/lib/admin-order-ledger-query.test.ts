import { describe, expect, it } from 'vitest';
import {
  adminOrderHref,
  adminOrderQueryString,
  parseAdminOrderPage,
  readAdminOrderQuery,
} from './admin-order-ledger-query';
const customerId = '87000000-0000-4000-8000-000000000001';
describe('administrator order ledger URL boundary', () => {
  it('round trips combined filters and only builds a fixed local destination', () => {
    const selection = readAdminOrderQuery({
      search: '  account-87  ',
      status: 'PROCESSING',
      customerId,
      page: '6',
      pageSize: '20',
      next: 'https://example.test',
      returnTo: 'javascript:alert(1)',
    });
    expect(selection.invalid).toBe(false);
    expect(selection.query).toEqual({
      search: 'account-87',
      status: 'PROCESSING',
      customerId,
      page: 6,
      pageSize: 20,
    });
    const href = adminOrderHref(selection.query);
    expect(href.startsWith('/admin/orders?')).toBe(true);
    expect(
      readAdminOrderQuery(new URLSearchParams(href.split('?')[1])).query,
    ).toEqual(selection.query);
    expect(href).not.toMatch(/returnTo|next|javascript|https/);
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
    'status=processing',
    'search=' + 'a'.repeat(201),
    'serverId=' + customerId,
    'invoiceId=' + customerId,
    'productId=' + customerId,
    'productPriceId=' + customerId,
    'search=a&search=b',
    'status=ACTIVE&status=ACTIVE',
    'page=1&page=2',
    'pageSize=20&pageSize=20',
  ])(
    'blocks malformed or unsupported URL %s without losing valid customer scope',
    (input) => {
      const result = readAdminOrderQuery(
        new URLSearchParams(`${input}&customerId=${customerId}`),
      );
      expect(result.invalid).toBe(true);
      expect(result.customerFilter).toEqual({ customerId, invalid: false });
      expect(result.query).toEqual({ page: 1, pageSize: 20, customerId });
    },
  );
  it('rejects array-owned fields and keeps invalid customer independent', () => {
    expect(readAdminOrderQuery({ page: ['1'] }).invalid).toBe(true);
    const result = readAdminOrderQuery(
      new URLSearchParams('customerId=bad&customerId=bad&status=CANCELLED'),
    );
    expect(result.invalid).toBe(false);
    expect(result.customerFilter.invalid).toBe(true);
    expect(result.query.customerId).toBeUndefined();
    expect(result.query.status).toBe('CANCELLED');
  });
  it('uses bounded defaults and accepts an intentional empty search/status', () => {
    expect(
      readAdminOrderQuery(new URLSearchParams('search=&status=')).query,
    ).toEqual({ page: 1, pageSize: 20 });
    expect(() =>
      adminOrderQueryString({ page: 2147483647, pageSize: 100 }),
    ).toThrow();
  });
  it('accepts empty out-of-range metadata without silently clamping', () => {
    const page = {
      success: true,
      data: [],
      pagination: { page: 8, pageSize: 20, totalItems: 140, totalPages: 7 },
    };
    expect(parseAdminOrderPage(page, { page: 8, pageSize: 20 })).toEqual(page);
    expect(() =>
      parseAdminOrderPage(
        { ...page, pagination: { ...page.pagination, totalPages: 8 } },
        { page: 8, pageSize: 20 },
      ),
    ).toThrow(/inconsistent/);
  });
});
