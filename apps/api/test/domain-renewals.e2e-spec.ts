import type {
  EmailSendRequest,
  EmailSendResult,
} from '../../worker/src/email/email.types';
import { parseWorkerEnvironment } from '@webhost-billing/config';
import { DomainRenewalBilling } from '../../worker/src/renewal/domain-renewal-billing';
import { RenewalProcessorService } from '../../worker/src/renewal/renewal-processor.service';
import { EmailMessageResolver } from '../../worker/src/email/email-message.resolver';
import { EmailTemplateCatalog } from '../../worker/src/email/email-template.catalog';
import { EmailDeliveryService } from '../../worker/src/email/email-delivery.service';
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
import type { RegistrarDomainFacts } from '@webhost-billing/shared';
import { AppModule } from '../src/app.module';
import { API_ENVIRONMENT } from '../src/infrastructure/environment/environment.module';
import { PRISMA_CLIENT } from '../src/infrastructure/database/database.module';
import type { AuthRequestContext } from '../src/modules/auth/auth.types';
import { TotpService } from '../src/modules/auth/services/totp.service';
import { PaymentService } from '../src/modules/payments/payment.service';
import { DomainService } from '../src/modules/domains/domain.service';
import { DomainFactsService } from '../src/modules/domains/domain-facts.service';

jest.setTimeout(60_000);

