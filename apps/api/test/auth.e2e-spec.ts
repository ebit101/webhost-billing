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
  authenticatedIdentitySchema,
  authenticatedSessionResponseSchema,
  authenticationSessionSchema,
} from '@webhost-billing/shared';
import request from 'supertest';
import type { App } from 'supertest/types';
import { z } from 'zod';
import { AppModule } from '../src/app.module';
import { PRISMA_CLIENT } from '../src/infrastructure/database/database.module';
import { API_ENVIRONMENT } from '../src/infrastructure/environment/environment.module';
import { hashOpaqueToken } from '../src/modules/auth/services/auth-token.service';
import { PasswordHasherService } from '../src/modules/auth/services/password-hasher.service';
import { TokenCipherService } from '../src/modules/auth/services/token-cipher.service';

const CUSTOMER_EMAIL = 'command5-customer@example.test';
const ADMIN_EMAIL = 'command5-admin@example.test';
const ORIGINAL_PASSWORD = 'correct horse battery staple';
const NEW_PASSWORD = 'new correct horse battery staple';
const SEEDED_OTHER_CUSTOMER_ID = '10000000-0000-4000-8000-000000000004';

const csrfResponseSchema = apiSuccessResponseSchema(
  z.object({ csrfToken: z.string().min(32) }).strict(),
);
const identityResponseSchema = apiSuccessResponseSchema(
  authenticatedIdentitySchema,
);
const sessionsResponseSchema = apiSuccessResponseSchema(
  z.array(authenticationSessionSchema),
);

