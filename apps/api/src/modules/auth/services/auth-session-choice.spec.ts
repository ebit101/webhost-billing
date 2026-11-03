import { apiEnvironmentSchema } from '@webhost-billing/config';
import { customerSupportSessionRequestSchema } from '@webhost-billing/shared';
import {
  UserRole,
  UserStatus,
  type Prisma,
  type PrismaClient,
} from '@webhost-billing/database';
import { AuthService } from './auth.service';
import { AuthAuditService } from './auth-audit.service';
import { PasswordHasherService } from './password-hasher.service';
import { TokenCipherService } from './token-cipher.service';
import { TotpService } from './totp.service';
import { administratorSessionToken } from './admin-session-policy';
import { hashOpaqueToken } from './auth-token.service';

const day = 24 * 60 * 60 * 1_000;
const environment = apiEnvironmentSchema.parse({
  NODE_ENV: 'test',
  PORT: 3001,
  DATABASE_URL: 'postgresql://test:test@127.0.0.1:5432/test',
  REDIS_URL: 'redis://127.0.0.1:6379/0',
  SESSION_SECRET: 'test-session-secret-at-least-32-characters',
  CREDENTIAL_ENCRYPTION_KEY: 'test-encryption-key-at-least-32-characters',
});
const context = {
  ipAddressHash: 'a'.repeat(64),
  userAgent: 'Fictional browser',
};

