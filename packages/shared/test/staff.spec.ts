import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  authenticatedIdentitySchema,
  createStaffRequestSchema,
  hasStaffPermission,
  staffHome,
  staffPermissions,
  staffRoleSchema,
  updateStaffRequestSchema,
} from '../src';

describe('fixed staff roles', () => {
  it('uses narrow grants and denies unknown or missing roles', () => {
    for (const permission of staffPermissions)
      assert.equal(hasStaffPermission('FULL_ADMINISTRATOR', permission), true);
    assert.equal(
      hasStaffPermission('BILLING_OPERATOR', 'tickets.manage'),
      false,
    );
    assert.equal(
      hasStaffPermission('SUPPORT_OPERATOR', 'payments.manage'),
      false,
    );
    assert.equal(
      hasStaffPermission('SUPPORT_OPERATOR', 'customers.read'),
      false,
    );
    assert.equal(
      hasStaffPermission('BILLING_OPERATOR', 'invoices.manage'),
      true,
    );
    assert.equal(
      hasStaffPermission('SUPPORT_OPERATOR', 'tickets.manage'),
      true,
    );
    for (const role of [undefined, null, 'ADMIN', 'API_USER', '__proto__'])
      assert.equal(hasStaffPermission(role, 'account.self'), false);
  });
  it('does not silently upgrade an old/malformed administrator identity', () => {
    const identity = {
      userId: '92000000-0000-4000-8000-000000000001',
      email: 'staff@example.test',
      role: 'ADMIN',
      adminProfileId: '92000000-0000-4000-8000-000000000002',
    };
    assert.equal(
      authenticatedIdentitySchema.safeParse(identity).success,
      false,
    );
    for (const staffRole of staffRoleSchema.options)
      assert.equal(
        authenticatedIdentitySchema.safeParse({
          ...identity,
          staffRole,
          twoFactorEnabled: false,
        }).success,
        true,
      );
    assert.equal(staffHome('BILLING_OPERATOR'), '/admin/invoices');
    assert.equal(staffHome('SUPPORT_OPERATOR'), '/admin/support');
  });
  it('rejects password, super-admin, role/customer changes and custom grants in staff input', () => {
    const input = {
      email: ' Person@Example.Test ',
      displayName: ' Person ',
      staffRole: 'SUPPORT_OPERATOR',
    };
    assert.equal(
      createStaffRequestSchema.parse(input).email,
      'person@example.test',
    );
    for (const extra of [
      { password: 'secret' },
      { isSuperAdmin: true },
      { permissions: ['*'] },
      { role: 'ADMIN' },
      { department: '*' },
    ])
      assert.equal(
        createStaffRequestSchema.safeParse({ ...input, ...extra }).success,
        false,
      );
    assert.equal(
      updateStaffRequestSchema.safeParse({
        displayName: 'Person',
        staffRole: 'FULL_ADMINISTRATOR',
        enabled: 'false',
      }).success,
      false,
    );
  });
});
