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
  invoiceAgingResponseSchema,
  invoiceSchema,
  paginatedApiSuccessResponseSchema,
} from '@webhost-billing/shared';
import request from 'supertest';
import type { App } from 'supertest/types';
import { z } from 'zod';
import { AppModule } from '../src/app.module';
import { PRISMA_CLIENT } from '../src/infrastructure/database/database.module';
import { API_ENVIRONMENT } from '../src/infrastructure/environment/environment.module';
import { PasswordHasherService } from '../src/modules/auth/services/password-hasher.service';
import { addCalendarDays } from '../src/modules/dashboard-reports/dashboard-period';

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
    await customer.get('/reports/invoice-aging').expect(403);

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

  it('groups positive overdue balances and returns the same invoices in each ledger drill-down', async () => {
    const admin = request.agent(app.getHttpServer());
    await authenticate(admin, ADMIN_EMAIL);
    const { id: customerId } = await prisma.customer.findFirstOrThrow({
      where: { user: { email: CUSTOMER_EMAIL } },
      select: { id: true },
    });
    const schema = apiSuccessResponseSchema(invoiceAgingResponseSchema);
    const baseline = schema.parse(
      (await admin.get('/reports/invoice-aging').expect(200)).body,
    ).data;
    const ages = [0, 1, 30, 31, 60, 61, 90, 91, 365];
    const tag = `R203-${randomUUID().slice(0, 8)}`;
    const data = ages.map((age) => {
      const balanceDue = age === 30 ? 200n : 1000n;
      return {
        invoiceNumber: `${tag}-${age}`,
        submissionKey: randomUUID(),
        customerId,
        status: 'OVERDUE' as const,
        currency: baseline.currency,
        subtotal: 1000n,
        total: 1000n,
        amountPaid: 1000n - balanceDue,
        balanceDue,
        customerNameSnapshot: 'Fictional customer',
        customerEmailSnapshot: CUSTOMER_EMAIL,
        customerAddressSnapshot: {
          line1: '22 Fictional Road',
          line2: null,
          city: 'Dhaka',
          region: null,
          postalCode: null,
          countryCode: 'BD',
        },
        businessIdentitySnapshot: { name: 'Fictional host' },
        issuedAt: new Date(
          `${addCalendarDays(baseline.asOf, -age - 1)}T00:00:00.000Z`,
        ),
        dueAt: new Date(
          `${addCalendarDays(baseline.asOf, -age)}T23:59:59.999Z`,
        ),
      };
    });
    const [sample] = data;
    const invoices = await prisma.invoice.createManyAndReturn({
      data: [
        ...data,
        {
          ...sample,
          invoiceNumber: `${tag}-unpaid`,
          submissionKey: randomUUID(),
          dueAt: data[1].dueAt,
          status: 'UNPAID',
        },
        {
          ...sample,
          invoiceNumber: `${tag}-other`,
          submissionKey: randomUUID(),
          dueAt: data[1].dueAt,
          currency: 'USD',
        },
      ],
      select: { id: true, currency: true },
    });
    await prisma.invoiceItem.createMany({
      data: invoices.map(({ id, currency }) => ({
        invoiceId: id,
        linePosition: 1,
        descriptionSnapshot: 'Fictional hosting',
        currency,
        unitAmount: 1000n,
        lineTotal: 1000n,
      })),
    });

    const report = schema.parse(
      (await admin.get('/reports/invoice-aging').expect(200)).body,
    ).data;
    const expected = [
      { id: '1-30', ages: [1, 30], balance: 1200n },
      { id: '31-60', ages: [31, 60], balance: 2000n },
      { id: '61-90', ages: [61, 90], balance: 2000n },
      { id: '91-plus', ages: [91, 365], balance: 2000n },
    ];
    expect(report.asOf).toBe(baseline.asOf);
    for (const [index, bucket] of expected.entries()) {
      expect(report.buckets[index]).toEqual({
        id: bucket.id,
        count: baseline.buckets[index].count + bucket.ages.length,
        balance: (
          BigInt(baseline.buckets[index].balance) + bucket.balance
        ).toString(),
      });
      const query = new URLSearchParams({
        status: 'OVERDUE',
        agingBucket: bucket.id,
        agingAsOf: report.asOf,
        agingCurrency: report.currency,
        customerId,
      });
      const ledger = paginatedApiSuccessResponseSchema(invoiceSchema).parse(
        (await admin.get(`/invoices?${query}`).expect(200)).body,
      );
      expect(
        ledger.data.map((invoice) => invoice.invoiceNumber).sort(),
      ).toEqual(bucket.ages.map((age) => `${tag}-${age}`).sort());
    }
    await admin.get('/invoices?status=OVERDUE&agingBucket=1-30').expect(400);
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
    const reportInvoices = {
      customerId: { in: customerIds },
      invoiceNumber: { startsWith: 'R203-' },
    };
    await prisma.invoiceItem.deleteMany({ where: { invoice: reportInvoices } });
    await prisma.invoice.deleteMany({ where: reportInvoices });
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
