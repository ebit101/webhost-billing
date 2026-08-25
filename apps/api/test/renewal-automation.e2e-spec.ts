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
  automationRunSummarySchema,
  renewalAutomationPolicySchema,
} from '@webhost-billing/shared';
import request from 'supertest';
import type { App } from 'supertest/types';
import { z } from 'zod';
import { AppModule } from '../src/app.module';
import { PRISMA_CLIENT } from '../src/infrastructure/database/database.module';
import { API_ENVIRONMENT } from '../src/infrastructure/environment/environment.module';
import { PasswordHasherService } from '../src/modules/auth/services/password-hasher.service';

const ADMIN_EMAIL = 'command19-admin@example.test';
const CUSTOMER_EMAIL = 'command19-customer@example.test';
const PASSWORD = 'command nineteen secure password';
const POLICY_KEY = 'automation.renewal-policy';

describe('Renewal automation administration (e2e)', () => {
  let app: INestApplication<App>;
  let moduleFixture: TestingModule;
  let prisma: PrismaClient;
  let originalSetting: {
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
  } | null = null;

  beforeAll(async () => {
    moduleFixture = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(API_ENVIRONMENT)
      .useValue(loadTestEnvironment())
      .compile();
    app = moduleFixture.createNestApplication();
    await app.init();
    prisma = moduleFixture.get(PRISMA_CLIENT);
    originalSetting = await prisma.setting.findUnique({
      where: { key: POLICY_KEY },
      select: {
        category: true,
        value: true,
        description: true,
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
        adminProfile: { create: { displayName: 'Command Nineteen Admin' } },
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
            customerNumber: `C19-${randomUUID().slice(0, 8)}`,
            firstName: 'Command Nineteen',
            lastName: 'Customer',
            addressLine1: '19 Fictional Road',
            city: 'Dhaka',
            countryCode: 'BD',
          },
        },
      },
    });
  });

  afterAll(async () => {
    if (originalSetting) {
      await prisma.setting.update({
        where: { key: POLICY_KEY },
        data: {
          ...originalSetting,
          value:
            originalSetting.value === null
              ? Prisma.JsonNull
              : originalSetting.value,
        },
      });
    } else {
      await prisma.setting.deleteMany({ where: { key: POLICY_KEY } });
    }
    await cleanupUsers();
    await app.close();
  });

  it('restricts policy and run history to admins and validates policy updates', async () => {
    const customer = request.agent(app.getHttpServer());
    await authenticate(customer, CUSTOMER_EMAIL);
    await customer.get('/renewal-automation/policy').expect(403);
    await customer.get('/renewal-automation/runs').expect(403);

    const admin = request.agent(app.getHttpServer());
    const csrf = await authenticate(admin, ADMIN_EMAIL);
    await admin
      .put('/renewal-automation/policy')
      .set('X-CSRF-Token', csrf)
      .send({
        enabled: true,
        invoiceLeadDays: 7,
        reminderDaysBeforeDue: [7, 7],
        gracePeriodDays: 3,
        timeZone: 'invalid/timezone',
      })
      .expect(400);

    const policy = {
      enabled: true,
      invoiceLeadDays: 21,
      reminderDaysBeforeDue: [10, 5, 1],
      gracePeriodDays: 4,
      timeZone: 'Asia/Dhaka',
    };
    const updated = await admin
      .put('/renewal-automation/policy')
      .set('X-CSRF-Token', csrf)
      .send(policy)
      .expect(200);
    expect(
      apiSuccessResponseSchema(renewalAutomationPolicySchema).parse(
        updated.body,
      ).data,
    ).toEqual(policy);

    const read = await admin.get('/renewal-automation/policy').expect(200);
    expect(
      apiSuccessResponseSchema(renewalAutomationPolicySchema).parse(read.body)
        .data,
    ).toEqual(policy);
    const runs = await admin.get('/renewal-automation/runs').expect(200);
    expect(
      apiSuccessResponseSchema(z.array(automationRunSummarySchema)).parse(
        runs.body,
      ).data,
    ).toEqual(expect.any(Array));
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

  async function cleanupUsers() {
    if (!prisma) return;
    const users = await prisma.user.findMany({
      where: { email: { in: [ADMIN_EMAIL, CUSTOMER_EMAIL] } },
      select: { id: true },
    });
    const ids = users.map(({ id }) => id);
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
      AUTH_RATE_LIMIT_NAMESPACE: `renewal-e2e-${randomUUID()}`,
      BULLMQ_PREFIX: `renewal-e2e-${randomUUID().replaceAll('-', '')}`,
    });
  }
});
