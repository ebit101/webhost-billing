import { randomUUID } from 'node:crypto';
import { type INestApplication } from '@nestjs/common';
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
  apiErrorResponseSchema,
  apiSuccessResponseSchema,
  customerDetailSchema,
  customerSummarySchema,
  paginatedApiSuccessResponseSchema,
} from '@webhost-billing/shared';
import request from 'supertest';
import type { App } from 'supertest/types';
import { z } from 'zod';
import { AppModule } from '../src/app.module';
import { PRISMA_CLIENT } from '../src/infrastructure/database/database.module';
import { API_ENVIRONMENT } from '../src/infrastructure/environment/environment.module';
import { PasswordHasherService } from '../src/modules/auth/services/password-hasher.service';
import { TokenCipherService } from '../src/modules/auth/services/token-cipher.service';

const ADMIN_EMAIL = 'command7-admin@example.test';
const CUSTOMER_EMAIL = 'command7-customer@example.test';
const PASSWORD = 'command seven secure password';
const NEW_PASSWORD = 'command seven newer password';

describe('Customer management (e2e)', () => {
  let app: INestApplication<App>;
  let moduleFixture: TestingModule;
  let prisma: PrismaClient;
  let passwords: PasswordHasherService;
  let tokenCipher: TokenCipherService;

  beforeAll(async () => {
    moduleFixture = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(API_ENVIRONMENT)
      .useValue(loadTestEnvironment())
      .compile();
    app = moduleFixture.createNestApplication();
    await app.init();
    prisma = moduleFixture.get(PRISMA_CLIENT);
    passwords = moduleFixture.get(PasswordHasherService);
    tokenCipher = moduleFixture.get(TokenCipherService);
    await cleanup();
    await prisma.user.create({
      data: {
        email: ADMIN_EMAIL,
        passwordHash: await passwords.hash(PASSWORD),
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
        emailVerifiedAt: new Date(),
        adminProfile: {
          create: { displayName: 'Command Seven Admin', isSuperAdmin: true },
        },
      },
    });
  });

  it('supports the administrator workflow and records every administrator change', async () => {
    const admin = request.agent(app.getHttpServer());
    const csrf = await csrfToken(admin);
    await admin
      .post('/auth/login')
      .set('X-CSRF-Token', csrf)
      .send({ email: ADMIN_EMAIL, password: PASSWORD })
      .expect(200);

    const createResponse = await admin
      .post('/customers')
      .set('X-CSRF-Token', csrf)
      .send({
        email: CUSTOMER_EMAIL,
        password: PASSWORD,
        firstName: 'Command',
        lastName: 'Seven',
        companyName: 'Example Hosting Client',
        addressLine1: '7 Test Avenue',
        city: 'Dhaka',
        countryCode: 'BD',
        taxIdentifier: 'TEST-TAX-7',
      })
      .expect(201);
    const customer = apiSuccessResponseSchema(customerDetailSchema).parse(
      createResponse.body,
    ).data;
    expect(customer.accountStatus).toBe('PENDING_VERIFICATION');
    expect(customer.taxIdentifier).toBe('TEST-TAX-7');

    const listResponse = await admin
      .get(
        '/customers?search=example%20hosting&status=ACTIVE&page=1&pageSize=10',
      )
      .expect(200);
    const list = paginatedApiSuccessResponseSchema(customerSummarySchema).parse(
      listResponse.body,
    );
    expect(list.data.map((item) => item.id)).toContain(customer.id);

    const updatedResponse = await admin
      .patch(`/customers/${customer.id}/profile`)
      .set('X-CSRF-Token', csrf)
      .send({ phone: '+8801700000000', city: 'Chattogram' })
      .expect(200);
    expect(
      apiSuccessResponseSchema(customerDetailSchema).parse(updatedResponse.body)
        .data.city,
    ).toBe('Chattogram');

    await admin
      .patch(`/customers/${customer.id}/billing`)
      .set('X-CSRF-Token', csrf)
      .send({ taxIdentifier: 'TEST-TAX-UPDATED' })
      .expect(200);
    const deactivated = await admin
      .patch(`/customers/${customer.id}/access`)
      .set('X-CSRF-Token', csrf)
      .send({ active: false })
      .expect(200);
    expect(
      apiSuccessResponseSchema(customerDetailSchema).parse(deactivated.body)
        .data.accountStatus,
    ).toBe('DISABLED');
    const activated = await admin
      .patch(`/customers/${customer.id}/access`)
      .set('X-CSRF-Token', csrf)
      .send({ active: true })
      .expect(200);
    expect(
      apiSuccessResponseSchema(customerDetailSchema).parse(activated.body).data
        .accountStatus,
    ).toBe('PENDING_VERIFICATION');

    const administratorChanges = await prisma.activityLog.findMany({
      where: { entityId: customer.id, action: { endsWith: '_BY_ADMIN' } },
      select: { action: true, actorUserId: true, metadata: true },
    });
    expect(administratorChanges.map((item) => item.action).sort()).toEqual([
      'CUSTOMER_ACCESS_ACTIVATED_BY_ADMIN',
      'CUSTOMER_ACCESS_DEACTIVATED_BY_ADMIN',
      'CUSTOMER_BILLING_UPDATED_BY_ADMIN',
      'CUSTOMER_CREATED_BY_ADMIN',
      'CUSTOMER_PROFILE_UPDATED_BY_ADMIN',
    ]);
    expect(JSON.stringify(administratorChanges)).not.toContain(
      '+8801700000000',
    );
  });

  it('enforces customer ownership and allows profile and password self-service', async () => {
    const user = await prisma.user.findUniqueOrThrow({
      where: { email: CUSTOMER_EMAIL },
    });
    const verification = await prisma.emailVerificationToken.findFirstOrThrow({
      where: { userId: user.id, usedAt: null },
    });
    const customer = await prisma.customer.findUniqueOrThrow({
      where: { userId: user.id },
    });
    const agent = request.agent(app.getHttpServer());
    const csrf = await csrfToken(agent);
    await agent
      .post('/auth/verify-email')
      .set('X-CSRF-Token', csrf)
      .send({ token: tokenCipher.decrypt(verification.deliveryCiphertext) })
      .expect(200);
    await agent
      .post('/auth/login')
      .set('X-CSRF-Token', csrf)
      .send({ email: CUSTOMER_EMAIL, password: PASSWORD })
      .expect(200);

    await agent.get(`/customers/${customer.id}`).expect(200);
    const forbidden = await agent.get(`/customers/${randomUUID()}`).expect(403);
    expect(apiErrorResponseSchema.parse(forbidden.body).error.code).toBe(
      'FORBIDDEN',
    );
    await agent.get('/customers').expect(403);
    await agent
      .patch(`/customers/${customer.id}/billing`)
      .set('X-CSRF-Token', csrf)
      .send({ taxIdentifier: 'FORBIDDEN' })
      .expect(403);

    const profile = await agent
      .patch(`/customers/${customer.id}/profile`)
      .set('X-CSRF-Token', csrf)
      .send({ firstName: 'Self-managed' })
      .expect(200);
    expect(
      apiSuccessResponseSchema(customerDetailSchema).parse(profile.body).data
        .firstName,
    ).toBe('Self-managed');
    await agent
      .post(`/customers/${customer.id}/change-password`)
      .set('X-CSRF-Token', csrf)
      .send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD })
      .expect(200);
    await agent.get('/auth/me').expect(401);
    await agent
      .post('/auth/login')
      .set('X-CSRF-Token', csrf)
      .send({ email: CUSTOMER_EMAIL, password: NEW_PASSWORD })
      .expect(200);
  });

  afterAll(async () => {
    if (prisma) await cleanup();
    if (app) await app.close();
  });

  async function csrfToken(agent: ReturnType<typeof request.agent>) {
    const response = await agent.get('/auth/csrf').expect(200);
    return apiSuccessResponseSchema(
      z.object({ csrfToken: z.string().min(32) }).strict(),
    ).parse(response.body).data.csrfToken;
  }

  async function cleanup() {
    const users = await prisma.user.findMany({
      where: { email: { in: [ADMIN_EMAIL, CUSTOMER_EMAIL] } },
      select: { id: true, customer: { select: { id: true } } },
    });
    const userIds = users.map((item) => item.id);
    const customerIds = users.flatMap((item) =>
      item.customer ? [item.customer.id] : [],
    );
    if (!userIds.length) return;
    await prisma.activityLog.deleteMany({
      where: {
        OR: [
          { actorUserId: { in: userIds } },
          { entityId: { in: [...userIds, ...customerIds] } },
        ],
      },
    });
    await prisma.authSession.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.passwordResetToken.deleteMany({
      where: { userId: { in: userIds } },
    });
    await prisma.emailVerificationToken.deleteMany({
      where: { userId: { in: userIds } },
    });
    await prisma.outboxEvent.deleteMany({
      where: { aggregateId: { in: userIds } },
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
      AUTH_RATE_LIMIT_NAMESPACE: `customer-e2e-${randomUUID()}`,
    });
  }
});
