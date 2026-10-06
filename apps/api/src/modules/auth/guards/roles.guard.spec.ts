import { Reflector } from '@nestjs/core';
import type { ExecutionContext } from '@nestjs/common';
import { apiEnvironmentSchema } from '@webhost-billing/config';
import type {
  AuthenticatedIdentity,
  Role,
  StaffPermission,
  StaffRole,
} from '@webhost-billing/shared';
import { AuthAuditService } from '../services/auth-audit.service';
import { REQUIRED_ROLES_KEY } from '../decorators/roles.decorator';
import { STAFF_PERMISSION_KEY } from '../decorators/staff-permission.decorator';
import { RolesGuard } from './roles.guard';

const environment = apiEnvironmentSchema.parse({
  NODE_ENV: 'test',
  PORT: 3001,
  DATABASE_URL: 'postgresql://test:test@127.0.0.1:5432/test',
  REDIS_URL: 'redis://127.0.0.1:6379',
  SESSION_SECRET: 'unit-test-secret-at-least-32-characters',
  CREDENTIAL_ENCRYPTION_KEY: 'unit-test-encryption-at-least-32-characters',
});
const userId = '92000000-0000-4000-8000-000000000001';

function identity(
  staffRole: StaffRole,
  twoFactorEnabled = true,
): AuthenticatedIdentity {
  return {
    userId,
    email: 'fictional@example.test',
    role: 'ADMIN',
    adminProfileId: userId,
    staffRole,
    twoFactorEnabled,
  };
}

describe('administrator permission enforcement', () => {
  const audit = {
    record: jest
      .fn<Promise<void>, Parameters<AuthAuditService['record']>>()
      .mockResolvedValue(undefined),
  };
  const guard = new RolesGuard(
    new Reflector(),
    audit as unknown as AuthAuditService,
    environment,
  );
  const run = (
    actor: AuthenticatedIdentity | undefined,
    permission?: StaffPermission,
    roles?: Role[],
  ) => {
    const handler = () => undefined;
    if (roles) Reflect.defineMetadata(REQUIRED_ROLES_KEY, roles, handler);
    if (permission)
      Reflect.defineMetadata(STAFF_PERMISSION_KEY, permission, handler);
    const request = {
      auth: actor ? { identity: actor } : undefined,
      headers: {},
      ip: '127.0.0.1',
      get: () => undefined,
    };
    return guard.canActivate({
      getHandler: () => handler,
      getClass: () => class {},
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext);
  };

  it.each(['BILLING_OPERATOR', 'SUPPORT_OPERATOR'] as const)(
    'denies %s on unannotated administrator and ownership routes',
    async (role) => {
      await expect(
        run(identity(role), undefined, ['ADMIN']),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      await expect(run(identity(role))).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
    },
  );
  it('allows full administrators but never treats an unknown role as full', async () => {
    await expect(
      run(identity('FULL_ADMINISTRATOR'), undefined, ['ADMIN']),
    ).resolves.toBe(true);
    await expect(
      run(
        {
          ...identity('FULL_ADMINISTRATOR'),
          staffRole: undefined,
        } as unknown as AuthenticatedIdentity,
        'account.self',
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
  it('enforces cross-role boundaries and preserves customer role checks', async () => {
    await expect(
      run(identity('BILLING_OPERATOR'), 'payments.manage', ['ADMIN']),
    ).resolves.toBe(true);
    await expect(
      run(identity('BILLING_OPERATOR'), 'tickets.manage', ['ADMIN']),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      run(identity('SUPPORT_OPERATOR'), 'tickets.manage', [
        'ADMIN',
        'CUSTOMER',
      ]),
    ).resolves.toBe(true);
    await expect(
      run(identity('SUPPORT_OPERATOR'), 'invoices.read', ['ADMIN', 'CUSTOMER']),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const customer: AuthenticatedIdentity = {
      userId,
      email: 'customer@example.test',
      role: 'CUSTOMER',
      customerId: userId,
    };
    await expect(
      run(customer, 'invoices.read', ['ADMIN', 'CUSTOMER']),
    ).resolves.toBe(true);
    await expect(
      run(customer, 'invoices.read', ['ADMIN']),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      run(undefined, 'payments.read', ['ADMIN']),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
  it.each(['BILLING_OPERATOR', 'SUPPORT_OPERATOR'] as const)(
    'requires enrolled MFA for %s work, without blocking enrollment',
    async (role) => {
      await expect(
        run(
          identity(role, false),
          role === 'BILLING_OPERATOR' ? 'invoices.read' : 'tickets.manage',
          ['ADMIN'],
        ),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      await expect(
        run(identity(role, false), 'account.self', ['ADMIN']),
      ).resolves.toBe(true);
    },
  );
  it('audits denied access without credentials or request body', async () => {
    audit.record.mockClear();
    await expect(
      run(identity('SUPPORT_OPERATOR'), 'payments.manage', ['ADMIN']),
    ).rejects.toThrow();
    expect(audit.record.mock.calls[0]?.[0]).toMatchObject({
      actorUserId: userId,
      action: 'AUTH_ROLE_ACCESS_DENIED',
      metadata: { permission: 'payments.manage' },
    });
    expect(JSON.stringify(audit.record.mock.calls)).not.toContain('password');
  });
  it('requires MFA for full-administrator staff changes too', async () => {
    await expect(
      run(identity('FULL_ADMINISTRATOR', false), 'staff.manage', ['ADMIN']),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      run(identity('FULL_ADMINISTRATOR', true), 'staff.manage', ['ADMIN']),
    ).resolves.toBe(true);
  });
});
