import { describe, expect, it } from 'vitest';
import {
  adminServiceHref,
  adminServiceQueryString,
  parseAdminServicePage,
  readAdminServiceQuery,
} from './admin-service-ledger-query';
const customerId = '87000000-0000-4000-8000-000000000001';
describe('administrator service inventory URL boundary', () => {
  it('round trips combined filters and only builds a fixed local destination', () => {
    const selection = readAdminServiceQuery({
      search: '  account-87  ',
      status: 'PROVISION_FAILED',
      customerId,
      page: '6',
      pageSize: '20',
      next: 'https://example.test',
      returnTo: 'javascript:alert(1)',
    });
    expect(selection.invalid).toBe(false);
    expect(selection.query).toEqual({
      search: 'account-87',
      status: 'PROVISION_FAILED',
      customerId,
      page: 6,
      pageSize: 20,
    });
    const href = adminServiceHref(selection.query);
    expect(href.startsWith('/admin/services?')).toBe(true);
    expect(
      readAdminServiceQuery(new URLSearchParams(href.split('?')[1])).query,
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
    'status=PAID',
    'status=active',
    'search=' + 'a'.repeat(201),
    'serverId=' + customerId,
    'search=a&search=b',
    'status=ACTIVE&status=ACTIVE',
    'page=1&page=2',
    'pageSize=20&pageSize=20',
  ])(
    'blocks malformed or unsupported URL %s without losing valid customer scope',
    (input) => {
      const result = readAdminServiceQuery(
        new URLSearchParams(`${input}&customerId=${customerId}`),
      );
      expect(result.invalid).toBe(true);
      expect(result.customerFilter).toEqual({ customerId, invalid: false });
      expect(result.query).toEqual({ page: 1, pageSize: 20, customerId });
    },
  );
  it('rejects array-owned fields and keeps invalid customer independent', () => {
    expect(readAdminServiceQuery({ page: ['1'] }).invalid).toBe(true);
    const result = readAdminServiceQuery(
      new URLSearchParams('customerId=bad&customerId=bad&status=CANCELLED'),
    );
    expect(result.invalid).toBe(false);
    expect(result.customerFilter.invalid).toBe(true);
    expect(result.query.customerId).toBeUndefined();
    expect(result.query.status).toBe('CANCELLED');
  });
  it('uses bounded defaults and accepts an intentional empty search/status', () => {
    expect(
      readAdminServiceQuery(new URLSearchParams('search=&status=')).query,
    ).toEqual({ page: 1, pageSize: 20 });
    expect(() =>
      adminServiceQueryString({ page: 2147483647, pageSize: 100 }),
    ).toThrow();
    expect(() =>
      adminServiceQueryString({ page: 1, pageSize: 20, serverId: customerId }),
    ).toThrow();
  });
  it('accepts empty out-of-range metadata without silently clamping', () => {
    const page = {
      success: true,
      data: [],
      pagination: { page: 8, pageSize: 20, totalItems: 140, totalPages: 7 },
    };
    expect(parseAdminServicePage(page, { page: 8, pageSize: 20 })).toEqual(
      page,
    );
    expect(() =>
      parseAdminServicePage(
        { ...page, pagination: { ...page.pagination, totalPages: 8 } },
        { page: 8, pageSize: 20 },
      ),
    ).toThrow(/inconsistent/);
  });
});
