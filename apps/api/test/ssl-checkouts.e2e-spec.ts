import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { Test, type TestingModule } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import {
  parseApiEnvironment,
  type ApiEnvironment,
} from '@webhost-billing/config';
import { Prisma, type PrismaClient } from '@webhost-billing/database';
import {
  apiSuccessResponseSchema,
  paymentWebhookResultSchema,
  paymentSessionSchema,
  sslCheckoutSchema,
  type PaymentSession,
} from '@webhost-billing/shared';
import { AppModule } from '../src/app.module';
import { PRISMA_CLIENT } from '../src/infrastructure/database/database.module';
import { API_ENVIRONMENT } from '../src/infrastructure/environment/environment.module';
import { PAYMENT_HTTP_CLIENT } from '../src/modules/payment-gateways/payment-http.client';
import { SslCheckoutService } from '../src/modules/payment-gateways/ssl-checkout.service';
import { IntegrationCredentialService } from '../src/modules/settings/integration-credential.service';
import { TotpService } from '../src/modules/auth/services/totp.service';
import type { AuthRequestContext } from '../src/modules/auth/auth.types';
import {
  FictionalSslHttp,
  type FictionalSslTransaction,
} from './fixtures/ssl-http.fixture';

jest.setTimeout(60000);
describe('Command 220 isolated SSLCOMMERZ checkout, capture and refund recovery', () => {
  let app: INestApplication<App>;
  let module: TestingModule;
  let prisma: PrismaClient;
  let ssl: SslCheckoutService;
  const provider = new FictionalSslHttp();
  let owner: Actor;
  let customer: Actor;
  let other: Actor;
  let noMfa: Actor;
  let originalSetting: Prisma.JsonValue | undefined;
  let originalCredentials: {
    ciphertext: string;
    keyVersion: string;
    maskedIdentifier: string;
    updatedByUserId: string;
  } | null;
  type Actor = {
    auth: AuthRequestContext;
    agent: ReturnType<typeof request.agent>;
    csrf: string;
  };
  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL!);
    if (!url.searchParams.get('schema')?.startsWith('command26_e2e_'))
      throw new Error(
        'SSLCOMMERZ acceptance requires the guarded fictional schema.',
      );
    const env: ApiEnvironment = parseApiEnvironment({
      ...process.env,
      NODE_ENV: 'test',
      PORT: '3001',
      API_PUBLIC_ORIGIN: 'https://api.example.test',
      SSLCOMMERZ_ENABLED: 'false',
      AUTH_RATE_LIMIT_NAMESPACE: `ssl-${randomUUID()}`,
    });
    module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(API_ENVIRONMENT)
      .useValue(env)
      .overrideProvider(PAYMENT_HTTP_CLIENT)
      .useValue(provider)
      .compile();
    app = module.createNestApplication({ rawBody: true });
    await app.init();
    prisma = module.get(PRISMA_CLIENT);
    ssl = module.get(SslCheckoutService);
    owner = await actor('FULL_ADMINISTRATOR', true);
    noMfa = await actor('FULL_ADMINISTRATOR', false);
    customer = await actor('CUSTOMER');
    other = await actor('CUSTOMER');
    originalSetting = (
      await prisma.setting.findUnique({
        where: { key: 'integration.active-providers' },
      })
    )?.value;
    originalCredentials = await prisma.integrationCredential.findUnique({
      where: { providerKey: 'sslcommerz' },
      select: {
        ciphertext: true,
        keyVersion: true,
        maskedIdentifier: true,
        updatedByUserId: true,
      },
    });
    await active('sslcommerz');
    await credentials('fictional-store', 'fictional-password');
  });
  afterEach(() => {
    provider.validationOverride = {};
    provider.queryOverride = {};
    provider.createBarrier = undefined;
    provider.loseCreateResponse = false;
    provider.loseRefundResponse = false;
    provider.omitRefundAmount = false;
  });
  afterAll(async () => {
    if (prisma) {
      if (originalSetting !== undefined)
        await prisma.setting.update({
          where: { key: 'integration.active-providers' },
          data: {
            value:
              originalSetting === null
                ? Prisma.JsonNull
                : (originalSetting as Prisma.InputJsonValue),
          },
        });
      if (originalCredentials)
        await prisma.integrationCredential.update({
          where: { providerKey: 'sslcommerz' },
          data: originalCredentials,
        });
      else
        await prisma.integrationCredential.deleteMany({
          where: { providerKey: 'sslcommerz' },
        });
    }
    if (app) await app.close();
  });

  it('reserves one full-balance checkout, snapshots encrypted merchant credentials and maps real contact details', async () => {
    const invoice = await invoiceFor(customer);
    const key = randomUUID();
    const session = await start(invoice.id, key);
    const saved = await ssl.getBound(session.paymentId);
    expect(saved.environment).toBe('SANDBOX');
    expect(saved.merchantReference).toBe(session.providerSessionId);
    expect(saved.sessionKey).toBeTruthy();
    expect(saved.credentialCiphertext).not.toContain('fictional-password');
    const body = new URLSearchParams(
      provider.calls.find((call) =>
        call.body?.includes(`value_a=${session.paymentId}`),
      )!.body,
    );
    expect(body.get('cus_phone')).toBe('+8801700000000');
    expect(body.get('cus_country')).toBe('Bangladesh');
    expect(body.get('total_amount')).toBe('100.00');
    const repeat = await start(invoice.id, key);
    expect(repeat.paymentId).toBe(session.paymentId);
    expect(repeat.duplicate).toBe(true);
    const changedKey = await start(invoice.id);
    expect(changedKey.paymentId).toBe(session.paymentId);
    expect(mutations(saved.merchantReference)).toHaveLength(1);
  });
  it('serializes distinct submission keys and concurrent session creation before contacting the provider', async () => {
    const invoice = await invoiceFor(customer);
    let release = () => {};
    const wait = new Promise<void>((resolve) => (release = resolve));
    provider.createBarrier = () => wait;
    const first = ssl.create(
      { invoiceId: invoice.id, submissionKey: randomUUID() },
      customer.auth,
    );
    const attempt = await untilAttempt(invoice.id);
    await expect(
      ssl.create(
        { invoiceId: invoice.id, submissionKey: randomUUID() },
        customer.auth,
      ),
    ).rejects.toThrow('not reusable');
    release();
    await first;
    expect(mutations(attempt.merchantReference)).toHaveLength(1);
    expect(
      await prisma.sslCheckout.count({ where: { invoiceId: invoice.id } }),
    ).toBe(1);
  });
  it('pays one real fictional hosting checkout while retaining separate order and provisioning states', async () => {
    const plan = await prisma.product.create({
      data: {
        name: 'Fictional SSL hosting',
        slug: `c220-${randomUUID()}`,
        status: 'ACTIVE',
        publicVisible: true,
        hostingPackageIdentifier: 'fictional_c220',
        prices: {
          create: { billingPeriod: 'MONTHLY', currency: 'BDT', amount: 10000n },
        },
      },
      include: { prices: true },
    });
    const body = {
      productId: plan.id,
      priceId: plan.prices[0].id,
      requestedDomain: `c220-${randomUUID().slice(0, 8)}.example.test`,
      submissionKey: randomUUID(),
    };
    await customer.agent
      .post('/orders/checkout')
      .set('X-CSRF-Token', customer.csrf)
      .send(body)
      .expect(201);
    await customer.agent
      .post('/orders/checkout')
      .set('X-CSRF-Token', customer.csrf)
      .send(body)
      .expect(201);
    const orders = await prisma.order.findMany({
      where: {
        customerId:
          customer.auth.identity.role === 'CUSTOMER'
            ? customer.auth.identity.customerId
            : '',
      },
      include: { invoices: true },
    });
    expect(orders).toHaveLength(1);
    const order = orders[0];
    expect(order.invoices).toHaveLength(1);
    const session = await start(order.invoices[0].id);
    transaction(session).status = 'VALID';
    await ipn(transaction(session)).expect(202);
    expect(
      (await prisma.order.findUniqueOrThrow({ where: { id: order.id } }))
        .status,
    ).toBe('PAID');
    expect(
      await prisma.service.count({ where: { customerId: order.customerId } }),
    ).toBe(0);
    expect(
      await prisma.outboxEvent.count({
        where: {
          aggregateId: session.paymentId,
          eventType: 'GATEWAY_PAYMENT_SUCCEEDED',
        },
      }),
    ).toBe(1);
  });
  it('holds online attempts across a provider switch until their outcome is known', async () => {
    const invoice = await invoiceFor(customer);
    const session = await start(invoice.id);
    await active('fake');
    try {
      await customer.agent
        .post('/payment-gateways/fake/sessions')
        .set('X-CSRF-Token', customer.csrf)
        .send({ invoiceId: invoice.id, submissionKey: randomUUID() })
        .expect(409);
    } finally {
      await active('sslcommerz');
    }
    expect(
      await prisma.payment.count({ where: { invoiceId: invoice.id } }),
    ).toBe(1);
    const otherInvoice = await invoiceFor(customer);
    await prisma.payment.create({
      data: {
        invoiceId: otherInvoice.id,
        provider: 'bkash',
        kind: 'CHARGE',
        status: 'PENDING',
        currency: 'BDT',
        amount: 10000n,
        idempotencyKey: `fictional-pending:${randomUUID()}`,
      },
    });
    await startResponse(otherInvoice.id, customer).expect(409);
    expect(mutations(session.providerSessionId)).toHaveLength(1);
  });
  it('rejects foreign invoices, non-BDT amounts, missing phone, disabled accounts and read-only support writes', async () => {
    const invoice = await invoiceFor(customer);
    await startResponse(invoice.id, other).expect(404);
    const usd = await invoiceFor(customer, 'USD');
    await startResponse(usd.id, customer).expect(422);
    const before = provider.calls.length;
    const id =
      customer.auth.identity.role === 'CUSTOMER'
        ? customer.auth.identity.customerId
        : '';
    await prisma.customer.update({ where: { id }, data: { phone: null } });
    try {
      await startResponse(invoice.id, customer).expect(422);
    } finally {
      await prisma.customer.update({
        where: { id },
        data: { phone: '+8801700000000' },
      });
    }
    await prisma.customer.update({
      where: { id },
      data: { status: 'INACTIVE' },
    });
    try {
      await startResponse(invoice.id, customer).expect(422);
    } finally {
      await prisma.customer.update({
        where: { id },
        data: { status: 'ACTIVE' },
      });
    }
    await expect(
      ssl.create(
        { invoiceId: invoice.id, submissionKey: randomUUID() },
        {
          ...customer.auth,
          supportAdministratorId: owner.auth.identity.userId,
        },
      ),
    ).rejects.toThrow('read-only');
    expect(provider.calls.length).toBe(before);
  });
  it('recovers a lost create response through the pre-saved merchant reference without creating another session', async () => {
    const invoice = await invoiceFor(customer);
    provider.loseCreateResponse = true;
    await startResponse(invoice.id, customer).expect(503);
    const saved = await prisma.sslCheckout.findFirstOrThrow({
      where: { invoiceId: invoice.id },
    });
    expect(saved.state).toBe('UNKNOWN');
    expect(
      (
        await prisma.payment.findUniqueOrThrow({
          where: { id: saved.paymentId },
        })
      ).reference,
    ).toBe(saved.merchantReference);
    await startResponse(invoice.id, customer).expect(409);
    const row = provider.transactions.get(saved.merchantReference)!;
    row.status = 'VALID';
    await reconcile(saved.paymentId).expect(201);
    expect(
      (await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } }))
        .status,
    ).toBe('PAID');
    expect(mutations(saved.merchantReference)).toHaveLength(1);
  });
  it('keeps a reference with no authoritative query result unresolved and never creates a blind replacement', async () => {
    const invoice = await invoiceFor(customer);
    provider.loseCreateResponse = true;
    await startResponse(invoice.id, customer).expect(503);
    const saved = await prisma.sslCheckout.findFirstOrThrow({
      where: { invoiceId: invoice.id },
    });
    provider.transactions.delete(saved.merchantReference);
    await reconcile(saved.paymentId).expect(503);
    await startResponse(invoice.id, customer).expect(409);
    expect(mutations(saved.merchantReference)).toHaveLength(1);
  });
  it('does not treat unattempted status as proof that a saved checkout cannot still be paid', async () => {
    const session = await start((await invoiceFor(customer)).id);
    transaction(session).status = 'UNATTEMPTED';
    await reconcile(session.paymentId).expect(201);
    await startResponse(session.invoiceId, customer).expect(409);
    expect((await ssl.getBound(session.paymentId)).payment.status).toBe(
      'PENDING',
    );
    transaction(session).status = 'VALID';
    await ipn(transaction(session)).expect(202);
  });
  it('rejects duplicate form parameters and unverified validation IDs before settlement', async () => {
    const session = await start((await invoiceFor(customer)).id);
    const row = transaction(session);
    row.status = 'VALID';
    const raw =
      new URLSearchParams(form(row)).toString() + `&tran_id=${row.tran_id}`;
    await request(app.getHttpServer())
      .post('/payment-gateways/sslcommerz/webhooks')
      .type('form')
      .send(raw)
      .expect(422);
    await request(app.getHttpServer())
      .post('/payment-gateways/sslcommerz/webhooks')
      .type('form')
      .send({ ...form(row), val_id: 'forged_validation' })
      .expect(422);
    expect((await ssl.getBound(session.paymentId)).invoice.amountPaid).toBe(0n);
  });
  it('does not settle from browser success, failure or cancellation returns', async () => {
    const invoice = await invoiceFor(customer);
    const session = await start(invoice.id);
    for (const state of ['success', 'fail', 'cancel'])
      await request(app.getHttpServer())
        .post(`/payment-gateways/sslcommerz/return/${state}`)
        .type('form')
        .send({ value_b: invoice.id, status: 'VALID' })
        .expect(303);
    expect(
      (
        await prisma.payment.findUniqueOrThrow({
          where: { id: session.paymentId },
        })
      ).status,
    ).toBe('PENDING');
    expect(
      (await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } }))
        .amountPaid,
    ).toBe(0n);
  });
  it('authenticates IPN without an undocumented store field and retains the bank reference separately', async () => {
    const invoice = await invoiceFor(customer);
    const session = await start(invoice.id);
    const row = transaction(session);
    row.status = 'VALID';
    await ipn(row).expect(202);
    const saved = await ssl.getBound(session.paymentId);
    expect(saved.appliedToInvoice).toBe(true);
    expect(saved.bankReference).toBe(row.bank_tran_id);
    expect(saved.payment.providerTransactionId).toBe(row.bank_tran_id);
    expect(saved.payment.reference).toBe(row.tran_id);
    expect(saved.invoice.amountPaid).toBe(10000n);
    expect(saved.invoice.balanceDue).toBe(0n);
    expect(
      await prisma.outboxEvent.count({
        where: {
          aggregateId: session.paymentId,
          eventType: 'EMAIL_PAYMENT_RECEIVED',
        },
      }),
    ).toBe(1);
  });
  it('accepts semantically identical encoded/status callback variants once and shares proof with reconciliation', async () => {
    const session = await start((await invoiceFor(customer)).id);
    const row = transaction(session);
    row.status = 'VALID';
    await ipn(row).expect(202);
    row.status = 'VALIDATED';
    const differentOrder = new URLSearchParams(
      Object.entries(form(row)).reverse(),
    ).toString();
    const result = await request(app.getHttpServer())
      .post('/payment-gateways/sslcommerz/webhooks')
      .type('form')
      .send(differentOrder)
      .expect(202);
    expect(
      apiSuccessResponseSchema(paymentWebhookResultSchema).parse(result.body)
        .data.duplicate,
    ).toBe(true);
    await reconcile(session.paymentId).expect(201);
    expect(
      await prisma.paymentEvent.count({
        where: { paymentId: session.paymentId },
      }),
    ).toBe(1);
    expect((await ssl.getBound(session.paymentId)).invoice.amountPaid).toBe(
      10000n,
    );
  });
  it('allows pending observations to progress to successful payment with the same merchant transaction', async () => {
    const session = await start((await invoiceFor(customer)).id);
    await reconcile(session.paymentId).expect(201);
    transaction(session).status = 'VALID';
    await reconcile(session.paymentId).expect(201);
    expect((await ssl.getBound(session.paymentId)).state).toBe('CAPTURED');
    expect(
      await prisma.paymentEvent.count({
        where: { paymentId: session.paymentId },
      }),
    ).toBe(2);
  });
  it('holds high, missing and unknown risk and missing timestamps until authoritative safe completion proof arrives', async () => {
    const session = await start((await invoiceFor(customer)).id);
    const row = transaction(session);
    row.status = 'VALID';
    for (const risk of ['1', undefined, 'unknown']) {
      row.risk_level = risk;
      await reconcile(session.paymentId).expect(201);
      expect((await ssl.getBound(session.paymentId)).invoice.amountPaid).toBe(
        0n,
      );
    }
    row.risk_level = '0';
    row.tran_date = 'not-a-date';
    await reconcile(session.paymentId).expect(201);
    expect((await ssl.getBound(session.paymentId)).payment.status).toBe(
      'PENDING',
    );
    row.tran_date = '2026-11-07 12:00:00';
    await reconcile(session.paymentId).expect(201);
    expect((await ssl.getBound(session.paymentId)).invoice.amountPaid).toBe(
      10000n,
    );
  });
  it.each([
    'amount',
    'currency',
    'payment',
    'invoice',
    'merchant',
    'transaction',
    'server-merchant',
    'currency-type',
    'currency-amount',
  ])(
    'rejects mismatched %s evidence before financial mutation',
    async (kind) => {
      const session = await start((await invoiceFor(customer)).id);
      const row = transaction(session);
      row.status = 'VALID';
      if (kind === 'amount') provider.validationOverride = { amount: '1.00' };
      if (kind === 'currency')
        provider.validationOverride = { currency: 'USD' };
      if (kind === 'payment')
        provider.validationOverride = { value_a: randomUUID() };
      if (kind === 'invoice')
        provider.validationOverride = { value_b: randomUUID() };
      if (kind === 'transaction')
        provider.validationOverride = { tran_id: 'DIFFERENT_REFERENCE' };
      if (kind === 'server-merchant')
        provider.validationOverride = { store_id: 'another-store' };
      if (kind === 'currency-type')
        provider.validationOverride = { currency_type: 'USD' };
      if (kind === 'currency-amount')
        provider.validationOverride = { currency_amount: '1.00' };
      const values = form(row);
      if (kind === 'merchant') values.store_id = 'another-store';
      await request(app.getHttpServer())
        .post('/payment-gateways/sslcommerz/webhooks')
        .type('form')
        .send(values)
        .expect(422);
      expect((await ssl.getBound(session.paymentId)).invoice.amountPaid).toBe(
        0n,
      );
      expect((await ssl.getBound(session.paymentId)).payment.status).toBe(
        'PENDING',
      );
    },
  );
  it('ignores false failed/cancel callback data and relies on the server-side status query', async () => {
    const session = await start((await invoiceFor(customer)).id);
    const row = transaction(session);
    await request(app.getHttpServer())
      .post('/payment-gateways/sslcommerz/webhooks')
      .type('form')
      .send({ tran_id: row.tran_id, status: 'FAILED' })
      .expect(202);
    expect((await ssl.getBound(session.paymentId)).payment.status).toBe(
      'PENDING',
    );
  });
  it.each(['FAILED', 'CANCELLED', 'EXPIRED'])(
    'retains %s outcomes, permits a new attempt only after definitive failure and handles delayed safe success',
    async (status) => {
      const invoice = await invoiceFor(customer);
      const first = await start(invoice.id);
      transaction(first).status = status;
      await reconcile(first.paymentId).expect(201);
      await reconcile(first.paymentId).expect(201);
      expect(
        await prisma.outboxEvent.count({
          where: {
            aggregateId: first.paymentId,
            eventType: 'GATEWAY_PAYMENT_FAILED',
          },
        }),
      ).toBe(1);
      const next = await start(invoice.id);
      expect(next.paymentId).not.toBe(first.paymentId);
      transaction(first).status = 'VALID';
      await ipn(transaction(first)).expect(202);
      transaction(next).status = 'VALID';
      await ipn(transaction(next)).expect(202);
      const old = await ssl.getBound(first.paymentId);
      const late = await ssl.getBound(next.paymentId);
      expect(old.appliedToInvoice).toBe(true);
      expect(late.appliedToInvoice).toBe(false);
      expect(late.payment.status).toBe('SUCCEEDED');
      expect(old.invoice.amountPaid).toBe(10000n);
    },
  );
  it('does not treat local URL expiry as failure and accepts a delayed validated capture', async () => {
    const session = await start((await invoiceFor(customer)).id);
    await prisma.payment.update({
      where: { id: session.paymentId },
      data: { providerSessionExpiresAt: new Date(0) },
    });
    await startResponse(session.invoiceId, customer).expect(409);
    transaction(session).status = 'VALID';
    await ipn(transaction(session)).expect(202);
    expect((await ssl.getBound(session.paymentId)).state).toBe('CAPTURED');
  });
  it('serializes IPN and reconciliation and never lets a late failure downgrade a confirmed charge', async () => {
    const session = await start((await invoiceFor(customer)).id);
    const row = transaction(session);
    row.status = 'VALID';
    const results = await Promise.all([
      ipn(row),
      reconcile(session.paymentId),
      ipn(row),
    ]);
    expect(results.map((value) => value.status).sort()).toEqual([
      201, 202, 202,
    ]);
    row.status = 'FAILED';
    await reconcile(session.paymentId).expect(201);
    const saved = await ssl.getBound(session.paymentId);
    expect(saved.payment.status).toBe('SUCCEEDED');
    expect(saved.invoice.amountPaid).toBe(10000n);
    expect(
      await prisma.outboxEvent.count({
        where: {
          aggregateId: session.paymentId,
          eventType: 'GATEWAY_PAYMENT_FAILED',
        },
      }),
    ).toBe(0);
    expect(
      await prisma.outboxEvent.count({
        where: {
          aggregateId: session.paymentId,
          eventType: 'EMAIL_PAYMENT_RECEIVED',
        },
      }),
    ).toBe(1);
  });
  it('retains a remote capture after manual settlement without crediting the invoice twice', async () => {
    const session = await start((await invoiceFor(customer)).id);
    await owner.agent
      .post('/payments/manual/admin')
      .set('X-CSRF-Token', owner.csrf)
      .send({
        invoiceId: session.invoiceId,
        submissionKey: randomUUID(),
        amount: '10000',
        proof: {
          method: 'BANK_TRANSFER',
          reference: `fictional-${randomUUID()}`,
        },
      })
      .expect(201);
    transaction(session).status = 'VALID';
    await ipn(transaction(session)).expect(202);
    const saved = await ssl.getBound(session.paymentId);
    expect(saved.payment.status).toBe('SUCCEEDED');
    expect(saved.appliedToInvoice).toBe(false);
    expect(saved.invoice.amountPaid).toBe(10000n);
    expect(saved.reviewReason).toContain('not credited');
    expect(
      await prisma.outboxEvent.count({
        where: {
          aggregateId: session.paymentId,
          eventType: 'EMAIL_PAYMENT_RECEIVED',
        },
      }),
    ).toBe(0);
  });
  it('handles the real PostgreSQL race between manual settlement and authenticated capture with one invoice credit', async () => {
    const session = await start((await invoiceFor(customer)).id);
    transaction(session).status = 'VALID';
    const manual = owner.agent
      .post('/payments/manual/admin')
      .set('X-CSRF-Token', owner.csrf)
      .send({
        invoiceId: session.invoiceId,
        submissionKey: randomUUID(),
        amount: '10000',
        proof: { method: 'BANK_TRANSFER', reference: `race-${randomUUID()}` },
      });
    const result = await Promise.all([manual, ipn(transaction(session))]);
    expect([201, 422]).toContain(result[0].status);
    expect(result[1].status).toBe(202);
    const saved = await ssl.getBound(session.paymentId);
    expect(saved.invoice.amountPaid).toBe(10000n);
    expect(saved.invoice.balanceDue).toBe(0n);
    expect(saved.payment.status).toBe('SUCCEEDED');
  });
  it('keeps old checkout credentials bound across rotation and stopping new checkouts', async () => {
    const session = await start((await invoiceFor(customer)).id);
    transaction(session).status = 'VALID';
    await credentials('new-fictional-store', 'new-fictional-password');
    await active('manual');
    try {
      await startResponse((await invoiceFor(customer)).id, customer).expect(
        404,
      );
      await ipn(transaction(session)).expect(202);
      await reconcile(session.paymentId).expect(201);
    } finally {
      await credentials('fictional-store', 'fictional-password');
      await active('sslcommerz');
    }
    const requests = provider.calls
      .filter((value) => value.url.includes('validationserverAPI.php'))
      .at(-1)!;
    expect(new URL(requests.url).searchParams.get('store_id')).toBe(
      'fictional-store',
    );
  });
  it('rejects a bank reference already captured for another checkout', async () => {
    const first = await start((await invoiceFor(customer)).id);
    transaction(first).status = 'VALID';
    await ipn(transaction(first)).expect(202);
    const next = await start((await invoiceFor(customer)).id);
    transaction(next).status = 'VALID';
    transaction(next).bank_tran_id = transaction(first).bank_tran_id;
    await ipn(transaction(next)).expect(422);
    expect((await ssl.getBound(next.paymentId)).invoice.amountPaid).toBe(0n);
  });
  it('requires fresh admin MFA and explicit refund confirmation, reserving concurrent requests only once', async () => {
    const session = await captured();
    const body = refundBody('3000');
    await refundResponse(session.paymentId, body, customer).expect(403);
    await refundResponse(session.paymentId, body, noMfa).expect(403);
    await refundResponse(
      session.paymentId,
      { ...body, confirmation: 'WRONG' },
      owner,
    ).expect(400);
    const previous = await prisma.authSession.findUniqueOrThrow({
      where: { id: owner.auth.sessionId },
    });
    await prisma.authSession.update({
      where: { id: previous.id },
      data: {
        createdAt: new Date(Date.now() - 3600000),
        twoFactorVerifiedAt: new Date(Date.now() - 16 * 60000),
      },
    });
    try {
      await refundResponse(session.paymentId, body).expect(403);
    } finally {
      await prisma.authSession.update({
        where: { id: previous.id },
        data: {
          createdAt: previous.createdAt,
          twoFactorVerifiedAt: previous.twoFactorVerifiedAt,
        },
      });
    }
    await owner.agent
      .post(
        `/payment-gateways/sslcommerz/payments/${session.paymentId}/refunds`,
      )
      .send(body)
      .expect(403);
    const results = await Promise.all([
      refundResponse(session.paymentId, body),
      refundResponse(session.paymentId, body),
    ]);
    expect(results.map((value) => value.status)).toEqual([201, 201]);
    expect(refundMutations(session)).toHaveLength(1);
    expect((await ssl.getBound(session.paymentId)).refunds).toHaveLength(1);
    await refundResponse(session.paymentId, refundBody('8000')).expect(422);
  });
  it('posts one append-only partial and full refund only after provider confirmation', async () => {
    const session = await captured();
    const first = refundBody('3000');
    await refundResponse(session.paymentId, first).expect(201);
    let saved = await ssl.getBound(session.paymentId);
    const refund = saved.refunds[0];
    expect(refund.state).toBe('PENDING');
    expect(saved.invoice.amountPaid).toBe(10000n);
    provider.refunds.get(refund.providerReference!)!.status = 'refunded';
    await checkRefund(refund.id).expect(201);
    await checkRefund(refund.id).expect(201);
    saved = await ssl.getBound(session.paymentId);
    expect(saved.invoice.status).toBe('PARTIALLY_REFUNDED');
    expect(saved.invoice.amountPaid).toBe(7000n);
    expect(saved.payment.status).toBe('SUCCEEDED');
    await refundResponse(session.paymentId, refundBody('7000')).expect(201);
    saved = await ssl.getBound(session.paymentId);
    const second = saved.refunds.at(-1)!;
    provider.refunds.get(second.providerReference!)!.status = 'refunded';
    await checkRefund(second.id).expect(201);
    saved = await ssl.getBound(session.paymentId);
    expect(saved.invoice.status).toBe('REFUNDED');
    expect(saved.invoice.balanceDue).toBe(10000n);
    expect(saved.invoice.amountPaid).toBe(0n);
    await startResponse(session.invoiceId, customer).expect(422);
    const adjustments = await prisma.payment.findMany({
      where: { originalPaymentId: session.paymentId },
    });
    expect(adjustments).toHaveLength(2);
    expect(
      adjustments.every(
        (value) => value.kind === 'REFUND' && value.status === 'SUCCEEDED',
      ),
    ).toBe(true);
  });
  it('reserves unknown refund submissions, refuses blind repeats and verifies a recovered reference and amount', async () => {
    const session = await captured();
    const body = refundBody('10000');
    provider.loseRefundResponse = true;
    await refundResponse(session.paymentId, body).expect(201);
    let saved = await ssl.getBound(session.paymentId);
    const refund = saved.refunds[0];
    expect(refund.state).toBe('UNKNOWN');
    expect(refund.providerReference).toBeNull();
    await refundResponse(session.paymentId, body).expect(201);
    await refundResponse(session.paymentId, refundBody('10000')).expect(422);
    expect(refundMutations(session)).toHaveLength(1);
    await checkRefund(refund.id).expect(409);
    const proof = [...provider.refunds.values()].find(
      (value) => value.bank_tran_id === saved.bankReference,
    )!;
    proof.status = 'refunded';
    provider.omitRefundAmount = true;
    await checkRefund(refund.id, {
      providerReference: proof.refund_ref_id,
      reason: 'Verified fictional provider record',
      confirmation: 'LINK_REFUND_REFERENCE',
    }).expect(409);
    provider.omitRefundAmount = false;
    await checkRefund(refund.id, {
      providerReference: proof.refund_ref_id,
      reason: 'Verified fictional provider record',
      confirmation: 'LINK_REFUND_REFERENCE',
    }).expect(201);
    saved = await ssl.getBound(session.paymentId);
    expect(saved.refunds[0].state).toBe('SUCCEEDED');
    expect(saved.invoice.status).toBe('REFUNDED');
  });
  it('holds mismatched refund evidence and releases reserved money only after a definitive refund failure', async () => {
    const session = await captured();
    await refundResponse(session.paymentId, refundBody('10000')).expect(201);
    let saved = await ssl.getBound(session.paymentId);
    const refund = saved.refunds[0];
    const remote = provider.refunds.get(refund.providerReference!)!;
    remote.refund_amount = '1.00';
    remote.status = 'refunded';
    await checkRefund(refund.id).expect(409);
    saved = await ssl.getBound(session.paymentId);
    expect(saved.invoice.amountPaid).toBe(10000n);
    expect(saved.refunds[0].state).toBe('PENDING');
    remote.refund_amount = '100.00';
    remote.status = 'failed';
    await checkRefund(refund.id).expect(201);
    expect((await ssl.getBound(session.paymentId)).refunds[0].state).toBe(
      'FAILED',
    );
    await refundResponse(session.paymentId, refundBody('10000')).expect(201);
    await expect(
      prisma.sslRefund.update({
        where: { id: refund.id },
        data: { state: 'PENDING' },
      }),
    ).rejects.toThrow();
  });
  it('refunds an unapplied duplicate capture without changing the already settled invoice or original manual payment', async () => {
    const session = await start((await invoiceFor(customer)).id);
    await owner.agent
      .post('/payments/manual/admin')
      .set('X-CSRF-Token', owner.csrf)
      .send({
        invoiceId: session.invoiceId,
        submissionKey: randomUUID(),
        amount: '10000',
        proof: {
          method: 'BANK_TRANSFER',
          reference: `refund-review-${randomUUID()}`,
        },
      })
      .expect(201);
    transaction(session).status = 'VALID';
    await ipn(transaction(session)).expect(202);
    await refundResponse(session.paymentId, refundBody('10000')).expect(201);
    const saved = await ssl.getBound(session.paymentId);
    const refund = saved.refunds[0];
    provider.refunds.get(refund.providerReference!)!.status = 'refunded';
    await checkRefund(refund.id).expect(201);
    const after = await ssl.getBound(session.paymentId);
    expect(after.invoice.status).toBe('PAID');
    expect(after.invoice.amountPaid).toBe(10000n);
    expect(after.appliedToInvoice).toBe(false);
    expect(after.reviewReason).toBeNull();
  });
  it('retains immutable attempt/refund history and returns no credentials, raw provider data or card fields', async () => {
    const session = await captured();
    await refundResponse(session.paymentId, refundBody('1000')).expect(201);
    const saved = await ssl.getBound(session.paymentId);
    await expect(
      prisma.sslCheckout.update({
        where: { id: saved.id },
        data: { accountHash: 'a'.repeat(64) },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.sslCheckout.delete({ where: { id: saved.id } }),
    ).rejects.toThrow();
    await expect(
      prisma.sslRefund.delete({ where: { id: saved.refunds[0].id } }),
    ).rejects.toThrow();
    const response = await owner.agent
      .get('/payment-gateways/sslcommerz/checkouts')
      .expect(200);
    const publicRows = apiSuccessResponseSchema(
      sslCheckoutSchema.array(),
    ).parse(response.body).data;
    expect(
      publicRows.some((value) => value.paymentId === session.paymentId),
    ).toBe(true);
    const text = JSON.stringify(response.body);
    expect(text).not.toContain('fictional-password');
    expect(text).not.toContain('credentialCiphertext');
    expect(text).not.toContain('store_passwd');
    await customer.agent
      .get('/payment-gateways/sslcommerz/checkouts')
      .expect(403);
  });

  async function invoiceFor(who: Actor, currency = 'BDT') {
    const identity = who.auth.identity;
    if (identity.role !== 'CUSTOMER')
      throw new Error('Fictional customer required');
    return prisma.invoice.create({
      data: {
        invoiceNumber: `C220-${randomUUID().slice(0, 12)}`,
        submissionKey: `c220:${randomUUID()}`,
        customerId: identity.customerId,
        status: 'UNPAID',
        currency,
        subtotal: 10000n,
        total: 10000n,
        balanceDue: 10000n,
        customerNameSnapshot: 'Fictional SSL customer',
        customerEmailSnapshot: identity.email,
        customerAddressSnapshot: {
          line1: '220 Fictional Road',
          city: 'Dhaka',
          region: 'Dhaka',
          postalCode: '1200',
          countryCode: 'BD',
        },
        businessIdentitySnapshot: { name: 'Fictional Hosting' },
        issuedAt: new Date(),
        dueAt: new Date(Date.now() + 86400000),
        items: {
          create: {
            linePosition: 1,
            descriptionSnapshot: 'Fictional hosting plan',
            currency,
            quantity: 1,
            unitAmount: 10000n,
            lineTotal: 10000n,
          },
        },
      },
    });
  }
  function startResponse(
    invoiceId: string,
    who = customer,
    key = randomUUID(),
  ) {
    return who.agent
      .post('/payment-gateways/sslcommerz/sessions')
      .set('X-CSRF-Token', who.csrf)
      .send({ invoiceId, submissionKey: key });
  }
  async function start(
    invoiceId: string,
    key = randomUUID(),
  ): Promise<PaymentSession> {
    return apiSuccessResponseSchema(paymentSessionSchema).parse(
      (await startResponse(invoiceId, customer, key).expect(201)).body,
    ).data;
  }
  function transaction(session: PaymentSession) {
    return provider.transactions.get(session.providerSessionId)!;
  }
  function form(row: FictionalSslTransaction): Record<string, string> {
    return {
      tran_id: row.tran_id,
      val_id: row.val_id,
      amount: row.amount,
      currency: row.currency,
      status: row.status,
      value_a: row.value_a,
      value_b: row.value_b,
    };
  }
  function ipn(row: FictionalSslTransaction) {
    return request(app.getHttpServer())
      .post('/payment-gateways/sslcommerz/webhooks')
      .type('form')
      .send(form(row));
  }
  function reconcile(id: string) {
    return owner.agent
      .post(`/payment-gateways/sslcommerz/payments/${id}/reconcile`)
      .set('X-CSRF-Token', owner.csrf)
      .send({});
  }
  function refundBody(amount: string) {
    return {
      submissionKey: randomUUID(),
      amount,
      reason: 'Fictional customer requested a refund',
      confirmation: 'APPROVE_SANDBOX_REFUND',
    };
  }
  function refundResponse(
    id: string,
    body: Record<string, unknown>,
    who = owner,
  ) {
    return who.agent
      .post(`/payment-gateways/sslcommerz/payments/${id}/refunds`)
      .set('X-CSRF-Token', who.csrf)
      .send(body);
  }
  function checkRefund(id: string, body: Record<string, unknown> = {}) {
    return owner.agent
      .post(`/payment-gateways/sslcommerz/refunds/${id}/reconcile`)
      .set('X-CSRF-Token', owner.csrf)
      .send(body);
  }
  async function captured() {
    const session = await start((await invoiceFor(customer)).id);
    transaction(session).status = 'VALID';
    await ipn(transaction(session)).expect(202);
    return session;
  }
  function mutations(ref: string) {
    return provider.calls.filter(
      (value) =>
        value.url.endsWith('/gwprocess/v4/api.php') &&
        new URLSearchParams(value.body).get('tran_id') === ref,
    );
  }
  function refundMutations(session: PaymentSession) {
    return provider.calls.filter((value) => {
      const url = new URL(value.url);
      return (
        url.searchParams.has('refund_amount') &&
        url.searchParams.get('bank_tran_id') ===
          transaction(session).bank_tran_id
      );
    });
  }
  async function untilAttempt(invoiceId: string) {
    for (let n = 0; n < 100; n++) {
      const result = await prisma.sslCheckout.findFirst({
        where: { invoiceId },
      });
      if (result && provider.transactions.has(result.merchantReference))
        return result;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error('Fictional checkout did not reach the mock provider.');
  }
  async function active(value: 'sslcommerz' | 'manual' | 'fake') {
    await prisma.setting.upsert({
      where: { key: 'integration.active-providers' },
      create: {
        key: 'integration.active-providers',
        category: 'INTEGRATION',
        value: {
          activeGateway: value,
          activeHostingPanelAdapter: 'fake-panel',
        },
      },
      update: {
        value: {
          activeGateway: value,
          activeHostingPanelAdapter: 'fake-panel',
        },
      },
    });
  }
  async function credentials(storeId: string, storePassword: string) {
    await module.get(IntegrationCredentialService).replace(
      {
        provider: 'sslcommerz',
        credentials: { storeId, storePassword },
        confirmation: 'REPLACE_CREDENTIALS',
      },
      owner.auth,
      { ipAddressHash: 'fictional-command220' },
    );
  }
  async function actor(
    role: 'CUSTOMER' | 'FULL_ADMINISTRATOR',
    mfa = false,
  ): Promise<Actor> {
    const now = new Date();
    const totp = module.get(TotpService);
    const user = await prisma.user.create({
      data: {
        email: `c220-${randomUUID()}@example.test`,
        role: role === 'CUSTOMER' ? 'CUSTOMER' : 'ADMIN',
        status: 'ACTIVE',
        emailVerifiedAt: now,
        ...(role === 'CUSTOMER'
          ? {
              customer: {
                create: {
                  customerNumber: `C220-${randomUUID().slice(0, 8)}`,
                  firstName: 'Fictional',
                  lastName: 'SSL customer',
                  phone: '+8801700000000',
                  addressLine1: '220 Fictional Road',
                  city: 'Dhaka',
                  countryCode: 'BD',
                },
              },
            }
          : {
              adminProfile: {
                create: {
                  displayName: 'Fictional payment administrator',
                  staffRole: role,
                },
              },
            }),
        ...(mfa
          ? {
              adminTotpCredential: {
                create: {
                  secretCiphertext: totp.encryptSecret(totp.generateSecret()),
                  keyVersion: 'test',
                  createdAt: now,
                  enabledAt: now,
                },
              },
            }
          : {}),
      },
      include: { customer: true, adminProfile: true },
    });
    const token = randomBytes(32).toString('hex');
    const sessionNow = new Date();
    const session = await prisma.authSession.create({
      data: {
        userId: user.id,
        tokenHash: createHash('sha256').update(token).digest('hex'),
        createdAt: sessionNow,
        expiresAt: new Date(Date.now() + 3600000),
        twoFactorVerifiedAt: mfa ? sessionNow : null,
      },
    });
    const agent = request.agent(app.getHttpServer());
    agent.set('Cookie', `webhost_session=${token}`);
    const response = await agent.get('/auth/csrf').expect(200);
    return {
      agent,
      csrf: (response.body as { data: { csrfToken: string } }).data.csrfToken,
      auth: {
        sessionId: session.id,
        identity:
          role === 'CUSTOMER'
            ? {
                role: 'CUSTOMER',
                userId: user.id,
                email: user.email,
                customerId: user.customer!.id,
              }
            : {
                role: 'ADMIN',
                userId: user.id,
                email: user.email,
                adminProfileId: user.adminProfile!.id,
                staffRole: role,
                twoFactorEnabled: mfa,
              },
      },
    };
  }
});
