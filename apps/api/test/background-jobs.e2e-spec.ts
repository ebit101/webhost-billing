import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import {
  parseApiEnvironment,
  type ApiEnvironment,
} from '@webhost-billing/config';
import {
  OutboxStatus,
  UserRole,
  UserStatus,
  type PrismaClient,
} from '@webhost-billing/database';
import {
  apiSuccessResponseSchema,
  backgroundFailureListSchema,
} from '@webhost-billing/shared';
import request from 'supertest';
import type { App } from 'supertest/types';
import { z } from 'zod';
import { AppModule } from '../src/app.module';
import { PRISMA_CLIENT } from '../src/infrastructure/database/database.module';
import { API_ENVIRONMENT } from '../src/infrastructure/environment/environment.module';
import { PasswordHasherService } from '../src/modules/auth/services/password-hasher.service';

const ADMIN_EMAIL = 'command17-admin@example.test';
const CUSTOMER_EMAIL = 'command17-customer@example.test';
const PASSWORD = 'command seventeen secure password';

describe('Background job administration (e2e)', () => {
  let app: INestApplication<App>;
  let moduleFixture: TestingModule;
  let prisma: PrismaClient;
  let outboxEventId = '';

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
        adminProfile: {
          create: { displayName: 'Command Seventeen Admin' },
        },
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
            customerNumber: `CMD17-${randomUUID().slice(0, 8)}`,
            status: 'ACTIVE',
            firstName: 'Command Seventeen',
            lastName: 'Customer',
            phone: '+8801700000017',
            addressLine1: '17 Fictional Road',
            city: 'Dhaka',
            countryCode: 'BD',
          },
        },
      },
    });
    outboxEventId = randomUUID();
    await prisma.outboxEvent.create({
      data: {
        id: outboxEventId,
        aggregateType: 'USER',
        aggregateId: randomUUID(),
        eventType: 'AUTH_EMAIL_VERIFICATION_REQUESTED',
        idempotencyKey: `command17-e2e-${outboxEventId}`,
        payload: { tokenRecordId: randomUUID() },
        status: OutboxStatus.FAILED,
        attemptCount: 5,
        lastError: 'OUTBOX_PUBLICATION_ATTEMPTS_EXHAUSTED',
      },
    });
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  it('shows safe failures only to administrators and explicitly retries outbox publication', async () => {
    const customer = request.agent(app.getHttpServer());
    await authenticate(customer, CUSTOMER_EMAIL);
    await customer.get('/background-jobs/failures').expect(403);

    const admin = request.agent(app.getHttpServer());
    const csrf = await authenticate(admin, ADMIN_EMAIL);
    const response = await admin.get('/background-jobs/failures').expect(200);
    const failures = apiSuccessResponseSchema(
      backgroundFailureListSchema,
    ).parse(response.body).data;
    expect(failures.outboxEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          outboxEventId,
          eventType: 'AUTH_EMAIL_VERIFICATION_REQUESTED',
          attemptCount: 5,
          manualRetryAllowed: true,
        }),
      ]),
    );
    expect(JSON.stringify(response.body)).not.toContain('lastError');
    expect(JSON.stringify(response.body)).not.toContain('payload');

    await admin
      .post(`/background-jobs/outbox/${outboxEventId}/retry`)
      .set('X-CSRF-Token', csrf)
      .send({ confirmation: 'RETRY_OUTBOX' })
      .expect(201)
      .expect({ success: true, data: { queued: true } });

    const stored = await prisma.outboxEvent.findUniqueOrThrow({
      where: { id: outboxEventId },
    });
    expect(stored.status).toBe(OutboxStatus.PENDING);
    expect(stored.attemptCount).toBe(0);
    expect(stored.lastError).toBeNull();
    expect(
      await prisma.activityLog.count({
        where: {
          entityId: outboxEventId,
          action: 'OUTBOX_EVENT_RETRIED',
        },
      }),
    ).toBe(1);
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
    return csrf;
  }

  async function cleanup() {
    if (!prisma) return;
    const users = await prisma.user.findMany({
      where: { email: { in: [ADMIN_EMAIL, CUSTOMER_EMAIL] } },
      select: { id: true },
    });
    const userIds = users.map(({ id }) => id);
    await prisma.activityLog.deleteMany({
      where: { actorUserId: { in: userIds } },
    });
    if (outboxEventId) {
      await prisma.activityLog.deleteMany({
        where: { entityId: outboxEventId },
      });
      await prisma.outboxEvent.deleteMany({ where: { id: outboxEventId } });
    }
    await prisma.authSession.deleteMany({ where: { userId: { in: userIds } } });
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
      AUTH_RATE_LIMIT_NAMESPACE: `background-jobs-e2e-${randomUUID()}`,
      BULLMQ_PREFIX: `background-jobs-e2e-${randomUUID().replaceAll('-', '')}`,
    });
  }
});