describe('Command 214 domain renewal billing', () => {
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
    for (let index = 0; index < 8; index += 1) prepared.push(await fixture());
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
    return { domain, sync };
  }
  function observed(
    f: Awaited<ReturnType<typeof fixture>>,
    overrides: Partial<RegistrarDomainFacts> = {},
  ): RegistrarDomainFacts {
    return {
      accountId: f.domain.executionAccountId ?? f.domain.accountId,
      customerId: f.domain.customerId,
      domainName: f.domain.domainName,
      providerOrderId: f.domain.providerOrderId!,
      observedAt: new Date(Date.now()).toISOString(),
      expiresAt: f.domain.expiresAt!.toISOString(),
      status: 'ACTIVE',
      renewalEligibility: 'ELIGIBLE',
      registrarAutoRenew: false,
      simulated: true,
      ...overrides,
    };
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
  it('creates one annual invoice at the lead boundary under concurrent runs without changing original billing or provider state', async () => {
    const f = await eligible();
    const original = await prisma.invoice.findUniqueOrThrow({
      where: { id: f.domain.invoiceId! },
      include: { items: true, payments: true },
    });
    expect((await preferences().view(f.domain.id, customer)).enabled).toBe(
      false,
    );
    await configure(f);
    await Promise.all([
      billing().process(new Date(Date.now()), policy),
      billing().process(new Date(Date.now()), policy),
    ]);
    const renewal = await record(f.domain.id);
    const invoice = await prisma.invoice.findUniqueOrThrow({
      where: { id: renewal.invoiceId },
      include: { items: true },
    });
    expect(invoice).toMatchObject({
      status: 'UNPAID',
      total: 170000n,
      balanceDue: 170000n,
      dueAt: f.domain.expiresAt,
      orderId: null,
    });
    expect(invoice.items).toHaveLength(1);
    expect(invoice.items[0]).toMatchObject({
      serviceId: null,
      unitAmount: 170000n,
      servicePeriodStart: f.domain.expiresAt,
      servicePeriodEnd: renewal.termEnd,
    });
    expect(
      await prisma.domainRenewalInvoice.count({
        where: { domainId: f.domain.id },
      }),
    ).toBe(1);
    expect(
      await prisma.domainAction.count({ where: { domainId: f.domain.id } }),
    ).toBe(0);
    expect(
      (await prisma.domain.findUniqueOrThrow({ where: { id: f.domain.id } }))
        .expiresAt,
    ).toEqual(f.domain.expiresAt);
    expect(
      await prisma.invoice.findUniqueOrThrow({
        where: { id: f.domain.invoiceId! },
        include: { items: true, payments: true },
      }),
    ).toEqual(original);
  });
  it('catches missed windows once, delivers via a local adapter and suppresses queued reminders after opt-out', async () => {
    const f = await eligible(20);
    await configure(f);
    await billing().process(new Date(Date.now()), policy);
    expect(
      await prisma.domainRenewalInvoice.count({
        where: { domainId: f.domain.id },
      }),
    ).toBe(0);
    advance(15 * 86_400_000);
    await fresh(f);
    await billing().process(new Date(Date.now()), policy);
    const renewal = await record(f.domain.id);
    expect(
      await prisma.outboxEvent.count({
        where: {
          aggregateId: renewal.invoiceId,
          eventType: 'EMAIL_RENEWAL_REMINDER',
        },
      }),
    ).toBe(0);
    advance(86_400_000);
    await fresh(f);
    await Promise.all([
      billing().process(new Date(Date.now()), policy),
      billing().process(new Date(Date.now()), policy),
    ]);
    const reminder = await prisma.outboxEvent.findFirstOrThrow({
      where: {
        aggregateId: renewal.invoiceId,
        eventType: 'EMAIL_RENEWAL_REMINDER',
      },
    });
    expect(
      await prisma.outboxEvent.count({
        where: {
          aggregateId: renewal.invoiceId,
          eventType: 'EMAIL_RENEWAL_REMINDER',
        },
      }),
    ).toBe(1);
    const env = parseWorkerEnvironment({
      ...process.env,
      EMAIL_TRANSPORT: 'preview',
    });
    const resolver = new EmailMessageResolver(
      prisma,
      env,
      new EmailTemplateCatalog(),
    );
    const send = jest
      .fn<Promise<EmailSendResult>, [EmailSendRequest]>()
      .mockResolvedValue({
        provider: 'fictional-memory',
        providerMessageId: randomUUID(),
      });
    const delivery = new EmailDeliveryService(
      prisma,
      { key: 'fictional-memory', send, close: () => Promise.resolve() },
      resolver,
    );
    await prisma.outboxEvent.update({
      where: { id: reminder.id },
      data: { status: 'PUBLISHED', publishedAt: new Date(Date.now()) },
    });
    await delivery.deliver(job(reminder), undefined);
    await delivery.deliver(job(reminder), undefined);
    expect(send).toHaveBeenCalledTimes(1);
    await billing().process(new Date(Date.now()), {
      ...policy,
      reminderDaysBeforeDue: [10, 5, 0],
    });
    expect(
      await prisma.outboxEvent.count({
        where: {
          aggregateId: renewal.invoiceId,
          eventType: 'EMAIL_RENEWAL_REMINDER',
        },
      }),
    ).toBe(1);
    expect(JSON.stringify(send.mock.calls[0]?.[0])).toContain(
      'renewal reminder',
    );
    advance();
    jest
      .spyOn(FakeDomainRegistrar.prototype, 'readDomainFacts')
      .mockResolvedValueOnce({
        ...observed(f),
        expiresAt: f.domain.expiresAt!.toISOString(),
        renewalEligibility: 'UNKNOWN',
      });
    await f.sync();
    await expect(resolver.resolve(job(reminder))).rejects.toMatchObject({
      code: 'EMAIL_DOMAIN_RENEWAL_REMINDER_SUPPRESSED',
    });
    const current = await preferences().view(f.domain.id, customer);
    await preferences().update(
      f.domain.id,
      {
        confirmation: f.domain.domainName,
        expectedRevision: current.revision,
        enabled: false,
      },
      customer,
    );
    await expect(resolver.resolve(job(reminder))).rejects.toMatchObject({
      code: 'EMAIL_DOMAIN_RENEWAL_REMINDER_SUPPRESSED',
    });
    advance(2 * 86_400_000);
    await billing().process(new Date(Date.now()), policy);
    expect(
      await prisma.outboxEvent.count({
        where: {
          aggregateId: renewal.invoiceId,
          eventType: 'EMAIL_RENEWAL_REMINDER',
        },
      }),
    ).toBe(1);
    expect(
      (
        await prisma.invoice.findUniqueOrThrow({
          where: { id: renewal.invoiceId },
        })
      ).status,
    ).toBe('UNPAID');
  });
  it('preserves issued prices and holds changed catalogue terms for administrator review', async () => {
    const f = await eligible();
    await configure(f);
    await billing().process(new Date(Date.now()), policy);
    const renewal = await record(f.domain.id);
    const catalogue = await prisma.domainCatalogueTld.findUniqueOrThrow({
      where: { tld: 'com' },
    });
    await prisma.domainCatalogueTld.update({
      where: { id: catalogue.id },
      data: { renewalAmount: 180000n, revision: { increment: 1 } },
    });
    await billing().process(new Date(Date.now()), policy);
    expect((await preferences().view(f.domain.id, admin)).reviewCode).toBe(
      'TERMS_CHANGED',
    );
    expect(
      (
        await prisma.invoice.findUniqueOrThrow({
          where: { id: renewal.invoiceId },
        })
      ).total,
    ).toBe(170000n);
    await configure(f);
    await billing().process(new Date(Date.now()), policy);
    expect(
      await prisma.domainRenewalInvoice.count({
        where: { domainId: f.domain.id },
      }),
    ).toBe(1);
    await prisma.domainCatalogueTld.update({
      where: { id: catalogue.id },
      data: { renewalAmount: 170000n, revision: { increment: 1 } },
    });
  });
  it('holds stale facts, conflicting responsibility and expired grace/redemption cases instead of invoicing', async () => {
    const f = await eligible();
    await configure(f);
    advance(2 * 3_600_000);
    await billing().process(new Date(Date.now()), policy);
    expect((await preferences().view(f.domain.id, admin)).reviewCode).toBe(
      'FACTS_STALE',
    );
    await fresh(f);
    jest
      .spyOn(FakeDomainRegistrar.prototype, 'readDomainFacts')
      .mockResolvedValue({
        ...observed(f),
        expiresAt: f.domain.expiresAt!.toISOString(),
        registrarAutoRenew: true,
      });
    advance();
    await f.sync();
    await billing().process(new Date(Date.now()), policy);
    expect((await preferences().view(f.domain.id, admin)).reviewCode).toBe(
      'RENEWAL_RESPONSIBILITY_UNCONFIRMED',
    );
    advance(15 * 86_400_000);
    await billing().process(new Date(Date.now()), policy);
    expect((await preferences().view(f.domain.id, admin)).reviewCode).toBe(
      'EXPIRY_REQUIRES_REVIEW',
    );
    expect(
      await prisma.domainRenewalInvoice.count({
        where: { domainId: f.domain.id },
      }),
    ).toBe(0);
  });
  it('enforces owned preferences, read-only support and optimistic concurrency', async () => {
    const f = await eligible();
    const configured = await configure(f, false);
    const input = {
      confirmation: f.domain.domainName,
      expectedRevision: configured.revision,
      enabled: true,
    };
    await expect(
      preferences().update(f.domain.id, input, {
        ...customer,
        supportAdministratorId: admin.identity.userId,
      }),
    ).rejects.toMatchObject({ status: 403 });
    if (customer.identity.role !== 'CUSTOMER') throw new Error();
    await expect(
      preferences().view(f.domain.id, {
        ...customer,
        identity: { ...customer.identity, customerId: randomUUID() },
      }),
    ).rejects.toMatchObject({ status: 403 });
    const results = await Promise.allSettled([
      preferences().update(f.domain.id, input, customer),
      preferences().update(f.domain.id, input, customer),
    ]);
    expect(results.filter((row) => row.status === 'fulfilled')).toHaveLength(1);
    expect(
      (
        await preferences().view(f.domain.id, {
          ...customer,
          supportAdministratorId: admin.identity.userId,
        })
      ).canChangePreference,
    ).toBe(false);
  });
  it('handles the daily queue and payment without renewing the domain or creating hosting suspension work', async () => {
    const f = await eligible(10);
    await configure(f);
    const run = await prisma.automationRun.create({
      data: {
        jobName: 'renewal-cycle',
        idempotencyKey: `fictional-214-${randomUUID()}`,
      },
    });
    const event = await prisma.outboxEvent.create({
      data: {
        aggregateType: 'AUTOMATION_RUN',
        aggregateId: run.id,
        eventType: 'RENEWAL_INVOICE_GENERATION_REQUESTED',
        idempotencyKey: randomUUID(),
        status: 'PUBLISHED',
        publishedAt: new Date(),
        payload: {
          schemaVersion: 1,
          automationRunId: run.id,
          businessDate: new Date().toISOString().slice(0, 10),
          scheduledFor: new Date().toISOString(),
          policy,
        },
      },
    });
    const processor = new RenewalProcessorService(prisma, {
      now: () => new Date(Date.now()),
    });
    await processor.process(job(event));
    await processor.process(job(event));
    const renewal = await record(f.domain.id);
    await module.get(PaymentService).recordManual(
      {
        invoiceId: renewal.invoiceId,
        amount: '170000',
        submissionKey: randomUUID(),
        proof: {
          method: 'BANK_TRANSFER',
          reference: `FICTIONAL-214-${randomUUID()}`,
        },
      },
      admin,
      { ipAddressHash: 'fictional' },
    );
    advance(4 * 86_400_000);
    await fresh(f);
    await billing().process(new Date(Date.now()), policy);
    expect(
      await prisma.outboxEvent.count({
        where: {
          aggregateId: renewal.invoiceId,
          eventType: 'EMAIL_RENEWAL_REMINDER',
        },
      }),
    ).toBe(0);
    expect(
      (await prisma.domain.findUniqueOrThrow({ where: { id: f.domain.id } }))
        .expiresAt,
    ).toEqual(f.domain.expiresAt);
    expect(
      await prisma.domainAction.count({ where: { domainId: f.domain.id } }),
    ).toBe(0);
    expect(
      (
        await prisma.invoice.findUniqueOrThrow({
          where: { id: renewal.invoiceId },
        })
      ).status,
    ).toBe('PAID');
  });
  it('holds unknown renewal capability and refuses unsupported years or customer price claims', async () => {
    const f = await eligible();
    await configure(f);
    advance();
    jest
      .spyOn(FakeDomainRegistrar.prototype, 'readDomainFacts')
      .mockResolvedValue({
        ...observed(f),
        expiresAt: f.domain.expiresAt!.toISOString(),
        renewalEligibility: 'UNKNOWN',
        registrarAutoRenew: null,
      });
    await f.sync();
    await billing().process(new Date(Date.now()), policy);
    expect((await preferences().view(f.domain.id, admin)).reviewCode).toBe(
      'FACTS_REQUIRE_REVIEW',
    );
    expect(
      await prisma.domainRenewalInvoice.count({
        where: { domainId: f.domain.id },
      }),
    ).toBe(0);
    const input = {
      confirmation: f.domain.domainName,
      expectedRevision: 1,
      enabled: false,
      years: 2,
    };
    await expect(
      preferences().update(f.domain.id, input, customer),
    ).rejects.toThrow();
  });
  it('keeps an unresolved invoiced term from being replaced when observed expiry changes', async () => {
    const f = await eligible();
    await configure(f);
    await billing().process(new Date(Date.now()), policy);
    const expiry = new Date(f.domain.expiresAt!.getTime() + 365 * 86_400_000);
    await prisma.fakeRegistrarRegistration.update({
      where: { id: f.domain.providerOrderId! },
      data: { expiresAt: expiry },
    });
    advance();
    await fresh(f);
    await billing().process(new Date(Date.now()), policy);
    expect((await preferences().view(f.domain.id, admin)).reviewCode).toBe(
      'UNRESOLVED_RENEWAL',
    );
    expect(
      await prisma.domainRenewalInvoice.count({
        where: { domainId: f.domain.id },
      }),
    ).toBe(1);
  });
});
