import {
  RegistrarCipher,
  credentialBinding,
} from '@webhost-billing/database/registrar';
import { DomainRenewalExecutionService } from '../src/modules/domains/domain-renewal-execution.service';
import { DomainRenewalProcessor } from '@webhost-billing/database/registrar';
import { DomainRenewalBilling } from '../../worker/src/renewal/domain-renewal-billing';
import { DomainRenewalsService } from '../src/modules/domains/domain-renewals.service';
import {
  DEFAULT_RENEWAL_AUTOMATION_POLICY,
  type BackgroundJobData,
} from '@webhost-billing/shared';
import { randomUUID } from 'node:crypto';
import { Test, type TestingModule } from '@nestjs/testing';
import {
  parseApiEnvironment,
  type ApiEnvironment,
} from '@webhost-billing/config';
import { type PrismaClient } from '@webhost-billing/database';
import {
  FakeDomainRegistrar,
  RegistrarProcessor,
} from '@webhost-billing/database/registrar';
import { AppModule } from '../src/app.module';
import { API_ENVIRONMENT } from '../src/infrastructure/environment/environment.module';
import { PRISMA_CLIENT } from '../src/infrastructure/database/database.module';
import type { AuthRequestContext } from '../src/modules/auth/auth.types';
import { TotpService } from '../src/modules/auth/services/totp.service';
import { PaymentService } from '../src/modules/payments/payment.service';
import { DomainService } from '../src/modules/domains/domain.service';
import { DomainFactsService } from '../src/modules/domains/domain-facts.service';

jest.setTimeout(60_000);

