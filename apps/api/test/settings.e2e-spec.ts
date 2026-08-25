import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import {
  parseApiEnvironment,
  type ApiEnvironment,
} from '@webhost-billing/config';
import {
  Prisma,
  UserRole,
  UserStatus,
  type PrismaClient,
} from '@webhost-billing/database';
import {
  apiSuccessResponseSchema,
  credentialStatusSchema,
  settingsOverviewSchema,
} from '@webhost-billing/shared';
import request from 'supertest';
import type { App } from 'supertest/types';
import { z } from 'zod';
import { AppModule } from '../src/app.module';
import { PRISMA_CLIENT } from '../src/infrastructure/database/database.module';
import { API_ENVIRONMENT } from '../src/infrastructure/environment/environment.module';
import { PasswordHasherService } from '../src/modules/auth/services/password-hasher.service';

const ADMIN_EMAIL = 'command21-admin@example.test';
const CUSTOMER_EMAIL = 'command21-customer@example.test';
const PASSWORD = 'command twenty one secure password';
const SECRET_VALUE = 'fictional-command21-secret-value';
const SETTING_KEYS = [
  'business.identity',
  'business.localization',
  'billing.invoice-numbering',
  'automation.renewal-policy',
  'business.termination-policy',
  'billing.manual-payments',
  'billing.manual-payment-instructions',
  'email.branding',
  'integration.active-providers',
];

