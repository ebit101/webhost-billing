import { apiEnvironmentSchema } from '@webhost-billing/config';
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