describe('Command 215 paid domain renewal execution', () => {
  let module: TestingModule;
  let prisma: PrismaClient;
  let service: DomainFactsService;
  let domains: DomainService;
  let environment: ApiEnvironment;
  let admin: AuthRequestContext;
  let customer: AuthRequestContext;
  let offerId: string;
  const prepared: Array<Awaited<ReturnType<typeof fixture>>> = [];
  beforeAll(async () => {
    environment = parseApiEnvironment({
      ...process.env,
      PORT: '3001',
      NODE_ENV: 'test',
      RESELLBIZ_LIVE_ENABLED: 'false',
      REGISTRAR_DOMAIN_SYNC_LIVE_ENABLED: 'false',
    });
    module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(API_ENVIRONMENT)
      .useValue(environment)
      .compile();
    await module.init();
    prisma = module.get(PRISMA_CLIENT);
    service = module.get(DomainFactsService);
    domains = module.get(DomainService);
    const totp = module.get(TotpService);
    const owner = await prisma.user.create({
      data: {
        email: `facts-admin-${randomUUID()}@example.test`,
        role: 'ADMIN',
        status: 'ACTIVE',
        emailVerifiedAt: new Date(),
        adminProfile: {
          create: {
            displayName: 'Fictional facts administrator',
            staffRole: 'FULL_ADMINISTRATOR',
          },
        },
        adminTotpCredential: {
          create: {
            secretCiphertext: totp.encryptSecret(totp.generateSecret()),
            keyVersion: 'mfa-v1',
            createdAt: new Date(),
            enabledAt: new Date(),
          },
        },
      },
      include: { adminProfile: true },
    });
    const buyer = await prisma.user.create({
      data: {
        email: `facts-buyer-${randomUUID()}@example.test`,
        role: 'CUSTOMER',
        status: 'ACTIVE',
        emailVerifiedAt: new Date(),
        customer: {
          create: {
            customerNumber: `FACT-${randomUUID().slice(0, 20)}`,
            firstName: 'Fictional',
            lastName: 'Registrant',
            addressLine1: '213 Test Road',
            city: 'Dhaka',
            countryCode: 'BD',
          },
        },
      },
      include: { customer: true },
    });
    admin = {
      sessionId: randomUUID(),
      identity: {
        role: 'ADMIN',
        userId: owner.id,
        email: owner.email,
        adminProfileId: owner.adminProfile!.id,
        staffRole: 'FULL_ADMINISTRATOR',
        twoFactorEnabled: true,
      },
    };
    customer = {
      sessionId: randomUUID(),
      identity: {
        role: 'CUSTOMER',
        userId: buyer.id,
        email: buyer.email,
        customerId: buyer.customer!.id,
      },
    };
    await domains.setup('150000', admin);
    offerId = (await domains.offers()).find((row) => row.tld === 'com')!.id;
    const sourceOffer = await prisma.domainOffer.findUniqueOrThrow({
      where: { id: offerId },
    });
    const sourceCredential = await prisma.registrarCredential.findFirstOrThrow({
      where: { accountId: sourceOffer.accountId },
    });
    const cipher = new RegistrarCipher(environment.CREDENTIAL_ENCRYPTION_KEY);
    const credentialPayload = cipher.decrypt(
      credentialBinding(
        sourceOffer.accountId,
        sourceCredential.version,
        'FAKE',
      ),
      sourceCredential.ciphertext,
    );
    for (let index = 0; index < 12; index += 1) {
      if (index === 6) {
        const alternate = await prisma.user.create({
          data: {
            email: `renewal-buyer-${randomUUID()}@example.test`,
            role: 'CUSTOMER',
            status: 'ACTIVE',
            emailVerifiedAt: new Date(),
            customer: {
              create: {
                customerNumber: `REN-${randomUUID().slice(0, 20)}`,
                firstName: 'Fictional',
                lastName: 'Second registrant',
                addressLine1: '215 Test Road',
                city: 'Dhaka',
                countryCode: 'BD',
              },
            },
          },
          include: { customer: true },
        });
        customer = {
          sessionId: randomUUID(),
          identity: {
            role: 'CUSTOMER',
            userId: alternate.id,
            email: alternate.email,
            customerId: alternate.customer!.id,
          },
        };
      }
      const account = await prisma.registrarAccount.create({
        data: { enabled: true, mode: 'FAKE' },
      });
      await prisma.registrarCredential.create({
        data: {
          accountId: account.id,
          version: 1,
          ciphertext: cipher.encrypt(
            credentialBinding(account.id, 1, 'FAKE'),
            credentialPayload,
          ),
        },
      });
      const offer = await prisma.domainOffer.create({
        data: {
          accountId: account.id,
          productId: sourceOffer.productId,
          priceId: sourceOffer.priceId,
          tld: 'com',
          nameservers: ['ns1.example.test', 'ns2.example.test'],
        },
      });
      offerId = offer.id;
      prepared.push(await fixture());
    }
    const offer = await prisma.domainOffer.findUniqueOrThrow({
      where: { id: offerId },
    });
    await prisma.domainCatalogueTld.create({
      data: {
        tld: 'com',
        productId: offer.productId,
        renewalAmount: 170000n,
        enabled: false,
      },
    });
  });
  afterEach(() => jest.restoreAllMocks());
  afterAll(async () => module?.close());
  async function fixture() {
    const quote = await domains.quote(
      {
        offerId,
        domainName: `facts-${randomUUID()}.com`,
        contact: {
          name: 'Fictional registrant',
          company: 'Fictional company',
          address: '213 Test Road',
          city: 'Dhaka',
          region: 'Dhaka',
          postalCode: '1212',
          country: 'BD',
          email: 'facts@example.test',
          phoneCountryCode: '880',
          phone: '1700000000',
        },
        agreement: 'fictional-registration-v1',
        consent: true,
      },
      customer,
    );
    const bought = await domains.purchase(
      { quoteId: quote.id, submissionKey: randomUUID() },
      customer,
    );
    await module.get(PaymentService).recordManual(
      {
        invoiceId: bought.invoiceId!,
        amount: '150000',
        submissionKey: randomUUID(),
        proof: {
          method: 'BANK_TRANSFER',
          reference: `FICTIONAL-213-${randomUUID()}`,
        },
      },
      admin,
      { ipAddressHash: 'fictional' },
    );
    await domains.approve(
      bought.id,
      {
        confirmation: bought.domainName,
        costCeiling: '1000',
        costCurrency: 'USD',
      },
      admin,
    );
    const op = await prisma.registrarOperation.findUniqueOrThrow({
      where: { domainId: bought.id },
    });
    await new RegistrarProcessor(
      prisma,
      environment.CREDENTIAL_ENCRYPTION_KEY,
    ).process(op.id);
    const domain = await prisma.domain.findUniqueOrThrow({
      where: { id: bought.id },
    });
    expect(domain.state).toBe('REGISTERED');
    const sync = (key = randomUUID()) =>
      service.synchronize(
        domain.id,
        { submissionKey: key, confirmation: domain.domainName },
        admin,
      );
    return { domain, sync, owner: customer };
  }
  function advance(ms = 20_000) {
    jest.spyOn(Date, 'now').mockReturnValue(Date.now() + ms);
  }

  const policy = DEFAULT_RENEWAL_AUTOMATION_POLICY;
  const billing = () => new DomainRenewalBilling(prisma);
  const preferences = () => module.get(DomainRenewalsService);
  async function eligible(days = 14) {
    const f = prepared.shift();
    if (!f) throw new Error('Missing fictional registration fixture');
    customer = f.owner;
    const expiry = new Date(Date.now() + days * 86_400_000);
    await prisma.fakeRegistrarRegistration.update({
      where: { id: f.domain.providerOrderId! },
      data: { expiresAt: expiry },
    });
    const checked = await f.sync();
    if (checked.canReview)
      await service.review(
        f.domain.id,
        checked.attemptId!,
        {
          confirmation: f.domain.domainName,
          reason: 'Correct fictional paid-period expiry.',
        },
        admin,
      );
    return {
      ...f,
      domain: await prisma.domain.findUniqueOrThrow({
        where: { id: f.domain.id },
      }),
    };
  }
  async function configure(
    f: Awaited<ReturnType<typeof eligible>>,
    enabled = true,
  ) {
    const view = await preferences().view(f.domain.id, admin);
    return preferences().update(
      f.domain.id,
      {
        confirmation: f.domain.domainName,
        expectedRevision: view.revision,
        enabled,
        years: 1,
        sellingAmount: view.suggestedAmount!,
        catalogueRevision: view.catalogueRevision!,
        ordinaryRenewalConfirmed: true,
        reason: 'Fictional ordinary renewal; application owns billing.',
      },
      admin,
      true,
    );
  }
  async function fresh(f: Awaited<ReturnType<typeof eligible>>) {
    expect((await f.sync()).outcome).toBe('SUCCEEDED');
  }
  const record = (id: string) =>
    prisma.domainRenewalInvoice.findFirstOrThrow({ where: { domainId: id } });
  function job(event: {
    id: string;
    aggregateType: string;
    aggregateId: string;
    eventType: string;
  }): BackgroundJobData {
    return {
      schemaVersion: 1,
      outboxEventId: event.id,
      aggregateType: event.aggregateType,
      aggregateId: event.aggregateId,
      eventType: event.eventType,
      correlationId: event.id,
    };
  }
  const execute = () => module.get(DomainRenewalExecutionService);
  const processor = () =>
    new DomainRenewalProcessor(prisma, environment.CREDENTIAL_ENCRYPTION_KEY, {
      simulationAllowed: true,
      liveAllowed: false,
      liveReadAllowed: false,
    });
  async function purchase(paid = true) {
    const f = await eligible();
    await configure(f);
    await billing().process(new Date(Date.now()), policy);
    const renewal = await record(f.domain.id);
    if (paid) await pay(renewal.invoiceId);
    return { ...f, renewal };
  }
  async function pay(invoiceId: string) {
    await module.get(PaymentService).recordManual(
      {
        invoiceId,
        amount: '170000',
        submissionKey: randomUUID(),
        proof: {
          method: 'BANK_TRANSFER',
          reference: `FICTIONAL-215-${randomUUID()}`,
        },
      },
      admin,
      { ipAddressHash: 'fictional' },
    );
    return prisma.payment.findFirstOrThrow({
      where: { invoiceId, kind: 'CHARGE', status: 'SUCCEEDED' },
    });
  }
  function approval(
    f: Awaited<ReturnType<typeof purchase>>,
    key = randomUUID(),
  ) {
    return {
      submissionKey: key,
      invoiceId: f.renewal.invoiceId,
      confirmation: f.domain.domainName,
      years: 1 as const,
      costCeiling: '1000',
      costCurrency: 'USD' as const,
      approved: true as const,
      reason: 'Fictional verified one-year renewal; USD ceiling approved.',
    };
  }
  async function approve(f: Awaited<ReturnType<typeof purchase>>) {
    const input = approval(f);
    await execute().approve(f.domain.id, input, admin);
    return {
      input,
      op: await prisma.domainRenewalOperation.findUniqueOrThrow({
        where: { id: input.submissionKey },
      }),
    };
  }
  async function eventFor(id: string, type = 'DOMAIN_RENEWAL_REQUESTED') {
    const event = await prisma.outboxEvent.findFirstOrThrow({
      where: { aggregateId: id, eventType: type },
      orderBy: { createdAt: 'desc' },
    });
    await prisma.outboxEvent.update({
      where: { id: event.id },
      data: { status: 'PUBLISHED', publishedAt: new Date(Date.now()) },
    });
    return job(event);
  }
  async function reconcile(
    f: Awaited<ReturnType<typeof purchase>>,
    id: string,
  ) {
    await execute().reconcile(
      f.domain.id,
      id,
      {
        submissionKey: randomUUID(),
        confirmation: f.domain.domainName,
        reason: 'Read-only fictional renewal recovery.',
      },
      admin,
    );
    await processor().process(await eventFor(id, 'DOMAIN_RENEWAL_RECONCILE'));
  }
  it('requires verified payment and full administrator approval and rejects foreign invoice/support/customer requests', async () => {
    const f = await purchase(false);
    const input = approval(f);
    await expect(
      execute().approve(f.domain.id, input, admin),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      execute().approve(f.domain.id, input, customer),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      execute().approve(f.domain.id, input, {
        ...admin,
        supportAdministratorId: admin.identity.userId,
      }),
    ).rejects.toMatchObject({ status: 403 });
    await pay(f.renewal.invoiceId);
    await expect(
      execute().approve(
        f.domain.id,
        { ...input, invoiceId: f.domain.invoiceId! },
        admin,
      ),
    ).rejects.toMatchObject({ status: 409 });
    expect((await preferences().view(f.domain.id, customer)).canApprove).toBe(
      false,
    );
    expect(
      await prisma.domainRenewalOperation.count({
        where: { domainId: f.domain.id },
      }),
    ).toBe(0);
  });
  it('renews once under duplicate approvals/jobs and shows synchronized expiry while preserving the paid invoice', async () => {
    const f = await purchase();
    const input = approval(f);
    const before = await prisma.invoice.findUniqueOrThrow({
      where: { id: f.renewal.invoiceId },
      include: { items: true, payments: true },
    });
    await Promise.all([
      execute().approve(f.domain.id, input, admin),
      execute().approve(f.domain.id, input, admin),
    ]);
    const event = await eventFor(input.submissionKey);
    await Promise.all([processor().process(event), processor().process(event)]);
    await processor().process(event);
    expect(
      await prisma.fakeRegistrarRenewal.count({
        where: { operationId: input.submissionKey },
      }),
    ).toBe(1);
    const result = await preferences().view(f.domain.id, customer);
    expect(result.execution).toMatchObject({
      status: 'SUCCEEDED',
      expiryAfter: f.renewal.termEnd.toISOString(),
      financialReviewRequired: false,
    });
    expect((await service.stored(f.domain.id, customer)).expiresAt).toBe(
      f.renewal.termEnd.toISOString(),
    );
    expect(
      await prisma.invoice.findUniqueOrThrow({
        where: { id: f.renewal.invoiceId },
        include: { items: true, payments: true },
      }),
    ).toEqual(before);
    await expect(
      execute().approve(f.domain.id, approval(f), admin),
    ).rejects.toMatchObject({ status: 409 });
    advance(365 * 86_400_000);
    await fresh(f);
    await billing().process(new Date(Date.now()), policy);
    expect(
      await prisma.domainRenewalInvoice.count({
        where: { domainId: f.domain.id },
      }),
    ).toBe(2);
  });
  it('reconciles a lost reply after a possible purchase without repeating the chargeable call', async () => {
    const f = await purchase();
    const { op } = await approve(f);
    const underlying = new FakeDomainRegistrar(prisma);
    const realRenew = underlying.renewDomain.bind(underlying);
    const realRead = underlying.readDomainFacts.bind(underlying);
    let unavailable = false;
    const renew = jest
      .spyOn(FakeDomainRegistrar.prototype, 'renewDomain')
      .mockImplementation(async function (
        this: FakeDomainRegistrar,
        intent,
        claim,
      ) {
        await realRenew(intent, claim);
        unavailable = true;
        throw new Error('SECRET-LOST-REPLY');
      });
    jest
      .spyOn(FakeDomainRegistrar.prototype, 'readDomainFacts')
      .mockImplementation(function (this: FakeDomainRegistrar, ref) {
        if (unavailable) return Promise.reject(new Error('SECRET-READ-ERROR'));
        return realRead(ref);
      });
    await processor().process(await eventFor(op.id));
    expect(
      await prisma.domainRenewalOperation.findUniqueOrThrow({
        where: { id: op.id },
      }),
    ).toMatchObject({ status: 'NEEDS_RECONCILIATION' });
    expect(
      (await prisma.domain.findUniqueOrThrow({ where: { id: f.domain.id } }))
        .expiresAt,
    ).toEqual(f.renewal.termStart);
    await expect(
      execute().approve(f.domain.id, approval(f), admin),
    ).rejects.toMatchObject({ status: 409 });
    unavailable = false;
    advance(31_000);
    await reconcile(f, op.id);
    expect(
      (await preferences().view(f.domain.id, admin)).execution?.status,
    ).toBe('SUCCEEDED');
    expect(renew).toHaveBeenCalledTimes(1);
    expect(
      await prisma.fakeRegistrarRenewal.count({
        where: { operationId: op.id },
      }),
    ).toBe(1);
    expect(
      JSON.stringify(await preferences().view(f.domain.id, customer)),
    ).not.toContain('SECRET');
  });
  it('retains explicit pre-submission rejection and permits a newly approved bounded retry', async () => {
    const f = await purchase();
    const first = await approve(f);
    const quote = jest
      .spyOn(FakeDomainRegistrar.prototype, 'renewalQuote')
      .mockResolvedValue({
        costAmount: 1000n,
        costCurrency: 'USD',
        balance: 'SUFFICIENT',
        rejectionCode: 'PROVIDER_REJECTED',
      });
    await processor().process(await eventFor(first.op.id));
    expect(
      await prisma.domainRenewalOperation.findUniqueOrThrow({
        where: { id: first.op.id },
      }),
    ).toMatchObject({
      status: 'REJECTED',
      submittedAt: null,
      code: 'PROVIDER_REJECTED',
    });
    quote.mockRestore();
    const retry = await approve(f);
    await processor().process(await eventFor(retry.op.id));
    expect(retry.op.attempt).toBe(2);
    expect(
      (await preferences().view(f.domain.id, admin)).execution?.status,
    ).toBe('SUCCEEDED');
    expect(
      await prisma.fakeRegistrarRenewal.count({
        where: { registrationId: f.domain.providerOrderId! },
      }),
    ).toBe(1);
  });
  it('holds insufficient provider balance and a changed native cost before submission', async () => {
    const f = await purchase();
    const first = await approve(f);
    const quote = jest
      .spyOn(FakeDomainRegistrar.prototype, 'renewalQuote')
      .mockResolvedValue({
        costAmount: 1000n,
        costCurrency: 'USD',
        balance: 'INSUFFICIENT',
      });
    await processor().process(await eventFor(first.op.id));
    expect(
      (await preferences().view(f.domain.id, admin)).execution,
    ).toMatchObject({
      status: 'REJECTED',
      submittedAt: null,
      code: 'INSUFFICIENT_PROVIDER_BALANCE',
    });
    quote.mockResolvedValue({
      costAmount: 1100n,
      costCurrency: 'USD',
      balance: 'SUFFICIENT',
    });
    const retry = await approve(f);
    await processor().process(await eventFor(retry.op.id));
    expect((await preferences().view(f.domain.id, admin)).execution?.code).toBe(
      'COST_LIMIT_EXCEEDED',
    );
    expect(
      await prisma.fakeRegistrarRenewal.count({
        where: { registrationId: f.domain.providerOrderId! },
      }),
    ).toBe(0);
  });
  it('never resubmits an uncertain pending renewal even when a later read still shows the original expiry', async () => {
    const f = await purchase();
    const { op } = await approve(f);
    const renew = jest
      .spyOn(FakeDomainRegistrar.prototype, 'renewDomain')
      .mockImplementation(async (_intent, claim) => {
        await claim();
        throw new Error('Pending provider response.');
      });
    await processor().process(await eventFor(op.id));
    advance(31_000);
    await reconcile(f, op.id);
    expect(
      (await preferences().view(f.domain.id, admin)).execution?.status,
    ).toBe('NEEDS_RECONCILIATION');
    expect(renew).toHaveBeenCalledTimes(1);
    await prisma.domainRenewalOperation.update({
      where: { id: op.id },
      data: { readCount: 10 },
    });
    expect((await preferences().view(f.domain.id, admin)).canReconcile).toBe(
      false,
    );
    expect(
      (
        await prisma.invoice.findUniqueOrThrow({
          where: { id: f.renewal.invoiceId },
        })
      ).status,
    ).toBe('PAID');
  });
  it('rechecks account eligibility at the actual submission boundary', async () => {
    const f = await purchase();
    const { op } = await approve(f);
    jest
      .spyOn(FakeDomainRegistrar.prototype, 'renewalQuote')
      .mockImplementation(async () => {
        await prisma.registrarAccount.update({
          where: { id: f.domain.accountId },
          data: { enabled: false },
        });
        return {
          costAmount: 1000n,
          costCurrency: 'USD',
          balance: 'SUFFICIENT',
        };
      });
    try {
      await processor().process(await eventFor(op.id));
      expect(
        (await preferences().view(f.domain.id, admin)).execution,
      ).toMatchObject({ status: 'REJECTED', submittedAt: null });
      expect(
        await prisma.fakeRegistrarRenewal.count({
          where: { operationId: op.id },
        }),
      ).toBe(0);
    } finally {
      await prisma.registrarAccount.update({
        where: { id: f.domain.accountId },
        data: { enabled: true },
      });
    }
  });
  it('blocks simulated production dispatch without reading or purchasing at a provider', async () => {
    const f = await purchase();
    const { op } = await approve(f);
    const read = jest.spyOn(FakeDomainRegistrar.prototype, 'readDomainFacts');
    await new DomainRenewalProcessor(
      prisma,
      environment.CREDENTIAL_ENCRYPTION_KEY,
      { simulationAllowed: false, liveAllowed: false, liveReadAllowed: false },
    ).process(await eventFor(op.id));
    expect(read).not.toHaveBeenCalled();
    expect(
      (await preferences().view(f.domain.id, admin)).execution?.status,
    ).toBe('REJECTED');
    expect(
      await prisma.fakeRegistrarRenewal.count({
        where: { operationId: op.id },
      }),
    ).toBe(0);
  });
  it('rechecks payment before submission when the approved invoice is refunded', async () => {
    const f = await purchase();
    const { op } = await approve(f);
    const payment = await prisma.payment.findFirstOrThrow({
      where: {
        invoiceId: f.renewal.invoiceId,
        kind: 'CHARGE',
        status: 'SUCCEEDED',
      },
    });
    await module.get(PaymentService).adjust(
      payment.id,
      {
        kind: 'REFUND',
        amount: '170000',
        reference: randomUUID(),
        submissionKey: randomUUID(),
      },
      admin,
      { ipAddressHash: 'fictional' },
    );
    await processor().process(await eventFor(op.id));
    expect(
      (await preferences().view(f.domain.id, admin)).execution,
    ).toMatchObject({
      status: 'REJECTED',
      submittedAt: null,
      code: 'PAYMENT_REQUIRES_REVIEW',
    });
    expect(
      (
        await prisma.invoice.findUniqueOrThrow({
          where: { id: f.renewal.invoiceId },
        })
      ).status,
    ).toBe('REFUNDED');
    expect(
      await prisma.fakeRegistrarRenewal.count({
        where: { operationId: op.id },
      }),
    ).toBe(0);
  });
  it('records actual fulfillment and financial review when refunded after a possible purchase', async () => {
    const f = await purchase();
    const { op } = await approve(f);
    const underlying = new FakeDomainRegistrar(prisma);
    const realRenew = underlying.renewDomain.bind(underlying);
    const realRead = underlying.readDomainFacts.bind(underlying);
    let unavailable = false;
    jest
      .spyOn(FakeDomainRegistrar.prototype, 'renewDomain')
      .mockImplementation(async function (
        this: FakeDomainRegistrar,
        intent,
        claim,
      ) {
        await realRenew(intent, claim);
        unavailable = true;
        throw new Error('Lost reply.');
      });
    jest
      .spyOn(FakeDomainRegistrar.prototype, 'readDomainFacts')
      .mockImplementation(function (this: FakeDomainRegistrar, ref) {
        return unavailable
          ? Promise.reject(new Error('Read unavailable.'))
          : realRead(ref);
      });
    await processor().process(await eventFor(op.id));
    const payment = await prisma.payment.findFirstOrThrow({
      where: {
        invoiceId: f.renewal.invoiceId,
        kind: 'CHARGE',
        status: 'SUCCEEDED',
      },
    });
    await module.get(PaymentService).adjust(
      payment.id,
      {
        kind: 'REFUND',
        amount: '170000',
        reference: randomUUID(),
        submissionKey: randomUUID(),
      },
      admin,
      { ipAddressHash: 'fictional' },
    );
    unavailable = false;
    advance(31_000);
    await reconcile(f, op.id);
    expect(
      (await preferences().view(f.domain.id, admin)).execution,
    ).toMatchObject({
      status: 'SUCCEEDED',
      financialReviewRequired: true,
      code: 'FINANCIAL_REVIEW_REQUIRED',
    });
    expect(
      (
        await prisma.invoice.findUniqueOrThrow({
          where: { id: f.renewal.invoiceId },
        })
      ).status,
    ).toBe('REFUNDED');
    expect(
      (await prisma.domain.findUniqueOrThrow({ where: { id: f.domain.id } }))
        .expiresAt,
    ).toEqual(f.renewal.termEnd);
  });
  it('fences an expired pre-submission worker before an administrator requests recovery', async () => {
    const f = await purchase();
    const { op } = await approve(f);
    let release!: () => void;
    let started!: () => void;
    const paused = new Promise<void>((resolve) => {
      release = resolve;
    });
    const entered = new Promise<void>((resolve) => {
      started = resolve;
    });
    const underlying = new FakeDomainRegistrar(prisma);
    const original = underlying.renewDomain.bind(underlying);
    jest
      .spyOn(FakeDomainRegistrar.prototype, 'renewDomain')
      .mockImplementation(async function (
        this: FakeDomainRegistrar,
        intent,
        claim,
      ) {
        started();
        await paused;
        await original(intent, claim);
      });
    const running = processor().process(await eventFor(op.id));
    await entered;
    advance(121_000);
    await reconcile(f, op.id);
    release();
    await running;
    expect(
      (await preferences().view(f.domain.id, admin)).execution,
    ).toMatchObject({ status: 'REJECTED', submittedAt: null });
    expect(
      await prisma.fakeRegistrarRenewal.count({
        where: { operationId: op.id },
      }),
    ).toBe(0);
  });
  it('does not apply or expose a foreign observation after submission', async () => {
    const f = await purchase();
    const { op } = await approve(f);
    const underlying = new FakeDomainRegistrar(prisma);
    const original = underlying.readDomainFacts.bind(underlying);
    jest
      .spyOn(FakeDomainRegistrar.prototype, 'readDomainFacts')
      .mockImplementation(async function (this: FakeDomainRegistrar, ref) {
        const facts = await original(ref);
        const current = await prisma.domainRenewalOperation.findUniqueOrThrow({
          where: { id: op.id },
        });
        return current.submittedAt && facts
          ? {
              ...facts,
              customerId: randomUUID(),
              domainName: 'foreign-owner.com',
            }
          : facts;
      });
    await processor().process(await eventFor(op.id));
    const view = await preferences().view(f.domain.id, customer);
    expect(view.execution?.status).toBe('NEEDS_RECONCILIATION');
    expect(JSON.stringify(view)).not.toContain('foreign-owner');
    expect(
      (await prisma.domain.findUniqueOrThrow({ where: { id: f.domain.id } }))
        .expiresAt,
    ).toEqual(f.renewal.termStart);
  });
});