function fixture() {
  const now = new Date();
  const user = {
    id: '10000000-0000-4000-8000-000000000001',
    email: 'admin@example.test',
    passwordHash: 'fictional-hash',
    role: UserRole.ADMIN,
    status: UserStatus.ACTIVE,
    emailVerifiedAt: now,
    deletedAt: null,
    customer: null,
    adminProfile: {
      id: '10000000-0000-4000-8000-000000000002',
      displayName: 'Fictional Administrator',
      staffRole: 'FULL_ADMINISTRATOR',
    },
    adminTotpCredential: {
      id: 'factor-id',
      enabledAt: now as Date | null,
      secretCiphertext: 'encrypted',
      recoveryCodes: [],
    },
  };
  const session = {
    id: '10000000-0000-4000-8000-000000000003',
    userId: user.id,
    user,
    revokedAt: null as Date | null,
    expiresAt: new Date(now.getTime() + 30 * day),
    lastSeenAt: new Date(now.getTime() - 2 * 60 * 60 * 1_000),
    twoFactorVerifiedAt: now as Date | null,
  };
  const prisma = {
    user: { findUnique: jest.fn().mockResolvedValue(user), update: jest.fn() },
    authSession: {
      findUnique: jest.fn().mockResolvedValue(session),
      create: jest.fn<Promise<unknown>, [{ data: Record<string, unknown> }]>(),
      updateMany: jest
        .fn<
          Promise<{ count: number }>,
          [{ where: Record<string, unknown>; data: Record<string, unknown> }]
        >()
        .mockResolvedValue({ count: 1 }),
    },
    adminLoginChallenge: {
      create: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findUnique: jest.fn().mockResolvedValue({
        id: 'challenge-id',
        usedAt: null,
        expiresAt: new Date(now.getTime() + day),
        failedAttempts: 0,
        ipAddressHash: context.ipAddressHash,
        user,
      }),
    },
    adminTotpCredential: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    activityLog: { create: jest.fn() },
    customer: { findFirst: jest.fn() },
    customerSupportSession: {
      create: jest.fn().mockResolvedValue({ id: 'support-session-id' }),
      findFirst: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    $transaction: jest.fn(async (work: unknown): Promise<unknown> => {
      if (typeof work === 'function')
        return (work as (tx: Prisma.TransactionClient) => Promise<unknown>)(
          prisma as unknown as Prisma.TransactionClient,
        );
      if (Array.isArray(work)) return Promise.all(work);
      throw new Error('Unexpected transaction');
    }),
  };
  const passwords = {
    verify: jest.fn().mockResolvedValue(true),
    consumeEquivalentWork: jest.fn(),
  };
  const factor = {
    verify: jest.fn().mockReturnValue(1n),
    decryptSecret: jest.fn().mockReturnValue('secret'),
    hashRecoveryCode: jest.fn().mockReturnValue('hash'),
  };
  const service = new AuthService(
    prisma as unknown as PrismaClient,
    { generate: () => 'fictional-random-token' },
    environment,
    passwords as unknown as PasswordHasherService,
    {} as TokenCipherService,
    factor as unknown as TotpService,
    { record: jest.fn() } as unknown as AuthAuditService,
  );
  return { service, prisma, user, session, passwords, factor };
}

function customerFixture(emailTwoStep: boolean) {
  const base = fixture();
  const user = {
    ...base.user,
    email: 'customer@example.test',
    role: UserRole.CUSTOMER,
    customer: { id: base.session.id },
    adminProfile: null,
    adminTotpCredential: null,
    customerSecurityPreference: emailTwoStep
      ? { emailTwoStep, marketingConsent: false }
      : null,
  };
  const cipher = new TokenCipherService(environment);
  const prisma = {
    ...base.prisma,
    user: {
      ...base.prisma.user,
      findUnique: jest.fn().mockResolvedValue(user),
    },
    authSession: {
      ...base.prisma.authSession,
      findFirst: jest.fn().mockResolvedValue({ id: base.session.id }),
    },
    $queryRaw: jest.fn(),
    customerSecurityPreference: {
      findUnique: jest.fn().mockResolvedValue(user.customerSecurityPreference),
      upsert: jest
        .fn()
        .mockResolvedValue({ emailTwoStep, marketingConsent: true }),
    },
    customerEmailChallenge: {
      updateMany: jest.fn(),
      create: jest.fn(async ({ data }) => ({
        ...data,
        id: base.session.id,
        usedAt: null,
        failedAttempts: 0,
      })),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    outboxEvent: { create: jest.fn() },
    $transaction: async (work: (tx: unknown) => Promise<unknown>) =>
      work(prisma),
  };
  const service = new AuthService(
    prisma as unknown as PrismaClient,
    { generate: () => 'fictional-random-token-that-is-long-enough' },
    environment,
    base.passwords as unknown as PasswordHasherService,
    cipher,
    {} as TotpService,
    { record: jest.fn() } as unknown as AuthAuditService,
  );
  return {
    prisma,
    service,
    cipher,
    user,
    login: { email: user.email, password: 'fictional-password' },
  };
}

describe('customer sign-in and consent preferences', () => {
  it('defaults to password sign-in and requires a separate explicit marketing opt-in', async () => {
    const { service, prisma, login } = customerFixture(false);
    const result = await service.login(login, context);
    if (!('identity' in result))
      throw new Error('Expected a password-only session');
    const auth = { identity: result.identity, sessionId: result.session.id };
    await expect(service.getCustomerSecurityPreferences(auth)).resolves.toEqual(
      {
        emailTwoStep: false,
        marketingConsent: false,
      },
    );
    await expect(
      service.updateCustomerSecurityPreferences(auth, {
        marketingConsent: true,
      }),
    ).resolves.toEqual({
      emailTwoStep: false,
      marketingConsent: true,
    });
    expect(prisma.customerSecurityPreference.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: { marketingConsent: true },
      }),
    );
    expect(prisma.customerEmailChallenge.create).not.toHaveBeenCalled();
  });

  it('issues a session only after a valid code and rejects a wrong code and replay', async () => {
    const { service, prisma, login, cipher } = customerFixture(true);
    const result = await service.login(login, context);
    if (!('challengeToken' in result))
      throw new Error('Expected an email code challenge');
    expect(result.method).toBe('email');
    expect(prisma.authSession.create).not.toHaveBeenCalled();
    const challenge =
      await prisma.customerEmailChallenge.create.mock.results[0].value;
    const code = cipher.decrypt(challenge.deliveryCiphertext);
    expect(code).toMatch(/^\d{6}$/);
    expect(prisma.outboxEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          payload: {
            schemaVersion: 1,
            challengeId: challenge.id,
            recipientEmail: login.email,
          },
        }),
      }),
    );
    prisma.customerEmailChallenge.findUnique.mockResolvedValue(challenge);
    await expect(
      service.completeCustomerEmailLogin(
        {
          challengeToken: result.challengeToken,
          code: code === '000000' ? '000001' : '000000',
        },
        context,
      ),
    ).rejects.toThrow();
    expect(prisma.customerEmailChallenge.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { failedAttempts: { increment: 1 } },
      }),
    );
    expect(prisma.authSession.create).not.toHaveBeenCalled();
    await expect(
      service.completeCustomerEmailLogin(
        { challengeToken: result.challengeToken, code },
        context,
      ),
    ).resolves.toHaveProperty('session');
    prisma.customerEmailChallenge.findUnique.mockResolvedValue({
      ...challenge,
      usedAt: new Date(),
    });
    await expect(
      service.completeCustomerEmailLogin(
        { challengeToken: result.challengeToken, code },
        context,
      ),
    ).rejects.toThrow();
    expect(prisma.authSession.create).toHaveBeenCalledTimes(1);
  });
});

