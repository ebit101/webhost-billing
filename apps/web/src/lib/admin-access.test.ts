import { describe, expect, it } from 'vitest';
import { canAccessAdminPath, staffHome } from './admin-access';
import { staffRoleSchema } from '@webhost-billing/shared';

describe('staff navigation and route boundaries', () => {
  it('separates full, billing and support workspaces including deep routes', () => {
    for (const area of [
      'settings',
      'staff',
      'products',
      'services',
      'orders',
      'email',
      'automation',
      '',
    ]) {
      const path = `/admin/${area}`;
      expect(canAccessAdminPath('FULL_ADMINISTRATOR', path)).toBe(true);
      expect(canAccessAdminPath('BILLING_OPERATOR', path)).toBe(false);
      expect(canAccessAdminPath('SUPPORT_OPERATOR', path)).toBe(false);
    }
    expect(
      canAccessAdminPath('BILLING_OPERATOR', '/admin/invoices/fictional'),
    ).toBe(true);
    expect(
      canAccessAdminPath('BILLING_OPERATOR', '/admin/customers/fictional'),
    ).toBe(true);
    expect(canAccessAdminPath('BILLING_OPERATOR', '/admin/support')).toBe(
      false,
    );
    expect(canAccessAdminPath('SUPPORT_OPERATOR', '/admin/support')).toBe(true);
    expect(canAccessAdminPath('SUPPORT_OPERATOR', '/admin/payments')).toBe(
      false,
    );
    for (const role of staffRoleSchema.options)
      expect(canAccessAdminPath(role, staffHome(role))).toBe(true);
  });
});
