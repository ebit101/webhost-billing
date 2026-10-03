import { describe, expect, it } from 'vitest';
import {
  adminCustomerFilterHref,
  parseAdminCustomerFilter,
  withAdminCustomerFilter,
} from './admin-customer-filter';

const customerId = '70000000-0000-4000-8000-000000000001';

describe('administrator customer filter', () => {
  it('accepts one UUID and binds it to target URLs', () => {
    const filter = parseAdminCustomerFilter(customerId);

    expect(filter).toEqual({ customerId, invalid: false });
    expect(withAdminCustomerFilter('/admin/orders', filter)).toBe(
      `/admin/orders?customerId=${customerId}`,
    );
    expect(withAdminCustomerFilter('/orders?pageSize=100', filter)).toBe(
      `/orders?pageSize=100&customerId=${customerId}`,
    );
    expect(adminCustomerFilterHref('/admin/support', customerId)).toBe(
      `/admin/support?customerId=${customerId}`,
    );
  });

  it.each([['not-a-uuid'], [[customerId, customerId]]])(
    'rejects malformed or repeated customer context without inferring a customer',
    (value) => {
      expect(parseAdminCustomerFilter(value)).toEqual({ invalid: true });
    },
  );

  it('leaves an unfiltered path unchanged', () => {
    expect(withAdminCustomerFilter('/admin/invoices', { invalid: false })).toBe(
      '/admin/invoices',
    );
  });
});
