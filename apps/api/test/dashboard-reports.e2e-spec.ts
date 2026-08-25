import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import {
  parseApiEnvironment,
  type ApiEnvironment,
} from '@webhost-billing/config';
import {
  UserRole,
  UserStatus,
  type PrismaClient,
} from '@webhost-billing/database';
import {
  apiSuccessResponseSchema,
  dashboardResponseSchema,
} from '@webhost-billing/shared';
import request from 'supertest';
import type { App } from 'supertest/types';
import { z } from 'zod';
import { AppModule } from '../src/app.module';
import { PRISMA_CLIENT } from '../src/infrastructure/database/database.module';
import { API_ENVIRONMENT } from '../src/infrastructure/environment/environment.module';
import { PasswordHasherService } from '../src/modules/auth/services/password-hasher.service';

const ADMIN_EMAIL = 'command22-admin@example.test';
const CUSTOMER_EMAIL = 'command22-customer@example.test';
const PASSWORD = 'command twenty two secure password';

describe('Administrator dashboard and reports (e2e)', () => {
  let app: INestApplication<App>;
  let moduleFixture: TestingModule;
  let prisma: PrismaClient;

  beforeAll(async () => {
    moduleFixture = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(API_ENVIRONMENT)
      .useValue(loadTestEnvironment())
      .compile();
    app = moduleFixture.createNestApplication();
    await app.init();
    prisma = moduleFixture.get(PRISMA_CLIENT);
    await cleanup();
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
        adminProfile: { create: { displayName: 'Command Twenty Two Admin' } },
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
            customerNumber: `C22-${randomUUID().slice(0, 8)}`,
            firstName: '=FORMULA',
            lastName: 'Safety',
            addressLine1: '22 Fictional Road',
            city: 'Dhaka',
            countryCode: 'BD',
          },
        },
      },
    });
  });

  afterAll(async () => {
    if (prisma) await cleanup();
    if (app) await app.close();
  });

  it('serves live typed metrics only to administrators', async () => {
    const customer = request.agent(app.getHttpServer());
    await authenticate(customer, CUSTOMER_EMAIL);
    await customer.get('/dashboard').expect(403);

    const admin = request.agent(app.getHttpServer());
    await authenticate(admin, ADMIN_EMAIL);
    const response = await admin
      .get('/dashboard?from=2026-08-01&to=2026-08-31')
      .expect(200);
    const dashboard = apiSuccessResponseSchema(dashboardResponseSchema).parse(
      response.body,
    ).data;
    expect(dashboard.currency).toBe('BDT');
    expect(dashboard.timeZone).toBe('Asia/Dhaka');
    expect(dashboard.revenueSeries).toHaveLength(31);
  });

  it('protects, formula-safes, and audits CSV export creation', async () => {
    const customer = request.agent(app.getHttpServer());
    const customerCsrf = await authenticate(customer, CUSTOMER_EMAIL);
    await customer
      .post('/reports/exports/customers')
      .set('X-CSRF-Token', customerCsrf)
      .send({ from: '2026-08-01', to: '2026-08-31' })
      .expect(403);

    const admin = request.agent(app.getHttpServer());
    const csrf = await authenticate(admin, ADMIN_EMAIL);
    const response = await admin
      .post('/reports/exports/customers')
      .set('X-CSRF-Token', csrf)
      .send({ from: '2026-08-01', to: '2026-08-31' })
      .expect(200)
      .expect('Content-Type', /text\/csv/)
      .expect('Cache-Control', 'no-store');
    expect(response.text).toContain('"\'=FORMULA"');
    expect(response.text).not.toContain('passwordHash');

    const adminUser = await prisma.user.findUniqueOrThrow({
      where: { email: ADMIN_EMAIL },
    });
    const audit = await prisma.activityLog.findFirstOrThrow({
      where: {
        actorUserId: adminUser.id,
        action: 'REPORT_CSV_EXPORTED_BY_ADMIN',
      },
      orderBy: { createdAt: 'desc' },
    });
    expect(audit.entityType).toBe('REPORT');
    expect(audit.metadata).toMatchObject({ resource: 'customers' });
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

  async function cleanup() {
    if (!prisma) return;
    const users = await prisma.user.findMany({
      where: { email: { in: [ADMIN_EMAIL, CUSTOMER_EMAIL] } },
      select: { id: true, customer: { select: { id: true } } },
    });
    const ids = users.map((user) => user.id);
    const customerIds = users.flatMap((user) =>
      user.customer ? [user.customer.id] : [],
    );
    if (!ids.length) return;
    await prisma.activityLog.deleteMany({
      where: {
        OR: [{ actorUserId: { in: ids } }, { entityId: { in: customerIds } }],
      },
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
      AUTH_RATE_LIMIT_NAMESPACE: `dashboard-e2e-${randomUUID()}`,
      BULLMQ_PREFIX: `dashboard-e2e-${randomUUID().replaceAll('-', '')}`,
    });
  }
});
