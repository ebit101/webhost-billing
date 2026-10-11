import { execFileSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  parseApiEnvironment,
  type ApiEnvironment,
} from '@webhost-billing/config';
import {
  createPrismaClient,
  type PrismaClient,
} from '@webhost-billing/database';
import {
  RegistrarProcessor,
  FakeDomainRegistrar,
} from '@webhost-billing/database/registrar';
import {
  PARTIAL_PAYMENT_POLICY_CONFIRMATION,
  domainDetailSchema,
} from '@webhost-billing/shared';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { API_ENVIRONMENT } from '../src/infrastructure/environment/environment.module';
import { PRISMA_CLIENT } from '../src/infrastructure/database/database.module';
import { hashOpaqueToken } from '../src/modules/auth/services/auth-token.service';
import { TotpService } from '../src/modules/auth/services/totp.service';
import { DomainService } from '../src/modules/domains/domain.service';
import type { AuthRequestContext } from '../src/modules/auth/auth.types';

interface DomainResult {
  id: string;
  invoiceId: string;
  orderId: string;
  domainName: string;
  state: string;
  customerId?: string;
  operationId?: string;
}
interface Success<T> {
  data: T;
}
describe('complete simulated registrar in isolated PostgreSQL (e2e)', () => {
  const schema = `registrar_test_${randomUUID().replaceAll('-', '')}`;
  let adminDb: PrismaClient;
  let prisma: PrismaClient;
  let app: INestApplication<App>;
  let created = false;
  let owner: ReturnType<typeof request.agent>;
  let customer: ReturnType<typeof request.agent>;
  let other: ReturnType<typeof request.agent>;
  let billing: ReturnType<typeof request.agent>;
  let unenrolled: ReturnType<typeof request.agent>;
  let offerId = '';
  let processor: RegistrarProcessor;
  let totp: TotpService;
  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL ?? '');
    if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
      throw new Error('Registrar tests require loopback PostgreSQL.');
    url.searchParams.delete('schema');
    url.searchParams.delete('options');
    adminDb = createPrismaClient(url.toString());
    await adminDb.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    created = true;
    url.searchParams.set('schema', schema);
    url.searchParams.set('options', `-c search_path=${schema}`);
    const args = ['--filter', '@webhost-billing/database', 'db:migrate:deploy'];
    execFileSync(
      process.platform === 'win32'
        ? (process.env.ComSpec ?? 'cmd.exe')
        : 'pnpm',
      process.platform === 'win32' ? ['/d', '/s', '/c', 'pnpm', ...args] : args,
      {
        cwd: '../..',
        env: { ...process.env, DATABASE_URL: url.toString() },
        stdio: 'pipe',
      },
    );
    const environment = parseApiEnvironment({
      ...process.env,
      DATABASE_URL: url.toString(),
      NODE_ENV: 'test',
      PORT: '3001',
      AUTH_RATE_LIMIT_NAMESPACE: schema,
      BULLMQ_PREFIX: schema,
      BKASH_ENABLED: 'false',
      SSLCOMMERZ_ENABLED: 'false',
    });
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(API_ENVIRONMENT)
      .useValue(environment)
      .compile();
    app = module.createNestApplication();
    await app.init();
    prisma = module.get(PRISMA_CLIENT);
    totp = module.get(TotpService);
    processor = new RegistrarProcessor(
      prisma,
      environment.CREDENTIAL_ENCRYPTION_KEY,
    );
    owner = await account('FULL_ADMINISTRATOR');
    customer = await account('CUSTOMER');
    other = await account('CUSTOMER');
    billing = await account('BILLING_OPERATOR');
    unenrolled = await account('FULL_ADMINISTRATOR', false);
    await mutation(
      owner,
      '/domains/registrar',
      { confirmation: 'Enable simulated registrar', sellingAmount: '150000' },
      201,
    );
    const response = await customer.get('/domains/offers').expect(200);
    offerId =
      (response.body as Success<{ id: string; tld: string }[]>).data.find(
        (offer) => offer.tld === 'com',
      )?.id ?? '';
  }, 120000);
  afterAll(async () => {
    if (app) await app.close();
    if (adminDb) {
      if (!/^registrar_test_[a-f0-9]{32}$/.test(schema))
        throw new Error('Invalid disposal scope.');
      if (created)
        await adminDb.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
      await adminDb.$disconnect();
    }
  });
  beforeEach(async () => {
    customer = await account('CUSTOMER');
  });
  async function account(
    role: 'CUSTOMER' | 'FULL_ADMINISTRATOR' | 'BILLING_OPERATOR',
    mfa = true,
  ) {
    const userId = randomUUID();
    await prisma.user.create({
      data: {
        id: userId,
        email: `${userId}@example.test`,
        role: role === 'CUSTOMER' ? 'CUSTOMER' : 'ADMIN',
        status: 'ACTIVE',
        emailVerifiedAt: new Date(),
        ...(role === 'CUSTOMER'
          ? {
              customer: {
                create: {
                  customerNumber: `F-${userId.slice(0, 24)}`,
                  firstName: 'Fictional',
                  lastName: 'Customer',
                  status: 'ACTIVE',
                  addressLine1: '1 Test Street',
                  city: 'Dhaka',
                  countryCode: 'BD',
                },
              },
            }
          : {
              adminProfile: {
                create: {
                  displayName: 'Fictional administrator',
                  staffRole: role,
                },
              },
              ...(mfa
                ? {
                    adminTotpCredential: {
                      create: {
                        secretCiphertext: totp.encryptSecret(
                          totp.generateSecret(),
                        ),
                        keyVersion: 'mfa-v1',
                        createdAt: new Date(),
                        enabledAt: new Date(),
                      },
                    },
                  }
                : {}),
            }),
      },
    });
    const token = randomBytes(32).toString('hex');
    await prisma.authSession.create({
      data: {
        userId,
        tokenHash: hashOpaqueToken(token),
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 3600000),
        twoFactorVerifiedAt: role !== 'CUSTOMER' && mfa ? new Date() : null,
      },
    });
    return request
      .agent(app.getHttpServer())
      .set('Cookie', `webhost_session=${token}`);
  }
  async function mutation(
    agent: ReturnType<typeof request.agent>,
    path: string,
    body: object,
    expected: number,
  ) {
    const csrf = await agent.get('/auth/csrf').expect(200);
    return agent
      .post(path)
      .set(
        'X-CSRF-Token',
        (csrf.body as Success<{ csrfToken: string }>).data.csrfToken,
      )
      .send(body)
      .expect((response) => {
        if (response.status !== expected)
          throw new Error(
            `Unexpected response ${response.status}: ${JSON.stringify(response.body)}`,
          );
      });
  }
  async function purchase(prefix = 'success') {
    const quote = await mutation(
      customer,
      '/domains/quotes',
      {
        offerId,
        domainName: `${prefix}-${randomUUID()}.com`,
        contact: {
          name: 'Fictional registrant',
          company: 'Fictional company',
          address: '1 Test Street',
          city: 'Dhaka',
          region: 'Dhaka',
          postalCode: '1000',
          country: 'BD',
          email: 'fictional@example.test',
          phoneCountryCode: '880',
          phone: '1700000000',
        },
        agreement: 'fictional-registration-v1',
        consent: true,
      },
      201,
    );
    const input = {
      quoteId: (quote.body as Success<{ id: string }>).data.id,
      submissionKey: randomUUID(),
    };
    const order = await mutation(customer, '/domains/orders', input, 201);
    const duplicate = await mutation(customer, '/domains/orders', input, 201);
    expect((duplicate.body as Success<DomainResult>).data.id).toBe(
      (order.body as Success<DomainResult>).data.id,
    );
    return (order.body as Success<DomainResult>).data;
  }
  async function pay(domain: DomainResult, amount = '150000') {
    const response = await mutation(
      customer,
      '/payments/manual/customer',
      {
        invoiceId: domain.invoiceId,
        amount,
        submissionKey: randomUUID(),
        proof: {
          method: 'BANK_TRANSFER',
          reference: randomUUID(),
          payerName: 'Fictional payer',
        },
      },
      201,
    );
    const paymentId = (response.body as Success<{ payment: { id: string } }>)
      .data.payment.id;
    const csrf = await owner.get('/auth/csrf').expect(200);
    await owner
      .patch(`/payments/${paymentId}/review`)
      .set(
        'X-CSRF-Token',
        (csrf.body as Success<{ csrfToken: string }>).data.csrfToken,
      )
      .send({ action: 'VERIFY' })
      .expect(200);
    return paymentId;
  }
  async function approve(domain: DomainResult, expected = 201) {
    return mutation(
      owner,
      `/domains/${domain.id}/approve`,
      {
        confirmation: domain.domainName,
        costCeiling: '1000',
        costCurrency: 'USD',
      },
      expected,
    );
  }
  it('denies anonymous, restricted and unenrolled administration', async () => {
    await request(app.getHttpServer()).get('/domains').expect(401);
    await billing.get('/domains').expect(403);
    await mutation(
      unenrolled,
      '/domains/registrar',
      { confirmation: 'Enable simulated registrar', sellingAmount: '150000' },
      403,
    );
  });
  it('fails closed before database mutation when production simulation is attempted', async () => {
    const production = new DomainService(prisma, {
      ...app.get<ApiEnvironment>(API_ENVIRONMENT),
      NODE_ENV: 'production',
    });
    // Deliberately absent identity: the production gate must not reach identity or DB work.
    const absent = undefined as unknown as AuthRequestContext;
    const before = await prisma.registrarAccount.count();
    expect(await production.offers()).toEqual([]);
    await expect(production.setup('150000', absent)).rejects.toThrow(
      'Simulated registrar writes are disabled in production.',
    );
    await expect(production.toggle(randomUUID(), true, absent)).rejects.toThrow(
      'Simulated registrar writes are disabled in production.',
    );
    await expect(production.reconcile(randomUUID(), absent)).rejects.toThrow(
      'Simulated registrar writes are disabled in production.',
    );
    expect(await prisma.registrarAccount.count()).toBe(before);
  });
  it('uses immutable invoices and verified payments, isolates ownership, dispatches once concurrently', async () => {
    const domain = await purchase();
    await other.get(`/domains/${domain.id}`).expect(403);
    expect(
      JSON.stringify((await customer.get(`/domains/${domain.id}`)).body),
    ).not.toMatch(
      /contactCiphertext|operationId|costAmount|providerOrderId|fingerprint/,
    );
    await approve(domain, 409);
    await expect(
      prisma.invoice.update({
        where: { id: domain.invoiceId },
        data: { total: 1n },
      }),
    ).rejects.toThrow();
    const item = await prisma.orderItem.findFirstOrThrow({
      where: { orderId: domain.orderId },
    });
    expect(item.kind).toBe('DOMAIN');
    expect(item.provisioningSnapshot).toBeNull();
    await expect(
      prisma.order.update({
        where: { id: domain.orderId },
        data: { status: 'COMPLETED' },
      }),
    ).rejects.toThrow();
    await pay(domain);
    await approve(domain);
    const op = await prisma.registrarOperation.findUniqueOrThrow({
      where: { domainId: domain.id },
    });
    await Promise.all([
      processor.process(op.id),
      processor.process(op.id),
      processor.process(op.id),
    ]);
    await processor.process(op.id);
    expect(
      await prisma.fakeRegistrarRegistration.count({
        where: { operationId: op.id },
      }),
    ).toBe(1);
    expect(
      (await prisma.domain.findUniqueOrThrow({ where: { id: domain.id } }))
        .state,
    ).toBe('REGISTERED');
    expect(
      (
        await prisma.invoice.findUniqueOrThrow({
          where: { id: domain.invoiceId },
        })
      ).status,
    ).toBe('PAID');
    expect(await prisma.service.count()).toBe(0);
    await expect(
      prisma.registrarOperation.update({
        where: { id: op.id },
        data: { claimedAt: null },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.registrarEvidence.deleteMany({ where: { operationId: op.id } }),
    ).rejects.toThrow();
  });
  it('reconciles lost successful responses without a second mutation', async () => {
    const domain = await purchase('lost');
    await pay(domain);
    await approve(domain);
    const op = await prisma.registrarOperation.findUniqueOrThrow({
      where: { domainId: domain.id },
    });
    await processor.process(op.id);
    await processor.process(op.id);
    expect(
      await prisma.fakeRegistrarRegistration.count({
        where: { operationId: op.id },
      }),
    ).toBe(1);
    expect(
      (await prisma.domain.findUniqueOrThrow({ where: { id: domain.id } }))
        .state,
    ).toBe('REGISTERED');
    expect(
      await prisma.registrarEvidence.count({
        where: { operationId: op.id, code: 'MUTATION_OUTCOME_UNCERTAIN' },
      }),
    ).toBe(1);
  });
  it('rejects refunded payment and native price ceiling changes', async () => {
    const domain = await purchase();
    const paymentId = await pay(domain);
    await mutation(
      owner,
      `/payments/${paymentId}/adjustments`,
      {
        kind: 'REFUND',
        amount: '150000',
        reference: randomUUID(),
        submissionKey: randomUUID(),
      },
      201,
    );
    await approve(domain, 409);
    const changed = await purchase('price');
    await pay(changed);
    await approve(changed, 409);
  });

  it('blocks pending receipts, invented settlement, expired quotes and cross-owner SQL linkage', async () => {
    const domain = await purchase();
    await mutation(
      customer,
      '/payments/manual/customer',
      {
        invoiceId: domain.invoiceId,
        amount: '150000',
        submissionKey: randomUUID(),
        proof: {
          method: 'BANK_TRANSFER',
          reference: randomUUID(),
          payerName: 'Fictional pending payer',
        },
      },
      201,
    );
    await approve(domain, 409);
    // A malicious summary-only settlement is never sufficient; the verified ledger is checked.
    await prisma.invoice.update({
      where: { id: domain.invoiceId },
      data: {
        status: 'PAID',
        amountPaid: 150000n,
        balanceDue: 0n,
        paidAt: new Date(),
      },
    });
    await approve(domain, 409);
    const stored = await prisma.domain.findUniqueOrThrow({
      where: { id: domain.id },
    });
    const quote = await prisma.domainQuote.findUniqueOrThrow({
      where: { id: stored.quoteId },
    });
    const expired = await prisma.domainQuote.create({
      data: {
        ...quote,
        nameservers: ['ns1.example.test', 'ns2.example.test'],
        id: randomUUID(),
        createdAt: new Date(Date.now() - 600000),
        expiresAt: new Date(Date.now() - 300000),
      },
    });
    await mutation(
      customer,
      '/domains/orders',
      { quoteId: expired.id, submissionKey: randomUUID() },
      409,
    );
    const otherOwner = await prisma.customer.findFirstOrThrow({
      where: { id: { not: stored.customerId } },
    });
    await expect(
      prisma.domain.create({
        data: {
          ...stored,
          id: randomUUID(),
          customerId: otherOwner.id,
          domainName: `different-${randomUUID()}.com`,
          submissionKey: randomUUID(),
        },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.domainQuote.update({
        where: { id: quote.id },
        data: { sellingAmount: 1n },
      }),
    ).rejects.toThrow();
  });

  it('rechecks refunds at the claim boundary without issuing a mutation', async () => {
    const domain = await purchase();
    const paymentId = await pay(domain);
    await approve(domain);
    await mutation(
      owner,
      `/payments/${paymentId}/adjustments`,
      {
        kind: 'REVERSAL',
        amount: '150000',
        reference: randomUUID(),
        submissionKey: randomUUID(),
      },
      201,
    );
    const operation = await prisma.registrarOperation.findUniqueOrThrow({
      where: { domainId: domain.id },
    });
    await processor.process(operation.id);
    expect(
      await prisma.fakeRegistrarRegistration.count({
        where: { operationId: operation.id },
      }),
    ).toBe(0);
    expect(
      (
        await prisma.registrarOperation.findUniqueOrThrow({
          where: { id: operation.id },
        })
      ).claimedAt,
    ).toBeNull();
  });
  it('keeps paid invoices independent of pending registration and stops unsafe retries', async () => {
    const domain = await purchase('pending');
    await pay(domain);
    await approve(domain);
    const op = await prisma.registrarOperation.findUniqueOrThrow({
      where: { domainId: domain.id },
    });
    await processor.process(op.id);
    await processor.process(op.id);
    expect(
      (await prisma.domain.findUniqueOrThrow({ where: { id: domain.id } }))
        .state,
    ).toBe('NEEDS_RECONCILIATION');
    expect(
      (
        await prisma.invoice.findUniqueOrThrow({
          where: { id: domain.invoiceId },
        })
      ).status,
    ).toBe('PAID');
    await approve(domain, 409);
    await expect(
      prisma.order.update({
        where: { id: domain.orderId },
        data: { status: 'CANCELLED' },
      }),
    ).rejects.toThrow();
    await prisma.fakeRegistrarRegistration.update({
      where: { operationId: op.id },
      data: { state: 'Active' },
    });
    await prisma.registrarOperation.update({
      where: { id: op.id },
      data: { nextPollAt: new Date(0) },
    });
    await processor.process(op.id);
  });
  it('denies partial payment and disabled dispatch; reconciles rejection truthfully', async () => {
    const csrf = await owner.get('/auth/csrf').expect(200);
    await owner
      .patch('/payments/settings')
      .set(
        'X-CSRF-Token',
        (csrf.body as Success<{ csrfToken: string }>).data.csrfToken,
      )
      .send({
        partialPaymentsEnabled: true,
        partialPaymentPolicyConfirmation: PARTIAL_PAYMENT_POLICY_CONFIRMATION,
      })
      .expect(200);
    const partial = await purchase();
    await pay(partial, '1');
    await approve(partial, 409);
    const rejected = await purchase('reject');
    await pay(rejected);
    await approve(rejected);
    const op = await prisma.registrarOperation.findUniqueOrThrow({
      where: { domainId: rejected.id },
    });
    const settings = await prisma.registrarAccount.findFirstOrThrow();
    await prisma.registrarAccount.update({
      where: { id: settings.id },
      data: { enabled: false },
    });
    await processor.process(op.id);
    expect(
      await prisma.fakeRegistrarRegistration.count({
        where: { operationId: op.id },
      }),
    ).toBe(0);
    await prisma.registrarAccount.update({
      where: { id: settings.id },
      data: { enabled: true },
    });
    await processor.process(op.id);
    expect(
      (await prisma.domain.findUniqueOrThrow({ where: { id: rejected.id } }))
        .state,
    ).toBe('FAILED');
    expect(
      (
        await prisma.invoice.findUniqueOrThrow({
          where: { id: rejected.invoiceId },
        })
      ).status,
    ).toBe('PAID');
  });
  it('retains actual registrar outcome and financial attention when refunded after dispatch', async () => {
    const domain = await purchase('pending');
    const paymentId = await pay(domain);
    await approve(domain);
    const op = await prisma.registrarOperation.findUniqueOrThrow({
      where: { domainId: domain.id },
    });
    await processor.process(op.id);
    await mutation(
      owner,
      `/payments/${paymentId}/adjustments`,
      {
        kind: 'REFUND',
        amount: '150000',
        reference: randomUUID(),
        submissionKey: randomUUID(),
      },
      201,
    );
    await prisma.fakeRegistrarRegistration.update({
      where: { operationId: op.id },
      data: { state: 'Active' },
    });
    await prisma.registrarOperation.update({
      where: { id: op.id },
      data: { nextPollAt: new Date(0) },
    });
    await processor.process(op.id);
    const response = await owner.get(`/domains/${domain.id}`).expect(200);
    const detail = domainDetailSchema.parse(
      (response.body as Success<unknown>).data,
    );
    expect(detail.state).toBe('REGISTERED');
    expect(detail.invoiceStatus).toBe('REFUNDED');
    expect(detail.financialAttention).toBe(true);
    expect(
      await prisma.fakeRegistrarRegistration.count({
        where: { operationId: op.id },
      }),
    ).toBe(1);
    expect(
      await prisma.registrarEvidence.count({
        where: { operationId: op.id, code: 'PAYMENT_CHANGED_AFTER_DISPATCH' },
      }),
    ).toBeGreaterThan(0);
  });
  it('rechecks cancellation before a dispatch claim', async () => {
    const domain = await purchase();
    await pay(domain);
    await approve(domain);
    await prisma.order.update({
      where: { id: domain.orderId },
      data: { status: 'CANCELLED', cancelledAt: new Date() },
    });
    const op = await prisma.registrarOperation.findUniqueOrThrow({
      where: { domainId: domain.id },
    });
    await processor.process(op.id);
    expect(
      await prisma.fakeRegistrarRegistration.count({
        where: { operationId: op.id },
      }),
    ).toBe(0);
    expect(
      (
        await prisma.registrarOperation.findUniqueOrThrow({
          where: { id: op.id },
        })
      ).claimedAt,
    ).toBeNull();
  });
  it('does not repeat ambiguous customer/contact creation or silently dispatch a registration', async () => {
    const domain = await purchase('contact-lost');
    await pay(domain);
    await approve(domain);
    const op = await prisma.registrarOperation.findUniqueOrThrow({
      where: { domainId: domain.id },
    });
    await processor.process(op.id);
    await prisma.registrarOperation.update({
      where: { id: op.id },
      data: { nextPollAt: new Date(0) },
    });
    await processor.process(op.id);
    expect(
      await prisma.registrarMapping.count({
        where: { customerId: op.customerId },
      }),
    ).toBe(1);
    expect(
      await prisma.fakeRegistrarRegistration.count({
        where: { operationId: op.id },
      }),
    ).toBe(0);
    expect(
      (await prisma.domain.findUniqueOrThrow({ where: { id: domain.id } }))
        .state,
    ).toBe('NEEDS_RECONCILIATION');
  });
  it('consumes the bounded reconciliation budget even when every lookup fails', async () => {
    const domain = await purchase('read-failure');
    await pay(domain);
    await approve(domain);
    const op = await prisma.registrarOperation.findUniqueOrThrow({
      where: { domainId: domain.id },
    });
    // Recover an already durably claimed operation; do not depend on other tests'
    // deliberately unresolved account-level mutations.
    await prisma.registrarOperation.update({
      where: { id: op.id },
      data: { claimedAt: new Date(), nextPollAt: new Date(0) },
    });
    const provider = new FakeDomainRegistrar(prisma);
    const lookup = jest
      .spyOn(provider, 'lookup')
      .mockRejectedValue(new Error('Fictional lookup failure'));
    // Use the same test encryption key as the authenticated application.
    const environment = app.get<ApiEnvironment>(API_ENVIRONMENT);
    const failing = new RegistrarProcessor(
      prisma,
      environment.CREDENTIAL_ENCRYPTION_KEY,
      provider,
    );
    for (let delivery = 0; delivery < 12; delivery++) {
      await prisma.registrarOperation.update({
        where: { id: op.id },
        data: { nextPollAt: new Date(0) },
      });
      await failing.process(op.id);
    }
    expect(
      (
        await prisma.registrarOperation.findUniqueOrThrow({
          where: { id: op.id },
        })
      ).pollCount,
    ).toBe(10);
    expect(lookup).toHaveBeenCalledTimes(10);
    expect(
      await prisma.fakeRegistrarRegistration.count({
        where: { operationId: op.id },
      }),
    ).toBe(0);
  });
});
