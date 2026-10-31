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
  orderFulfillmentComplete,
  Prisma,
  type PrismaClient,
} from '@webhost-billing/database';
import {
  RegistrarProcessor,
  FakeDomainRegistrar,
  ResellbizHttpsTransport,
  RegistrarCipher,
  credentialBinding,
} from '@webhost-billing/database/registrar';
import {
  PARTIAL_PAYMENT_POLICY_CONFIRMATION,
  domainDetailSchema,
  orderCreationResultSchema,
  hostingPanelOperationResultSchema,
  manualPaymentCreationResultSchema,
  serviceCreationResultSchema,
} from '@webhost-billing/shared';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { API_ENVIRONMENT } from '../src/infrastructure/environment/environment.module';
import { PRISMA_CLIENT } from '../src/infrastructure/database/database.module';
import { hashOpaqueToken } from '../src/modules/auth/services/auth-token.service';
import { TotpService } from '../src/modules/auth/services/totp.service';
import { DomainService } from '../src/modules/domains/domain.service';
import { DomainAdministrationService } from '../src/modules/domains/domain-administration.service';
import { ExistingDomainLinkService } from '../src/modules/domains/existing-domain-link.service';
import { FakeHostingPanel } from '../src/modules/hosting-panels/fake-hosting-panel';
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
function responseData<T = unknown>(response: { body: unknown }): T {
  return (response.body as Success<T>).data;
}
function registrationReference(value: string | null): string {
  if (!value) throw new Error('Expected a registration billing reference.');
  return value;
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
      RESELLBIZ_LIVE_ENABLED: 'true',
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
  async function existingLinkFixture() {
    customer = await account('CUSTOMER');
    const environment = app.get<ApiEnvironment>(API_ENVIRONMENT);
    const identity = (
      (await customer.get('/auth/me').expect(200)).body as Success<
        AuthRequestContext['identity']
      >
    ).data;
    if (identity.role !== 'CUSTOMER')
      throw new Error('Expected fictional client');
    const actor = {
      identity: (
        (await owner.get('/auth/me').expect(200)).body as Success<
          AuthRequestContext['identity']
        >
      ).data,
    } as AuthRequestContext;
    const registrar = await prisma.registrarAccount.create({
      data: {
        mode: 'LIVE',
        enabled: true,
        configuration: { schemaVersion: 2, resellerId: '54321' },
      },
    });
    await prisma.registrarProfile.create({
      data: {
        accountId: registrar.id,
        name: 'Fictional existing-domain account',
      },
    });
    const cipher = new RegistrarCipher(environment.CREDENTIAL_ENCRYPTION_KEY);
    const credential = await prisma.registrarCredential.create({
      data: {
        accountId: registrar.id,
        version: 1,
        ciphertext: cipher.encrypt(credentialBinding(registrar.id, 1, 'LIVE'), {
          resellerId: '54321',
          apiKey: 'fictional'.repeat(4),
        }),
      },
    });
    const input = {
      customerId: identity.customerId,
      registrarAccountId: registrar.id,
      domainName: `existing-${randomUUID()}.com`,
      confirmation: '',
      submissionKey: randomUUID(),
    };
    input.confirmation = input.domainName;
    let foreign = false;
    let expired = false;
    let race: (() => Promise<void>) | undefined;
    let fail = false;
    let allowLock = false;
    let locked = true;
    const wire = jest
      .spyOn(ResellbizHttpsTransport.prototype, 'request')
      .mockImplementation(async (path) => {
        if (fail) throw new Error('Fictional confidential provider error');
        if (
          path === '/api/domains/disable-theft-protection.json' &&
          allowLock
        ) {
          locked = false;
          return '{"entityid":"60001"}';
        }
        const values: Partial<Record<typeof path, unknown>> = {
          '/api/domains/orderid.json': '60001',
          '/api/domains/details.json': {
            entityid: '60001',
            domainname: input.domainName,
            customerid: '60002',
            isImmediateReseller: true,
            currentstatus: 'Active',
            endtime: expired ? '1000000' : '1900000000',
            noOfNameServers: '2',
            ns1: 'ns1.fictional-host.com',
            ns2: 'ns2.fictional-host.com',
            registrantcontactid: '60003',
            admincontactid: '60004',
            techcontactid: '60005',
            billingcontactid: '60006',
            raaVerificationStatus: 'Verified',
            domsecret: 'do-not-export',
          },
          '/api/customers/details-by-id.json': {
            customerid: '60002',
            resellerid: foreign ? '99999' : '54321',
            customerstatus: 'Active',
          },
          '/api/domains/locks.json': { transferlock: locked },
          '/api/contacts/details.json': {
            entityid: '60003',
            customerid: '60002',
            type: 'Contact',
            currentstatus: 'Active',
            name: 'Fictional registrant',
            company: 'Example Test Studio',
            emailaddr: 'registrant@example.test',
            address1: '1 Test Street',
            city: 'Dhaka',
            state: 'Dhaka',
            zip: '1000',
            country: 'BD',
            telnocc: '880',
            telno: '1700000000',
          },
        };
        if (!Object.hasOwn(values, path))
          throw new Error('A non-read registrar path was called');
        if (race && path === '/api/contacts/details.json') {
          const run = race;
          race = undefined;
          await run();
        }
        return JSON.stringify(values[path]);
      });
    return {
      environment,
      actor,
      registrar,
      credential,
      input,
      wire,
      foreign: () => {
        foreign = true;
      },
      expired: () => {
        expired = true;
      },
      fail: () => {
        fail = true;
      },
      race: (run: () => Promise<void>) => {
        race = run;
      },
      allowLock: () => {
        allowLock = true;
      },
    };
  }
  async function existingLinkFinancialCounts() {
    return Promise.all([
      prisma.order.count(),
      prisma.invoice.count(),
      prisma.invoiceItem.count(),
      prisma.payment.count(),
      prisma.domainQuote.count(),
      prisma.registrarOperation.count(),
      prisma.registrarMapping.count(),
      prisma.registrarPreparation.count(),
      prisma.outboxEvent.count(),
    ]);
  }
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
    expected: number | readonly number[],
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
        if (
          !(typeof expected === 'number' ? [expected] : expected).includes(
            response.status,
          )
        )
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
        invoiceId: registrationReference(domain.invoiceId),
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
  it('lets a full administrator record offline consent and create an unpaid domain order for a customer', async () => {
    const identity = await customer.get('/auth/me').expect(200);
    const customerId = (identity.body as Success<{ customerId: string }>).data
      .customerId;
    const domainName = `manual-${randomUUID()}.com`;
    const requestBody = {
      customerId,
      offerId,
      domainName,
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
      offlineConsent: {
        method: 'WRITTEN',
        reference: `fictional-ticket-${randomUUID()}`,
        consentedAt: new Date().toISOString(),
        attestation: true,
      },
    };
    await mutation(billing, '/domains/admin/quotes', requestBody, 403);
    await mutation(unenrolled, '/domains/admin/quotes', requestBody, 403);
    await mutation(
      owner,
      '/domains/admin/quotes',
      {
        ...requestBody,
        offlineConsent: { ...requestBody.offlineConsent, attestation: false },
      },
      400,
    );
    const response = await mutation(
      owner,
      '/domains/admin/quotes',
      requestBody,
      201,
    );
    const quoteId = (response.body as Success<{ id: string }>).data.id;
    const storedQuote = await prisma.domainQuote.findUniqueOrThrow({
      where: { id: quoteId },
    });
    expect(storedQuote.customerId).toBe(customerId);
    expect(storedQuote.offlineConsent).toMatchObject({
      method: 'WRITTEN',
      reference: requestBody.offlineConsent.reference,
      recordedBy: expect.any(String) as string,
    });
    const input = { customerId, quoteId, submissionKey: randomUUID() };
    await mutation(
      customer,
      '/domains/orders',
      { quoteId, submissionKey: input.submissionKey },
      403,
    );
    await mutation(billing, '/domains/admin/orders', input, 403);
    await mutation(unenrolled, '/domains/admin/orders', input, 403);
    const created = await mutation(owner, '/domains/admin/orders', input, 201);
    const domain = (created.body as Success<DomainResult>).data;
    expect(domain.state).toBe('AWAITING_PAYMENT');
    expect(
      JSON.stringify((await owner.get(`/domains/${domain.id}`)).body),
    ).toContain(requestBody.offlineConsent.reference);
    expect(
      JSON.stringify((await customer.get(`/domains/${domain.id}`)).body),
    ).not.toContain(requestBody.offlineConsent.reference);
    expect(
      (await mutation(owner, '/domains/admin/orders', input, 201)).body,
    ).toEqual(created.body);
    await customer.get(`/orders/${domain.orderId}`).expect(200);
    await customer.get(`/invoices/${domain.invoiceId}`).expect(200);
    const invoice = await prisma.invoice.findUniqueOrThrow({
      where: { id: domain.invoiceId },
    });
    expect(invoice.status).toBe('UNPAID');
    expect(
      await prisma.registrarOperation.count({ where: { domainId: domain.id } }),
    ).toBe(0);
    await approve(domain, 409);
    await pay(domain);
    const statusCsrf = await owner.get('/auth/csrf').expect(200);
    await owner
      .patch(`/orders/${domain.orderId}/status`)
      .set(
        'X-CSRF-Token',
        (statusCsrf.body as Success<{ csrfToken: string }>).data.csrfToken,
      )
      .send({ status: 'PROCESSING' })
      .expect(409);
    await approve(domain);
  });
  it('fails closed before database mutation when production simulation is attempted', async () => {
    const production = new DomainService(
      prisma,
      {
        ...app.get<ApiEnvironment>(API_ENVIRONMENT),
        NODE_ENV: 'production',
        RESELLBIZ_LIVE_ENABLED: false,
      },
      app.get(DomainAdministrationService),
    );
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
    const customerId = (
      await prisma.domain.findUniqueOrThrow({ where: { id: domain.id } })
    ).customerId;
    const otherId = (
      (await other.get('/auth/me').expect(200)).body as Success<{
        customerId: string;
      }>
    ).data.customerId;
    const before = await Promise.all([
      prisma.domain.count(),
      prisma.registrarOperation.count(),
      prisma.invoice.count(),
      prisma.payment.count(),
      prisma.outboxEvent.count(),
    ]);
    const scoped = (
      await owner.get(`/domains?customerId=${customerId}`).expect(200)
    ).body as Success<DomainResult[]>;
    expect(scoped.data.map((row) => row.id)).toEqual([domain.id]);
    expect(scoped.data.every((row) => row.customerId === customerId)).toBe(
      true,
    );
    expect(
      (
        (await owner.get(`/domains?customerId=${otherId}`).expect(200))
          .body as Success<DomainResult[]>
      ).data,
    ).toEqual([]);
    await owner
      .get(`/domains/${domain.id}?customerId=${customerId}`)
      .expect(200);
    await owner.get(`/domains/${domain.id}?customerId=${otherId}`).expect(403);
    await customer.get(`/domains?customerId=${otherId}`).expect(403);
    await customer
      .get(`/domains/${domain.id}?customerId=${otherId}`)
      .expect(403);
    await other
      .get(`/domains/${domain.id}?customerId=${customerId}`)
      .expect(403);
    for (const path of ['/domains', '/domains/' + domain.id]) {
      await owner.get(`${path}?customerId=invalid`).expect(400);
      await owner
        .get(`${path}?customerId=${customerId}&customerId=${otherId}`)
        .expect(400);
      await billing.get(`${path}?customerId=${customerId}`).expect(403);
    }
    expect(
      await Promise.all([
        prisma.domain.count(),
        prisma.registrarOperation.count(),
        prisma.invoice.count(),
        prisma.payment.count(),
        prisma.outboxEvent.count(),
      ]),
    ).toEqual(before);
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
  it('bills simulated registration and hosting together and completes after both are fulfilled', async () => {
    const hosting = await prisma.product.create({
      data: {
        slug: `combined-${randomUUID()}`,
        name: 'Fictional shared hosting',
        status: 'ACTIVE',
        publicVisible: true,
        hostingPackageIdentifier: 'fake_shared',
        prices: {
          create: {
            billingPeriod: 'ANNUAL',
            currency: 'BDT',
            amount: 25_000n,
            isActive: true,
          },
        },
      },
      include: { prices: true },
    });
    const server = await prisma.server.create({
      data: {
        name: 'Fictional combined-order server',
        hostname: `${randomUUID()}.example.test`,
        status: 'ACTIVE',
        adapterKey: 'fake-panel',
      },
    });
    const name = `combined-${randomUUID()}.com`;
    const quoted = await mutation(
      customer,
      '/domains/quotes',
      {
        offerId,
        domainName: name,
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
    const quoteId = (quoted.body as Success<{ id: string }>).data.id;
    const input = {
      productId: hosting.id,
      priceId: hosting.prices[0].id,
      requestedDomain: name,
      domainQuoteId: quoteId,
      submissionKey: randomUUID(),
    };
    const createdResponse = await mutation(
      customer,
      '/orders/checkout',
      input,
      201,
    );
    const created = orderCreationResultSchema.parse(
      (createdResponse.body as Success<unknown>).data,
    );
    const duplicateResponse = await mutation(
      customer,
      '/orders/checkout',
      input,
      201,
    );
    const duplicate = orderCreationResultSchema.parse(
      (duplicateResponse.body as Success<unknown>).data,
    );
    expect(duplicate.duplicate).toBe(true);
    expect(duplicate.order.id).toBe(created.order.id);
    expect(created.order.items.map((item) => item.kind).sort()).toEqual([
      'DOMAIN',
      'HOSTING',
    ]);
    expect(created.order.invoice.total.amount).toBe('175000');
    expect(
      await prisma.invoice.count({ where: { orderId: created.order.id } }),
    ).toBe(1);
    expect(
      await prisma.invoiceItem.count({
        where: { invoiceId: created.order.invoice.id },
      }),
    ).toBe(2);
    const domain = await prisma.domain.findUniqueOrThrow({
      where: { quoteId },
    });
    await pay(
      {
        id: domain.id,
        invoiceId: registrationReference(domain.invoiceId),
        orderId: created.order.id,
        domainName: name,
        state: domain.state,
      },
      '175000',
    );
    await approve({
      id: domain.id,
      invoiceId: registrationReference(domain.invoiceId),
      orderId: created.order.id,
      domainName: name,
      state: domain.state,
    });
    const operation = await prisma.registrarOperation.findUniqueOrThrow({
      where: { domainId: domain.id },
    });
    await processor.process(operation.id);
    expect(
      (
        await prisma.order.findUniqueOrThrow({
          where: { id: created.order.id },
        })
      ).status,
    ).toBe('PROCESSING');
    const hostingItem = created.order.items.find(
      (item) => item.kind === 'HOSTING',
    );
    expect(hostingItem).toBeDefined();
    const serviceResponse = await mutation(
      owner,
      '/services',
      { orderItemId: hostingItem!.id, serverId: server.id },
      201,
    );
    const serviceId = (
      serviceResponse.body as Success<{ service: { id: string } }>
    ).data.service.id;
    const csrf = await owner.get('/auth/csrf').expect(200);
    const token = (csrf.body as Success<{ csrfToken: string }>).data.csrfToken;
    await owner
      .patch(`/services/${serviceId}/status`)
      .set('X-CSRF-Token', token)
      .send({ status: 'PROVISIONING' })
      .expect(200);
    await owner
      .patch(`/services/${serviceId}/status`)
      .set('X-CSRF-Token', token)
      .send({
        status: 'ACTIVE',
        externalAccountId: 'fictional-combined-account',
        controlPanelUsername: 'fakecombined',
      })
      .expect(200);
    expect(
      (
        await prisma.order.findUniqueOrThrow({
          where: { id: created.order.id },
        })
      ).status,
    ).toBe('COMPLETED');
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
      where: { id: registrationReference(stored.quoteId) },
    });
    const expired = await prisma.domainQuote.create({
      data: {
        ...quote,
        selectionSnapshot: Prisma.DbNull,
        offlineConsent: Prisma.DbNull,
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
          managementSnapshot: stored.managementSnapshot ?? Prisma.DbNull,
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
  it('configures disabled live credentials, verifies ownership/payment/risk and registers once through an injected live transport', async () => {
    const key = 'fake'.repeat(8);
    const input = {
      resellerId: '12345',
      apiKey: key,
      confirmation: 'Configure live resell.biz',
      sellingAmount: '150000',
      nameservers: ['ns1.fictional-host.com', 'ns2.fictional-host.com'],
      agreementUrl: 'https://fictional-host.com/domain-agreement',
      customerTermsUrl: 'https://fictional-host.com/customer-terms',
      customerPrivacyUrl: 'https://fictional-host.com/privacy',
      confirmNativeUsdCosts: true,
    };
    const name = `live-${randomUUID()}.com`;
    const contact = {
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
    };
    let registered = false;
    let managedNs = [...input.nameservers],
      locked = true,
      expiry = '1900000000';
    let contactId = '34567',
      replacementId = '34567';
    let managementOffline = false;
    const wire = jest
      .spyOn(ResellbizHttpsTransport.prototype, 'request')
      .mockImplementation(async (path, parameters) => {
        await new Promise<void>((resolve) => queueMicrotask(resolve));
        switch (path) {
          case '/api/domains/available.json':
            return JSON.stringify({
              [`${String(parameters['domain-name'])}.com`]: {
                status: registered ? 'regthroughus' : 'available',
              },
            });
          case '/api/products/reseller-cost-price.json':
            return '{"domcno":{"addnewdomain":{"1":10.99},"renewdomain":{"1":10.99}}}';
          case '/api/customers/search.json':
            return '{"recsonpage":0,"recsindb":0}';
          case '/api/customers/v2/signup.json':
            return '23456';
          case '/api/contacts/add.json':
            replacementId = registered ? '34568' : '34567';
            return replacementId;
          case '/api/customers/details-by-id.json':
            return JSON.stringify({
              customerid: '23456',
              resellerid: '12345',
              customerstatus: 'Active',
              username: contact.email,
              useremail: contact.email,
              name: contact.name,
              company: contact.company,
              address1: contact.address,
              city: contact.city,
              state: contact.region,
              zip: contact.postalCode,
              country: contact.country,
              telnocc: contact.phoneCountryCode,
              telno: contact.phone,
              pin: 'never-export-this',
            });
          case '/api/contacts/details.json':
            return JSON.stringify({
              entityid: replacementId,
              customerid: '23456',
              type: 'Contact',
              currentstatus: 'Active',
              name: contact.name,
              company: contact.company,
              address1: contact.address,
              city: contact.city,
              state: contact.region,
              zip: contact.postalCode,
              country: contact.country,
              emailaddr: contact.email,
              telnocc: contact.phoneCountryCode,
              telno: contact.phone,
            });
          case '/api/domains/register.json':
            registered = true;
            throw new Error(
              'Simulated lost response including fictionalApiKey123456789',
            );
          case '/api/domains/orderid.json':
            return '45678';
          case '/api/domains/details.json':
            if (managementOffline)
              throw new Error('Simulated management read error with secret');
            return JSON.stringify({
              entityid: '45678',
              domainname: name,
              customerid: '23456',
              isImmediateReseller: 'true',
              currentstatus: 'Active',
              endtime: expiry,
              domsecret: 'never-export-this',
              noOfNameServers: String(managedNs.length),
              ns1: managedNs[0],
              ns2: managedNs[1],
              registrantcontactid: contactId,
              admincontactid: contactId,
              techcontactid: contactId,
              billingcontactid: contactId,
              raaVerificationStatus: 'Verified',
            });
          case '/api/domains/locks.json':
            return JSON.stringify({ transferlock: locked });
          case '/api/domains/modify-ns.json':
            managedNs = [...(parameters.ns as readonly string[])];
            throw new Error(
              'Simulated lost nameserver response containing fictionalApiKey123456789',
            );
          case '/api/domains/enable-theft-protection.json':
            locked = true;
            return '{"entityid":"45678"}';
          case '/api/domains/disable-theft-protection.json':
            locked = false;
            return '{"entityid":"45678"}';
          case '/api/domains/modify-contact.json':
            contactId = String(parameters['reg-contact-id']);
            return '{"entityid":"45678","irtp_status":"Pending"}';
          case '/api/domains/renew.json':
            expiry = String(BigInt(expiry) + 31536000n);
            throw new Error('Simulated lost renewal response');
          default:
            throw new Error('Unexpected fictional endpoint');
        }
      });
    async function patch(path: string, body: object, status = 200) {
      const csrf = await owner.get('/auth/csrf').expect(200);
      return owner
        .patch(path)
        .set(
          'X-CSRF-Token',
          (csrf.body as Success<{ csrfToken: string }>).data.csrfToken,
        )
        .send(body)
        .expect(status);
    }
    try {
      await customer.get('/domains/registrar/live').expect(403);
      await billing.get('/domains/registrar/live').expect(403);
      await unenrolled.get('/domains/registrar/live').expect(403);
      await mutation(unenrolled, '/domains/registrar/live', input, 403);
      await mutation(
        owner,
        '/domains/registrar/live',
        { ...input, confirmNativeUsdCosts: false },
        400,
      );
      const configured = await mutation(
        owner,
        '/domains/registrar/live',
        input,
        201,
      );
      const accountId = (configured.body as Success<{ id: string }>).data.id;
      expect(JSON.stringify(configured.body)).not.toMatch(
        /fictionalApiKey|ciphertext|"resellerId"/,
      );
      expect(JSON.stringify(configured.body)).not.toContain(key);
      expect(
        (configured.body as Success<{ enabled: boolean }>).data.enabled,
      ).toBe(false);
      expect(wire).not.toHaveBeenCalled();
      const secret = await prisma.registrarCredential.findFirstOrThrow({
        where: { accountId },
      });
      expect(secret.ciphertext).not.toContain(key);
      await expect(
        prisma.registrarAccount.update({
          where: { id: accountId },
          data: { mode: 'FAKE', configuration: Prisma.JsonNull },
        }),
      ).rejects.toThrow();
      await patch(`/domains/registrar/live/${accountId}`, { enabled: true });
      const before = wire.mock.calls.length;
      const available = await customer.get('/domains/offers').expect(200);
      const liveOffer = (
        available.body as Success<
          { id: string; simulated: boolean; costAmount?: string }[]
        >
      ).data.find((offer) => !offer.simulated);
      expect(liveOffer).toBeDefined();
      expect(liveOffer?.costAmount).toBeUndefined();
      expect(wire.mock.calls.length).toBe(before);
      await mutation(
        customer,
        '/domains/quotes',
        {
          offerId: liveOffer?.id,
          domainName: name,
          contact,
          consent: true,
          agreement: 'fictional-registration-v1',
        },
        409,
      );
      const quote = await mutation(
        customer,
        '/domains/quotes',
        {
          offerId: liveOffer?.id,
          domainName: name,
          contact,
          consent: true,
          agreement: 'resellbiz-registration-v1',
          customerPolicyConsent: true,
        },
        201,
      );
      const order = await mutation(
        customer,
        '/domains/orders',
        {
          quoteId: (quote.body as Success<{ id: string }>).data.id,
          submissionKey: randomUUID(),
        },
        201,
      );
      const domain = (order.body as Success<DomainResult>).data;
      await other.get(`/domains/${domain.id}`).expect(403);
      await unenrolled.get(`/domains/${domain.id}`).expect(403);
      const customerView = await customer
        .get(`/domains/${domain.id}`)
        .expect(200);
      expect(JSON.stringify(customerView.body)).not.toMatch(
        /contactCiphertext|operationId|costAmount|remoteCustomerId|remoteContactId|never-export/,
      );
      const approval = {
        confirmation: name,
        costCeiling: '1099',
        costCurrency: 'USD',
        acceptPriceChangeRisk: true,
      };
      await mutation(
        owner,
        `/domains/${domain.id}/approve`,
        { confirmation: name, costCeiling: '1099', costCurrency: 'USD' },
        409,
      );
      await mutation(owner, `/domains/${domain.id}/approve`, approval, 409);
      await pay(domain);
      const approved = await mutation(
        owner,
        `/domains/${domain.id}/approve`,
        approval,
        201,
      );
      const opId =
        (approved.body as Success<DomainResult>).data.operationId ?? '';
      // Default/production-disabled processor cannot dispatch a live operation.
      const blocked = new RegistrarProcessor(
        prisma,
        app.get<ApiEnvironment>(API_ENVIRONMENT).CREDENTIAL_ENCRYPTION_KEY,
        undefined,
        { simulationAllowed: false, liveAllowed: false },
      );
      await blocked.process(opId);
      expect(registered).toBe(false);
      const actual = new RegistrarProcessor(
        prisma,
        app.get<ApiEnvironment>(API_ENVIRONMENT).CREDENTIAL_ENCRYPTION_KEY,
        undefined,
        { simulationAllowed: false, liveAllowed: true },
      );
      await Promise.all([actual.process(opId), actual.process(opId)]);
      await actual.process(opId);
      expect(
        wire.mock.calls.filter(
          ([path]) => path === '/api/domains/register.json',
        ),
      ).toHaveLength(1);
      expect(
        wire.mock.calls.filter(
          ([path]) => path === '/api/customers/v2/signup.json',
        ),
      ).toHaveLength(1);
      expect(
        wire.mock.calls.filter(([path]) => path === '/api/contacts/add.json'),
      ).toHaveLength(1);
      const prepared = await prisma.registrarPreparation.findFirstOrThrow({
        where: { accountId },
      });
      expect(prepared.remoteCustomerId).toBe('23456');
      expect(prepared.remoteContactId).toBe('34567');
      await expect(
        prisma.registrarPreparation.update({
          where: { id: prepared.id },
          data: { customerClaimedAt: null },
        }),
      ).rejects.toThrow();
      const final = await prisma.domain.findUniqueOrThrow({
        where: { id: domain.id },
      });
      expect(final.state).toBe('REGISTERED');
      expect(final.providerOrderId).toBe('45678');
      expect(
        await prisma.fakeRegistrarRegistration.count({ where: { accountId } }),
      ).toBe(0);
      expect(
        await prisma.service.count({
          where: { orderItemId: final.orderItemId },
        }),
      ).toBe(0);
      expect(
        (
          await prisma.order.findUniqueOrThrow({
            where: { id: domain.orderId },
          })
        ).status,
      ).toBe('COMPLETED');
      const evidence = await prisma.registrarEvidence.findMany({
        where: { operationId: opId },
      });
      expect(
        evidence.some((event) => event.code === 'MUTATION_OUTCOME_UNCERTAIN'),
      ).toBe(true);
      expect(JSON.stringify(evidence)).not.toMatch(
        /fictionalApiKey|never-export/,
      );
      const risk = await prisma.registrarOperation.findUniqueOrThrow({
        where: { id: opId },
      });
      await expect(
        prisma.registrarOperation.update({
          where: { id: opId },
          data: { priceChangeRiskAccepted: false },
        }),
      ).rejects.toThrow();
      expect(risk.priceChangeRiskAccepted).toBe(true);
      // Management operates from its own durable claims; reads stay separately bounded.
      const managementBase = `/domains/${domain.id}`;
      const readsBefore = wire.mock.calls.length;
      await customer.get(`${managementBase}/management`).expect(200);
      await customer.get(`${managementBase}/actions`).expect(200);
      expect(wire.mock.calls.length).toBe(readsBefore);
      await other.get(`${managementBase}/actions`).expect(403);
      await mutation(
        customer,
        `${managementBase}/actions`,
        { confirmation: name, request: { kind: 'LOCK', locked: false } },
        403,
      );
      const financialSnapshot = (value: unknown) =>
        JSON.stringify(value, (_key, entry: unknown) =>
          typeof entry === 'bigint' ? entry.toString() : entry,
        );
      const initialInvoice = financialSnapshot(
        await prisma.invoice.findUniqueOrThrow({
          where: { id: registrationReference(final.invoiceId) },
        }),
      );
      const newNames = ['ns3.fictional-host.com', 'ns4.fictional-host.com'];
      async function action(request: object) {
        const result = await mutation(
          owner,
          `${managementBase}/actions`,
          { confirmation: name, request },
          201,
        );
        return (
          result.body as Success<{ id: string; invoiceId: string | null }[]>
        ).data[0];
      }
      const abandoned = await action({
        kind: 'RENEW',
        sellingAmount: '170000',
        costCeiling: '1099',
        acceptPriceChangeRisk: true,
      });
      const beforeCancel = wire.mock.calls.length;
      await mutation(
        owner,
        `${managementBase}/actions/${abandoned.id}/cancel-unsent`,
        { confirmation: name },
        201,
      );
      expect(wire.mock.calls.length).toBe(beforeCancel);
      expect(
        (
          await prisma.invoice.findUniqueOrThrow({
            where: { id: abandoned.invoiceId! },
          })
        ).status,
      ).toBe('CANCELLED');
      expect(
        (
          await prisma.domainAction.findUniqueOrThrow({
            where: { id: abandoned.id },
          })
        ).state,
      ).toBe('CANCELLED');
      const preflightFailed = await action({
        kind: 'NAMESERVERS',
        nameservers: newNames,
      });
      managementOffline = true;
      await mutation(
        owner,
        `${managementBase}/actions/${preflightFailed.id}/execute`,
        { confirmation: name },
        201,
      );
      managementOffline = false;
      expect(
        (
          await prisma.domainAction.findUniqueOrThrow({
            where: { id: preflightFailed.id },
          })
        ).state,
      ).toBe('FAILED');
      expect(
        wire.mock.calls.some(
          ([path]) => path === '/api/domains/modify-ns.json',
        ),
      ).toBe(false);
      const nsAction = await action({
        kind: 'NAMESERVERS',
        nameservers: newNames,
      });
      await mutation(
        owner,
        `${managementBase}/actions`,
        { confirmation: name, request: { kind: 'LOCK', locked: false } },
        409,
      );
      const parallel = await Promise.all([
        mutation(
          owner,
          `${managementBase}/actions/${nsAction.id}/execute`,
          { confirmation: name },
          [201, 409],
        ),
        mutation(
          owner,
          `${managementBase}/actions/${nsAction.id}/execute`,
          { confirmation: name },
          [201, 409],
        ),
      ]);
      expect(parallel.some((response) => response.status === 201)).toBe(true);
      expect(
        wire.mock.calls.filter(
          ([path]) => path === '/api/domains/modify-ns.json',
        ),
      ).toHaveLength(1);
      expect(
        (
          await prisma.domainAction.findUniqueOrThrow({
            where: { id: nsAction.id },
          })
        ).state,
      ).toBe('SUCCEEDED');
      await mutation(
        owner,
        `${managementBase}/actions/${nsAction.id}/cancel-unsent`,
        { confirmation: name },
        409,
      );
      await expect(
        prisma.domainAction.update({
          where: { id: nsAction.id },
          data: { submittedAt: null },
        }),
      ).rejects.toThrow();
      const lockAction = await action({ kind: 'LOCK', locked: false });
      await mutation(
        owner,
        `${managementBase}/actions/${lockAction.id}/execute`,
        { confirmation: name },
        201,
      );
      expect(locked).toBe(false);
      const contactAction = await action({
        kind: 'CONTACT',
        contact,
        consent: true,
        acceptRegistrantChange: true,
      });
      await mutation(
        owner,
        `${managementBase}/actions/${contactAction.id}/execute`,
        { confirmation: name },
        201,
      );
      const change = wire.mock.calls.find(
        ([path]) => path === '/api/domains/modify-contact.json',
      )![1];
      expect(change['designated-agent']).toBe('false');
      expect(change['sixty-day-lock-optout']).toBe('false');
      expect(change['attr-name1']).toBe('registrant-org-consent');
      expect(change['attr-value1']).toBe('false');
      expect(
        (
          await prisma.domainAction.findUniqueOrThrow({
            where: { id: contactAction.id },
          })
        ).state,
      ).toBe('SUCCEEDED');
      const renewal = await action({
        kind: 'RENEW',
        sellingAmount: '170000',
        costCeiling: '1099',
        acceptPriceChangeRisk: true,
      });
      expect(renewal.invoiceId).not.toBe(final.invoiceId);
      const renewUrl = `${managementBase}/actions/${renewal.id}/execute`;
      await mutation(owner, renewUrl, { confirmation: name }, 409);
      expect(
        wire.mock.calls.some(([path]) => path === '/api/domains/renew.json'),
      ).toBe(false);
      await pay({ ...domain, invoiceId: renewal.invoiceId! }, '170000');
      await mutation(owner, renewUrl, { confirmation: name }, 201);
      await mutation(owner, renewUrl, { confirmation: name }, 201);
      expect(
        wire.mock.calls.filter(([path]) => path === '/api/domains/renew.json'),
      ).toHaveLength(1);
      expect(
        (
          await prisma.domainAction.findUniqueOrThrow({
            where: { id: renewal.id },
          })
        ).state,
      ).toBe('SUCCEEDED');
      expect(
        financialSnapshot(
          await prisma.invoice.findUniqueOrThrow({
            where: { id: registrationReference(final.invoiceId) },
          }),
        ),
      ).toBe(initialInvoice);
      const actionRow = await prisma.domainAction.findUniqueOrThrow({
        where: { id: renewal.id },
      });
      await expect(
        prisma.domainAction.update({
          where: { id: renewal.id },
          data: { payloadCiphertext: 'changed' },
        }),
      ).rejects.toThrow();
      await expect(
        prisma.domainAction.delete({ where: { id: renewal.id } }),
      ).rejects.toThrow();
      expect(actionRow.payloadCiphertext).not.toContain('170000');
      const code = await mutation(
        owner,
        `${managementBase}/authorization-code`,
        { confirmation: name },
        201,
      );
      expect(code.headers['cache-control']).toContain('no-store');
      expect((code.body as Success<{ code: string }>).data.code).toBe(
        'never-export-this',
      );
      expect(
        JSON.stringify(
          await prisma.domainAction.findMany({
            where: { domainId: domain.id },
          }),
        ),
      ).not.toContain('never-export-this');
      // Five independently reserved reads consume the budget; an extra check is denied before network.
      const calls = wire.mock.calls.length;
      await mutation(
        owner,
        `/domains/registrar/live/${accountId}/check`,
        { domainName: name },
        409,
      );
      expect(wire.mock.calls.length).toBe(calls);
      await patch(
        `/domains/registrar/live/${accountId}/credential`,
        { resellerId: '99999', apiKey: key },
        409,
      );
      await patch(`/domains/registrar/live/${accountId}/credential`, {
        resellerId: '12345',
        apiKey: 'fake2'.repeat(8),
      });
      expect(
        (
          await prisma.registrarAccount.findUniqueOrThrow({
            where: { id: accountId },
          })
        ).enabled,
      ).toBe(false);
      expect(
        await prisma.registrarCredential.count({ where: { accountId } }),
      ).toBe(2);
      expect(
        await prisma.activityLog.count({
          where: { entityId: accountId, action: 'RESELLBIZ_READ_RESERVED' },
        }),
      ).toBe(5);
    } finally {
      wire.mockRestore();
    }
  });
  it('protects independent registrar/catalogue/default APIs with MFA and ownership roles', async () => {
    for (const path of [
      '/domains/administration/registrars',
      '/domains/administration/tlds',
      '/domains/administration/defaults',
    ]) {
      await request(app.getHttpServer()).get(path).expect(401);
      await customer.get(path).expect(403);
      await billing.get(path).expect(403);
      await unenrolled.get(path).expect(403);
      await owner.get(path).expect(200);
    }
  });
  it('saves multiple encrypted connections without requiring or creating products/DNS/policies', async () => {
    const beforeProducts = await prisma.product.count();
    const beforeDomains = await prisma.domain.count();
    for (const resellerId of ['22345', '32345']) {
      const response = await mutation(
        owner,
        '/domains/administration/registrars',
        {
          name: `Fictional LogicBoxes ${resellerId}`,
          module: 'logicboxes',
          resellerId,
          apiKey: 'fake'.repeat(8),
          confirmation: 'Save registrar connection',
        },
        201,
      );
      expect(JSON.stringify(response.body)).not.toContain('fake'.repeat(8));
    }
    expect(await prisma.product.count()).toBe(beforeProducts);
    expect(await prisma.domain.count()).toBe(beforeDomains);
    expect(
      await prisma.registrarAccount.count({ where: { mode: 'LIVE' } }),
    ).toBe(3);
    await mutation(
      owner,
      '/domains/administration/registrars',
      {
        name: 'Duplicate',
        module: 'logicboxes',
        resellerId: '22345',
        apiKey: 'fake'.repeat(8),
        confirmation: 'Save registrar connection',
      },
      409,
    );
  });
  it('executes through a consent-scoped non-default registrar, retaining prices and the original quote binding', async () => {
    const administration = app.get(DomainAdministrationService);
    const origin = await prisma.registrarAccount.findFirstOrThrow({
      where: { mode: 'FAKE' },
    });
    await prisma.registrarAccount.update({
      where: { id: origin.id },
      data: { enabled: true },
    });
    const second = await prisma.registrarAccount.create({
      data: { mode: 'FAKE', enabled: true },
    });
    const cipher = new RegistrarCipher(
      app.get<ApiEnvironment>(API_ENVIRONMENT).CREDENTIAL_ENCRYPTION_KEY,
    );
    await prisma.registrarCredential.create({
      data: {
        accountId: second.id,
        version: 1,
        ciphertext: cipher.encrypt(credentialBinding(second.id, 1, 'FAKE'), {
          fictional: true,
        }),
      },
    });
    await prisma.registrarProfile.create({
      data: {
        accountId: second.id,
        name: 'Fictional secondary',
        nativeCostConfirmed: true,
      },
    });
    const auth = (await owner.get('/auth/me')).body as Success<
      AuthRequestContext['identity']
    >;
    const actor = { identity: auth.data } as AuthRequestContext;
    await administration.setDefault(origin.id, actor);
    await administration.saveDefaults(
      'dns',
      { nameservers: ['ns1.fictional-host.com', 'ns2.fictional-host.com'] },
      actor,
    );
    await administration.saveDefaults(
      'policies',
      {
        agreementUrl: 'https://fictional-host.com/domain-policy',
        customerTermsUrl: 'https://fictional-host.com/terms',
        customerPrivacyUrl: 'https://fictional-host.com/privacy',
      },
      actor,
    );
    await administration.saveTld(
      {
        tld: 'com',
        registrationAmount: '150000',
        renewalAmount: '160000',
        enabled: true,
        featured: true,
        displayOrder: 1,
        preferredRegistrarId: null,
        revision: 0,
      },
      actor,
    );
    const offers = (await customer.get('/domains/offers').expect(200))
      .body as Success<
      {
        id: string;
        tld: string;
        selectionConsentRevision?: string;
        eligibleRegistrars?: { id: string }[];
      }[]
    >;
    const selectedOffer = offers.data.find((entry) => entry.tld === 'com')!;
    expect(selectedOffer.eligibleRegistrars?.map((entry) => entry.id)).toEqual(
      expect.arrayContaining([origin.id, second.id]),
    );
    const name = `catalogue-${randomUUID()}.com`;
    const contact = {
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
    };
    await mutation(
      customer,
      '/domains/quotes',
      {
        offerId: selectedOffer.id,
        domainName: name,
        contact,
        agreement: 'fictional-registration-v1',
        consent: true,
      },
      409,
    );
    const quoteResponse = await mutation(
      customer,
      '/domains/quotes',
      {
        offerId: selectedOffer.id,
        domainName: name,
        contact,
        agreement: 'fictional-registration-v1',
        consent: true,
        selectionConsentRevision: selectedOffer.selectionConsentRevision,
      },
      201,
    );
    const quoteId = (quoteResponse.body as Success<{ id: string }>).data.id;
    const response = await mutation(
      customer,
      '/domains/orders',
      { quoteId, submissionKey: randomUUID() },
      201,
    );
    const domain = (response.body as Success<DomainResult>).data;
    await pay(domain);
    await mutation(
      owner,
      `/domains/${domain.id}/approve`,
      {
        confirmation: name,
        costCeiling: '1000',
        costCurrency: 'USD',
        registrarAccountId: randomUUID(),
      },
      409,
    );
    await mutation(
      owner,
      `/domains/${domain.id}/registration-check`,
      { registrarAccountId: second.id },
      201,
    );
    const approval = await mutation(
      owner,
      `/domains/${domain.id}/approve`,
      {
        confirmation: name,
        costCeiling: '1000',
        costCurrency: 'USD',
        registrarAccountId: second.id,
      },
      201,
    );
    const operationId = (approval.body as Success<DomainResult>).data
      .operationId!;
    const beforeInvoice = await prisma.invoice.findUniqueOrThrow({
      where: { id: domain.invoiceId },
    });
    await administration.setDefault(second.id, actor);
    await processor.process(operationId);
    await processor.process(operationId);
    const stored = await prisma.domain.findUniqueOrThrow({
      where: { id: domain.id },
    });
    expect(stored.state).toBe('REGISTERED');
    expect(stored.accountId).toBe(origin.id);
    expect(stored.executionAccountId).toBe(second.id);
    expect(
      (
        await prisma.fakeRegistrarRegistration.findUniqueOrThrow({
          where: { operationId },
        })
      ).accountId,
    ).toBe(second.id);
    expect(
      await prisma.fakeRegistrarRegistration.count({ where: { operationId } }),
    ).toBe(1);
    await expect(
      prisma.registrarOperation.update({
        where: { id: operationId },
        data: { selectedAccountId: origin.id },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.domain.update({
        where: { id: domain.id },
        data: { executionAccountId: origin.id },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.domainQuote.update({
        where: { id: quoteId },
        data: { selectionSnapshot: {} },
      }),
    ).rejects.toThrow();
    const catalogue = await prisma.domainCatalogueTld.findUniqueOrThrow({
      where: { tld: 'com' },
    });
    await administration.saveTld(
      {
        tld: 'com',
        registrationAmount: '250000',
        renewalAmount: '260000',
        enabled: true,
        featured: false,
        displayOrder: 1,
        preferredRegistrarId: origin.id,
        revision: catalogue.revision,
      },
      actor,
    );
    await expect(
      prisma.productPrice.update({
        where: { id: catalogue.registrationPriceId! },
        data: { amount: 999n },
      }),
    ).rejects.toThrow();
    expect(
      (
        await prisma.invoice.findUniqueOrThrow({
          where: { id: domain.invoiceId },
        })
      ).total,
    ).toBe(beforeInvoice.total);
    expect(
      (await prisma.domainQuote.findUniqueOrThrow({ where: { id: quoteId } }))
        .sellingAmount,
    ).toBe(150000n);
    await administration.setDefault(origin.id, actor);
    const observed = (await owner.get(`/domains/${domain.id}`).expect(200))
      .body as Success<{ registrar: string; selectedRegistrarId: string }>;
    expect(observed.data.registrar).toBe('Fictional secondary');
    expect(observed.data.selectedRegistrarId).toBe(second.id);
    await mutation(
      owner,
      `/domains/${domain.id}/approve`,
      {
        confirmation: name,
        costCeiling: '1000',
        costCurrency: 'USD',
        registrarAccountId: origin.id,
      },
      409,
    );
    await expect(
      administration.saveTld(
        {
          tld: 'com',
          registrationAmount: '1',
          renewalAmount: null,
          enabled: true,
          featured: false,
          displayOrder: 1,
          preferredRegistrarId: null,
          revision: catalogue.revision,
        },
        actor,
      ),
    ).rejects.toThrow();
  });
  it('rejects stale policy and DNS consent, stale checkout and partial bulk writes', async () => {
    const administration = app.get(DomainAdministrationService);
    const auth = (await owner.get('/auth/me')).body as Success<
      AuthRequestContext['identity']
    >;
    const actor = { identity: auth.data } as AuthRequestContext;
    const fakeAccounts = await prisma.registrarAccount.findMany({
      where: { mode: 'FAKE', enabled: true },
    });
    expect(fakeAccounts.length).toBeGreaterThanOrEqual(2);
    await Promise.all(
      fakeAccounts
        .slice(0, 2)
        .map((entry) => administration.setDefault(entry.id, actor)),
    );
    expect(
      await prisma.registrarProfile.count({ where: { isDefault: true } }),
    ).toBe(1);
    const previous = await prisma.domainCatalogueTld.findUniqueOrThrow({
      where: { tld: 'com' },
    });
    const input = {
      tld: 'com',
      registrationAmount: '250000',
      renewalAmount: '260000',
      enabled: true,
      featured: false,
      displayOrder: 1,
      preferredRegistrarId: null,
      revision: previous.revision,
    };
    await administration.saveTld(input, actor);
    const offer = (await customer.get('/domains/offers').expect(200))
      .body as Success<{ id: string; selectionConsentRevision: string }[]>;
    const request = {
      offerId: offer.data[0].id,
      domainName: `stale-${randomUUID()}.com`,
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
      selectionConsentRevision: offer.data[0].selectionConsentRevision,
    };
    await administration.saveDefaults(
      'dns',
      { nameservers: ['ns3.fictional-host.com', 'ns4.fictional-host.com'] },
      actor,
    );
    await mutation(customer, '/domains/quotes', request, 409);
    const dnsOffer = (await customer.get('/domains/offers').expect(200))
      .body as typeof offer;
    await administration.saveDefaults(
      'policies',
      {
        agreementUrl: 'https://fictional-host.com/domain-policy',
        customerTermsUrl: 'https://fictional-host.com/terms',
        customerPrivacyUrl: 'https://fictional-host.com/privacy',
      },
      actor,
    );
    await mutation(
      customer,
      '/domains/quotes',
      {
        ...request,
        selectionConsentRevision: dnsOffer.data[0].selectionConsentRevision,
      },
      409,
    );
    const freshOffer = (await customer.get('/domains/offers').expect(200))
      .body as typeof offer;
    const quoted = await mutation(
      customer,
      '/domains/quotes',
      {
        ...request,
        selectionConsentRevision: freshOffer.data[0].selectionConsentRevision,
      },
      201,
    );
    const quoteId = (quoted.body as Success<{ id: string }>).data.id;
    const current = await prisma.domainCatalogueTld.findUniqueOrThrow({
      where: { tld: 'com' },
    });
    await administration.saveTld(
      { ...input, registrationAmount: '260000', revision: current.revision },
      actor,
    );
    const invoiceCount = await prisma.invoice.count();
    await mutation(
      customer,
      '/domains/orders',
      { quoteId, submissionKey: randomUUID() },
      409,
    );
    expect(await prisma.invoice.count()).toBe(invoiceCount);
    expect(await prisma.domain.count({ where: { quoteId } })).toBe(0);
    await administration.saveTld(
      { ...input, tld: 'net', enabled: false, revision: 0 },
      actor,
    );
    const batchRows = await prisma.domainCatalogueTld.findMany({
      where: { tld: { in: ['com', 'net'] } },
      orderBy: { id: 'asc' },
    });
    await expect(
      administration.bulk(
        {
          entries: batchRows.map((row, index) => ({
            id: row.id,
            revision: row.revision + index,
          })),
          enabled: false,
          confirmation: 'Apply TLD changes',
        },
        actor,
      ),
    ).rejects.toThrow();
    expect(
      await prisma.domainCatalogueTld.findMany({
        where: { id: { in: batchRows.map((row) => row.id) } },
        orderBy: { id: 'asc' },
      }),
    ).toEqual(batchRows);
    await administration.saveDefaults(
      'dns',
      { nameservers: ['ns1.fictional-host.com', 'ns2.fictional-host.com'] },
      actor,
    );
  });
  it('prepares live contacts and management on the selected account through HTTP mocks only', async () => {
    const administration = app.get(DomainAdministrationService);
    const auth = (await owner.get('/auth/me')).body as Success<
      AuthRequestContext['identity']
    >;
    const actor = { identity: auth.data } as AuthRequestContext;
    const accounts = await prisma.registrarAccount.findMany({
      where: { mode: 'LIVE' },
      orderBy: { createdAt: 'asc' },
    });
    const origin = accounts.find(
      (entry) =>
        (entry.configuration as { resellerId?: string })?.resellerId ===
        '22345',
    )!;
    const selected = accounts.find(
      (entry) =>
        (entry.configuration as { resellerId?: string })?.resellerId ===
        '32345',
    )!;
    for (const account of [origin, selected]) {
      await prisma.registrarAccount.update({
        where: { id: account.id },
        data: { enabled: true },
      });
      await prisma.registrarProfile.update({
        where: { accountId: account.id },
        data: { nativeCostConfirmed: true },
      });
    }
    await administration.setDefault(origin.id, actor);
    const catalogue = await prisma.domainCatalogueTld.findUniqueOrThrow({
      where: { tld: 'com' },
    });
    await administration.saveTld(
      {
        tld: 'com',
        registrationAmount: '250000',
        renewalAmount: '260000',
        enabled: true,
        featured: false,
        displayOrder: 1,
        preferredRegistrarId: origin.id,
        revision: catalogue.revision,
      },
      actor,
    );
    const name = `selected-live-${randomUUID()}.com`;
    const contact = {
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
      publishOrganization: false,
    };
    let registered = false;
    let selectedExpiry = 1900000000n;
    const wire = jest
      .spyOn(ResellbizHttpsTransport.prototype, 'request')
      .mockImplementation(async (path, parameters) => {
        await new Promise<void>((resolve) => queueMicrotask(resolve));
        switch (path) {
          case '/api/domains/available.json':
            return JSON.stringify({
              [`${String(parameters['domain-name'])}.com`]: {
                status: registered ? 'regthroughus' : 'available',
              },
            });
          case '/api/products/reseller-cost-price.json':
            return '{"domcno":{"addnewdomain":{"1":10.99},"renewdomain":{"1":10.99}}}';
          case '/api/customers/search.json':
            return '{"recsonpage":0,"recsindb":0}';
          case '/api/customers/v2/signup.json':
            return '23456';
          case '/api/contacts/add.json':
            return '34567';
          case '/api/customers/details-by-id.json':
            return JSON.stringify({
              customerid: '23456',
              resellerid: '32345',
              customerstatus: 'Active',
              username: contact.email,
              useremail: contact.email,
              name: contact.name,
              company: contact.company,
              address1: contact.address,
              city: contact.city,
              state: contact.region,
              zip: contact.postalCode,
              country: contact.country,
              telnocc: contact.phoneCountryCode,
              telno: contact.phone,
            });
          case '/api/contacts/details.json':
            return JSON.stringify({
              entityid: '34567',
              customerid: '23456',
              type: 'Contact',
              currentstatus: 'Active',
              name: contact.name,
              company: contact.company,
              address1: contact.address,
              city: contact.city,
              state: contact.region,
              zip: contact.postalCode,
              country: contact.country,
              emailaddr: contact.email,
              telnocc: contact.phoneCountryCode,
              telno: contact.phone,
            });
          case '/api/domains/register.json':
            registered = true;
            throw new Error('Fictional lost response; reconciliation only');
          case '/api/domains/orderid.json':
            return '45678';
          case '/api/domains/details.json':
            return JSON.stringify({
              entityid: '45678',
              domainname: name,
              customerid: '23456',
              isImmediateReseller: 'true',
              currentstatus: 'Active',
              endtime: selectedExpiry.toString(),
              noOfNameServers: '2',
              ns1: 'ns1.fictional-host.com',
              ns2: 'ns2.fictional-host.com',
              registrantcontactid: '34567',
              admincontactid: '34567',
              techcontactid: '34567',
              billingcontactid: '34567',
              raaVerificationStatus: 'Verified',
            });
          case '/api/domains/locks.json':
            return '{"transferlock":true}';
          case '/api/domains/renew.json':
            selectedExpiry += 31536000n;
            throw new Error(
              'Fictional lost renewal response; reconciliation only',
            );
          default:
            throw new Error('Unexpected HTTP-mocked operation');
        }
      });
    try {
      const offers = (await customer.get('/domains/offers').expect(200))
        .body as Success<
        {
          id: string;
          tld: string;
          simulated: boolean;
          selectionConsentRevision: string;
        }[]
      >;
      const offer = offers.data.find((entry) => entry.tld === 'com')!;
      expect(offer.simulated).toBe(false);
      const quoted = await mutation(
        customer,
        '/domains/quotes',
        {
          offerId: offer.id,
          domainName: name,
          contact,
          agreement: 'resellbiz-registration-v1',
          consent: true,
          customerPolicyConsent: true,
          selectionConsentRevision: offer.selectionConsentRevision,
        },
        201,
      );
      const ordered = await mutation(
        customer,
        '/domains/orders',
        {
          quoteId: (quoted.body as Success<{ id: string }>).data.id,
          submissionKey: randomUUID(),
        },
        201,
      );
      const domain = (ordered.body as Success<DomainResult>).data;
      await pay(domain, '250000');
      await mutation(
        owner,
        `/domains/${domain.id}/approve`,
        {
          confirmation: name,
          costCeiling: '1100',
          costCurrency: 'USD',
          acceptPriceChangeRisk: true,
          registrarAccountId: selected.id,
        },
        201,
      );
      const operation = await prisma.registrarOperation.findUniqueOrThrow({
        where: { domainId: domain.id },
      });
      const live = new RegistrarProcessor(
        prisma,
        app.get<ApiEnvironment>(API_ENVIRONMENT).CREDENTIAL_ENCRYPTION_KEY,
        undefined,
        { simulationAllowed: false, liveAllowed: true },
      );
      await live.process(operation.id);
      await live.process(operation.id);
      expect(
        (await prisma.domain.findUniqueOrThrow({ where: { id: domain.id } }))
          .state,
      ).toBe('REGISTERED');
      const mutationCalls = wire.mock.calls.filter(([path]) =>
        [
          '/api/customers/v2/signup.json',
          '/api/contacts/add.json',
          '/api/domains/register.json',
        ].includes(path),
      );
      expect(mutationCalls).toHaveLength(3);
      expect(
        mutationCalls.every(
          ([, parameters]) => parameters['auth-userid'] === '32345',
        ),
      ).toBe(true);
      const preparation = await prisma.registrarPreparation.findFirstOrThrow({
        where: { operationId: operation.id },
      });
      expect(preparation.accountId).toBe(selected.id);
      await administration.setDefault(origin.id, actor);
      const refreshed = await mutation(
        owner,
        `/domains/${domain.id}/management/refresh`,
        {},
        201,
      );
      expect(
        (refreshed.body as Success<{ nameservers: string[] }>).data.nameservers,
      ).toEqual(['ns1.fictional-host.com', 'ns2.fictional-host.com']);
      const beforeRenewal = await prisma.invoice.count();
      await mutation(
        owner,
        `/domains/${domain.id}/actions`,
        {
          confirmation: name,
          request: {
            kind: 'RENEW',
            sellingAmount: '1',
            costCeiling: '1100',
            acceptPriceChangeRisk: true,
          },
        },
        409,
      );
      expect(await prisma.invoice.count()).toBe(beforeRenewal);
      const currentCatalogue =
        await prisma.domainCatalogueTld.findUniqueOrThrow({
          where: { tld: 'com' },
        });
      await mutation(
        owner,
        `/domains/${domain.id}/actions`,
        {
          confirmation: name,
          request: {
            kind: 'RENEW',
            sellingAmount: '260000',
            catalogueRevision: currentCatalogue.revision,
            costCeiling: '1100',
            acceptPriceChangeRisk: true,
          },
        },
        201,
      );
      const action = await prisma.domainAction.findFirstOrThrow({
        where: { domainId: domain.id, kind: 'RENEW' },
      });
      expect(action.accountId).toBe(selected.id);
      expect(
        (
          await prisma.invoice.findUniqueOrThrow({
            where: { id: action.invoiceId! },
          })
        ).total,
      ).toBe(260000n);
      await pay({ ...domain, invoiceId: action.invoiceId! }, '260000');
      const renewalUrl = `/domains/${domain.id}/actions/${action.id}/execute`;
      await mutation(owner, renewalUrl, { confirmation: name }, 201);
      await mutation(owner, renewalUrl, { confirmation: name }, 201);
      const renewCalls = wire.mock.calls.filter(
        ([path]) => path === '/api/domains/renew.json',
      );
      expect(renewCalls).toHaveLength(1);
      expect(renewCalls[0][1]['auth-userid']).toBe('32345');
      expect(
        (
          await prisma.domainAction.findUniqueOrThrow({
            where: { id: action.id },
          })
        ).state,
      ).toBe('SUCCEEDED');
      expect(
        (
          await prisma.invoice.findUniqueOrThrow({
            where: { id: domain.invoiceId },
          })
        ).total,
      ).toBe(250000n);
      // Settings checks and operational checks share one account read budget.
      for (let index = 0; index < 3; index++)
        await administration.check(selected.id, 'ordinary-example.com', actor);
      const readCalls = wire.mock.calls.length;
      await expect(
        administration.check(selected.id, 'ordinary-example.com', actor),
      ).rejects.toThrow();
      expect(wire.mock.calls.length).toBe(readCalls);
    } finally {
      wire.mockRestore();
    }
  });
  it('links an existing domain once with no billing or registration and retains client ownership and SQL guards', async () => {
    const fixture = await existingLinkFixture();
    try {
      const before = await existingLinkFinancialCounts();
      await mutation(customer, '/domains/existing-links', fixture.input, 403);
      await mutation(billing, '/domains/existing-links', fixture.input, 403);
      await mutation(unenrolled, '/domains/existing-links', fixture.input, 403);
      await owner
        .post('/domains/existing-links')
        .send(fixture.input)
        .expect(403);
      await mutation(
        owner,
        '/domains/existing-links',
        { ...fixture.input, confirmation: 'wrong.com' },
        400,
      );
      await mutation(
        owner,
        '/domains/existing-links',
        { ...fixture.input, remoteCustomerId: '99999' },
        400,
      );
      expect(fixture.wire).not.toHaveBeenCalled();
      const result = await mutation(
        owner,
        '/domains/existing-links',
        fixture.input,
        201,
      );
      const linked = domainDetailSchema.parse(
        (result.body as Success<unknown>).data,
      );
      expect(linked).toMatchObject({
        origin: 'EXISTING',
        customerId: fixture.input.customerId,
        state: 'REGISTERED',
        invoiceId: null,
        invoiceStatus: null,
        orderId: null,
        sellingAmount: null,
        balanceDue: null,
        registrationYears: null,
        autoRenew: false,
      });
      expect(JSON.stringify(result.body)).not.toMatch(
        /60002|60003|do-not-export|ciphertext|fictionalfictional/,
      );
      const stored = await prisma.domain.findUniqueOrThrow({
        where: { id: linked.id },
      });
      expect(stored.quoteId).toBeNull();
      expect(stored.invoiceId).toBeNull();
      expect(stored.orderItemId).toBeNull();
      expect(stored.linkCredentialId).toBe(fixture.credential.id);
      expect(stored.linkEvidenceCiphertext).not.toContain(
        'registrant@example.test',
      );
      const calls = fixture.wire.mock.calls.length;
      const retry = await mutation(
        owner,
        '/domains/existing-links',
        fixture.input,
        201,
      );
      expect((retry.body as Success<{ id: string }>).data.id).toBe(linked.id);
      expect(fixture.wire.mock.calls.length).toBe(calls);
      await mutation(
        owner,
        '/domains/existing-links',
        { ...fixture.input, submissionKey: randomUUID() },
        409,
      );
      await mutation(
        owner,
        '/domains/existing-links',
        {
          ...fixture.input,
          domainName: 'different.com',
          confirmation: 'different.com',
        },
        409,
      );
      await customer.get(`/domains/${linked.id}`).expect(200);
      await other.get(`/domains/${linked.id}`).expect(403);
      const otherIdentity = (
        (await other.get('/auth/me')).body as Success<
          AuthRequestContext['identity']
        >
      ).data;
      if (otherIdentity.role !== 'CUSTOMER')
        throw new Error('Expected second client');
      await owner
        .get(`/domains/${linked.id}?customerId=${otherIdentity.customerId}`)
        .expect(403);
      await mutation(
        owner,
        `/domains/${linked.id}/approve`,
        {
          confirmation: linked.domainName,
          costCeiling: '1000',
          costCurrency: 'USD',
        },
        409,
      );
      await mutation(
        owner,
        `/domains/${linked.id}/actions`,
        {
          confirmation: linked.domainName,
          request: {
            kind: 'RENEW',
            sellingAmount: '1000',
            costCeiling: '1000',
            acceptPriceChangeRisk: true,
          },
        },
        409,
      );
      await expect(
        prisma.domain.update({
          where: { id: linked.id },
          data: { origin: 'REGISTRATION' },
        }),
      ).rejects.toThrow();
      await expect(
        prisma.domain.update({
          where: { id: linked.id },
          data: { providerOrderId: '99999' },
        }),
      ).rejects.toThrow();
      await expect(
        prisma.domain.update({
          where: { id: linked.id },
          data: { customerId: otherIdentity.customerId },
        }),
      ).rejects.toThrow();
      await expect(
        prisma.domain.delete({ where: { id: linked.id } }),
      ).rejects.toThrow();
      await expect(
        prisma.registrarOperation.create({
          data: {
            domainId: linked.id,
            customerId: fixture.input.customerId,
            accountId: fixture.registrar.id,
            credentialId: fixture.credential.id,
            actorUserId: fixture.actor.identity.userId,
            costCeiling: 1000n,
          },
        }),
      ).rejects.toThrow();
      fixture.foreign();
      await mutation(
        owner,
        `/domains/${linked.id}/actions`,
        {
          confirmation: linked.domainName,
          request: { kind: 'LOCK', locked: false },
        },
        409,
      );
      expect(
        await prisma.domainAction.count({ where: { domainId: linked.id } }),
      ).toBe(0);
      expect(await existingLinkFinancialCounts()).toEqual(before);
      expect(
        await prisma.activityLog.count({
          where: { entityId: linked.id, action: 'EXISTING_DOMAIN_LINKED' },
        }),
      ).toBe(1);
      expect(
        fixture.wire.mock.calls.every(([path]) =>
          [
            '/api/domains/orderid.json',
            '/api/domains/details.json',
            '/api/customers/details-by-id.json',
            '/api/domains/locks.json',
            '/api/contacts/details.json',
          ].includes(path),
        ),
      ).toBe(true);
    } finally {
      fixture.wire.mockRestore();
    }
  });
  it('blocks disabled networking or account, foreign/expired/error evidence and settings changes without linking', async () => {
    for (const mode of [
      'network',
      'disabled',
      'foreign',
      'expired',
      'failure',
      'pause',
      'rotation',
      'client',
      'actor',
    ] as const) {
      const fixture = await existingLinkFixture();
      try {
        const before = await existingLinkFinancialCounts();
        if (mode === 'network') {
          const service = new ExistingDomainLinkService(
            prisma,
            { ...fixture.environment, RESELLBIZ_LIVE_ENABLED: false },
            app.get(DomainAdministrationService),
            app.get(DomainService),
          );
          await expect(
            service.link(fixture.input, fixture.actor),
          ).rejects.toThrow(/networking is disabled/);
          expect(fixture.wire).not.toHaveBeenCalled();
        } else {
          const approving =
            mode === 'actor' ? await account('FULL_ADMINISTRATOR') : owner;
          if (mode === 'actor') {
            const approvingIdentity = (
              (await approving.get('/auth/me').expect(200)).body as Success<
                AuthRequestContext['identity']
              >
            ).data;
            fixture.race(async () => {
              await prisma.user.update({
                where: { id: approvingIdentity.userId },
                data: { deletedAt: new Date() },
              });
            });
          }
          if (mode === 'disabled')
            await prisma.registrarAccount.update({
              where: { id: fixture.registrar.id },
              data: { enabled: false },
            });
          if (mode === 'foreign') fixture.foreign();
          if (mode === 'expired') fixture.expired();
          if (mode === 'failure') fixture.fail();
          if (mode === 'pause')
            fixture.race(async () => {
              await prisma.registrarAccount.update({
                where: { id: fixture.registrar.id },
                data: { enabled: false },
              });
            });
          if (mode === 'rotation')
            fixture.race(async () => {
              await prisma.registrarCredential.create({
                data: {
                  accountId: fixture.registrar.id,
                  version: 2,
                  ciphertext: new RegistrarCipher(
                    fixture.environment.CREDENTIAL_ENCRYPTION_KEY,
                  ).encrypt(
                    credentialBinding(fixture.registrar.id, 2, 'LIVE'),
                    {
                      resellerId: '54321',
                      apiKey: 'rotatedfictional'.repeat(3),
                    },
                  ),
                },
              });
            });
          if (mode === 'client')
            fixture.race(async () => {
              await prisma.customer.update({
                where: { id: fixture.input.customerId },
                data: { status: 'INACTIVE' },
              });
            });
          const result = await mutation(
            approving,
            '/domains/existing-links',
            fixture.input,
            mode === 'actor' ? 403 : 409,
          );
          expect(JSON.stringify(result.body)).not.toContain('confidential');
          if (mode === 'disabled') expect(fixture.wire).not.toHaveBeenCalled();
        }
        expect(
          await prisma.domain.count({
            where: { domainName: fixture.input.domainName },
          }),
        ).toBe(0);
        expect(await existingLinkFinancialCounts()).toEqual(before);
      } finally {
        fixture.wire.mockRestore();
      }
    }
  });
  it('manages a linked domain only after fresh ownership and preserves at-most-once claims without billing', async () => {
    const fixture = await existingLinkFixture();
    try {
      const before = await existingLinkFinancialCounts();
      const result = await mutation(
        owner,
        '/domains/existing-links',
        fixture.input,
        201,
      );
      const linked = domainDetailSchema.parse(
        (result.body as Success<unknown>).data,
      );
      await mutation(
        owner,
        `/domains/${linked.id}/actions`,
        {
          confirmation: linked.domainName,
          request: { kind: 'LOCK', locked: false },
        },
        201,
      );
      const action = await prisma.domainAction.findFirstOrThrow({
        where: { domainId: linked.id },
      });
      await prisma.registrarAccount.update({
        where: { id: fixture.registrar.id },
        data: { enabled: false },
      });
      const callCount = fixture.wire.mock.calls.length;
      await mutation(
        owner,
        `/domains/${linked.id}/actions/${action.id}/execute`,
        { confirmation: linked.domainName },
        409,
      );
      expect(fixture.wire.mock.calls.length).toBe(callCount);
      expect(
        (
          await prisma.domainAction.findUniqueOrThrow({
            where: { id: action.id },
          })
        ).claimedAt,
      ).toBeNull();
      await prisma.registrarAccount.update({
        where: { id: fixture.registrar.id },
        data: { enabled: true },
      });
      fixture.allowLock();
      const url = `/domains/${linked.id}/actions/${action.id}/execute`;
      await mutation(owner, url, { confirmation: linked.domainName }, 201);
      await mutation(owner, url, { confirmation: linked.domainName }, 201);
      expect(
        (
          await prisma.domainAction.findUniqueOrThrow({
            where: { id: action.id },
          })
        ).state,
      ).toBe('SUCCEEDED');
      expect(
        fixture.wire.mock.calls.filter(
          ([path]) => path === '/api/domains/disable-theft-protection.json',
        ),
      ).toHaveLength(1);
      expect(await existingLinkFinancialCounts()).toEqual(before);
      expect(
        fixture.wire.mock.calls.every(
          ([path]) => !/register|renew|signup|add\.json/.test(path),
        ),
      ).toBe(true);
    } finally {
      fixture.wire.mockRestore();
    }
  });

  describe('administrator combined hosting/domain orders', () => {
    it('accepts an admin live quote through HTTP mocks only, retaining disabled-network/account gates', async () => {
      const fixture = await existingLinkFixture();
      try {
        fixture.wire.mockImplementation(async (path, parameters) => {
          await Promise.resolve();
          if (path === '/api/domains/available.json')
            return JSON.stringify({
              [`${String(parameters['domain-name'])}.com`]: {
                status: 'available',
              },
            });
          if (path === '/api/products/reseller-cost-price.json')
            return '{"domcno":{"addnewdomain":{"1":10.99}}}';
          throw new Error('Unexpected registrar path during combined order');
        });
        const administration = app.get(DomainAdministrationService);
        await administration.setDefault(fixture.registrar.id, fixture.actor);
        await prisma.registrarProfile.update({
          where: { accountId: fixture.registrar.id },
          data: { nativeCostConfirmed: true },
        });
        await administration.saveDefaults(
          'dns',
          { nameservers: ['ns1.fictional-host.com', 'ns2.fictional-host.com'] },
          fixture.actor,
        );
        await administration.saveDefaults(
          'policies',
          {
            agreementUrl: 'https://fictional-host.com/agreement',
            customerTermsUrl: 'https://fictional-host.com/terms',
            customerPrivacyUrl: 'https://fictional-host.com/privacy',
          },
          fixture.actor,
        );
        await catalogue(fixture.actor);
        const offers = responseData<
          {
            id: string;
            tld: string;
            selectionConsentRevision: string;
          }[]
        >(await owner.get('/domains/offers').expect(200));
        const offer = offers.find((o) => o.tld === 'com')!;
        const name = `admin-live-${randomUUID()}.com`;
        const quote = responseData<{ id: string }>(
          await mutation(
            owner,
            '/domains/admin/quotes',
            {
              customerId: fixture.input.customerId,
              offerId: offer.id,
              selectionConsentRevision: offer.selectionConsentRevision,
              domainName: name,
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
              agreement: 'resellbiz-registration-v1',
              customerPolicyConsent: true,
              offlineConsent: {
                method: 'WRITTEN',
                reference: 'fictional-live-consent-149',
                consentedAt: new Date().toISOString(),
                attestation: true,
              },
            },
            201,
          ),
        );
        const input = {
          ...(await hostingSelection(fixture.input.customerId, name)),
          domainOrder: {
            mode: 'REGISTRATION',
            quoteId: quote.id,
            sendToRegistrar: true,
          },
        };
        const calls = fixture.wire.mock.calls.length;
        fixture.environment.RESELLBIZ_LIVE_ENABLED = false;
        await mutation(owner, '/orders/admin', input, 409);
        fixture.environment.RESELLBIZ_LIVE_ENABLED = true;
        await prisma.registrarAccount.update({
          where: { id: fixture.registrar.id },
          data: { enabled: false },
        });
        await mutation(owner, '/orders/admin', input, 409);
        await prisma.registrarAccount.update({
          where: { id: fixture.registrar.id },
          data: { enabled: true },
        });
        const result = orderCreationResultSchema.parse(
          responseData(await mutation(owner, '/orders/admin', input, 201)),
        );
        const domain = await prisma.domain.findUniqueOrThrow({
          where: { quoteId: quote.id },
        });
        expect(result.order.total.amount).toBe('309500');
        expect(domain.state).toBe('AWAITING_PAYMENT');
        expect(
          await prisma.registrarOperation.count({
            where: { domainId: domain.id },
          }),
        ).toBe(0);
        expect(fixture.wire.mock.calls.length).toBe(calls);
        expect(
          fixture.wire.mock.calls.every(
            ([path]) =>
              path === '/api/domains/available.json' ||
              path === '/api/products/reseller-cost-price.json',
          ),
        ).toBe(true);
      } finally {
        fixture.environment.RESELLBIZ_LIVE_ENABLED = true;
        fixture.wire.mockRestore();
      }
    });
    async function hostingSelection(
      customerId: string,
      requestedDomain: string,
      setupFee = 500n,
    ) {
      const product = await prisma.product.create({
        data: {
          slug: `admin-combined-${randomUUID()}`,
          name: 'Fictional combined hosting',
          status: 'ACTIVE',
          publicVisible: false,
          hostingPackageIdentifier: 'fictional_package',
          prices: {
            create: {
              billingPeriod: 'MONTHLY',
              currency: 'BDT',
              amount: 120000n,
              setupFee,
              isActive: true,
            },
          },
        },
        include: { prices: true },
      });
      return {
        customerId,
        productId: product.id,
        priceId: product.prices[0].id,
        requestedDomain,
        submissionKey: randomUUID(),
        hostingProvisioningMode: 'PRESERVE_EXISTING' as const,
      };
    }
    async function catalogue(actor: AuthRequestContext) {
      const row = await prisma.domainCatalogueTld.findUnique({
        where: { tld: 'com' },
      });
      await app.get(DomainAdministrationService).saveTld(
        {
          tld: 'com',
          registrationAmount: '189000',
          renewalAmount: null,
          enabled: true,
          featured: false,
          displayOrder: 0,
          preferredRegistrarId: null,
          revision: row?.revision ?? 0,
        },
        actor,
      );
      return prisma.domainCatalogueTld.findUniqueOrThrow({
        where: { tld: 'com' },
      });
    }
    async function linkedSelection(setupFee = 500n) {
      const fixture = await existingLinkFixture();
      const result = await mutation(
        owner,
        '/domains/existing-links',
        fixture.input,
        201,
      );
      const linked = domainDetailSchema.parse(
        (result.body as Success<unknown>).data,
      );
      const tld = await catalogue(fixture.actor);
      if (!tld.registrationPriceId) throw new Error('Expected catalogue price');
      await prisma.registrarAccount.update({
        where: { id: fixture.registrar.id },
        data: { enabled: false },
      });
      fixture.environment.RESELLBIZ_LIVE_ENABLED = false;
      fixture.wire.mockClear();
      const input = {
        ...(await hostingSelection(
          fixture.input.customerId,
          linked.domainName,
          setupFee,
        )),
        domainOrder: {
          mode: 'EXISTING' as const,
          domainId: linked.id,
          priceId: tld.registrationPriceId,
          sendToRegistrar: false as const,
        },
      };
      return { fixture, linked, input, tld };
    }
    it('bills a verified existing domain and hosting once with providers disabled, preserving its history', async () => {
      const { fixture, linked, input } = await linkedSelection();
      try {
        const old = await prisma.domain.findUniqueOrThrow({
          where: { id: linked.id },
        });
        const before = await Promise.all([
          prisma.registrarOperation.count(),
          prisma.domainAction.count(),
          prisma.payment.count(),
          prisma.domainQuote.count(),
        ]);
        const options = await owner
          .get(`/orders/admin/domain-options?customerId=${linked.customerId}`)
          .expect(200);
        expect(
          (
            options.body as Success<{ domains: { id: string }[] }>
          ).data.domains.some((d) => d.id === linked.id),
        ).toBe(true);
        let pendingCreation:
          Promise<Awaited<ReturnType<typeof mutation>>[]> | undefined;
        await prisma.$transaction(
          async (tx) => {
            await tx.$queryRaw`SELECT pg_advisory_xact_lock(510118)::text`;
            pendingCreation = Promise.all([
              mutation(owner, '/orders/admin', input, 201),
              mutation(owner, '/orders/admin', input, 201),
            ]);
            let waiting = false;
            for (let i = 0; i < 100; i++) {
              const locks = await tx.$queryRaw<
                { waiting: number }[]
              >`SELECT COUNT(*)::integer AS waiting FROM pg_locks WHERE locktype='advisory' AND classid=0 AND objid=510118 AND NOT granted`;
              if ((locks[0]?.waiting ?? 0) >= 2) {
                waiting = true;
                break;
              }
              await new Promise<void>((resolve) => setTimeout(resolve, 25));
            }
            expect(waiting).toBe(true);
            // A concurrent ownership-link operation must still be able to take
            // its actor/client locks while this order waits for the catalogue.
            await tx.$queryRaw`SELECT id FROM users WHERE id=${fixture.actor.identity.userId}::uuid FOR UPDATE NOWAIT`;
            await tx.$queryRaw`SELECT u.id FROM users u JOIN customers c ON c.user_id=u.id WHERE c.id=${input.customerId}::uuid FOR UPDATE OF u,c NOWAIT`;
          },
          { timeout: 10000 },
        );
        if (!pendingCreation)
          throw new Error('Expected pending combined order');
        const results = (await pendingCreation).map((response) =>
          orderCreationResultSchema.parse(responseData(response)),
        );
        expect(results.map((result) => result.duplicate).sort()).toEqual([
          false,
          true,
        ]);
        expect(new Set(results.map((result) => result.order.id)).size).toBe(1);
        const result = results.find((result) => !result.duplicate)!;
        expect(result.order.total.amount).toBe('309500');
        expect(result.order.invoice.total.amount).toBe('309500');
        expect(result.order.invoice.status).toBe('UNPAID');
        expect(
          result.order.items.find((i) => i.kind === 'DOMAIN'),
        ).toMatchObject({
          domainAction: 'EXISTING',
          domainId: linked.id,
          billingPeriod: 'ANNUAL',
          unitAmount: { amount: '189000' },
        });
        expect(
          result.order.items.find((i) => i.kind === 'HOSTING')
            ?.hostingProvisioningMode,
        ).toBe('PRESERVE_EXISTING');
        const invoiceId = result.order.invoice.id;
        expect(
          await prisma.invoice.count({ where: { orderId: result.order.id } }),
        ).toBe(1);
        expect(await prisma.invoiceItem.count({ where: { invoiceId } })).toBe(
          3,
        );
        expect(
          await prisma.outboxEvent.count({
            where: { aggregateId: { in: [result.order.id, invoiceId] } },
          }),
        ).toBe(2);
        const replay = orderCreationResultSchema.parse(
          responseData(await mutation(owner, '/orders/admin', input, 201)),
        );
        expect(replay.duplicate).toBe(true);
        expect(replay.order.id).toBe(result.order.id);
        await mutation(
          owner,
          '/orders/admin',
          { ...input, domainOrder: undefined },
          409,
        );
        await mutation(
          owner,
          '/orders/admin',
          {
            ...input,
            domainOrder: { ...input.domainOrder, priceId: randomUUID() },
          },
          409,
        );
        await mutation(
          owner,
          '/orders/admin',
          { ...input, submissionKey: randomUUID() },
          409,
        );
        const current = domainDetailSchema.parse(
          responseData(await customer.get(`/domains/${linked.id}`).expect(200)),
        );
        expect(current).toMatchObject({
          origin: 'EXISTING',
          orderId: null,
          invoiceId: null,
          sellingAmount: null,
          billingOrder: {
            orderId: result.order.id,
            invoiceId,
            sellingAmount: '189000',
            balanceDue: '309500',
            billingPeriod: 'ANNUAL',
          },
        });
        await other.get(`/domains/${linked.id}`).expect(403);
        expect(
          await prisma.domain.findUniqueOrThrow({ where: { id: linked.id } }),
        ).toEqual(old);
        expect(
          await Promise.all([
            prisma.registrarOperation.count(),
            prisma.domainAction.count(),
            prisma.payment.count(),
            prisma.domainQuote.count(),
          ]),
        ).toEqual(before);
        expect(fixture.wire).not.toHaveBeenCalled();
        expect(
          await prisma.$transaction((tx) =>
            orderFulfillmentComplete(tx, result.order.id),
          ),
        ).toBe(false);
        await expect(
          prisma.existingDomainOrder.update({
            where: { domainId: linked.id },
            data: { customerId: randomUUID() },
          }),
        ).rejects.toThrow();
        await expect(
          prisma.existingDomainOrder.delete({ where: { domainId: linked.id } }),
        ).rejects.toThrow();
        const item = result.order.items.find((i) => i.kind === 'DOMAIN')!;
        await expect(
          prisma.orderItem.create({
            data: {
              orderId: result.order.id,
              kind: 'DOMAIN',
              productId: item.productId,
              productPriceId: item.productPriceId,
              productNameSnapshot: 'Fictional orphan',
              billingPeriod: 'ANNUAL',
              currency: 'BDT',
              unitAmount: 1n,
              lineTotal: 1n,
              requestedDomain: linked.domainName,
              provisioningSnapshot: {
                adminDomainAction: 'EXISTING',
                domainRecordId: linked.id,
                sendToRegistrar: false,
              },
            },
          }),
        ).rejects.toThrow();
        await expect(
          prisma.orderItem.update({
            where: { id: item.id },
            data: {
              provisioningSnapshot: {
                adminDomainAction: 'REGISTRATION',
                sendToRegistrar: true,
                domainRecordId: linked.id,
              },
            },
          }),
        ).rejects.toThrow();
        await expect(
          prisma.order.update({
            where: { id: result.order.id },
            data: { status: 'COMPLETED' },
          }),
        ).rejects.toThrow();
        await pay(
          {
            id: linked.id,
            invoiceId,
            orderId: result.order.id,
            domainName: linked.domainName,
            state: 'REGISTERED',
          },
          '309500',
        );
        const server = await prisma.server.create({
          data: {
            name: 'Fictional combined server',
            hostname: `${randomUUID()}.example.test`,
            status: 'ACTIVE',
            adapterKey: 'fake-panel',
          },
        });
        const serviceResult = await mutation(
          owner,
          '/services',
          {
            orderItemId: result.order.items.find((i) => i.kind === 'HOSTING')!
              .id,
            serverId: server.id,
          },
          201,
        );
        const serviceId = (
          serviceResult.body as Success<{ service: { id: string } }>
        ).data.service.id;
        const csrf = responseData<{ csrfToken: string }>(
          await owner.get('/auth/csrf'),
        ).csrfToken;
        await owner
          .patch(`/services/${serviceId}/status`)
          .set('X-CSRF-Token', csrf)
          .send({ status: 'PROVISIONING' })
          .expect(200);
        await owner
          .patch(`/services/${serviceId}/status`)
          .set('X-CSRF-Token', csrf)
          .send({
            status: 'ACTIVE',
            externalAccountId: 'fictional-combined-existing',
            controlPanelUsername: 'fakeexisting',
          })
          .expect(200);
        expect(
          (
            await prisma.order.findUniqueOrThrow({
              where: { id: result.order.id },
            })
          ).status,
        ).toBe('COMPLETED');
        expect(
          await prisma.$transaction((tx) =>
            orderFulfillmentComplete(tx, result.order.id),
          ),
        ).toBe(true);
        expect(fixture.wire).not.toHaveBeenCalled();
        expect(
          await prisma.domain.findUniqueOrThrow({ where: { id: linked.id } }),
        ).toEqual(old);
      } finally {
        fixture.environment.RESELLBIZ_LIVE_ENABLED = true;
        fixture.wire.mockRestore();
      }
    });
    it.each(['success', 'temporary failure', 'uncertain result'] as const)(
      'fulfills a fictional BDT 3,090 existing-domain order safely through the fake panel: %s',
      async (scenario) => {
        const { fixture, linked, input } = await linkedSelection(0n);
        const panel = app.get(FakeHostingPanel);
        const originalCreate = panel.createAccount.bind(panel);
        let accountsCreated = 0;
        const accountIds = new Set<string>();
        const create = jest
          .spyOn(panel, 'createAccount')
          .mockImplementation(async (connection, requested) => {
            expect(requested.hostingProvisioningMode).toBe('PRESERVE_EXISTING');
            const result = await originalCreate(connection, requested);
            if (result.created) accountsCreated++;
            accountIds.add(result.account.externalAccountId);
            if (scenario === 'uncertain result')
              throw new Error('Fictional response lost after account creation');
            return result;
          });
        try {
          const domainBefore = await prisma.domain.findUniqueOrThrow({
            where: { id: linked.id },
          });
          const registrarBefore = await Promise.all([
            prisma.registrarOperation.count(),
            prisma.domainAction.count(),
            prisma.domainQuote.count(),
            prisma.fakeRegistrarRegistration.count(),
          ]);
          const emailLogsBefore = await prisma.emailLog.count();
          const created = orderCreationResultSchema.parse(
            responseData(await mutation(owner, '/orders/admin', input, 201)),
          );
          expect(created.order.status).toBe('AWAITING_PAYMENT');
          expect(created.order.total.amount).toBe('309000');
          expect(created.order.invoice).toMatchObject({
            status: 'UNPAID',
            total: { amount: '309000' },
            balanceDue: { amount: '309000' },
          });
          const orderId = created.order.id;
          const invoiceId = created.order.invoice.id;
          const hostingItem = created.order.items.find(
            (i) => i.kind === 'HOSTING',
          );
          const domainItem = created.order.items.find(
            (i) => i.kind === 'DOMAIN',
          );
          if (!hostingItem || !domainItem)
            throw new Error('Expected both order items');
          expect(hostingItem.hostingProvisioningMode).toBe('PRESERVE_EXISTING');
          expect(domainItem).toMatchObject({
            domainAction: 'EXISTING',
            domainId: linked.id,
          });
          expect(await prisma.invoice.count({ where: { orderId } })).toBe(1);
          const invoiceItems = await prisma.invoiceItem.findMany({
            where: { invoiceId },
            orderBy: { linePosition: 'asc' },
          });
          expect(invoiceItems.map((i) => i.lineTotal)).toEqual([
            120000n,
            189000n,
          ]);
          const orderReplay = orderCreationResultSchema.parse(
            responseData(await mutation(owner, '/orders/admin', input, 201)),
          );
          expect(orderReplay).toMatchObject({
            duplicate: true,
            order: { id: orderId },
          });
          const server = await prisma.server.create({
            data: {
              name: `Fictional flow ${randomUUID()}`,
              hostname: `${randomUUID()}.example.test`,
              status: 'ACTIVE',
              adapterKey: 'fake-panel',
            },
          });
          const serviceInput = {
            orderItemId: hostingItem.id,
            serverId: server.id,
          };
          await mutation(owner, '/services', serviceInput, 422);
          const paymentInput = {
            invoiceId,
            amount: '309000',
            submissionKey: randomUUID(),
            proof: {
              method: 'BANK_TRANSFER',
              reference: `SAMPLE-ONLY-${randomUUID()}`,
              payerName: 'Fictional flow payer',
              note: 'Isolated automated sample; no actual bank credit.',
            },
          };
          const submitted = manualPaymentCreationResultSchema.parse(
            responseData(
              await mutation(
                customer,
                '/payments/manual/customer',
                paymentInput,
                201,
              ),
            ),
          );
          expect(submitted.payment.state).toBe('PENDING');
          await mutation(owner, '/services', serviceInput, 422);
          expect(
            (
              await prisma.invoice.findUniqueOrThrow({
                where: { id: invoiceId },
              })
            ).amountPaid,
          ).toBe(0n);
          const csrf = responseData<{ csrfToken: string }>(
            await owner.get('/auth/csrf').expect(200),
          ).csrfToken;
          await owner
            .patch(`/payments/${submitted.payment.id}/review`)
            .set('X-CSRF-Token', csrf)
            .send({ action: 'VERIFY' })
            .expect(200);
          expect(
            await prisma.invoice.findUniqueOrThrow({
              where: { id: invoiceId },
            }),
          ).toMatchObject({
            status: 'PAID',
            amountPaid: 309000n,
            balanceDue: 0n,
          });
          expect(
            (await prisma.order.findUniqueOrThrow({ where: { id: orderId } }))
              .status,
          ).toBe('PAID');
          expect(
            await prisma.service.count({
              where: { orderItemId: hostingItem.id },
            }),
          ).toBe(0);
          expect(create).not.toHaveBeenCalled();
          const serviceResult = serviceCreationResultSchema.parse(
            responseData(await mutation(owner, '/services', serviceInput, 201)),
          );
          const serviceId = serviceResult.service.id;
          const serviceReplay = serviceCreationResultSchema.parse(
            responseData(await mutation(owner, '/services', serviceInput, 201)),
          );
          expect(serviceReplay).toMatchObject({
            duplicate: true,
            service: { id: serviceId },
          });
          expect(serviceResult.service.status).toBe('PENDING');
          expect(
            (await prisma.order.findUniqueOrThrow({ where: { id: orderId } }))
              .status,
          ).toBe('PROCESSING');
          expect(
            await prisma.$transaction((tx) =>
              orderFulfillmentComplete(tx, orderId),
            ),
          ).toBe(false);
          const operationPath = `/hosting-panel/services/${serviceId}/operations`;
          const operationInput = {
            type: 'CREATE_ACCOUNT',
            submissionKey: randomUUID(),
          };
          await mutation(customer, operationPath, operationInput, 403);
          if (scenario === 'temporary failure')
            panel.failNext('TEMPORARY', 'FAKE_FLOW_BUSY');
          const first = hostingPanelOperationResultSchema.parse(
            responseData(
              await mutation(owner, operationPath, operationInput, 201),
            ),
          );
          let completed = first;
          const firstReplay = hostingPanelOperationResultSchema.parse(
            responseData(
              await mutation(owner, operationPath, operationInput, 201),
            ),
          );
          expect(firstReplay).toMatchObject({
            duplicate: true,
            operation: { id: first.operation.id },
          });
          expect(create).toHaveBeenCalledTimes(1);
          if (scenario !== 'success') {
            expect(first.operation).toMatchObject({
              status:
                scenario === 'temporary failure' ? 'FAILED' : 'INCONSISTENT',
              retryable: scenario === 'temporary failure',
            });
            expect(
              (
                await prisma.service.findUniqueOrThrow({
                  where: { id: serviceId },
                })
              ).status,
            ).toBe('PROVISION_FAILED');
            expect(
              (await prisma.order.findUniqueOrThrow({ where: { id: orderId } }))
                .status,
            ).toBe('PROCESSING');
            expect(
              await prisma.$transaction((tx) =>
                orderFulfillmentComplete(tx, orderId),
              ),
            ).toBe(false);
            // A fresh key must not bypass the bounded retry or uncertain-result hold.
            await mutation(
              owner,
              operationPath,
              { ...operationInput, submissionKey: randomUUID() },
              422,
            );
            expect(create).toHaveBeenCalledTimes(1);
            const retryPath = `/hosting-panel/operations/${first.operation.id}/retry`;
            const retryInput = { submissionKey: randomUUID() };
            if (scenario === 'temporary failure') {
              expect(accountsCreated).toBe(0);
              completed = hostingPanelOperationResultSchema.parse(
                responseData(await mutation(owner, retryPath, retryInput, 201)),
              );
              expect(completed.operation).toMatchObject({
                status: 'SUCCEEDED',
                attemptNumber: 2,
                retryOfOperationId: first.operation.id,
              });
              const retryReplay = hostingPanelOperationResultSchema.parse(
                responseData(await mutation(owner, retryPath, retryInput, 201)),
              );
              expect(retryReplay).toMatchObject({
                duplicate: true,
                operation: { id: completed.operation.id },
              });
              await mutation(
                owner,
                retryPath,
                { submissionKey: randomUUID() },
                409,
              );
              expect(
                await prisma.hostingPanelOperation.count({
                  where: { retryOfOperationId: first.operation.id },
                }),
              ).toBe(1);
              expect(create).toHaveBeenCalledTimes(2);
            } else {
              await mutation(owner, retryPath, retryInput, 422);
              expect(create).toHaveBeenCalledTimes(1);
            }
          }
          expect(accountsCreated).toBe(1);
          expect(accountIds.size).toBe(1);
          const service = await prisma.service.findUniqueOrThrow({
            where: { id: serviceId },
          });
          if (scenario === 'uncertain result') {
            expect(service.status).toBe('PROVISION_FAILED');
            expect(service.externalAccountId).toBeNull();
            expect(
              (await prisma.order.findUniqueOrThrow({ where: { id: orderId } }))
                .status,
            ).toBe('PROCESSING');
          } else {
            expect(completed.operation.status).toBe('SUCCEEDED');
            expect(service.status).toBe('ACTIVE');
            expect(service.externalAccountId).toBe(
              completed.operation.account?.externalAccountId,
            );
            expect(accountIds.has(service.externalAccountId ?? '')).toBe(true);
            expect(
              (await prisma.order.findUniqueOrThrow({ where: { id: orderId } }))
                .status,
            ).toBe('COMPLETED');
            expect(
              await prisma.$transaction((tx) =>
                orderFulfillmentComplete(tx, orderId),
              ),
            ).toBe(true);
          }
          expect(
            await prisma.service.count({
              where: { orderItemId: hostingItem.id },
            }),
          ).toBe(1);
          expect(await prisma.payment.count({ where: { invoiceId } })).toBe(1);
          const billingLink =
            await prisma.existingDomainOrder.findUniqueOrThrow({
              where: { domainId: linked.id },
            });
          expect(billingLink).toMatchObject({
            orderItemId: domainItem.id,
            invoiceId,
            customerId: input.customerId,
          });
          expect(
            await prisma.domain.findUniqueOrThrow({ where: { id: linked.id } }),
          ).toEqual(domainBefore);
          expect(
            await Promise.all([
              prisma.registrarOperation.count(),
              prisma.domainAction.count(),
              prisma.domainQuote.count(),
              prisma.fakeRegistrarRegistration.count(),
            ]),
          ).toEqual(registrarBefore);
          expect(fixture.wire).not.toHaveBeenCalled();
          const events = await prisma.outboxEvent.findMany({
            where: {
              aggregateId: {
                in: [orderId, invoiceId, submitted.payment.id, serviceId],
              },
            },
          });
          expect(events.map((e) => e.eventType).sort()).toEqual(
            [
              'EMAIL_ORDER_RECEIVED',
              'EMAIL_INVOICE_CREATED',
              'EMAIL_PAYMENT_RECEIVED',
              ...(scenario === 'uncertain result'
                ? []
                : ['EMAIL_SERVICE_PROVISIONED']),
            ].sort(),
          );
          expect(
            events.every((e) => e.status === 'PENDING' && e.attemptCount === 0),
          ).toBe(true);
          expect(await prisma.emailLog.count()).toBe(emailLogsBefore);
        } finally {
          create.mockRestore();
          fixture.environment.RESELLBIZ_LIVE_ENABLED = true;
          fixture.wire.mockRestore();
        }
      },
    );

    it('rejects cross-client, unverified, invalid-price and unauthorized requests atomically and serializes competing orders', async () => {
      const { fixture, linked, input } = await linkedSelection();
      try {
        const before = await existingLinkFinancialCounts();
        await request(app.getHttpServer())
          .get(`/orders/admin/domain-options?customerId=${linked.customerId}`)
          .expect(401);
        await customer
          .get(`/orders/admin/domain-options?customerId=${linked.customerId}`)
          .expect(403);
        await billing
          .get(`/orders/admin/domain-options?customerId=${linked.customerId}`)
          .expect(403);
        await unenrolled
          .get(`/orders/admin/domain-options?customerId=${linked.customerId}`)
          .expect(403);
        await mutation(billing, '/orders/admin', input, 403);
        await mutation(unenrolled, '/orders/admin', input, 403);
        await mutation(
          owner,
          '/orders/admin',
          {
            ...input,
            domainOrder: { ...input.domainOrder, sendToRegistrar: true },
          },
          400,
        );
        await mutation(
          owner,
          '/orders/admin',
          { ...input, domainOrder: { ...input.domainOrder, amount: '1' } },
          400,
        );
        const otherId = responseData<{ customerId: string }>(
          await other.get('/auth/me'),
        ).customerId;
        await mutation(
          owner,
          '/orders/admin',
          { ...input, customerId: otherId },
          409,
        );
        await mutation(
          owner,
          '/orders/admin',
          { ...input, requestedDomain: 'another-fictional.com' },
          409,
        );
        await mutation(
          owner,
          '/orders/admin',
          {
            ...input,
            domainOrder: { ...input.domainOrder, priceId: randomUUID() },
          },
          409,
        );
        const client = await prisma.customer.findUniqueOrThrow({
          where: { id: linked.customerId },
        });
        await prisma.user.update({
          where: { id: client.userId },
          data: { emailVerifiedAt: null },
        });
        await mutation(owner, '/orders/admin', input, 422);
        await prisma.user.update({
          where: { id: client.userId },
          data: { emailVerifiedAt: new Date() },
        });
        const originalDomain = await prisma.domain.findUniqueOrThrow({
          where: { id: linked.id },
        });
        await prisma.domain.update({
          where: { id: linked.id },
          data: { expiresAt: new Date('2020-01-01') },
        });
        await mutation(owner, '/orders/admin', input, 409);
        await prisma.domain.update({
          where: { id: linked.id },
          data: { expiresAt: originalDomain.expiresAt },
        });
        const replacement = await catalogue(fixture.actor);
        await mutation(owner, '/orders/admin', input, 409);
        input.domainOrder.priceId = replacement.registrationPriceId!;
        expect(await existingLinkFinancialCounts()).toEqual(before);
        const responses = await Promise.all([
          mutation(owner, '/orders/admin', input, [201, 409]),
          mutation(
            owner,
            '/orders/admin',
            { ...input, submissionKey: randomUUID() },
            [201, 409],
          ),
        ]);
        expect(responses.map((r) => r.status).sort()).toEqual([201, 409]);
        expect(
          await prisma.existingDomainOrder.count({
            where: { domainId: linked.id },
          }),
        ).toBe(1);
        expect(fixture.wire).not.toHaveBeenCalled();
      } finally {
        fixture.environment.RESELLBIZ_LIVE_ENABLED = true;
        fixture.wire.mockRestore();
      }
    });
    it('creates a registration intent without dispatch and keeps payment and separate approval mandatory', async () => {
      const identity = responseData<{
        customerId: string;
      }>(await customer.get('/auth/me'));
      const actor = {
        identity: responseData<AuthRequestContext['identity']>(
          await owner.get('/auth/me'),
        ),
      } as AuthRequestContext;
      await catalogue(actor);
      const fake = await prisma.registrarAccount.findFirstOrThrow({
        where: { mode: 'FAKE' },
      });
      await prisma.registrarAccount.update({
        where: { id: fake.id },
        data: { enabled: true },
      });
      await app.get(DomainAdministrationService).setDefault(fake.id, actor);
      await app
        .get(DomainAdministrationService)
        .saveDefaults(
          'dns',
          { nameservers: ['ns1.fictional-host.com', 'ns2.fictional-host.com'] },
          actor,
        );
      await app.get(DomainAdministrationService).saveDefaults(
        'policies',
        {
          agreementUrl: 'https://fictional-host.com/agreement',
          customerTermsUrl: 'https://fictional-host.com/terms',
          customerPrivacyUrl: 'https://fictional-host.com/privacy',
        },
        actor,
      );
      const offers = responseData<
        {
          id: string;
          tld: string;
          selectionConsentRevision?: string;
        }[]
      >(await customer.get('/domains/offers'));
      const offer = offers.find((o) => o.tld === 'com')!;
      const name = `admin-registration-${randomUUID()}.com`;
      const quoted = await mutation(
        owner,
        '/domains/admin/quotes',
        {
          customerId: identity.customerId,
          offerId: offer.id,
          domainName: name,
          selectionConsentRevision: offer.selectionConsentRevision,
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
          offlineConsent: {
            method: 'PHONE',
            reference: 'fictional-consent-149',
            consentedAt: new Date().toISOString(),
            attestation: true,
          },
        },
        201,
      );
      const quoteId = (quoted.body as Success<{ id: string }>).data.id;
      const input = {
        ...(await hostingSelection(identity.customerId, name)),
        domainOrder: { mode: 'REGISTRATION', quoteId, sendToRegistrar: true },
      };
      const before = await prisma.registrarOperation.count();
      const result = orderCreationResultSchema.parse(
        responseData(await mutation(owner, '/orders/admin', input, 201)),
      );
      expect(result.order.total.amount).toBe('309500');
      const domain = await prisma.domain.findUniqueOrThrow({
        where: { quoteId },
      });
      expect(domain.state).toBe('AWAITING_PAYMENT');
      expect(result.order.items.find((i) => i.kind === 'DOMAIN')).toMatchObject(
        { domainAction: 'REGISTRATION', domainId: domain.id },
      );
      const details = {
        id: domain.id,
        invoiceId: result.order.invoice.id,
        orderId: result.order.id,
        domainName: name,
        state: domain.state,
      };
      const approval = {
        confirmation: name,
        costCeiling: '1000',
        costCurrency: 'USD',
        registrarAccountId: fake.id,
      };
      await mutation(owner, `/domains/${domain.id}/approve`, approval, 409);
      expect(await prisma.registrarOperation.count()).toBe(before);
      expect(
        orderCreationResultSchema.parse(
          responseData(await mutation(owner, '/orders/admin', input, 201)),
        ).duplicate,
      ).toBe(true);
      await mutation(
        owner,
        '/orders/admin',
        { ...input, domainOrder: undefined },
        409,
      );
      await prisma.product.update({
        where: { id: input.productId },
        data: { publicVisible: true },
      });
      await mutation(
        customer,
        '/orders/checkout',
        {
          productId: input.productId,
          priceId: input.priceId,
          requestedDomain: name,
          submissionKey: randomUUID(),
          domainQuoteId: quoteId,
        },
        409,
      );
      await pay(details, '309500');
      expect(await prisma.registrarOperation.count()).toBe(before);
      await mutation(owner, `/domains/${domain.id}/approve`, approval, 201);
      expect(await prisma.registrarOperation.count()).toBe(before + 1);
      expect(
        await prisma.$transaction((tx) =>
          orderFulfillmentComplete(tx, result.order.id),
        ),
      ).toBe(false);
    });
  });
});