describe('Settings and encrypted credentials (e2e)', () => {
  let app: INestApplication<App>;
  let moduleFixture: TestingModule;
  let prisma: PrismaClient;
  let originalSettings: Array<{
    key: string;
    category:
      | 'BUSINESS'
      | 'BILLING'
      | 'AUTOMATION'
      | 'EMAIL'
      | 'INTEGRATION'
      | 'SECURITY';
    value: Prisma.JsonValue;
    description: string | null;
    updatedByUserId: string | null;
  }> = [];
  let originalCredential: {
    ciphertext: string;
    keyVersion: string;
    maskedIdentifier: string;
    updatedByUserId: string;
  } | null = null;

  beforeAll(async () => {
    moduleFixture = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(API_ENVIRONMENT)
      .useValue(loadTestEnvironment())
      .compile();
    app = moduleFixture.createNestApplication();
    await app.init();
    prisma = moduleFixture.get(PRISMA_CLIENT);
    originalSettings = await prisma.setting.findMany({
      where: { key: { in: SETTING_KEYS } },
      select: {
        key: true,
        category: true,
        value: true,
        description: true,
        updatedByUserId: true,
      },
    });
    originalCredential = await prisma.integrationCredential.findUnique({
      where: { providerKey: 'bkash' },
      select: {
        ciphertext: true,
        keyVersion: true,
        maskedIdentifier: true,
        updatedByUserId: true,
      },
    });
    await cleanupUsers();
    const passwordHash = await moduleFixture
      .get(PasswordHasherService)
      .hash(PASSWORD);
    await prisma.user.create({
      data: {
        email: ADMIN_EMAIL,
        passwordHash,
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
        emailVerifiedAt: new Date(),
        adminProfile: { create: { displayName: 'Command Twenty One Admin' } },
      },
    });
    await prisma.user.create({
      data: {
        email: CUSTOMER_EMAIL,
        passwordHash,
        role: UserRole.CUSTOMER,
        status: UserStatus.ACTIVE,
        emailVerifiedAt: new Date(),
        customer: {
          create: {
            customerNumber: `C21-${randomUUID().slice(0, 8)}`,
            firstName: 'Command Twenty One',
            lastName: 'Customer',
            addressLine1: '21 Fictional Road',
            city: 'Dhaka',
            countryCode: 'BD',
          },
        },
      },
    });
  });

  afterAll(async () => {
    if (prisma) {
      await restoreCredential();
      await restoreSettings();
      await cleanupUsers();
    }
    if (app) await app.close();
  });

  it('authorizes settings and validates the complete ordinary document', async () => {
    const customer = request.agent(app.getHttpServer());
    await authenticate(customer, CUSTOMER_EMAIL);
    await customer.get('/settings').expect(403);

    const admin = request.agent(app.getHttpServer());
    const csrf = await authenticate(admin, ADMIN_EMAIL);
    const initial = await admin.get('/settings').expect(200);
    const overview = apiSuccessResponseSchema(settingsOverviewSchema).parse(
      initial.body,
    ).data;
    const { credentialStatuses, ...ordinary } = overview;
    void credentialStatuses;
    const updatedBody = {
      ...ordinary,
      businessIdentity: {
        ...ordinary.businessIdentity,
        name: 'Fictional Command 21 Hosting',
      },
      invoiceNumbering: {
        prefix: 'BILL',
        nextNumber: 4321,
        padding: 6,
      },
      manualPayments: {
        partialPaymentsEnabled: true,
        instructions:
          'Use only the fictional development bank reference shown on the invoice.',
      },
      emailBranding: {
        brandName: 'Fictional Hosting',
        brandColor: '#0E7490',
        fromName: 'Fictional Billing',
        fromAddress: 'billing@example.test',
        replyToAddress: 'support@example.test',
      },
      activeGateway: 'manual',
    };
    const updated = await admin
      .put('/settings')
      .set('X-CSRF-Token', csrf)
      .send(updatedBody)
      .expect(200);
    const parsed = apiSuccessResponseSchema(settingsOverviewSchema).parse(
      updated.body,
    ).data;
    expect(parsed.invoiceNumbering).toEqual(updatedBody.invoiceNumbering);
    expect(parsed.manualPayments.instructions).toContain('fictional');

    await admin
      .put('/settings')
      .set('X-CSRF-Token', csrf)
      .send({
        ...updatedBody,
        renewalAutomation: {
          ...updatedBody.renewalAutomation,
          timeZone: 'UTC',
        },
      })
      .expect(400);
  });

  it('encrypts credential rotation and returns only masked status', async () => {
    const admin = request.agent(app.getHttpServer());
    const csrf = await authenticate(admin, ADMIN_EMAIL);
    await admin
      .put('/settings/credentials')
      .set('X-CSRF-Token', csrf)
      .send({
        provider: 'bkash',
        confirmation: 'REPLACE_CREDENTIALS',
        credentials: { appKey: 'incomplete' },
      })
      .expect(400);

    const rotated = await admin
      .put('/settings/credentials')
      .set('X-CSRF-Token', csrf)
      .send({
        provider: 'bkash',
        confirmation: 'REPLACE_CREDENTIALS',
        credentials: {
          appKey: 'fictional-command21-app-key',
          appSecret: SECRET_VALUE,
          username: 'fictional-command21-user',
          password: 'fictional-command21-password',
        },
      })
      .expect(200);
    const status = apiSuccessResponseSchema(credentialStatusSchema).parse(
      rotated.body,
    ).data;
    expect(status.configured).toBe(true);
    expect(status.maskedIdentifier).toContain('fi***er');
    expect(JSON.stringify(rotated.body)).not.toContain(SECRET_VALUE);

    const stored = await prisma.integrationCredential.findUniqueOrThrow({
      where: { providerKey: 'bkash' },
    });
    expect(stored.ciphertext).not.toContain(SECRET_VALUE);
    expect(stored.keyVersion).toBe('integration-credential-v1');
    const overview = await admin.get('/settings').expect(200);
    expect(JSON.stringify(overview.body)).not.toContain(SECRET_VALUE);
    expect(JSON.stringify(overview.body)).not.toContain(stored.ciphertext);

    const audit = await prisma.activityLog.findFirstOrThrow({
      where: {
        actorUserId: stored.updatedByUserId,
        action: {
          in: [
            'INTEGRATION_CREDENTIAL_CONFIGURED_BY_ADMIN',
            'INTEGRATION_CREDENTIAL_ROTATED_BY_ADMIN',
          ],
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    expect(JSON.stringify(audit.metadata)).not.toContain(SECRET_VALUE);
  });

  async function authenticate(
    agent: ReturnType<typeof request.agent>,
    email: string,
  ) {
    const csrfResponse = await agent.get('/auth/csrf').expect(200);
    const csrf = apiSuccessResponseSchema(
      z.object({ csrfToken: z.string().min(32) }).strict(),
    ).parse(csrfResponse.body).data.csrfToken;
    await agent
      .post('/auth/login')
      .set('X-CSRF-Token', csrf)
      .send({ email, password: PASSWORD })
      .expect(200);
    return csrf;
  }

  async function restoreSettings() {
    const originalKeys = originalSettings.map((setting) => setting.key);
    await prisma.setting.deleteMany({
      where: {
        key: { in: SETTING_KEYS.filter((key) => !originalKeys.includes(key)) },
      },
    });
    for (const setting of originalSettings) {
      await prisma.setting.upsert({
        where: { key: setting.key },
        update: {
          category: setting.category,
          value: setting.value === null ? Prisma.JsonNull : setting.value,
          description: setting.description,
          updatedByUserId: setting.updatedByUserId,
        },
        create: {
          ...setting,
          value: setting.value === null ? Prisma.JsonNull : setting.value,
        },
      });
    }
  }

  async function restoreCredential() {
    if (originalCredential) {
      await prisma.integrationCredential.upsert({
        where: { providerKey: 'bkash' },
        update: originalCredential,
        create: { providerKey: 'bkash', ...originalCredential },
      });
    } else {
      await prisma.integrationCredential.deleteMany({
        where: { providerKey: 'bkash' },
      });
    }
  }

  async function cleanupUsers() {
    if (!prisma) return;
    const users = await prisma.user.findMany({
      where: { email: { in: [ADMIN_EMAIL, CUSTOMER_EMAIL] } },
      select: { id: true },
    });
    const ids = users.map(({ id }) => id);
    if (ids.length === 0) return;
    await prisma.activityLog.deleteMany({
      where: { actorUserId: { in: ids } },
    });
    await prisma.authSession.deleteMany({ where: { userId: { in: ids } } });
    await prisma.adminProfile.deleteMany({ where: { userId: { in: ids } } });
    await prisma.customer.deleteMany({ where: { userId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
  }

  function loadTestEnvironment(): ApiEnvironment {
    return parseApiEnvironment({
      ...process.env,
      PORT: process.env.API_PORT ?? '3001',
      NODE_ENV: 'test',
      API_PUBLIC_ORIGIN: 'https://api.example.test',
      AUTH_RATE_LIMIT_NAMESPACE: `settings-e2e-${randomUUID()}`,
      BULLMQ_PREFIX: `settings-e2e-${randomUUID().replaceAll('-', '')}`,
    });
  }
});
