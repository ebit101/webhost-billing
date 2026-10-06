import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { parseApiEnvironment } from '@webhost-billing/config';
import {
  createPrismaClient,
  type PrismaClient,
} from '@webhost-billing/database';
import {
  apiSuccessResponseSchema,
  authenticatedIdentitySchema,
  staffAccountSchema,
  staffAccountListSchema,
  invoiceCreationResultSchema,
  manualPaymentCreationResultSchema,
  twoFactorSetupResponseSchema,
  twoFactorRecoveryCodesResponseSchema,
  type StaffRole,
} from '@webhost-billing/shared';
import { execFileSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PRISMA_CLIENT } from '../src/infrastructure/database/database.module';
import { API_ENVIRONMENT } from '../src/infrastructure/environment/environment.module';
import { hashOpaqueToken } from '../src/modules/auth/services/auth-token.service';
import { PasswordHasherService } from '../src/modules/auth/services/password-hasher.service';
import { TokenCipherService } from '../src/modules/auth/services/token-cipher.service';
import { TotpService } from '../src/modules/auth/services/totp.service';

// Never use the normal application's tables or reset an existing test schema.
describe('staff roles in an isolated fictional schema (e2e)', () => {
  const schema = `staff_roles_test_${randomUUID().replaceAll('-', '')}`;
  let administration: PrismaClient;
  let createdSchema = false;
  let prisma: PrismaClient;
  let app: INestApplication<App>;
  let passwordHash: string;
  let cipher: TokenCipherService;
  let totp: TotpService;
  let owner: ReturnType<typeof request.agent>;
  let billing: ReturnType<typeof request.agent>;
  let support: ReturnType<typeof request.agent>;
  let ownerId: string;
  let secondOwnerId: string;
  let billingId: string;
  let customerId: string;
  let csrf: string;
  const password = 'fictional staff password only';

  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL ?? '');
    if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
      throw new Error('Staff tests require loopback PostgreSQL');
    url.searchParams.delete('schema');
    administration = createPrismaClient(url.toString());
    await administration.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    createdSchema = true;
    url.searchParams.set('schema', schema);
    url.searchParams.set('options', `-c search_path=${schema}`);
    const environment = parseApiEnvironment({
      ...process.env,
      NODE_ENV: 'test',
      DATABASE_URL: url.toString(),
      PORT: '3001',
      AUTH_RATE_LIMIT_NAMESPACE: schema,
      BULLMQ_PREFIX: schema,
    });
    const migrationArgs = [
      '--filter',
      '@webhost-billing/database',
      'db:migrate:deploy',
    ];
    execFileSync(
      process.platform === 'win32'
        ? (process.env.ComSpec ?? 'cmd.exe')
        : 'pnpm',
      process.platform === 'win32'
        ? ['/d', '/s', '/c', 'pnpm', ...migrationArgs]
        : migrationArgs,
      {
        cwd: '../..',
        env: { ...process.env, DATABASE_URL: url.toString() },
        stdio: 'pipe',
      },
    );
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(API_ENVIRONMENT)
      .useValue(environment)
      .compile();
    app = module.createNestApplication();
    await app.init();
    prisma = module.get<PrismaClient>(PRISMA_CLIENT);
    const [scope] = await prisma.$queryRaw<
      Array<{ schema: string }>
    >`SELECT current_schema() AS schema`;
    if (scope?.schema !== schema || (await prisma.user.count()) !== 0)
      throw new Error('Unexpected staff test schema');
    cipher = module.get(TokenCipherService);
    totp = module.get(TotpService);
    passwordHash = await module.get(PasswordHasherService).hash(password);
    const first = await account('FULL_ADMINISTRATOR');
    owner = first.agent;
    ownerId = first.id;
    secondOwnerId = (await account('FULL_ADMINISTRATOR')).id;
    const bill = await account('BILLING_OPERATOR');
    billing = bill.agent;
    billingId = bill.id;
    support = (await account('SUPPORT_OPERATOR')).agent;
    const csrfResponse = await owner.get('/auth/csrf').expect(200);
    const csrfBody: unknown = csrfResponse.body;
    csrf = (csrfBody as { data: { csrfToken: string } }).data.csrfToken;
  }, 120_000);

  afterAll(async () => {
    if (app) await app.close();
    if (administration) {
      if (!/^staff_roles_test_[a-f0-9]{32}$/.test(schema))
        throw new Error('Invalid cleanup scope');
      if (createdSchema)
        await administration.$executeRawUnsafe(
          `DROP SCHEMA "${schema}" CASCADE`,
        );
      await administration.$disconnect();
    }
  });

  async function account(staffRole: StaffRole, mfa = true) {
    const id = randomUUID();
    await prisma.user.create({
      data: {
        id,
        email: `${id}@example.test`,
        passwordHash,
        role: 'ADMIN',
        status: 'ACTIVE',
        emailVerifiedAt: new Date(),
        adminProfile: { create: { displayName: 'Fictional staff', staffRole } },
        ...(mfa
          ? {
              adminTotpCredential: {
                create: {
                  secretCiphertext: totp.encryptSecret(totp.generateSecret()),
                  keyVersion: 'test',
                  createdAt: new Date(),
                  enabledAt: new Date(),
                },
              },
            }
          : {}),
      },
    });
    const token = randomBytes(32).toString('hex');
    await prisma.authSession.create({
      data: {
        userId: id,
        tokenHash: hashOpaqueToken(token),
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 3_600_000),
        twoFactorVerifiedAt: mfa ? new Date() : null,
      },
    });
    const agent = request.agent(app.getHttpServer());
    agent.set('Cookie', `webhost_session=${token}`);
    return { id, agent, token };
  }

  it('preserves default access for existing profiles and returns current staff role', async () => {
    const legacy = await prisma.user.create({
      data: {
        email: `${randomUUID()}@example.test`,
        role: 'ADMIN',
        status: 'PENDING_VERIFICATION',
        adminProfile: { create: { displayName: 'Legacy administrator' } },
      },
      include: { adminProfile: true },
    });
    expect(legacy.adminProfile?.staffRole).toBe('FULL_ADMINISTRATOR');
    const response = await billing.get('/auth/me').expect(200);
    const body: unknown = response.body;
    expect(
      apiSuccessResponseSchema(authenticatedIdentitySchema).parse(body).data,
    ).toMatchObject({
      role: 'ADMIN',
      staffRole: 'BILLING_OPERATOR',
      twoFactorEnabled: true,
    });
  });

  it('allows only each role’s assigned work and denies direct URL/body bypasses', async () => {
    for (const path of [
      '/invoices',
      '/payments',
      '/customers',
      '/payments/settings',
      '/invoices/settings/business-identity',
      '/settings/presentation',
    ])
      await billing.get(path).expect(200);
    for (const path of [
      '/tickets',
      '/settings',
      '/staff',
      '/dashboard',
      '/services',
      '/products',
      '/orders',
      '/observability/overview',
      '/background-jobs/failures',
      '/renewal-automation/policy',
      '/email-notifications',
      '/payment-gateways/failures',
    ])
      await billing.get(path).expect(403);
    for (const path of [
      '/tickets',
      '/tickets/setup-options',
      '/auth/two-factor',
      '/auth/sessions',
    ])
      await support.get(path).expect(200);
    for (const path of [
      '/invoices',
      '/payments',
      '/customers',
      '/settings/presentation',
      '/staff',
      '/services',
      '/orders',
    ])
      await support.get(path).expect(403);
    await billing
      .post(`/payments/${randomUUID()}/adjustments`)
      .send({ role: 'FULL_ADMINISTRATOR', kind: 'REFUND' })
      .expect(403);
    await billing
      .put('/settings')
      .send({ role: 'FULL_ADMINISTRATOR' })
      .expect(403);
    await support
      .patch(`/customers/${randomUUID()}/profile`)
      .send({ role: 'FULL_ADMINISTRATOR' })
      .expect(403);
    await billing.get('/invoices/my').expect(403);
    await request(app.getHttpServer()).get('/staff').expect(401);
    const customer = await prisma.user.create({
      data: {
        email: `${randomUUID()}@example.test`,
        role: 'CUSTOMER',
        status: 'ACTIVE',
        emailVerifiedAt: new Date(),
        customer: {
          create: {
            customerNumber: 'STAFF-TEST-CUSTOMER',
            firstName: 'Fictional',
            lastName: 'Customer',
            addressLine1: 'Test road',
            city: 'Dhaka',
            countryCode: 'BD',
          },
        },
      },
      include: { customer: true },
    });
    customerId = customer.customer!.id;
    const token = randomBytes(32).toString('hex');
    await prisma.authSession.create({
      data: {
        userId: customer.id,
        tokenHash: hashOpaqueToken(token),
        expiresAt: new Date(Date.now() + 3600000),
      },
    });
    const agent = request
      .agent(app.getHttpServer())
      .set('Cookie', `webhost_session=${token}`);
    await agent.get('/staff').expect(403);
    await agent.get(`/auth/customer-profile/${randomUUID()}`).expect(403);
  });

  it('allows billing invoice/manual-payment work, but denies adjustments and keeps financial facts intact', async () => {
    const issued = await billing.get('/auth/csrf').expect(200);
    const billingCsrf = (issued.body as { data: { csrfToken: string } }).data
      .csrfToken;
    const created = await billing
      .post('/invoices')
      .set('X-CSRF-Token', billingCsrf)
      .send({
        customerId,
        currency: 'BDT',
        dueAt: new Date(Date.now() + 86400000).toISOString(),
        creditTotal: '0',
        submissionKey: randomUUID(),
        items: [
          {
            description: 'Fictional hosting invoice',
            quantity: 1,
            unitAmount: '10000',
            discountAmount: '0',
            taxAmount: '0',
          },
        ],
      })
      .expect(201);
    const invoice = apiSuccessResponseSchema(invoiceCreationResultSchema).parse(
      created.body as unknown,
    ).data.invoice;
    await billing
      .patch(`/invoices/${invoice.id}/action`)
      .set('X-CSRF-Token', billingCsrf)
      .send({ action: 'ISSUE' })
      .expect(200);
    const recorded = await billing
      .post('/payments/manual/admin')
      .set('X-CSRF-Token', billingCsrf)
      .send({
        invoiceId: invoice.id,
        amount: '10000',
        submissionKey: randomUUID(),
        proof: {
          method: 'BANK_TRANSFER',
          reference: 'Fictional staff-role test payment',
        },
      })
      .expect(201);
    const payment = apiSuccessResponseSchema(
      manualPaymentCreationResultSchema,
    ).parse(recorded.body as unknown).data.payment;
    const beforePayment = await prisma.payment.findUniqueOrThrow({
      where: { id: payment.id },
    });
    const beforeInvoice = await prisma.invoice.findUniqueOrThrow({
      where: { id: invoice.id },
    });
    expect(beforeInvoice.status).toBe('PAID');
    await billing
      .post(`/payments/${payment.id}/adjustments`)
      .set('X-CSRF-Token', billingCsrf)
      .send({
        kind: 'REFUND',
        amount: '10000',
        submissionKey: randomUUID(),
        reference: 'Forbidden refund',
      })
      .expect(403);
    expect(
      await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } }),
    ).toEqual(beforePayment);
    expect(
      await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } }),
    ).toEqual(beforeInvoice);
  });

  it('does not allow unenrolled operators to work or full administrators to change staff without MFA', async () => {
    const unenrolled = await account('BILLING_OPERATOR', false);
    await unenrolled.agent.get('/invoices').expect(403);
    await unenrolled.agent.get('/auth/two-factor').expect(200);
    const noMfaOwner = await account('FULL_ADMINISTRATOR', false);
    const response = await noMfaOwner.agent.get('/auth/csrf').expect(200);
    await noMfaOwner.agent
      .post('/staff')
      .set(
        'X-CSRF-Token',
        (response.body as { data: { csrfToken: string } }).data.csrfToken,
      )
      .send({
        email: `${randomUUID()}@example.test`,
        displayName: 'Must not exist',
        staffRole: 'SUPPORT_OPERATOR',
      })
      .expect(403);
  });

  it('queues encrypted one-time invitations, denies privilege injection and supports verification/password setup', async () => {
    await owner
      .post('/staff')
      .set('X-CSRF-Token', csrf)
      .send({
        email: `${randomUUID()}@example.test`,
        displayName: 'Injected',
        staffRole: 'SUPPORT_OPERATOR',
        permissions: ['*'],
      })
      .expect(400);
    const created = await owner
      .post('/staff')
      .set('X-CSRF-Token', csrf)
      .send({
        email: `${randomUUID()}@example.test`,
        displayName: 'New support',
        staffRole: 'SUPPORT_OPERATOR',
      })
      .expect(201);
    const body: unknown = created.body;
    const staff = apiSuccessResponseSchema(staffAccountSchema).parse(body).data;
    expect(staff.status).toBe('PENDING_VERIFICATION');
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: staff.id },
    });
    expect(user.passwordHash).toBeNull();
    const verification = await prisma.emailVerificationToken.findFirstOrThrow({
      where: { userId: staff.id, usedAt: null },
    });
    const reset = await prisma.passwordResetToken.findFirstOrThrow({
      where: { userId: staff.id, usedAt: null },
    });
    const events = await prisma.outboxEvent.findMany({
      where: { aggregateId: staff.id },
    });
    expect(events).toHaveLength(2);
    expect(JSON.stringify(events)).not.toContain(
      cipher.decrypt(reset.deliveryCiphertext),
    );
    await owner
      .post('/auth/verify-email')
      .set('X-CSRF-Token', csrf)
      .send({ token: cipher.decrypt(verification.deliveryCiphertext) })
      .expect(200);
    await owner
      .post('/auth/password-reset/confirm')
      .set('X-CSRF-Token', csrf)
      .send({ token: cipher.decrypt(reset.deliveryCiphertext), password })
      .expect(200);
    await owner
      .post('/auth/password-reset/confirm')
      .set('X-CSRF-Token', csrf)
      .send({ token: cipher.decrypt(reset.deliveryCiphertext), password })
      .expect(400);
    const anonymous = request.agent(app.getHttpServer());
    const issued = await anonymous.get('/auth/csrf').expect(200);
    await anonymous
      .post('/auth/login')
      .set(
        'X-CSRF-Token',
        (issued.body as { data: { csrfToken: string } }).data.csrfToken,
      )
      .send({ email: staff.email, password })
      .expect(200);
    await anonymous.get('/tickets').expect(403);
    await anonymous.get('/auth/two-factor').expect(200);
    const staffCsrf = (issued.body as { data: { csrfToken: string } }).data
      .csrfToken;
    const setup = await anonymous
      .post('/auth/two-factor/setup')
      .set('X-CSRF-Token', staffCsrf)
      .send({ password })
      .expect(201);
    const secret = apiSuccessResponseSchema(twoFactorSetupResponseSchema).parse(
      setup.body as unknown,
    ).data.secret;
    const enabled = await anonymous
      .post('/auth/two-factor/enable')
      .set('X-CSRF-Token', staffCsrf)
      .send({ code: totp.codeAt(secret, new Date()) })
      .expect(201);
    apiSuccessResponseSchema(twoFactorRecoveryCodesResponseSchema).parse(
      enabled.body as unknown,
    );
    await anonymous.get('/tickets').expect(200);
    await anonymous.get('/invoices').expect(403);
  });

  it('can recover an email-verified invitation before password setup without reopening verification', async () => {
    const response = await owner
      .post('/staff')
      .set('X-CSRF-Token', csrf)
      .send({
        email: `${randomUUID()}@example.test`,
        displayName: 'Incomplete invitation',
        staffRole: 'SUPPORT_OPERATOR',
      })
      .expect(201);
    const staff = apiSuccessResponseSchema(staffAccountSchema).parse(
      response.body as unknown,
    ).data;
    const verification = await prisma.emailVerificationToken.findFirstOrThrow({
      where: { userId: staff.id, usedAt: null },
    });
    const oldReset = await prisma.passwordResetToken.findFirstOrThrow({
      where: { userId: staff.id, usedAt: null },
    });
    const oldToken = cipher.decrypt(oldReset.deliveryCiphertext);
    await owner
      .post('/auth/verify-email')
      .set('X-CSRF-Token', csrf)
      .send({ token: cipher.decrypt(verification.deliveryCiphertext) })
      .expect(200);
    const list = await owner.get('/staff').expect(200);
    const accounts = apiSuccessResponseSchema(staffAccountListSchema).parse(
      list.body as unknown,
    ).data;
    expect(accounts.find((account) => account.id === staff.id)?.status).toBe(
      'PENDING_VERIFICATION',
    );
    await owner
      .post(`/staff/${staff.id}/invitation`)
      .set('X-CSRF-Token', csrf)
      .expect(201);
    expect(
      await prisma.emailVerificationToken.count({
        where: { userId: staff.id, usedAt: null },
      }),
    ).toBe(0);
    await owner
      .post('/auth/password-reset/confirm')
      .set('X-CSRF-Token', csrf)
      .send({ token: oldToken, password })
      .expect(400);
    const latest = await prisma.passwordResetToken.findFirstOrThrow({
      where: { userId: staff.id, usedAt: null },
    });
    await owner
      .post('/auth/password-reset/confirm')
      .set('X-CSRF-Token', csrf)
      .send({ token: cipher.decrypt(latest.deliveryCiphertext), password })
      .expect(200);
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: staff.id } })).status,
    ).toBe('ACTIVE');
    await owner
      .post(`/staff/${staff.id}/invitation`)
      .set('X-CSRF-Token', csrf)
      .expect(409);
  });

  it('resending consumes old tokens and disabling cannot be undone by an outstanding invitation', async () => {
    const response = await owner
      .post('/staff')
      .set('X-CSRF-Token', csrf)
      .send({
        email: `${randomUUID()}@example.test`,
        displayName: 'Pending',
        staffRole: 'BILLING_OPERATOR',
      })
      .expect(201);
    const staff = apiSuccessResponseSchema(staffAccountSchema).parse(
      response.body as unknown,
    ).data;
    const old = await prisma.emailVerificationToken.findFirstOrThrow({
      where: { userId: staff.id, usedAt: null },
    });
    const oldToken = cipher.decrypt(old.deliveryCiphertext);
    await owner
      .post(`/staff/${staff.id}/invitation`)
      .set('X-CSRF-Token', csrf)
      .expect(201);
    await owner
      .post('/auth/verify-email')
      .set('X-CSRF-Token', csrf)
      .send({ token: oldToken })
      .expect(400);
    const latest = await prisma.emailVerificationToken.findFirstOrThrow({
      where: { userId: staff.id, usedAt: null },
    });
    const token = cipher.decrypt(latest.deliveryCiphertext);
    await owner
      .patch(`/staff/${staff.id}`)
      .set('X-CSRF-Token', csrf)
      .send({
        displayName: staff.displayName,
        staffRole: staff.staffRole,
        enabled: false,
      })
      .expect(200);
    await owner
      .post('/auth/verify-email')
      .set('X-CSRF-Token', csrf)
      .send({ token })
      .expect(400);
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: staff.id } })).status,
    ).toBe('DISABLED');
  });

  it('revokes sessions/challenges on role change, denies self-lockout and preserves financial/audit history', async () => {
    await prisma.adminLoginChallenge.create({
      data: {
        userId: billingId,
        tokenHash: hashOpaqueToken(randomBytes(32).toString('hex')),
        expiresAt: new Date(Date.now() + 300000),
        ipAddressHash: '0'.repeat(64),
      },
    });
    await owner
      .patch(`/staff/${billingId}`)
      .set('X-CSRF-Token', csrf)
      .send({
        displayName: 'Changed staff',
        staffRole: 'SUPPORT_OPERATOR',
        enabled: true,
      })
      .expect(200);
    await billing.get('/auth/me').expect(401);
    expect(
      await prisma.authSession.count({
        where: { userId: billingId, revokedAt: null },
      }),
    ).toBe(0);
    expect(
      await prisma.adminLoginChallenge.count({
        where: { userId: billingId, usedAt: null },
      }),
    ).toBe(0);
    await owner
      .patch(`/staff/${ownerId}`)
      .set('X-CSRF-Token', csrf)
      .send({
        displayName: 'Owner',
        staffRole: 'BILLING_OPERATOR',
        enabled: true,
      })
      .expect(409);
    await owner
      .patch(`/staff/${ownerId}`)
      .set('X-CSRF-Token', csrf)
      .send({
        displayName: 'Owner',
        staffRole: 'FULL_ADMINISTRATOR',
        enabled: false,
      })
      .expect(409);
    expect(await prisma.payment.count()).toBe(1);
    expect(await prisma.invoice.count()).toBe(1);
    expect(
      await prisma.activityLog.count({
        where: { action: 'STAFF_ACCESS_CHANGED' },
      }),
    ).toBeGreaterThan(0);
  });

  it('serializes competing full-administrator removals and rechecks the actor under lock', async () => {
    // Leave exactly the two enrolled owners; pending/unverified owners cannot count.
    await prisma.user.updateMany({
      where: {
        role: 'ADMIN',
        id: { notIn: [ownerId, secondOwnerId] },
        adminProfile: { is: { staffRole: 'FULL_ADMINISTRATOR' } },
      },
      data: { status: 'DISABLED' },
    });
    const owner2 = await account('FULL_ADMINISTRATOR');
    // The third account is not eligible to keep the installation administered.
    await prisma.user.update({
      where: { id: owner2.id },
      data: { status: 'DISABLED' },
    });
    const session = randomBytes(32).toString('hex');
    await prisma.authSession.create({
      data: {
        userId: secondOwnerId,
        tokenHash: hashOpaqueToken(session),
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 3600000),
        twoFactorVerifiedAt: new Date(),
      },
    });
    const agent2 = request
      .agent(app.getHttpServer())
      .set('Cookie', `webhost_session=${session}`);
    const issued = await agent2.get('/auth/csrf').expect(200);
    const csrf2 = (issued.body as { data: { csrfToken: string } }).data
      .csrfToken;
    const results = await Promise.all([
      owner.patch(`/staff/${secondOwnerId}`).set('X-CSRF-Token', csrf).send({
        displayName: 'Owner two',
        staffRole: 'FULL_ADMINISTRATOR',
        enabled: false,
      }),
      agent2.patch(`/staff/${ownerId}`).set('X-CSRF-Token', csrf2).send({
        displayName: 'Owner one',
        staffRole: 'FULL_ADMINISTRATOR',
        enabled: false,
      }),
    ]);
    expect(results.filter((result) => result.status === 200)).toHaveLength(1);
    expect(
      results.every((result) => [200, 401, 403, 409].includes(result.status)),
    ).toBe(true);
    expect(
      await prisma.user.count({
        where: {
          role: 'ADMIN',
          status: 'ACTIVE',
          adminProfile: { is: { staffRole: 'FULL_ADMINISTRATOR' } },
        },
      }),
    ).toBe(1);
  });
});