describe('customer support sessions', () => {
  const customerId = '10000000-0000-4000-8000-000000000009';
  const customerUserId = '10000000-0000-4000-8000-000000000010';

  it('validates the reason and limits starts to full administrators and eligible customers', async () => {
    expect(
      customerSupportSessionRequestSchema.safeParse({ reason: '   ' }).success,
    ).toBe(false);
    expect(
      customerSupportSessionRequestSchema.parse({
        reason: ' Review a ticket ',
      }),
    ).toEqual({ reason: 'Review a ticket' });
    const { service, prisma, session } = fixture();
    const admin = await service.authenticateSession('admin-token');
    if (admin.identity.role !== 'ADMIN')
      throw new Error('Expected administrator');
    const restricted = {
      ...admin,
      identity: { ...admin.identity, staffRole: 'SUPPORT_OPERATOR' as const },
    };
    await expect(
      service.startCustomerSupportSession(
        restricted,
        customerId,
        'Review a ticket',
        context,
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(prisma.customer.findFirst).not.toHaveBeenCalled();
    prisma.customer.findFirst.mockResolvedValue(null);
    await expect(
      service.startCustomerSupportSession(
        admin,
        customerId,
        'Review a ticket',
        context,
      ),
    ).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND' });
    prisma.customer.findFirst.mockResolvedValue({ id: customerId });
    const token = await service.startCustomerSupportSession(
      admin,
      customerId,
      'Review a ticket',
      context,
    );
    expect(prisma.customerSupportSession.create).toHaveBeenCalledWith({
      data: {
        customerId,
        adminSessionId: session.id,
        tokenHash: hashOpaqueToken(token),
        expiresAt: expect.any(Date),
      },
    });
    expect(prisma.activityLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorUserId: admin.identity.userId,
        action: 'CUSTOMER_SUPPORT_SESSION_STARTED',
        entityId: customerId,
        metadata: expect.objectContaining({
          reason: 'Review a ticket',
          supportSessionId: 'support-session-id',
        }),
      }),
    });
  });

  it('scopes the customer identity to an unexpired record tied to the live parent session', async () => {
    const { service, prisma, session, user } = fixture();
    const expiresAt = new Date(Date.now() + 60_000);
    prisma.customerSupportSession.findFirst.mockResolvedValue({
      id: 'support-session-id',
      customerId,
      expiresAt,
      customer: {
        userId: customerUserId,
        user: { email: 'customer@example.test' },
      },
    });
    await expect(
      service.authenticateCustomerSupportSession(
        'admin-token',
        'support-token',
      ),
    ).resolves.toEqual({
      sessionId: 'support-session-id',
      supportAdministratorId: user.id,
      identity: {
        role: 'CUSTOMER',
        userId: customerUserId,
        customerId,
        email: 'customer@example.test',
        supportSession: { expiresAt: expiresAt.toISOString() },
      },
    });
    expect(prisma.customerSupportSession.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tokenHash: hashOpaqueToken('support-token'),
          adminSessionId: session.id,
          endedAt: null,
          expiresAt: { gt: expect.any(Date) },
        }),
      }),
    );
    session.revokedAt = new Date();
    await expect(
      service.authenticateCustomerSupportSession(
        'admin-token',
        'support-token',
      ),
    ).rejects.toMatchObject({ code: 'AUTHENTICATION_REQUIRED' });
    expect(prisma.customerSupportSession.findFirst).toHaveBeenCalledTimes(1);
  });

  it('ends and audits the support session once without revoking the administrator', async () => {
    const { service, prisma, user } = fixture();
    prisma.customerSupportSession.findFirst.mockResolvedValue({
      id: 'support-session-id',
      customerId,
      adminSession: { userId: user.id },
    });
    prisma.customerSupportSession.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    await expect(
      service.endCustomerSupportSession(
        'admin-token',
        'support-token',
        context,
      ),
    ).resolves.toBe(customerId);
    await expect(
      service.endCustomerSupportSession(
        'admin-token',
        'support-token',
        context,
      ),
    ).resolves.toBe(customerId);
    expect(prisma.activityLog.create).toHaveBeenCalledTimes(1);
    expect(prisma.activityLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorUserId: user.id,
        action: 'CUSTOMER_SUPPORT_SESSION_ENDED',
        entityId: customerId,
      }),
    });
    expect(prisma.authSession.updateMany).not.toHaveBeenCalled();
  });
});

