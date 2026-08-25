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
  PaymentEventStatus,
  PaymentStatus,
  Prisma,
  SettingCategory,
  UserRole,
  UserStatus,
  type PrismaClient,
} from '@webhost-billing/database';
import {
  apiErrorResponseSchema,
  apiSuccessResponseSchema,
  paymentSessionSchema,
  paymentWebhookResultSchema,
} from '@webhost-billing/shared';
import request from 'supertest';
import type { App } from 'supertest/types';
import { z } from 'zod';
import { AppModule } from '../src/app.module';
import { PRISMA_CLIENT } from '../src/infrastructure/database/database.module';
import { API_ENVIRONMENT } from '../src/infrastructure/environment/environment.module';
import { PasswordHasherService } from '../src/modules/auth/services/password-hasher.service';
import { FakePaymentGateway } from '../src/modules/payment-gateways/fake-payment.gateway';

const CUSTOMER_EMAIL = 'command12-customer@example.test';
const OTHER_EMAIL = 'command12-other@example.test';
const PASSWORD = 'command twelve secure password';

describe('Payment gateways (e2e)', () => {
  let app: INestApplication<App>;
  let moduleFixture: TestingModule;
  let prisma: PrismaClient;
  let gateway: FakePaymentGateway;
  let customerId = '';
  let customer: ReturnType<typeof request.agent>;
  let csrf = '';
  let originalProviderSetting: {
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
    app = moduleFixture.createNestApplication({ rawBody: true });
    await app.init();
    prisma = moduleFixture.get(PRISMA_CLIENT);
    gateway = moduleFixture.get(FakePaymentGateway);
    await cleanup();
    originalProviderSetting = await prisma.setting.findUnique({
      where: { key: 'integration.active-providers' },
      select: {
        category: true,
        value: true,
        description: true,
        updatedByUserId: true,
      },
    });
    await prisma.setting.upsert({
      where: { key: 'integration.active-providers' },
      update: {
        category: SettingCategory.INTEGRATION,
        value: {
          activeGateway: 'fake',
          activeHostingPanelAdapter: 'fake-panel',
        },
      },
      create: {
        key: 'integration.active-providers',
        category: SettingCategory.INTEGRATION,
        value: {
          activeGateway: 'fake',
          activeHostingPanelAdapter: 'fake-panel',
        },
      },
    });
    const passwords = moduleFixture.get(PasswordHasherService);
    const passwordHash = await passwords.hash(PASSWORD);
    const user = await prisma.user.create({
      data: {
        email: CUSTOMER_EMAIL,
        passwordHash,
        role: UserRole.CUSTOMER,
        status: UserStatus.ACTIVE,
        emailVerifiedAt: new Date(),
        customer: {
          create: {
            customerNumber: 'CMD12-CUST',
            status: CustomerStatus.ACTIVE,
            firstName: 'Gateway',
            lastName: 'Customer',
            addressLine1: '12 Adapter Road',
            city: 'Dhaka',
            countryCode: 'BD',
          },
        },
      },
      include: { customer: true },
    });
    customerId = user.customer?.id ?? '';
    await prisma.user.create({
      data: {
        email: OTHER_EMAIL,
        passwordHash,
        role: UserRole.CUSTOMER,
        status: UserStatus.ACTIVE,
        emailVerifiedAt: new Date(),
        customer: {
          create: {
            customerNumber: 'CMD12-OTHER',
            status: CustomerStatus.ACTIVE,
            firstName: 'Other',
            lastName: 'Customer',
            addressLine1: '13 Adapter Road',
            city: 'Dhaka',
            countryCode: 'BD',
          },
        },
      },
    });
    customer = request.agent(app.getHttpServer());
    csrf = await csrfToken(customer);
    await login(customer, csrf, CUSTOMER_EMAIL);
  });

  it('creates an owned full-balance session idempotently', async () => {
    const invoiceId = await createInvoice(12_000n);
    const submissionKey = randomUUID();
    const first = await createSession(invoiceId, submissionKey);
    const second = await createSession(invoiceId, submissionKey);
    expect(first).toMatchObject({
      invoiceId,
      provider: 'fake',
      amount: { amount: '12000', currency: 'BDT' },
      duplicate: false,
    });
    expect(second).toMatchObject({
      paymentId: first.paymentId,
      providerSessionId: first.providerSessionId,
      duplicate: true,
    });
    expect(
      await prisma.payment.count({ where: { invoiceId, provider: 'fake' } }),
    ).toBe(1);

    const other = request.agent(app.getHttpServer());
    const otherCsrf = await csrfToken(other);
    await login(other, otherCsrf, OTHER_EMAIL);
    await other
      .post('/payment-gateways/fake/sessions')
      .set('X-CSRF-Token', otherCsrf)
      .send({ invoiceId, submissionKey: randomUUID() })
      .expect(404);
  });

  it('settles only from a signed callback and ignores an exact replay', async () => {
    const invoiceId = await createInvoice(15_000n);
    const session = await createSession(invoiceId);
    const rawBody = eventBody(session, {
      eventId: `cmd12-success-${randomUUID()}`,
      transactionId: `cmd12-txn-${randomUUID()}`,
    });
    const first = await sendWebhook(rawBody).expect(202);
    const second = await sendWebhook(rawBody).expect(202);
    expect(
      apiSuccessResponseSchema(paymentWebhookResultSchema).parse(first.body)
        .data,
    ).toMatchObject({ duplicate: false, status: 'PROCESSED' });
    expect(
      apiSuccessResponseSchema(paymentWebhookResultSchema).parse(second.body)
        .data,
    ).toMatchObject({ duplicate: true, status: 'PROCESSED' });

    const [invoice, payment, events, outbox, emailOutbox] = await Promise.all([
      prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } }),
      prisma.payment.findUniqueOrThrow({ where: { id: session.paymentId } }),
      prisma.paymentEvent.count({ where: { paymentId: session.paymentId } }),
      prisma.outboxEvent.count({
        where: {
          aggregateId: session.paymentId,
          eventType: 'GATEWAY_PAYMENT_SUCCEEDED',
        },
      }),
      prisma.outboxEvent.count({
        where: {
          aggregateId: session.paymentId,
          eventType: 'EMAIL_PAYMENT_RECEIVED',
        },
      }),
    ]);
    expect(invoice).toMatchObject({
      status: InvoiceStatus.PAID,
      amountPaid: 15_000n,
      balanceDue: 0n,
    });
    expect(payment).toMatchObject({ status: PaymentStatus.SUCCEEDED });
    expect(events).toBe(1);
    expect(outbox).toBe(1);
    expect(emailOutbox).toBe(1);
  });

  it('does not treat a browser success return as payment proof', async () => {
    const invoiceId = await createInvoice(13_000n);
    const session = await createSession(invoiceId);

    const returned = await request(app.getHttpServer())
      .post('/payment-gateways/sslcommerz/return/success')
      .type('form')
      .send({ value_b: invoiceId, status: 'VALID' })
      .expect(303);

    expect(returned.headers.location).toBe(
      `http://localhost:3000/portal/invoices/${invoiceId}`,
    );
    expect(
      await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } }),
    ).toMatchObject({
      status: InvoiceStatus.UNPAID,
      amountPaid: 0n,
      balanceDue: 13_000n,
    });
    expect(
      await prisma.payment.findUniqueOrThrow({
        where: { id: session.paymentId },
      }),
    ).toMatchObject({ status: PaymentStatus.PENDING });
    expect(
      await prisma.paymentEvent.count({
        where: { paymentId: session.paymentId },
      }),
    ).toBe(0);
  });

  it('rejects an invalid exact-body signature without recording an event', async () => {
    const invoiceId = await createInvoice(9_000n);
    const session = await createSession(invoiceId);
    const compact = eventBody(session, {
      eventId: `cmd12-signature-${randomUUID()}`,
      transactionId: `cmd12-txn-${randomUUID()}`,
    });
    const spaced = Buffer.from(
      JSON.stringify(JSON.parse(compact.toString()), null, 2),
    );
    const response = await request(app.getHttpServer())
      .post('/payment-gateways/fake/webhooks')
      .type('application/json')
      .set('X-Payment-Signature', gateway.signWebhook(compact))
      .send(spaced.toString())
      .expect(401);
    expect(apiErrorResponseSchema.parse(response.body).error.code).toBe(
      'PAYMENT_WEBHOOK_REJECTED',
    );
    expect(
      await prisma.paymentEvent.count({
        where: { paymentId: session.paymentId },
      }),
    ).toBe(0);
    expect(
      await prisma.payment.findUniqueOrThrow({
        where: { id: session.paymentId },
      }),
    ).toMatchObject({ status: PaymentStatus.PENDING });
  });

  it.each([
    ['merchant', { merchantId: 'another-merchant' }],
    ['amount', { amount: '1' }],
    ['currency', { currency: 'USD' }],
    ['invoice', { invoiceId: '10000000-0000-4000-8000-000000000099' }],
  ])('rejects a signed event with the wrong %s', async (_field, override) => {
    const invoiceId = await createInvoice(8_000n);
    const session = await createSession(invoiceId);
    const eventId = `cmd12-invalid-${randomUUID()}`;
    const rawBody = eventBody(session, {
      eventId,
      transactionId: `cmd12-txn-${randomUUID()}`,
      ...override,
    });
    const response = await sendWebhook(rawBody).expect(422);
    expect(apiErrorResponseSchema.parse(response.body).error.code).toBe(
      'PAYMENT_WEBHOOK_REJECTED',
    );
    await sendWebhook(rawBody).expect(422);
    expect(
      await prisma.payment.findUniqueOrThrow({
        where: { id: session.paymentId },
      }),
    ).toMatchObject({ status: PaymentStatus.PENDING });
    expect(
      await prisma.paymentEvent.findFirstOrThrow({
        where: {
          provider: 'fake',
          providerEventId: eventId,
        },
      }),
    ).toMatchObject({ status: PaymentEventStatus.FAILED });
    expect(
      await prisma.paymentEvent.count({
        where: { provider: 'fake', providerEventId: eventId },
      }),
    ).toBe(1);
  });

  it('rejects a provider transaction already used by another payment', async () => {
    const transactionId = `cmd12-duplicate-txn-${randomUUID()}`;
    const first = await createSession(await createInvoice(6_000n));
    await sendWebhook(
      eventBody(first, {
        eventId: `cmd12-first-${randomUUID()}`,
        transactionId,
      }),
    ).expect(202);
    const second = await createSession(await createInvoice(6_000n));
    await sendWebhook(
      eventBody(second, {
        eventId: `cmd12-second-${randomUUID()}`,
        transactionId,
      }),
    ).expect(422);
    expect(
      await prisma.payment.findUniqueOrThrow({
        where: { id: second.paymentId },
      }),
    ).toMatchObject({ status: PaymentStatus.PENDING });
  });

  it('serializes concurrent delivery and settles only once', async () => {
    const invoiceId = await createInvoice(11_000n);
    const session = await createSession(invoiceId);
    const rawBody = eventBody(session, {
      eventId: `cmd12-concurrent-${randomUUID()}`,
      transactionId: `cmd12-txn-${randomUUID()}`,
    });
    const [first, second] = await Promise.all([
      sendWebhook(rawBody),
      sendWebhook(rawBody),
    ]);
    expect([first.status, second.status]).toEqual([202, 202]);
    const results = [first, second].map(
      (response) =>
        apiSuccessResponseSchema(paymentWebhookResultSchema).parse(
          response.body,
        ).data.duplicate,
    );
    expect(results.sort()).toEqual([false, true]);
    expect(
      await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } }),
    ).toMatchObject({ amountPaid: 11_000n, balanceDue: 0n });
    expect(
      await prisma.paymentEvent.count({
        where: { paymentId: session.paymentId },
      }),
    ).toBe(1);
  });

  it('records provider failure and emits one follow-up outbox event', async () => {
    const invoiceId = await createInvoice(7_000n);
    const session = await createSession(invoiceId);
    await sendWebhook(
      eventBody(session, {
        eventId: `cmd12-failed-${randomUUID()}`,
        transactionId: `cmd12-txn-${randomUUID()}`,
        type: 'payment.failed',
        failureReason: 'Declined by fake provider',
      }),
    ).expect(202);
    expect(
      await prisma.payment.findUniqueOrThrow({
        where: { id: session.paymentId },
      }),
    ).toMatchObject({
      status: PaymentStatus.FAILED,
      failureReason: 'Declined by fake provider',
    });
    expect(
      await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } }),
    ).toMatchObject({ status: InvoiceStatus.UNPAID, amountPaid: 0n });
    expect(
      await prisma.outboxEvent.count({
        where: {
          aggregateId: session.paymentId,
          eventType: 'GATEWAY_PAYMENT_FAILED',
        },
      }),
    ).toBe(1);
  });

  afterAll(async () => {
    if (prisma) await cleanup();
    if (prisma && originalProviderSetting) {
      await prisma.setting.update({
        where: { key: 'integration.active-providers' },
        data: {
          ...originalProviderSetting,
          value:
            originalProviderSetting.value === null
              ? Prisma.JsonNull
              : originalProviderSetting.value,
        },
      });
    } else if (prisma) {
      await prisma.setting.deleteMany({
        where: { key: 'integration.active-providers' },
      });
    }
    if (app) await app.close();
  });

  async function createInvoice(total: bigint): Promise<string> {
    const now = new Date();
    const invoice = await prisma.invoice.create({
      data: {
        invoiceNumber: `CMD12-${randomUUID().slice(0, 12).toUpperCase()}`,
        submissionKey: `test:command12:${randomUUID()}`,
        customerId,
        status: InvoiceStatus.UNPAID,
        currency: 'BDT',
        subtotal: total,
        total,
        balanceDue: total,
        customerNameSnapshot: 'Gateway Customer',
        customerEmailSnapshot: CUSTOMER_EMAIL,
        customerAddressSnapshot: {
          line1: '12 Adapter Road',
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
            descriptionSnapshot: 'Command 12 gateway invoice',
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

  async function createSession(
    invoiceId: string,
    submissionKey = randomUUID(),
  ) {
    const response = await customer
      .post('/payment-gateways/fake/sessions')
      .set('X-CSRF-Token', csrf)
      .send({ invoiceId, submissionKey })
      .expect(201);
    return apiSuccessResponseSchema(paymentSessionSchema).parse(response.body)
      .data;
  }

  function eventBody(
    session: Awaited<ReturnType<typeof createSession>>,
    options: {
      eventId: string;
      transactionId: string;
      type?: 'payment.succeeded' | 'payment.failed';
      merchantId?: string;
      invoiceId?: string;
      amount?: string;
      currency?: string;
      failureReason?: string;
    },
  ): Buffer {
    return Buffer.from(
      JSON.stringify({
        event_id: options.eventId,
        type: options.type ?? 'payment.succeeded',
        merchant_id: options.merchantId ?? gateway.merchantId,
        data: {
          payment_id: session.paymentId,
          invoice_id: options.invoiceId ?? session.invoiceId,
          amount: options.amount ?? session.amount.amount,
          currency: options.currency ?? session.amount.currency,
          transaction_id: options.transactionId,
          occurred_at: new Date().toISOString(),
          failure_reason: options.failureReason ?? null,
        },
      }),
    );
  }

  function sendWebhook(rawBody: Buffer) {
    return request(app.getHttpServer())
      .post('/payment-gateways/fake/webhooks')
      .type('application/json')
      .set('X-Payment-Signature', gateway.signWebhook(rawBody))
      .send(rawBody.toString());
  }

  async function csrfToken(agent: ReturnType<typeof request.agent>) {
    const response = await agent.get('/auth/csrf').expect(200);
    return apiSuccessResponseSchema(
      z.object({ csrfToken: z.string().min(32) }).strict(),
    ).parse(response.body).data.csrfToken;
  }

  async function login(
    agent: ReturnType<typeof request.agent>,
    csrfTokenValue: string,
    email: string,
  ) {
    await agent
      .post('/auth/login')
      .set('X-CSRF-Token', csrfTokenValue)
      .send({ email, password: PASSWORD })
      .expect(200);
  }

  async function cleanup() {
    await prisma.paymentEvent.deleteMany({ where: { provider: 'fake' } });
    const users = await prisma.user.findMany({
      where: { email: { in: [CUSTOMER_EMAIL, OTHER_EMAIL] } },
      select: { id: true, customer: { select: { id: true } } },
    });
    const userIds = users.map((user) => user.id);
    const customerIds = users.flatMap((user) =>
      user.customer ? [user.customer.id] : [],
    );
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
    if (paymentIds.length) {
      await prisma.outboxEvent.deleteMany({
        where: { aggregateType: 'PAYMENT', aggregateId: { in: paymentIds } },
      });
      await prisma.activityLog.deleteMany({
        where: { entityType: 'PAYMENT', entityId: { in: paymentIds } },
      });
    }
    if (invoiceIds.length) {
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
      await prisma.authSession.deleteMany({
        where: { userId: { in: userIds } },
      });
      await prisma.customer.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
  }

  function loadTestEnvironment(): ApiEnvironment {
    return parseApiEnvironment({
      ...process.env,
      PORT: process.env.API_PORT ?? '3001',
      NODE_ENV: 'test',
      AUTH_RATE_LIMIT_NAMESPACE: `gateway-e2e-${randomUUID()}`,
    });
  }
});
