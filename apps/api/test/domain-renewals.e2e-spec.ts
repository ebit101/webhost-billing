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
  domainRenewalTermsSchema,
  domainRenewalProductAttributionSchema,
  operationalReportRequestSchema,
  PARTIAL_PAYMENT_POLICY_CONFIRMATION,
  type BackgroundJobData,
} from '@webhost-billing/shared';
import { randomUUID } from 'node:crypto';
import { Test, type TestingModule } from '@nestjs/testing';
import {
  parseApiEnvironment,
  type ApiEnvironment,
} from '@webhost-billing/config';
import { Prisma, type PrismaClient } from '@webhost-billing/database';
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
import { OperationalReportService } from '../src/modules/dashboard-reports/operational-report.service';
import { businessDate } from '../src/modules/dashboard-reports/dashboard-period';

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
    const originalCustomer = customer;
    for (let index = 0; index < 11; index += 1) {
      if (index === 8) {
        const additionalBuyer = await prisma.user.create({
          data: {
            email: `attribution-buyer-${randomUUID()}@example.test`,
            role: 'CUSTOMER',
            status: 'ACTIVE',
            emailVerifiedAt: new Date(),
            customer: {
              create: {
                customerNumber: `ATTR-${randomUUID().slice(0, 20)}`,
                firstName: 'Fictional',
                lastName: 'Attribution',
                addressLine1: '227 Test Road',
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
            userId: additionalBuyer.id,
            email: additionalBuyer.email,
            customerId: additionalBuyer.customer!.id,
          },
        };
      }
      prepared.push(await fixture());
    }
    customer = originalCustomer;
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
  const income = () =>
    module.get(OperationalReportService).list(
      'income',
      operationalReportRequestSchema.parse({
        from: businessDate(new Date(), 'Asia/Dhaka'),
        to: businessDate(new Date(), 'Asia/Dhaka'),
        pageSize: 100,
      }),
      admin,
    );
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

  it('preserves confirmed domain attribution through catalogue edits, renewal retries and partial cash adjustments', async () => {
    const f = await eligible();
    const catalogue = await prisma.domainCatalogueTld.findUniqueOrThrow({
      where: { tld: 'com' },
    });
    const product = await prisma.product.findUniqueOrThrow({
      where: { id: catalogue.productId },
    });
    const legacy = await prisma.invoiceItem.findMany({
      where: { invoiceId: f.domain.invoiceId! },
    });
    await prisma.product.update({
      where: { id: product.id },
      data: { name: 'Fictional confirmed domain renewal' },
    });
    await configure(f);
    const terms = domainRenewalTermsSchema.parse(
      (
        await prisma.domainRenewalPreference.findUniqueOrThrow({
          where: { domainId: f.domain.id },
        })
      ).terms,
    );
    expect(terms.productAttribution).toMatchObject({
      version: 2,
      productId: product.id,
      catalogueId: catalogue.id,
      catalogueRevision: catalogue.revision,
      name: 'Fictional confirmed domain renewal',
      kind: 'DOMAIN',
      source: 'DOMAIN_RENEWAL',
    });
    await prisma.product.update({
      where: { id: product.id },
      data: { name: 'Changed after confirmation' },
    });
    await Promise.all([
      billing().process(new Date(Date.now()), policy),
      billing().process(new Date(Date.now()), policy),
    ]);
    const renewal = await record(f.domain.id);
    const line = await prisma.invoiceItem.findFirstOrThrow({
      where: { invoiceId: renewal.invoiceId },
    });
    expect(line.productAttributionSnapshot).toEqual(terms.productAttribution);
    expect(line).toMatchObject({
      lineTotal: 170000n,
      servicePeriodStart: renewal.termStart,
      servicePeriodEnd: renewal.termEnd,
      serviceId: null,
      orderItemId: null,
    });
    await prisma.domainCatalogueTld.update({
      where: { id: catalogue.id },
      data: { renewalAmount: 190000n, revision: { increment: 1 } },
    });
    await billing().process(new Date(Date.now()), policy);
    expect(
      await prisma.domainRenewalInvoice.count({
        where: { domainId: f.domain.id },
      }),
    ).toBe(1);
    expect(
      (
        await prisma.invoice.findUniqueOrThrow({
          where: { id: renewal.invoiceId },
        })
      ).total,
    ).toBe(170000n);
    const payments = module.get(PaymentService);
    const before = await income();
    const oldPolicy = await payments.getSettings();
    await payments.updateSettings(
      {
        partialPaymentsEnabled: true,
        partialPaymentPolicyConfirmation: PARTIAL_PAYMENT_POLICY_CONFIRMATION,
      },
      admin,
      { ipAddressHash: 'fictional' },
    );
    const partial = await payments.recordManual(
      {
        invoiceId: renewal.invoiceId,
        amount: '10001',
        submissionKey: randomUUID(),
        proof: {
          method: 'BANK_TRANSFER',
          reference: `FICTIONAL-227-${randomUUID()}`,
        },
      },
      admin,
      { ipAddressHash: 'fictional' },
    );
    await payments.updateSettings(
      {
        ...oldPolicy,
        partialPaymentPolicyConfirmation: PARTIAL_PAYMENT_POLICY_CONFIRMATION,
      },
      admin,
      { ipAddressHash: 'fictional' },
    );
    const refund = {
      kind: 'REFUND' as const,
      amount: '500',
      reference: `FICTIONAL-227-REFUND-${randomUUID()}`,
      submissionKey: randomUUID(),
    };
    const refunds = await Promise.all([
      payments.adjust(partial.payment.id, refund, admin, {
        ipAddressHash: 'fictional',
      }),
      payments.adjust(partial.payment.id, refund, admin, {
        ipAddressHash: 'fictional',
      }),
    ]);
    expect(refunds[0].payment.id).toBe(refunds[1].payment.id);
    await payments.adjust(
      partial.payment.id,
      {
        kind: 'REVERSAL',
        amount: '1',
        reference: `FICTIONAL-227-REVERSAL-${randomUUID()}`,
        submissionKey: randomUUID(),
      },
      admin,
      { ipAddressHash: 'fictional' },
    );
    const after = await income();
    expect(before.pagination.totalPages).toBe(1);
    expect(after.pagination.totalPages).toBe(1);
    expect(BigInt(after.totals[2]) - BigInt(before.totals[2])).toBe(9500n);
    expect(
      after.rows.find(
        (row) =>
          row.id === `${product.id}|Fictional confirmed domain renewal|Domain`,
      )?.cells,
    ).toEqual(['Fictional confirmed domain renewal', 'Domain', '9500']);
    expect(
      (
        await prisma.payment.findUniqueOrThrow({
          where: { id: partial.payment.id },
        })
      ).amount,
    ).toBe(10001n);
    expect(
      await prisma.invoiceItem.findUniqueOrThrow({ where: { id: line.id } }),
    ).toEqual(line);
    expect(
      await prisma.invoiceItem.findMany({
        where: { invoiceId: f.domain.invoiceId! },
      }),
    ).toEqual(legacy);
    expect(
      await prisma.domainRenewalOperation.count({
        where: { domainId: f.domain.id },
      }),
    ).toBe(0);
    expect(
      (await prisma.domain.findUniqueOrThrow({ where: { id: f.domain.id } }))
        .expiresAt,
    ).toEqual(f.domain.expiresAt);
    await prisma.product.update({
      where: { id: product.id },
      data: { name: product.name },
    });
    await prisma.domainCatalogueTld.update({
      where: { id: catalogue.id },
      data: {
        renewalAmount: catalogue.renewalAmount,
        revision: { increment: 1 },
      },
    });
  });

  it('holds unconfirmed legacy attribution and rejects forged or rewritten domain invoice evidence', async () => {
    const f = await eligible();
    await configure(f);
    const preference = await prisma.domainRenewalPreference.findUniqueOrThrow({
      where: { domainId: f.domain.id },
    });
    const { productAttribution: _omitted, ...legacyTerms } =
      domainRenewalTermsSchema.parse(preference.terms);
    void _omitted;
    await prisma.domainRenewalPreference.update({
      where: { domainId: f.domain.id },
      data: { terms: legacyTerms },
    });
    await billing().process(new Date(Date.now()), policy);
    await billing().process(new Date(Date.now()), policy);
    expect(
      await prisma.domainRenewalInvoice.count({
        where: { domainId: f.domain.id },
      }),
    ).toBe(0);
    expect((await preferences().view(f.domain.id, admin)).reviewCode).toBe(
      'ATTRIBUTION_REQUIRES_REVIEW',
    );
    await configure(f);
    const confirmedTerms = domainRenewalTermsSchema.parse(
      (
        await prisma.domainRenewalPreference.findUniqueOrThrow({
          where: { domainId: f.domain.id },
        })
      ).terms,
    );
    const confirmed = confirmedTerms.productAttribution!;
    const sourceFact = await prisma.domainFactSync.findFirstOrThrow({
      where: { domainId: f.domain.id, status: 'SUCCEEDED' },
      orderBy: { startedAt: 'desc' },
    });
    const termEnd = new Date(f.domain.expiresAt!);
    termEnd.setUTCFullYear(termEnd.getUTCFullYear() + 1);
    for (const forged of [
      confirmed,
      { ...confirmed, productId: randomUUID() },
      { ...confirmed, catalogueRevision: confirmed.catalogueRevision + 1 },
    ]) {
      const key = randomUUID();
      await expect(
        prisma.$transaction(async (tx) => {
          const candidate = await tx.invoice.create({
            data: {
              invoiceNumber: `FORGED-${key.slice(0, 12)}`,
              submissionKey: key,
              customerId: f.domain.customerId,
              status: 'UNPAID',
              currency: 'BDT',
              subtotal: 170000n,
              total: 170000n,
              balanceDue: 170000n,
              customerNameSnapshot: 'Fictional',
              customerEmailSnapshot: 'fictional@example.test',
              customerAddressSnapshot: {},
              businessIdentitySnapshot: {},
              issuedAt: new Date(),
              dueAt: f.domain.expiresAt!,
              items: {
                create: {
                  linePosition: 1,
                  currency: 'BDT',
                  descriptionSnapshot: 'Rejected domain attribution',
                  unitAmount: 170000n,
                  lineTotal: 170000n,
                  servicePeriodStart: f.domain.expiresAt,
                  servicePeriodEnd: termEnd,
                  productAttributionSnapshot: forged,
                },
              },
            },
          });
          if (forged !== confirmed)
            await tx.domainRenewalInvoice.create({
              data: {
                domainId: f.domain.id,
                customerId: f.domain.customerId,
                invoiceId: candidate.id,
                sourceFactId: sourceFact.id,
                termStart: f.domain.expiresAt!,
                termEnd,
                termsSnapshot: { ...confirmedTerms, reminderPolicy: policy },
              },
            });
        }),
      ).rejects.toThrow();
      expect(
        await prisma.invoice.count({ where: { submissionKey: key } }),
      ).toBe(0);
      expect(
        await prisma.domainRenewalInvoice.count({
          where: { domainId: f.domain.id },
        }),
      ).toBe(0);
    }
    await billing().process(new Date(Date.now()), policy);
    const renewal = await record(f.domain.id);
    const line = await prisma.invoiceItem.findFirstOrThrow({
      where: { invoiceId: renewal.invoiceId },
    });
    const snapshot = domainRenewalProductAttributionSchema.parse(
      line.productAttributionSnapshot,
    );
    for (const data of [
      { productAttributionSnapshot: { ...snapshot, name: 'Rewritten' } },
      { productAttributionSnapshot: Prisma.DbNull },
      { unitAmount: line.unitAmount + 1n, lineTotal: line.lineTotal + 1n },
      { invoiceId: f.domain.invoiceId! },
      {
        servicePeriodEnd: new Date(line.servicePeriodEnd!.getTime() + 86400000),
      },
    ])
      await expect(
        prisma.invoiceItem.update({ where: { id: line.id }, data }),
      ).rejects.toThrow();
    await expect(
      prisma.invoiceItem.delete({ where: { id: line.id } }),
    ).rejects.toThrow();
    const legacy = await prisma.invoiceItem.findFirstOrThrow({
      where: { invoiceId: f.domain.invoiceId! },
    });
    await expect(
      prisma.invoiceItem.update({
        where: { id: legacy.id },
        data: { productAttributionSnapshot: snapshot },
      }),
    ).rejects.toThrow();
    // A shape-valid domain snapshot cannot commit without a matching retained
    // renewal record and confirmed identity/price. The whole insert rolls back.
    for (const forged of [
      snapshot,
      { ...snapshot, productId: randomUUID() },
      { ...snapshot, catalogueRevision: snapshot.catalogueRevision + 1 },
    ]) {
      const key = randomUUID();
      await expect(
        prisma.$transaction(async (tx) =>
          tx.invoice.create({
            data: {
              invoiceNumber: `FORGED-${key.slice(0, 12)}`,
              submissionKey: key,
              customerId: f.domain.customerId,
              status: 'UNPAID',
              currency: 'BDT',
              subtotal: 1n,
              total: 1n,
              balanceDue: 1n,
              customerNameSnapshot: 'Fictional',
              customerEmailSnapshot: 'fictional@example.test',
              customerAddressSnapshot: {},
              businessIdentitySnapshot: {},
              issuedAt: new Date(),
              dueAt: new Date(),
              items: {
                create: {
                  linePosition: 1,
                  currency: 'BDT',
                  descriptionSnapshot: 'Rejected domain attribution',
                  unitAmount: 1n,
                  lineTotal: 1n,
                  servicePeriodStart: renewal.termStart,
                  servicePeriodEnd: renewal.termEnd,
                  productAttributionSnapshot: forged,
                },
              },
            },
          }),
        ),
      ).rejects.toThrow();
      expect(
        await prisma.invoice.count({ where: { submissionKey: key } }),
      ).toBe(0);
    }
    expect(
      await prisma.invoiceItem.findUniqueOrThrow({ where: { id: line.id } }),
    ).toEqual(line);
  });

  it('keeps a legacy issued renewal payable and reminded without backfilling attribution', async () => {
    const f = await eligible(5);
    await configure(f);
    const preference = await prisma.domainRenewalPreference.findUniqueOrThrow({
      where: { domainId: f.domain.id },
    });
    const { productAttribution: _omitted, ...terms } =
      domainRenewalTermsSchema.parse(preference.terms);
    void _omitted;
    await prisma.domainRenewalPreference.update({
      where: { domainId: f.domain.id },
      data: { terms },
    });
    const fact = await prisma.domainFactSync.findFirstOrThrow({
      where: { domainId: f.domain.id, status: 'SUCCEEDED' },
      orderBy: { startedAt: 'desc' },
    });
    const end = new Date(f.domain.expiresAt!);
    end.setUTCFullYear(end.getUTCFullYear() + 1);
    const invoice = await prisma.invoice.create({
      data: {
        invoiceNumber: `LEGACY-${randomUUID().slice(0, 12)}`,
        submissionKey: randomUUID(),
        customerId: f.domain.customerId,
        status: 'UNPAID',
        currency: 'BDT',
        subtotal: 170000n,
        total: 170000n,
        balanceDue: 170000n,
        customerNameSnapshot: 'Fictional legacy',
        customerEmailSnapshot: 'fictional@example.test',
        customerAddressSnapshot: {},
        businessIdentitySnapshot: {},
        issuedAt: new Date(Date.now() - 2 * 86400000),
        dueAt: f.domain.expiresAt!,
        items: {
          create: {
            linePosition: 1,
            currency: 'BDT',
            descriptionSnapshot: 'Legacy domain renewal',
            unitAmount: 170000n,
            lineTotal: 170000n,
            servicePeriodStart: f.domain.expiresAt,
            servicePeriodEnd: end,
          },
        },
      },
      include: { items: true },
    });
    await prisma.domainRenewalInvoice.create({
      data: {
        domainId: f.domain.id,
        customerId: f.domain.customerId,
        invoiceId: invoice.id,
        sourceFactId: fact.id,
        termStart: f.domain.expiresAt!,
        termEnd: end,
        termsSnapshot: { ...terms, reminderPolicy: policy },
      },
    });
    await billing().process(new Date(Date.now()), policy);
    expect(
      await prisma.outboxEvent.count({
        where: { aggregateId: invoice.id, eventType: 'EMAIL_RENEWAL_REMINDER' },
      }),
    ).toBe(1);
    const before = await income();
    await module.get(PaymentService).recordManual(
      {
        invoiceId: invoice.id,
        amount: '170000',
        submissionKey: randomUUID(),
        proof: {
          method: 'BANK_TRANSFER',
          reference: `FICTIONAL-227-LEGACY-${randomUUID()}`,
        },
      },
      admin,
      { ipAddressHash: 'fictional' },
    );
    const after = await income();
    const unknown = (rows: typeof after.rows) =>
      rows
        .filter((row) => row.id.startsWith('unknown|'))
        .reduce((sum, row) => sum + BigInt(row.cells[2]), 0n);
    expect(unknown(after.rows) - unknown(before.rows)).toBe(170000n);
    expect(
      await prisma.invoiceItem.findMany({ where: { invoiceId: invoice.id } }),
    ).toEqual(invoice.items);
    await billing().process(new Date(Date.now()), policy);
    expect(
      await prisma.domainRenewalInvoice.count({
        where: { domainId: f.domain.id },
      }),
    ).toBe(1);
    expect(
      (await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } }))
        .status,
    ).toBe('PAID');
    expect(
      await prisma.domainRenewalOperation.count({
        where: { domainId: f.domain.id },
      }),
    ).toBe(0);
  });
});
