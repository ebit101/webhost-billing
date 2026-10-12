import { randomBytes, randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { parseApiEnvironment } from '@webhost-billing/config';
import type { PrismaClient } from '@webhost-billing/database';
import {
  SmtpConfigurationCipher,
  SMTP_KEY_VERSION,
} from '@webhost-billing/database/smtp-settings';
import {
  smtpSettingsStatusSchema,
  type SmtpSettingsStatus,
} from '@webhost-billing/shared';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { API_ENVIRONMENT } from '../src/infrastructure/environment/environment.module';
import { PRISMA_CLIENT } from '../src/infrastructure/database/database.module';
import { hashOpaqueToken } from '../src/modules/auth/services/auth-token.service';
import { TotpService } from '../src/modules/auth/services/totp.service';

describe('SMTP configuration in a marked fictional schema (e2e)', () => {
  let app: INestApplication<App>, prisma: PrismaClient, totp: TotpService;
  let owner: ReturnType<typeof request.agent>,
    unenrolled: ReturnType<typeof request.agent>,
    customer: ReturnType<typeof request.agent>,
    support: ReturnType<typeof request.agent>;
  const secret = 'fake'.repeat(8);
  const input = {
    host: 'smtp.provider.com',
    connection: { security: 'STARTTLS', port: 587 },
    username: 'fictional-smtp-user',
    password: secret,
    confirmation: 'SAVE_SMTP',
  };
  beforeAll(async () => {
    const schema = process.env.WEBHOST_BROWSER_E2E_SCHEMA;
    if (!schema || !/^command26_e2e_[a-f0-9]{32}$/.test(schema))
      throw new Error('SMTP acceptance requires the owned API test runner.');
    const environment = parseApiEnvironment({
      ...process.env,
      PORT: '3201',
      NODE_ENV: 'test',
    });
    const url = new URL(environment.DATABASE_URL);
    if (
      !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
      url.searchParams.get('schema') !== schema
    )
      throw new Error('SMTP acceptance requires isolated loopback PostgreSQL.');
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(API_ENVIRONMENT)
      .useValue(environment)
      .compile();
    app = module.createNestApplication();
    await app.init();
    prisma = module.get(PRISMA_CLIENT);
    totp = module.get(TotpService);
    const rows = await prisma.$queryRaw<
      { schema: string; owner: string }[]
    >`SELECT current_schema() AS schema, owner FROM __browser_e2e_scope`;
    if (
      rows.length !== 1 ||
      rows[0]?.schema !== schema ||
      rows[0]?.owner !== schema
    )
      throw new Error('SMTP fictional schema marker mismatch.');
    if (
      await prisma.integrationCredential.findUnique({
        where: { providerKey: 'smtp' },
      })
    )
      throw new Error('SMTP fixture cannot replace an existing credential.');
    owner = await account('FULL_ADMINISTRATOR', true);
    unenrolled = await account('FULL_ADMINISTRATOR', false);
    customer = await account('CUSTOMER', false);
    support = await account('SUPPORT_OPERATOR', true);
  });
  afterAll(async () => {
    if (app) await app.close();
  });
  async function account(
    role: 'FULL_ADMINISTRATOR' | 'SUPPORT_OPERATOR' | 'CUSTOMER',
    mfa: boolean,
  ) {
    const id = randomUUID();
    const now = new Date();
    await prisma.user.create({
      data: {
        id,
        email: `${id}@example.test`,
        role: role === 'CUSTOMER' ? 'CUSTOMER' : 'ADMIN',
        status: 'ACTIVE',
        emailVerifiedAt: new Date(),
        ...(role === 'CUSTOMER'
          ? {
              customer: {
                create: {
                  customerNumber: `S52-${id.slice(0, 8)}`,
                  firstName: 'Fictional',
                  lastName: 'Customer',
                  addressLine1: '1 Test Road',
                  city: 'Dhaka',
                  countryCode: 'BD',
                },
              },
            }
          : {
              adminProfile: {
                create: {
                  displayName: 'Fictional SMTP administrator',
                  staffRole: role,
                },
              },
              ...(mfa
                ? {
                    adminTotpCredential: {
                      create: {
                        secretCiphertext: totp.encryptSecret(
                          totp.generateSecret(),
                        ),
                        keyVersion: 'mfa-v1',
                        createdAt: now,
                        enabledAt: now,
                      },
                    },
                  }
                : {}),
            }),
      },
    });
    const token = randomBytes(32).toString('hex');
    const sessionTime = new Date();
    await prisma.authSession.create({
      data: {
        userId: id,
        tokenHash: hashOpaqueToken(token),
        createdAt: sessionTime,
        expiresAt: new Date(sessionTime.getTime() + 3600000),
        twoFactorVerifiedAt: mfa ? sessionTime : null,
      },
    });
    return request
      .agent(app.getHttpServer())
      .set('Cookie', `webhost_session=${token}`);
  }
  async function put(
    agent: ReturnType<typeof request.agent>,
    body: object,
    expected: number,
    activate = false,
  ) {
    const csrf = await agent.get('/auth/csrf').expect(200);
    const csrfBody = csrf.body as { data: { csrfToken: string } };
    return agent[activate ? 'post' : 'put'](
      activate ? '/settings/smtp/activation' : '/settings/smtp',
    )
      .set('X-CSRF-Token', csrfBody.data.csrfToken)
      .send(body)
      .expect(expected);
  }
  function status(body: unknown): SmtpSettingsStatus {
    return smtpSettingsStatusSchema.parse((body as { data: unknown }).data);
  }
  it('denies anonymous, customer, restricted staff and unenrolled administrators', async () => {
    await request(app.getHttpServer()).get('/settings/smtp').expect(401);
    for (const agent of [customer, support, unenrolled]) {
      await agent.get('/settings/smtp').expect(403);
      await put(agent, input, 403);
      await put(
        agent,
        {
          enabled: true,
          confirmation: 'ENABLE_SMTP',
          revision: 'a'.repeat(64),
        },
        403,
        true,
      );
    }
    expect(
      await prisma.integrationCredential.count({
        where: { providerKey: 'smtp' },
      }),
    ).toBe(0);
  });
  it('requires CSRF and strict TLS configuration before any persistent change', async () => {
    const response = await owner.get('/settings/smtp').expect(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(status(response.body).configured).toBe(false);
    await owner.put('/settings/smtp').send(input).expect(403);
    for (const body of [
      { ...input, confirmation: 'yes' },
      { ...input, host: 'http://localhost' },
      { ...input, connection: { security: 'NONE', port: 25 } },
      { ...input, enabled: true },
    ])
      await put(owner, body, 400);
    await put(
      owner,
      { enabled: true, confirmation: 'ENABLE_SMTP', revision: 'a'.repeat(64) },
      422,
      true,
    );
    expect(
      await prisma.integrationCredential.count({
        where: { providerKey: 'smtp' },
      }),
    ).toBe(0);
  });
  it('encrypts the complete bundle, audits safely and never activates on save', async () => {
    const response = await put(owner, input, 200);
    const view = status(response.body);
    expect(view).toMatchObject({
      configured: true,
      enabled: false,
      passwordConfigured: true,
      maskedUsername: '••••••••',
    });
    expect(JSON.stringify(response.body)).not.toContain(secret);
    expect(JSON.stringify(response.body)).not.toContain(input.username);
    const stored = await prisma.integrationCredential.findUniqueOrThrow({
      where: { providerKey: 'smtp' },
    });
    expect(stored.ciphertext).not.toContain(secret);
    expect(stored.ciphertext).not.toContain(input.username);
    expect(stored.keyVersion).toBe(SMTP_KEY_VERSION);
    const cipher = new SmtpConfigurationCipher(moduleEnvironmentKey());
    expect(cipher.decrypt(stored.keyVersion, stored.ciphertext)).toMatchObject({
      password: secret,
      enabled: false,
    });
    const ordinary = await owner.get('/settings').expect(200);
    expect(JSON.stringify(ordinary.body)).not.toContain(stored.ciphertext);
    const audits = await prisma.activityLog.findMany({
      where: { entityId: stored.id },
    });
    expect(audits.map((row) => row.action)).toContain(
      'SMTP_CONFIGURATION_SAVED_BY_ADMIN',
    );
    expect(JSON.stringify(audits)).not.toContain(secret);
    expect(JSON.stringify(audits)).not.toContain(input.username);
  });
  it('binds activation to the reviewed revision, rejects stale changes and resets rotation to inactive', async () => {
    const before = status((await owner.get('/settings/smtp').expect(200)).body);
    const changed = status(
      (await put(owner, { ...input, password: 'fake2'.repeat(8) }, 200)).body,
    );
    expect(changed.revision).not.toBe(before.revision);
    await put(
      owner,
      { enabled: true, confirmation: 'ENABLE_SMTP', revision: before.revision },
      422,
      true,
    );
    const enabled = status(
      (
        await put(
          owner,
          {
            enabled: true,
            confirmation: 'ENABLE_SMTP',
            revision: changed.revision,
          },
          200,
          true,
        )
      ).body,
    );
    expect(enabled.enabled).toBe(true);
    const disabled = status(
      (
        await put(
          owner,
          {
            enabled: false,
            confirmation: 'USE_DEPLOYMENT_EMAIL',
            revision: enabled.revision,
          },
          200,
          true,
        )
      ).body,
    );
    expect(disabled.enabled).toBe(false);
    await put(
      owner,
      {
        enabled: true,
        confirmation: 'ENABLE_SMTP',
        revision: disabled.revision,
      },
      200,
      true,
    );
    const rotated = status((await put(owner, input, 200)).body);
    expect(rotated.enabled).toBe(false);
  });
  it('fails closed with redacted errors on corrupt stored credentials', async () => {
    const before = await prisma.integrationCredential.findUniqueOrThrow({
      where: { providerKey: 'smtp' },
    });
    await prisma.integrationCredential.update({
      where: { id: before.id },
      data: { ciphertext: 'broken' },
    });
    const failed = await owner.get('/settings/smtp').expect(422);
    expect(JSON.stringify(failed.body)).not.toContain(secret);
    await put(owner, input, 200);
  });
  function moduleEnvironmentKey() {
    return process.env.CREDENTIAL_ENCRYPTION_KEY ?? '';
  }
});
