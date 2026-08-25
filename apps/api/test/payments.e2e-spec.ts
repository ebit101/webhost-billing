import { randomUUID } from 'node:crypto';
import { type INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import {
  parseApiEnvironment,
  type ApiEnvironment,
} from '@webhost-billing/config';
import {
  CustomerStatus,
  InvoiceStatus,
  UserRole,
  UserStatus,
  type Prisma,
  type PrismaClient,
} from '@webhost-billing/database';
import {
  apiSuccessResponseSchema,
  manualPaymentCreationResultSchema,
  manualPaymentSchema,
  paginatedApiSuccessResponseSchema,
  paymentSettingsSchema,
} from '@webhost-billing/shared';
import request from 'supertest';
import type { App } from 'supertest/types';
import { z } from 'zod';
import { AppModule } from '../src/app.module';
import { PRISMA_CLIENT } from '../src/infrastructure/database/database.module';
import { API_ENVIRONMENT } from '../src/infrastructure/environment/environment.module';
import { PasswordHasherService } from '../src/modules/auth/services/password-hasher.service';

const ADMIN_EMAIL = 'command11-admin@example.test';
const CUSTOMER_EMAIL = 'command11-customer@example.test';
const OTHER_EMAIL = 'command11-other@example.test';
const PASSWORD = 'command eleven secure password';
const SETTINGS_KEY = 'billing.manual-payments';

describe('Manual payments (e2e)', () => {
  let app: INestApplication<App>;
  let moduleFixture: TestingModule;
  let prisma: PrismaClient;
  let passwords: PasswordHasherService;
  let customerId = '';
  let previousSetting: {
    value: Prisma.InputJsonValue;
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
    passwords = moduleFixture.get(PasswordHasherService);
    const setting = await prisma.setting.findUnique({
      where: { key: SETTINGS_KEY },
      select: { value: true, updatedByUserId: true },
    });
    previousSetting = setting
      ? {
          value: setting.value as Prisma.InputJsonValue,
          updatedByUserId: setting.updatedByUserId,
        }
      : null;
    await cleanup(false);
    const passwordHash = await passwords.hash(PASSWORD);
    await prisma.user.create({
      data: {
        email: ADMIN_EMAIL,
        passwordHash,
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
        emailVerifiedAt: new Date(),
        adminProfile: {
          create: { displayName: 'Command Eleven Admin', isSuperAdmin: true },
        },
      },
    });
    const customer = await prisma.user.create({
      data: {
        email: CUSTOMER_EMAIL,
        passwordHash,
        role: UserRole.CUSTOMER,
        status: UserStatus.ACTIVE,
        emailVerifiedAt: new Date(),
        customer: {
          create: {
            customerNumber: 'CMD11-CUST',
            status: CustomerStatus.ACTIVE,
            firstName: 'Manual',
            lastName: 'Payer',
            addressLine1: '11 Payment Road',
            city: 'Dhaka',
            countryCode: 'BD',
          },
        },
      },
      include: { customer: true },
    });
    customerId = customer.customer?.id ?? '';
    await prisma.user.create({
      data: {
        email: OTHER_EMAIL,
        passwordHash,
        role: UserRole.CUSTOMER,
        status: UserStatus.ACTIVE,
        emailVerifiedAt: new Date(),
        customer: {
          create: {
            customerNumber: 'CMD11-OTHER',
            status: CustomerStatus.ACTIVE,
            firstName: 'Other',
            lastName: 'Payer',
            addressLine1: '12 Payment Road',
            city: 'Dhaka',
            countryCode: 'BD',
          },
        },
      },
    });
  });

  it('accepts an owned customer reference as pending and retries idempotently', async () => {
    const invoiceId = await createInvoice(10_000n);
    const customer = request.agent(app.getHttpServer());
    const csrf = await csrfToken(customer);
    await login(customer, csrf, CUSTOMER_EMAIL);
    await customer
      .post('/payments/manual/customer')
      .set('X-CSRF-Token', csrf)
      .send(paymentBody(invoiceId, '5000', 'PARTIAL-DISABLED'))
      .expect(422);

    const submissionKey = randomUUID();
    const body = paymentBody(
      invoiceId,
      '10000',
      'CUSTOMER-REFERENCE-001',
      submissionKey,
    );
    const first = await customer
      .post('/payments/manual/customer')
      .set('X-CSRF-Token', csrf)
      .send(body)
      .expect(201);
    const second = await customer
      .post('/payments/manual/customer')
      .set('X-CSRF-Token', csrf)
      .send(body)
      .expect(201);
    const firstResult = apiSuccessResponseSchema(
      manualPaymentCreationResultSchema,
    ).parse(first.body).data;
    const secondResult = apiSuccessResponseSchema(
      manualPaymentCreationResultSchema,
    ).parse(second.body).data;
    expect(firstResult).toMatchObject({ duplicate: false });
    expect(firstResult.payment).toMatchObject({
      invoiceId,
      state: 'PENDING',
      method: 'BANK_TRANSFER',
      reference: 'CUSTOMER-REFERENCE-001',
      amount: { amount: '10000', currency: 'BDT' },
      proof: { payerName: 'Manual Payer', note: 'Command 11 proof text' },
    });
    expect(secondResult).toMatchObject({
      duplicate: true,
      payment: { id: firstResult.payment.id },
    });
    const listed = await customer.get('/payments/my').expect(200);
    expect(
      paginatedApiSuccessResponseSchema(manualPaymentSchema).parse(listed.body)
        .data,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: firstResult.payment.id }),
      ]),
    );

    const other = request.agent(app.getHttpServer());
    const otherCsrf = await csrfToken(other);
    await login(other, otherCsrf, OTHER_EMAIL);
    await other.get(`/payments/${firstResult.payment.id}`).expect(403);
  });

  it('serializes concurrent reviews so the same payment settles once', async () => {
    const invoiceId = await createInvoice(12_000n);
    const customer = request.agent(app.getHttpServer());
    const customerCsrf = await csrfToken(customer);
    await login(customer, customerCsrf, CUSTOMER_EMAIL);
    const submitted = await customer
      .post('/payments/manual/customer')
      .set('X-CSRF-Token', customerCsrf)
      .send(paymentBody(invoiceId, '12000', 'CONCURRENT-VERIFY-001'))
      .expect(201);
    const paymentId = apiSuccessResponseSchema(
      manualPaymentCreationResultSchema,
    ).parse(submitted.body).data.payment.id;

    const admin = request.agent(app.getHttpServer());
    const csrf = await csrfToken(admin);
    await login(admin, csrf, ADMIN_EMAIL);
    const responses = await Promise.all([
      admin
        .patch(`/payments/${paymentId}/review`)
        .set('X-CSRF-Token', csrf)
        .send({ action: 'VERIFY' }),
      admin
        .patch(`/payments/${paymentId}/review`)
        .set('X-CSRF-Token', csrf)
        .send({ action: 'VERIFY' }),
    ]);
    const statuses = responses.map((response) => response.status);
    expect(statuses.filter((status) => status === 200)).toHaveLength(1);
    expect([409, 422]).toContain(statuses.find((status) => status !== 200));
    const invoice = await prisma.invoice.findUniqueOrThrow({
      where: { id: invoiceId },
    });
    expect(invoice).toMatchObject({
      status: InvoiceStatus.PAID,
      amountPaid: 12_000n,
      balanceDue: 0n,
    });
    expect(
      await prisma.payment.count({
        where: { id: paymentId, status: 'SUCCEEDED' },
      }),
    ).toBe(1);
    expect(
      await prisma.outboxEvent.count({
        where: {
          aggregateId: paymentId,
          eventType: 'EMAIL_PAYMENT_RECEIVED',
        },
      }),
    ).toBe(1);
  });

  it('rejects a pending reference without changing its invoice', async () => {
    const invoiceId = await createInvoice(8_000n);
    const customer = request.agent(app.getHttpServer());
    const customerCsrf = await csrfToken(customer);
    await login(customer, customerCsrf, CUSTOMER_EMAIL);
    const submitted = await customer
      .post('/payments/manual/customer')
      .set('X-CSRF-Token', customerCsrf)
      .send(paymentBody(invoiceId, '8000', 'REJECT-ME-001'))
      .expect(201);
    const paymentId = apiSuccessResponseSchema(
      manualPaymentCreationResultSchema,
    ).parse(submitted.body).data.payment.id;
    const admin = request.agent(app.getHttpServer());
    const csrf = await csrfToken(admin);
    await login(admin, csrf, ADMIN_EMAIL);
    const rejected = await admin
      .patch(`/payments/${paymentId}/review`)
      .set('X-CSRF-Token', csrf)
      .send({ action: 'REJECT', reason: 'Reference could not be verified.' })
      .expect(200);
    expect(
      apiSuccessResponseSchema(manualPaymentSchema).parse(rejected.body).data,
    ).toMatchObject({
      state: 'REJECTED',
      failureReason: 'Reference could not be verified.',
    });
    await admin
      .patch(`/payments/${paymentId}/review`)
      .set('X-CSRF-Token', csrf)
      .send({ action: 'VERIFY' })
      .expect(422);
    expect(
      await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } }),
    ).toMatchObject({ amountPaid: 0n, balanceDue: 8_000n });
  });

  it('enables partial payments explicitly and prevents concurrent overpayment', async () => {
    const admin = request.agent(app.getHttpServer());
    const csrf = await csrfToken(admin);
    await login(admin, csrf, ADMIN_EMAIL);
    const settings = await admin
      .patch('/payments/settings')
      .set('X-CSRF-Token', csrf)
      .send({ partialPaymentsEnabled: true })
      .expect(200);
    expect(
      apiSuccessResponseSchema(paymentSettingsSchema).parse(settings.body).data,
    ).toEqual({ partialPaymentsEnabled: true });

    const invoiceId = await createInvoice(10_000n);
    const responses = await Promise.all([
      admin
        .post('/payments/manual/admin')
        .set('X-CSRF-Token', csrf)
        .send(paymentBody(invoiceId, '7000', 'RACE-PARTIAL-A')),
      admin
        .post('/payments/manual/admin')
        .set('X-CSRF-Token', csrf)
        .send(paymentBody(invoiceId, '7000', 'RACE-PARTIAL-B')),
    ]);
    expect(
      responses.filter((response) => response.status === 201),
    ).toHaveLength(1);
    expect(
      responses.filter((response) => response.status === 422),
    ).toHaveLength(1);
    expect(
      await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } }),
    ).toMatchObject({ amountPaid: 7_000n, balanceDue: 3_000n });
  });

  it('appends refunds and reversals while preserving the original charge', async () => {
    const invoiceId = await createInvoice(10_000n);
    const admin = request.agent(app.getHttpServer());
    const csrf = await csrfToken(admin);
    await login(admin, csrf, ADMIN_EMAIL);
    const recorded = await admin
      .post('/payments/manual/admin')
      .set('X-CSRF-Token', csrf)
      .send(paymentBody(invoiceId, '10000', 'ADJUSTABLE-CHARGE-001'))
      .expect(201);
    const original = apiSuccessResponseSchema(
      manualPaymentCreationResultSchema,
    ).parse(recorded.body).data.payment;
    const refundKey = randomUUID();
    const refundBody = {
      kind: 'REFUND',
      amount: '4000',
      submissionKey: refundKey,
      reference: 'REFUND-001',
      note: 'Partial fictional refund',
    };
    const refund = await admin
      .post(`/payments/${original.id}/adjustments`)
      .set('X-CSRF-Token', csrf)
      .send(refundBody)
      .expect(201);
    expect(
      apiSuccessResponseSchema(manualPaymentCreationResultSchema).parse(
        refund.body,
      ).data.payment,
    ).toMatchObject({
      kind: 'REFUND',
      state: 'REFUNDED',
      originalPaymentId: original.id,
      amount: { amount: '4000', currency: 'BDT' },
    });
    const duplicateRefund = await admin
      .post(`/payments/${original.id}/adjustments`)
      .set('X-CSRF-Token', csrf)
      .send(refundBody)
      .expect(201);
    expect(
      apiSuccessResponseSchema(manualPaymentCreationResultSchema).parse(
        duplicateRefund.body,
      ).data.duplicate,
    ).toBe(true);
    expect(
      await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } }),
    ).toMatchObject({
      status: InvoiceStatus.PARTIALLY_REFUNDED,
      amountPaid: 6_000n,
      balanceDue: 4_000n,
    });
    await admin
      .post(`/payments/${original.id}/adjustments`)
      .set('X-CSRF-Token', csrf)
      .send({
        kind: 'REVERSAL',
        amount: '6000',
        submissionKey: randomUUID(),
        reference: 'REVERSAL-001',
      })
      .expect(201);
    const finalInvoice = await prisma.invoice.findUniqueOrThrow({
      where: { id: invoiceId },
    });
    expect(finalInvoice).toMatchObject({
      status: InvoiceStatus.REFUNDED,
      amountPaid: 0n,
      balanceDue: 10_000n,
    });
    const unchangedOriginal = await prisma.payment.findUniqueOrThrow({
      where: { id: original.id },
    });
    expect(unchangedOriginal).toMatchObject({
      kind: 'CHARGE',
      status: 'SUCCEEDED',
      amount: 10_000n,
      reference: 'ADJUSTABLE-CHARGE-001',
    });
    await admin
      .post(`/payments/${original.id}/adjustments`)
      .set('X-CSRF-Token', csrf)
      .send({
        kind: 'REFUND',
        amount: '1',
        submissionKey: randomUUID(),
        reference: 'EXCESS-REFUND-001',
      })
      .expect(422);
    expect(
      await prisma.payment.count({ where: { originalPaymentId: original.id } }),
    ).toBe(2);
  });

  it('records administrator audits and exposes only structured proof metadata', async () => {
    const admin = request.agent(app.getHttpServer());
    const csrf = await csrfToken(admin);
    await login(admin, csrf, ADMIN_EMAIL);
    const response = await admin.get('/payments?state=VERIFIED').expect(200);
    const payments = paginatedApiSuccessResponseSchema(
      manualPaymentSchema,
    ).parse(response.body).data;
    expect(payments.length).toBeGreaterThan(0);
    expect(payments[0]).not.toHaveProperty('providerTransactionId');
    expect(payments[0]).not.toHaveProperty('proof.file');
    expect(
      await prisma.activityLog.count({
        where: {
          actor: { email: ADMIN_EMAIL },
          action: {
            in: [
              'MANUAL_PAYMENT_RECORDED_BY_ADMIN',
              'MANUAL_PAYMENT_VERIFIED_BY_ADMIN',
              'MANUAL_PAYMENT_REJECTED_BY_ADMIN',
              'MANUAL_PAYMENT_REFUNDED_BY_ADMIN',
              'MANUAL_PAYMENT_REVERSED_BY_ADMIN',
            ],
          },
        },
      }),
    ).toBeGreaterThanOrEqual(5);
  });

  afterAll(async () => {
    await cleanup(true);
    await app.close();
  });

  async function createInvoice(total: bigint) {
    const now = new Date();
    const invoice = await prisma.invoice.create({
      data: {
        invoiceNumber: `CMD11-${randomUUID().slice(0, 12).toUpperCase()}`,
        submissionKey: `test:command11:${randomUUID()}`,
        customerId,
        status: InvoiceStatus.UNPAID,
        currency: 'BDT',
        subtotal: total,
        total,
        balanceDue: total,
        customerNameSnapshot: 'Manual Payer',
        customerEmailSnapshot: CUSTOMER_EMAIL,
        customerAddressSnapshot: {
          line1: '11 Payment Road',
          line2: null,
          city: 'Dhaka',
          region: null,
          postalCode: null,
          countryCode: 'BD',
        },
        businessIdentitySnapshot: { name: 'Fictional Hosting Ltd' },
        issuedAt: now,
        dueAt: new Date(now.getTime() + 86_400_000),
        items: {
          create: {
            linePosition: 1,
            descriptionSnapshot: 'Command 11 test invoice',
            currency: 'BDT',
            quantity: 1,
            unitAmount: total,
            lineTotal: total,
          },
        },
      },
    });
    return invoice.id;
  }

  function paymentBody(
    invoiceId: string,
    amount: string,
    reference: string,
    submissionKey = randomUUID(),
  ) {
    return {
      invoiceId,
      amount,
      submissionKey,
      proof: {
        method: 'BANK_TRANSFER',
        reference,
        payerName: 'Manual Payer',
        note: 'Command 11 proof text',
      },
    };
  }

  async function csrfToken(agent: ReturnType<typeof request.agent>) {
    const response = await agent.get('/auth/csrf').expect(200);
    return apiSuccessResponseSchema(
      z.object({ csrfToken: z.string().min(32) }).strict(),
    ).parse(response.body).data.csrfToken;
  }

  async function login(
    agent: ReturnType<typeof request.agent>,
    csrf: string,
    email: string,
  ) {
    await agent
      .post('/auth/login')
      .set('X-CSRF-Token', csrf)
      .send({ email, password: PASSWORD })
      .expect(200);
  }

  async function cleanup(restoreSetting: boolean) {
    const users = await prisma.user.findMany({
      where: { email: { in: [ADMIN_EMAIL, CUSTOMER_EMAIL, OTHER_EMAIL] } },
      select: { id: true, customer: { select: { id: true } } },
    });
    const userIds = users.map((user) => user.id);
    const customerIds = users.flatMap((user) =>
      user.customer ? [user.customer.id] : [],
    );
    if (customerIds.length) {
      const invoices = await prisma.invoice.findMany({
        where: { customerId: { in: customerIds } },
        select: { id: true },
      });
      const invoiceIds = invoices.map((invoice) => invoice.id);
      const payments = await prisma.payment.findMany({
        where: { invoiceId: { in: invoiceIds } },
        select: { id: true },
      });
      const paymentIds = payments.map((payment) => payment.id);
      await prisma.activityLog.deleteMany({
        where: {
          OR: [
            { entityType: 'PAYMENT', entityId: { in: paymentIds } },
            { entityType: 'INVOICE', entityId: { in: invoiceIds } },
          ],
        },
      });
      await prisma.paymentEvent.deleteMany({
        where: { paymentId: { in: paymentIds } },
      });
      await prisma.payment.deleteMany({
        where: {
          invoiceId: { in: invoiceIds },
          originalPaymentId: { not: null },
        },
      });
      await prisma.payment.deleteMany({
        where: { invoiceId: { in: invoiceIds } },
      });
      await prisma.invoiceItem.deleteMany({
        where: { invoiceId: { in: invoiceIds } },
      });
      await prisma.invoice.deleteMany({ where: { id: { in: invoiceIds } } });
    }
    if (userIds.length) {
      await prisma.activityLog.deleteMany({
        where: { actorUserId: { in: userIds } },
      });
      await prisma.setting.deleteMany({
        where: { key: SETTINGS_KEY, updatedByUserId: { in: userIds } },
      });
      await prisma.authSession.deleteMany({
        where: { userId: { in: userIds } },
      });
      await prisma.adminProfile.deleteMany({
        where: { userId: { in: userIds } },
      });
      await prisma.customer.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
    if (restoreSetting && previousSetting) {
      await prisma.setting.upsert({
        where: { key: SETTINGS_KEY },
        update: previousSetting,
        create: {
          key: SETTINGS_KEY,
          category: 'BILLING',
          value: previousSetting.value,
          updatedByUserId: previousSetting.updatedByUserId,
        },
      });
    }
  }

  function loadTestEnvironment(): ApiEnvironment {
    return parseApiEnvironment({
      ...process.env,
      PORT: process.env.API_PORT ?? '3001',
      NODE_ENV: 'test',
      AUTH_RATE_LIMIT_NAMESPACE: `payment-e2e-${randomUUID()}`,
    });
  }
});
