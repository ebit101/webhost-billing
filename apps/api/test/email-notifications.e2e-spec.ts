import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import {
  parseApiEnvironment,
  type ApiEnvironment,
} from '@webhost-billing/config';
import {
  EmailAttemptStatus,
  EmailStatus,
  OutboxStatus,
  UserRole,
  UserStatus,
  type PrismaClient,
} from '@webhost-billing/database';
import {
  apiSuccessResponseSchema,
  emailLogSummarySchema,
  clientEmailLogSummarySchema,
  paginatedApiSuccessResponseSchema,
} from '@webhost-billing/shared';
import request from 'supertest';
import type { App } from 'supertest/types';
import { z } from 'zod';
import { AppModule } from '../src/app.module';
import { PRISMA_CLIENT } from '../src/infrastructure/database/database.module';
import { API_ENVIRONMENT } from '../src/infrastructure/environment/environment.module';
import { PasswordHasherService } from '../src/modules/auth/services/password-hasher.service';

const ADMIN_EMAIL = 'command18-admin@example.test';
const CUSTOMER_EMAIL = 'command18-customer@example.test';
const PASSWORD = 'command eighteen secure password';

describe('Email notification administration (e2e)', () => {
  let app: INestApplication<App>;
  let moduleFixture: TestingModule;
  let prisma: PrismaClient;
  const outboxEventId = randomUUID();
  const historyEventIds = Array.from({ length: 23 }, () => randomUUID());
  let customerId = '';

  beforeAll(async () => {
    moduleFixture = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(API_ENVIRONMENT)
      .useValue(loadTestEnvironment())
      .compile();
    app = moduleFixture.createNestApplication();
    await app.init();
    prisma = moduleFixture.get(PRISMA_CLIENT);
    const passwords = moduleFixture.get(PasswordHasherService);
    await cleanup();
    const passwordHash = await passwords.hash(PASSWORD);
    await prisma.user.create({
      data: {
        email: ADMIN_EMAIL,
        passwordHash,
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
        emailVerifiedAt: new Date(),
        adminProfile: { create: { displayName: 'Command Eighteen Admin' } },
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
            customerNumber: `CMD18-${randomUUID().slice(0, 8)}`,
            firstName: 'Command Eighteen',
            lastName: 'Customer',
            addressLine1: '18 Fictional Road',
            city: 'Dhaka',
            countryCode: 'BD',
          },
        },
      },
    });
    await prisma.outboxEvent.create({
      data: {
        id: outboxEventId,
        aggregateType: 'USER',
        aggregateId: randomUUID(),
        eventType: 'AUTH_EMAIL_VERIFICATION_REQUESTED',
        idempotencyKey: `command18-e2e:${outboxEventId}`,
        payload: { referenceOnly: true },
        status: OutboxStatus.PUBLISHED,
        publishedAt: new Date(),
      },
    });
    customerId = (
      await prisma.customer.findFirstOrThrow({
        where: { user: { email: CUSTOMER_EMAIL } },
      })
    ).id;
    await prisma.emailLog.create({
      data: {
        outboxEventId,
        customerId,
        templateKey: 'email-verification',
        recipientEmail: CUSTOMER_EMAIL,
        subjectSnapshot: 'Verify your email address',
        status: EmailStatus.FAILED,
        provider: 'smtp',
        attemptCount: 1,
        lastError: 'SMTP_CONNECTION_UNAVAILABLE',
        failedAt: new Date(),
        attempts: {
          create: {
            attemptNumber: 1,
            status: EmailAttemptStatus.FAILED,
            provider: 'smtp',
            failureKind: 'TEMPORARY',
            failureCode: 'SMTP_CONNECTION_UNAVAILABLE',
            completedAt: new Date(),
          },
        },
      },
    });
    for (const [index, id] of historyEventIds.entries()) {
      await prisma.outboxEvent.create({
        data: {
          id,
          aggregateType: 'CUSTOMER',
          aggregateId: customerId,
          eventType: 'EMAIL_INVOICE_CREATED',
          idempotencyKey: `command141:${id}`,
          payload: { secret: 'must-never-appear' },
          status: OutboxStatus.PUBLISHED,
        },
      });
      await prisma.emailLog.create({
        data: {
          outboxEventId: id,
          customerId: index === 22 ? null : customerId,
          templateKey: 'invoice-created',
          recipientEmail:
            index === 22 ? CUSTOMER_EMAIL : 'historical141@example.test',
          subjectSnapshot: 'Fictional history 141',
          status: index % 2 ? EmailStatus.SENT : EmailStatus.QUEUED,
          lastError: 'private-diagnostic-secret',
          providerMessageId: 'private-provider-id',
        },
      });
    }
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  it('returns safe attempt logs to administrators only', async () => {
    const customer = request.agent(app.getHttpServer());
    await authenticate(customer, CUSTOMER_EMAIL);
    await customer.get('/email-notifications').expect(403);

    const admin = request.agent(app.getHttpServer());
    await authenticate(admin, ADMIN_EMAIL);
    const response = await admin.get('/email-notifications').expect(200);
    const logs = apiSuccessResponseSchema(z.array(emailLogSummarySchema)).parse(
      response.body,
    ).data;
    expect(logs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          templateKey: 'email-verification',
          recipientEmail: CUSTOMER_EMAIL,
          status: 'FAILED',
          attemptCount: 1,
        }),
      ]),
    );
    expect(JSON.stringify(response.body)).toContain(
      'SMTP_CONNECTION_UNAVAILABLE',
    );
    expect(JSON.stringify(response.body)).not.toContain('lastError');
    expect(JSON.stringify(response.body)).not.toContain('providerMessageId');
    expect(JSON.stringify(response.body)).not.toContain('payload');
  });

  it('scopes safe client history before counting, searching and paging, without sending or matching by address', async () => {
    const customer = request.agent(app.getHttpServer());
    await authenticate(customer, CUSTOMER_EMAIL);
    await customer
      .get(`/email-notifications/customers/${customerId}`)
      .expect(403);
    const admin = request.agent(app.getHttpServer());
    await authenticate(admin, ADMIN_EMAIL);
    const path = `/email-notifications/customers/${customerId}`;
    const before = {
      logs: await prisma.emailLog.count(),
      events: await prisma.outboxEvent.count(),
      attempts: await prisma.emailAttempt.count(),
    };
    const first = paginatedApiSuccessResponseSchema(
      clientEmailLogSummarySchema,
    ).parse((await admin.get(path).expect(200)).body);
    expect(first.pagination).toEqual({
      page: 1,
      pageSize: 20,
      totalItems: 23,
      totalPages: 2,
    });
    expect(first.data).toHaveLength(20);
    const second = paginatedApiSuccessResponseSchema(
      clientEmailLogSummarySchema,
    ).parse((await admin.get(path).query({ page: 2 }).expect(200)).body);
    expect(second.data).toHaveLength(3);
    expect(
      new Set([...first.data, ...second.data].map((row) => row.id)).size,
    ).toBe(23);
    expect(
      [...first.data, ...second.data].every(
        (row) => row.customerId === customerId,
      ),
    ).toBe(true);
    const filtered = paginatedApiSuccessResponseSchema(
      clientEmailLogSummarySchema,
    ).parse(
      (
        await admin
          .get(path)
          .query({ search: 'historical141', status: 'SENT' })
          .expect(200)
      ).body,
    );
    expect(filtered.pagination.totalItems).toBe(11);
    expect(filtered.data.every((row) => row.status === 'SENT')).toBe(true);
    const byCurrentAddress = paginatedApiSuccessResponseSchema(
      clientEmailLogSummarySchema,
    ).parse(
      (await admin.get(path).query({ search: CUSTOMER_EMAIL }).expect(200))
        .body,
    );
    expect(byCurrentAddress.pagination.totalItems).toBe(1);
    const serialized = JSON.stringify([first, second, filtered]);
    for (const secret of [
      'lastError',
      'private-diagnostic-secret',
      'providerMessageId',
      'private-provider-id',
      'payload',
      'must-never-appear',
    ])
      expect(serialized).not.toContain(secret);
    for (const query of [
      { page: 0 },
      { pageSize: 101 },
      { status: 'INVALID' },
      { search: 'x'.repeat(201) },
      { customerId },
    ])
      await admin.get(path).query(query).expect(400);
    await admin.get('/email-notifications/customers/invalid').expect(400);
    await admin
      .get(`/email-notifications/customers/${randomUUID()}`)
      .expect(404);
    await prisma.customer.update({
      where: { id: customerId },
      data: { deletedAt: new Date() },
    });
    try {
      await admin.get(path).expect(404);
    } finally {
      await prisma.customer.update({
        where: { id: customerId },
        data: { deletedAt: null },
      });
    }
    expect({
      logs: await prisma.emailLog.count(),
      events: await prisma.outboxEvent.count(),
      attempts: await prisma.emailAttempt.count(),
    }).toEqual(before);
    const adminUser = await prisma.user.findUniqueOrThrow({
      where: { email: ADMIN_EMAIL },
    });
    await prisma.adminProfile.update({
      where: { userId: adminUser.id },
      data: { staffRole: 'BILLING_OPERATOR' },
    });
    try {
      await admin.get(path).expect(403);
    } finally {
      await prisma.adminProfile.update({
        where: { userId: adminUser.id },
        data: { staffRole: 'FULL_ADMINISTRATOR' },
      });
    }
  });

  async function authenticate(
    agent: ReturnType<typeof request.agent>,
    email: string,
  ) {
    const response = await agent.get('/auth/csrf').expect(200);
    const csrf = apiSuccessResponseSchema(
      z.object({ csrfToken: z.string().min(32) }).strict(),
    ).parse(response.body).data.csrfToken;
    await agent
      .post('/auth/login')
      .set('X-CSRF-Token', csrf)
      .send({ email, password: PASSWORD })
      .expect(200);
  }

  async function cleanup() {
    if (!prisma) return;
    const historyLogs = await prisma.emailLog.findMany({
      where: { outboxEventId: { in: historyEventIds } },
      select: { id: true },
    });
    await prisma.emailAttempt.deleteMany({
      where: { emailLogId: { in: historyLogs.map((log) => log.id) } },
    });
    await prisma.emailLog.deleteMany({
      where: { outboxEventId: { in: historyEventIds } },
    });
    await prisma.outboxEvent.deleteMany({
      where: { id: { in: historyEventIds } },
    });
    const log = await prisma.emailLog.findUnique({
      where: { outboxEventId },
      select: { id: true },
    });
    if (log) {
      await prisma.emailAttempt.deleteMany({ where: { emailLogId: log.id } });
      await prisma.emailLog.delete({ where: { id: log.id } });
    }
    await prisma.outboxEvent.deleteMany({ where: { id: outboxEventId } });
    const users = await prisma.user.findMany({
      where: { email: { in: [ADMIN_EMAIL, CUSTOMER_EMAIL] } },
      select: { id: true },
    });
    const userIds = users.map(({ id }) => id);
    await prisma.authSession.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.activityLog.deleteMany({
      where: { actorUserId: { in: userIds } },
    });
    await prisma.adminProfile.deleteMany({
      where: { userId: { in: userIds } },
    });
    await prisma.customer.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }

  function loadTestEnvironment(): ApiEnvironment {
    return parseApiEnvironment({
      ...process.env,
      PORT: process.env.API_PORT ?? '3001',
      NODE_ENV: 'test',
      AUTH_RATE_LIMIT_NAMESPACE: `email-notifications-e2e-${randomUUID()}`,
      BULLMQ_PREFIX: `email-notifications-e2e-${randomUUID().replaceAll('-', '')}`,
    });
  }
});
