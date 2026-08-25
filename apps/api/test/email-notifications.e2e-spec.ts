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
    await prisma.emailLog.create({
      data: {
        outboxEventId,
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
