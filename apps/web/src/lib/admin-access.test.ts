import { describe, expect, it } from 'vitest';
import { canAccessAdminPath, staffHome } from './admin-access';
import { staffRoleSchema } from '@webhost-billing/shared';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('staff navigation and route boundaries', () => {
  it('routes the staff API to the staging backend without intercepting administrator pages', () => {
    const template = readFileSync(
      resolve(
        process.cwd(),
        '../../deploy/staging/nginx/my.speedhost.bd.conf.template',
      ),
      'utf8',
    );
    const location = template.match(
      /location ~ (\^\/\([^\n]+\)\(\/\|\$\)) \{\s+proxy_pass http:\/\/webhost_billing_staging_api;/,
    );
    const pattern = location?.[1];
    if (!pattern) throw new Error('Staging API proxy location was not found');
    const apiPath = new RegExp(pattern);
    expect(apiPath.test('/staff')).toBe(true);
    expect(apiPath.test('/staff/fictional-user/invitation')).toBe(true);
    for (const path of ['/admin/staff', '/staffing', '/portal', '/login']) {
      expect(apiPath.test(path)).toBe(false);
    }
  });
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