describe('Authentication (e2e)', () => {
  let app: INestApplication<App>;
  let moduleFixture: TestingModule;
  let prisma: PrismaClient;
  let tokenCipher: TokenCipherService;
  let passwordHasher: PasswordHasherService;
  let customerAgent: ReturnType<typeof request.agent>;
  let customerCsrfToken: string;
  let customerId: string;

  beforeAll(async () => {
    const environment = loadTestEnvironment();

    moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(API_ENVIRONMENT)
      .useValue(environment)
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    prisma = moduleFixture.get<PrismaClient>(PRISMA_CLIENT);
    tokenCipher = moduleFixture.get(TokenCipherService);
    passwordHasher = moduleFixture.get(PasswordHasherService);
    await cleanupTestUsers();
    await createTestAdministrator();
  });

  it('registers, verifies, and authenticates a customer with a secure session', async () => {
    customerAgent = request.agent(app.getHttpServer());
    customerCsrfToken = await issueCsrfToken(customerAgent);

    await customerAgent
      .post('/auth/register')
      .set('X-CSRF-Token', customerCsrfToken)
      .send({
        email: CUSTOMER_EMAIL,
        password: ORIGINAL_PASSWORD,
        firstName: 'Command',
        lastName: 'Five',
        addressLine1: '5 Test Avenue',
        city: 'Dhaka',
        countryCode: 'BD',
      })
      .expect(201);

    const registeredUser = await prisma.user.findUniqueOrThrow({
      where: { email: CUSTOMER_EMAIL },
      include: { customer: true },
    });
    customerId = registeredUser.customer?.id ?? '';
    expect(customerId).not.toBe('');
    expect(registeredUser.passwordHash?.startsWith('$argon2id$')).toBe(true);

    const verificationRecord =
      await prisma.emailVerificationToken.findFirstOrThrow({
        where: { userId: registeredUser.id, usedAt: null },
        orderBy: { createdAt: 'desc' },
      });
    const verificationToken = tokenCipher.decrypt(
      verificationRecord.deliveryCiphertext,
    );

    await customerAgent
      .post('/auth/verify-email')
      .set('X-CSRF-Token', customerCsrfToken)
      .send({ token: verificationToken })
      .expect(200);

    await customerAgent
      .post('/auth/verify-email')
      .set('X-CSRF-Token', customerCsrfToken)
      .send({ token: verificationToken })
      .expect(400);

    const loginResponse = await customerAgent
      .post('/auth/login')
      .set('X-CSRF-Token', customerCsrfToken)
      .send({ email: CUSTOMER_EMAIL, password: ORIGINAL_PASSWORD })
      .expect(200);
    const loginBody: unknown = loginResponse.body;
    const login = apiSuccessResponseSchema(
      authenticatedSessionResponseSchema,
    ).parse(loginBody);

    expect(login.data.identity.role).toBe('CUSTOMER');
    expect(login.data.session.current).toBe(true);

    const meResponse = await customerAgent.get('/auth/me').expect(200);
    const meBody: unknown = meResponse.body;
    expect(identityResponseSchema.parse(meBody).data.email).toBe(
      CUSTOMER_EMAIL,
    );

    await customerAgent.get(`/auth/customer-profile/${customerId}`).expect(200);
  });

  it('rejects invalid credentials without exposing account details', async () => {
    const anonymousAgent = request.agent(app.getHttpServer());
    const csrfToken = await issueCsrfToken(anonymousAgent);
    const response = await anonymousAgent
      .post('/auth/login')
      .set('X-CSRF-Token', csrfToken)
      .send({ email: CUSTOMER_EMAIL, password: 'incorrect password value' })
      .expect(401);
    const body: unknown = response.body;
    const error = apiErrorResponseSchema.parse(body);

    expect(error.error.code).toBe('INVALID_CREDENTIALS');
    expect(JSON.stringify(error)).not.toContain(CUSTOMER_EMAIL);
  });

  it('denies customer-only boundary violations and administrator routes', async () => {
    const adminDenied = await customerAgent
      .get('/auth/admin-check')
      .expect(403);
    const adminDeniedBody: unknown = adminDenied.body;
    expect(apiErrorResponseSchema.parse(adminDeniedBody).error.code).toBe(
      'FORBIDDEN',
    );

    const crossCustomer = await customerAgent
      .get(`/auth/customer-profile/${SEEDED_OTHER_CUSTOMER_ID}`)
      .expect(403);
    const crossCustomerBody: unknown = crossCustomer.body;
    expect(apiErrorResponseSchema.parse(crossCustomerBody).error.code).toBe(
      'FORBIDDEN',
    );
  });

  it('rejects expired single-use reset tokens', async () => {
    const user = await prisma.user.findUniqueOrThrow({
      where: { email: CUSTOMER_EMAIL },
    });
    const expiredToken = 'expired-command-five-token-value-000000000001';
    const now = Date.now();
    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: hashOpaqueToken(expiredToken),
        deliveryCiphertext: tokenCipher.encrypt(expiredToken),
        createdAt: new Date(now - 7_200_000),
        expiresAt: new Date(now - 3_600_000),
      },
    });

    const response = await customerAgent
      .post('/auth/password-reset/confirm')
      .set('X-CSRF-Token', customerCsrfToken)
      .send({ token: expiredToken, password: NEW_PASSWORD })
      .expect(400);
    const body: unknown = response.body;
    expect(apiErrorResponseSchema.parse(body).error.code).toBe(
      'INVALID_OR_EXPIRED_TOKEN',
    );
  });

  it('resets the password once and revokes every existing session', async () => {
    await customerAgent
      .post('/auth/password-reset/request')
      .set('X-CSRF-Token', customerCsrfToken)
      .send({ email: CUSTOMER_EMAIL })
      .expect(202);

    const user = await prisma.user.findUniqueOrThrow({
      where: { email: CUSTOMER_EMAIL },
    });
    const resetRecord = await prisma.passwordResetToken.findFirstOrThrow({
      where: { userId: user.id, usedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    const resetToken = tokenCipher.decrypt(resetRecord.deliveryCiphertext);
    const outbox = await prisma.outboxEvent.findUniqueOrThrow({
      where: { idempotencyKey: `auth-password-reset:${resetRecord.id}` },
    });

    expect(resetRecord.deliveryCiphertext).not.toContain(resetToken);
    expect(JSON.stringify(outbox.payload)).not.toContain(resetToken);

    await customerAgent
      .post('/auth/password-reset/confirm')
      .set('X-CSRF-Token', customerCsrfToken)
      .send({ token: resetToken, password: NEW_PASSWORD })
      .expect(200);

    await customerAgent
      .post('/auth/password-reset/confirm')
      .set('X-CSRF-Token', customerCsrfToken)
      .send({ token: resetToken, password: NEW_PASSWORD })
      .expect(400);
    await customerAgent.get('/auth/me').expect(401);

    await customerAgent
      .post('/auth/login')
      .set('X-CSRF-Token', customerCsrfToken)
      .send({ email: CUSTOMER_EMAIL, password: NEW_PASSWORD })
      .expect(200);

    const sessionsResponse = await customerAgent
      .get('/auth/sessions')
      .expect(200);
    const sessionsBody: unknown = sessionsResponse.body;
    const sessions = sessionsResponseSchema.parse(sessionsBody).data;
    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.current).toBe(true);

    await customerAgent
      .post('/auth/logout-all')
      .set('X-CSRF-Token', customerCsrfToken)
      .expect(200);
    await customerAgent.get('/auth/me').expect(401);
  });

  it('allows an authenticated administrator through role and ownership guards', async () => {
    const adminAgent = request.agent(app.getHttpServer());
    const csrfToken = await issueCsrfToken(adminAgent);
    const loginResponse = await adminAgent
      .post('/auth/login')
      .set('X-CSRF-Token', csrfToken)
      .send({ email: ADMIN_EMAIL, password: ORIGINAL_PASSWORD })
      .expect(200);
    const loginBody: unknown = loginResponse.body;
    expect(
      apiSuccessResponseSchema(authenticatedSessionResponseSchema).parse(
        loginBody,
      ).data.identity.role,
    ).toBe('ADMIN');

    await adminAgent.get('/auth/admin-check').expect(200);
    await adminAgent
      .get(`/auth/customer-profile/${SEEDED_OTHER_CUSTOMER_ID}`)
      .expect(200);
  });

  afterAll(async () => {
    if (prisma) {
      await cleanupTestUsers();
    }
    if (app) {
      await app.close();
    }
  });

  async function issueCsrfToken(
    agent: ReturnType<typeof request.agent>,
  ): Promise<string> {
    const response = await agent.get('/auth/csrf').expect(200);
    const body: unknown = response.body;
    return csrfResponseSchema.parse(body).data.csrfToken;
  }

  async function createTestAdministrator(): Promise<void> {
    const passwordHash = await passwordHasher.hash(ORIGINAL_PASSWORD);
    await prisma.user.create({
      data: {
        email: ADMIN_EMAIL,
        passwordHash,
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
        emailVerifiedAt: new Date(),
        adminProfile: {
          create: {
            displayName: 'Command Five Administrator',
            isSuperAdmin: true,
          },
        },
      },
    });
  }

  async function cleanupTestUsers(): Promise<void> {
    const users = await prisma.user.findMany({
      where: { email: { in: [CUSTOMER_EMAIL, ADMIN_EMAIL] } },
      select: { id: true },
    });
    const userIds = users.map((user) => user.id);

    if (userIds.length === 0) {
      return;
    }

    await prisma.authSession.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.passwordResetToken.deleteMany({
      where: { userId: { in: userIds } },
    });
    await prisma.emailVerificationToken.deleteMany({
      where: { userId: { in: userIds } },
    });
    await prisma.activityLog.deleteMany({
      where: {
        OR: [{ actorUserId: { in: userIds } }, { entityId: { in: userIds } }],
      },
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
      AUTH_RATE_LIMIT_NAMESPACE: `e2e-${randomUUID()}`,
    });
  }
});