describe('administrator session persistence', () => {
  it.each([false, true])(
    'still requires MFA on a new sign-in with remember device = %s',
    async (rememberDevice) => {
      const { service, prisma, passwords } = fixture();
      const result = await service.login(
        {
          email: 'admin@example.test',
          password: 'fictional-password',
          rememberDevice,
        },
        context,
      );
      expect(passwords.verify).toHaveBeenCalled();
      expect(result).toMatchObject({ requiresTwoFactor: true });
      expect(prisma.authSession.create).not.toHaveBeenCalled();
    },
  );

  it.each([false, true])(
    'creates the chosen lifetime only after MFA with remember device = %s',
    async (rememberDevice) => {
      const { service, prisma } = fixture();
      const result = await service.completeTwoFactorLogin(
        { challengeToken: 'challenge', code: '123456', rememberDevice },
        context,
      );
      expect(
        new Date(result.session.expiresAt).getTime() -
          new Date(result.session.createdAt).getTime(),
      ).toBe(rememberDevice ? 30 * day : day);
      const created = prisma.authSession.create.mock.calls[0]?.[0].data;
      expect(result.identity).toMatchObject({
        displayName: 'Fictional Administrator',
      });
      expect(created?.tokenHash).toBe(hashOpaqueToken(result.token));
      expect(created?.twoFactorVerifiedAt).toBeInstanceOf(Date);
      expect(
        JSON.stringify(prisma.authSession.create.mock.calls),
      ).not.toContain(result.token);
    },
  );

  it('cannot create a remembered session with an invalid or replayed code', async () => {
    const { service, prisma } = fixture();
    prisma.adminTotpCredential.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      service.completeTwoFactorLogin(
        { challengeToken: 'challenge', code: '123456', rememberDevice: true },
        context,
      ),
    ).rejects.toThrow();
    expect(prisma.authSession.create).not.toHaveBeenCalled();
  });

  it('applies the same choice on password-only administrator login', async () => {
    const { service, user } = fixture();
    user.adminTotpCredential.enabledAt = null;
    const result = await service.login(
      {
        email: user.email,
        password: 'fictional-password',
        rememberDevice: true,
      },
      context,
    );
    if ('requiresTwoFactor' in result) throw new Error('Unexpected challenge');
    expect(result.identity).toMatchObject({
      displayName: 'Fictional Administrator',
    });
    expect(
      new Date(result.session.expiresAt).getTime() -
        new Date(result.session.createdAt).getTime(),
    ).toBe(30 * day);
  });

  it('keeps an idle remembered session within its original absolute deadline', async () => {
    const { service, prisma, session } = fixture();
    const result = await service.authenticateSession(
      administratorSessionToken('random', true),
    );
    expect(result.sessionExpiresAt).toBe(session.expiresAt.toISOString());
    expect(result.identity).toMatchObject({
      displayName: 'Fictional Administrator',
    });
    const update = prisma.authSession.updateMany.mock.calls[0]?.[0];
    expect(update?.where).toEqual({ id: session.id, revokedAt: null });
    expect(update?.data.lastSeenAt).toBeInstanceOf(Date);
    expect(update?.data).not.toHaveProperty('expiresAt');
  });

  it('expires an idle browser session instead of promoting it to persistent access', async () => {
    const { service, prisma } = fixture();
    await expect(
      service.authenticateSession(administratorSessionToken('random', false)),
    ).rejects.toThrow();
    expect(
      prisma.authSession.updateMany.mock.calls[0]?.[0].data.revokedReason,
    ).toBe('IDLE_TIMEOUT');
  });

  it.each(['expired', 'revoked', 'missing factor'] as const)(
    'denies a remembered session that is %s',
    async (condition) => {
      const { service, session } = fixture();
      if (condition === 'expired') session.expiresAt = new Date(0);
      if (condition === 'revoked') session.revokedAt = new Date();
      if (condition === 'missing factor') session.twoFactorVerifiedAt = null;
      await expect(
        service.authenticateSession(administratorSessionToken('random', true)),
      ).rejects.toThrow();
    },
  );

  it('rejects a modified policy marker because the exact token has no stored hash', async () => {
    const { service, prisma } = fixture();
    prisma.authSession.findUnique.mockResolvedValue(null);
    const tampered = administratorSessionToken('random', true);
    await expect(service.authenticateSession(tampered)).rejects.toThrow();
    expect(prisma.authSession.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tokenHash: hashOpaqueToken(tampered) },
      }),
    );
  });

  it('retains renewal of already issued legacy administrator sessions', async () => {
    const { service, prisma } = fixture();
    await service.authenticateSession('existing-unprefixed-token');
    expect(
      prisma.authSession.updateMany.mock.calls[0]?.[0].data.expiresAt,
    ).toBeInstanceOf(Date);
  });
});
