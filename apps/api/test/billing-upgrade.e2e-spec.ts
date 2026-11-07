import { randomUUID } from 'node:crypto';
import { Test, type TestingModule } from '@nestjs/testing';
import {
  parseApiEnvironment,
  type ApiEnvironment,
} from '@webhost-billing/config';
import { type PrismaClient } from '@webhost-billing/database';
import {
  RegistrarProcessor,
  paidDomainRenewal,
} from '@webhost-billing/database/registrar';
import { domainRenewalContext } from '@webhost-billing/database/domain-renewals';
import {
  DEFAULT_RENEWAL_AUTOMATION_POLICY,
  operationalReportRequestSchema,
  snapshotDomainRenewalProduct,
} from '@webhost-billing/shared';
import { z } from 'zod';
import { AppModule } from '../src/app.module';
import { API_ENVIRONMENT } from '../src/infrastructure/environment/environment.module';
import { PRISMA_CLIENT } from '../src/infrastructure/database/database.module';
import type { AuthRequestContext } from '../src/modules/auth/auth.types';
import { TotpService } from '../src/modules/auth/services/totp.service';
import { DomainService } from '../src/modules/domains/domain.service';
import { DomainFactsService } from '../src/modules/domains/domain-facts.service';
import { DomainRenewalsService } from '../src/modules/domains/domain-renewals.service';
import { PaymentService } from '../src/modules/payments/payment.service';
import { OperationalReportService } from '../src/modules/dashboard-reports/operational-report.service';
import { businessDate } from '../src/modules/dashboard-reports/dashboard-period';
import { DomainRenewalBilling } from '../../worker/src/renewal/domain-renewal-billing';
import { addBillingPeriod } from '../../worker/src/renewal/renewal-calendar';
import { ServiceAddOnsService } from '../src/modules/services/service-add-ons.service';
import {
  alpha4FixtureSchema,
  type Alpha4Fixture,
} from './fixtures/alpha4-billing.fixture';
import {
  assertBrowserDatabaseScope,
  validateBrowserDatabaseUrl,
} from '../../web/e2e/database-scope';

const phase = process.env.WEBHOST_BILLING_UPGRADE_PHASE;
const describeUpgrade = phase ? describe : describe.skip;
const stateSchema = z.object({
  adminUserId: z.uuid(),
  profileId: z.uuid(),
  customerUserId: z.uuid(),
  customerId: z.uuid(),
  reviewDomainId: z.uuid(),
  pendingDomainId: z.uuid(),
  queuedDomainId: z.uuid(),
  pendingInvoiceId: z.uuid(),
  queuedInvoiceId: z.uuid(),
  pendingPaymentId: z.uuid(),
  pendingKey: z.uuid(),
  queuedOperationId: z.uuid(),
  legacyLineId: z.uuid(),
});
type State = z.infer<typeof stateSchema>;

describeUpgrade('Command 228 existing billing installation upgrade', () => {
  let module: TestingModule;
  let prisma: PrismaClient;
  let env: ApiEnvironment;
  let admin: AuthRequestContext;
  let customer: AuthRequestContext;
  let state: State;
  let alpha4: Alpha4Fixture;
  const context = { ipAddressHash: 'fictional-command228' };
  const policy = DEFAULT_RENEWAL_AUTOMATION_POLICY;
  beforeAll(async () => {
    if (!['legacy', 'current'].includes(phase ?? ''))
      throw new Error('Use the guarded billing upgrade launcher.');
    env = parseApiEnvironment({
      ...process.env,
      NODE_ENV: 'test',
      PORT: process.env.API_PORT ?? '3201',
      RESELLBIZ_LIVE_ENABLED: 'false',
      REGISTRAR_DOMAIN_SYNC_LIVE_ENABLED: 'false',
      REGISTRAR_RENEWAL_DISPATCH_ENABLED: 'false',
    });
    validateBrowserDatabaseUrl(
      env.DATABASE_URL,
      process.env.WEBHOST_BROWSER_E2E_SCHEMA ?? '',
    );
    module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(API_ENVIRONMENT)
      .useValue(env)
      .compile();
    prisma = module.get(PRISMA_CLIENT);
    await assertBrowserDatabaseScope(
      prisma,
      env.DATABASE_URL,
      process.env.WEBHOST_BROWSER_E2E_SCHEMA ?? '',
    );
    await module.init();
    const original = await prisma.$queryRaw<
      Array<{ alpha4_fixture: unknown }>
    >`SELECT alpha4_fixture FROM __browser_e2e_scope`;
    alpha4 = alpha4FixtureSchema.parse(original[0].alpha4_fixture);
    if (phase === 'current') {
      const rows = await prisma.$queryRaw<
        Array<{ fixture: unknown }>
      >`SELECT fixture FROM __browser_e2e_scope`;
      state = stateSchema.parse(rows[0]?.fixture);
      await actors();
    }
  }, 60000);
  afterAll(async () => module?.close());

  async function actors() {
    const owner = await prisma.user.findUniqueOrThrow({
      where: { id: state.adminUserId },
    });
    const buyer = await prisma.user.findUniqueOrThrow({
      where: { id: state.customerUserId },
    });
    admin = {
      sessionId: randomUUID(),
      identity: {
        role: 'ADMIN',
        userId: owner.id,
        email: owner.email,
        adminProfileId: state.profileId,
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
        customerId: state.customerId,
      },
    };
  }
  const billing = () =>
    new DomainRenewalBilling(prisma).process(new Date(), policy);
  const preferences = () => module.get(DomainRenewalsService);
  const payments = () => module.get(PaymentService);
  const pendingInput = () => ({
    invoiceId: state.pendingInvoiceId,
    amount: '170000',
    submissionKey: state.pendingKey,
    proof: {
      method: 'BANK_TRANSFER' as const,
      reference: 'FICTIONAL-228-PENDING',
    },
  });
  async function income() {
    const result = await module.get(OperationalReportService).list(
      'income',
      operationalReportRequestSchema.parse({
        from: businessDate(new Date(Date.now() - 180 * 86400000), 'Asia/Dhaka'),
        to: businessDate(new Date(), 'Asia/Dhaka'),
        pageSize: 100,
      }),
      admin,
    );
    const money = await prisma.payment.findMany({
      where: { status: 'SUCCEEDED', currency: 'BDT' },
      select: { kind: true, amount: true },
    });
    const ledger = money.reduce(
      (sum, row) => sum + (row.kind === 'CHARGE' ? row.amount : -row.amount),
      0n,
    );
    expect(BigInt(result.totals[2])).toBe(ledger);
    expect(result.pagination.totalPages).toBe(1);
    return result;
  }
  async function register(name: string) {
    const service = module.get(DomainService);
    const offerId = (await service.offers()).find(
      (offer) => offer.tld === 'com',
    )!.id;
    const quote = await service.quote(
      {
        offerId,
        domainName: `upgrade-${name}-${randomUUID()}.com`,
        contact: {
          name: 'Fictional upgrade registrant',
          company: 'Fictional',
          address: '228 Test Road',
          city: 'Dhaka',
          region: 'Dhaka',
          postalCode: '1212',
          country: 'BD',
          email: 'upgrade@example.test',
          phoneCountryCode: '880',
          phone: '1700000000',
        },
        agreement: 'fictional-registration-v1',
        consent: true,
      },
      customer,
    );
    const domain = await service.purchase(
      { quoteId: quote.id, submissionKey: randomUUID() },
      customer,
    );
    await payments().recordManual(
      {
        invoiceId: domain.invoiceId!,
        amount: '150000',
        submissionKey: randomUUID(),
        proof: {
          method: 'BANK_TRANSFER',
          reference: `FICTIONAL-228-REG-${name}`,
        },
      },
      admin,
      context,
    );
    await service.approve(
      domain.id,
      {
        confirmation: domain.domainName,
        costCeiling: '1000',
        costCurrency: 'USD',
      },
      admin,
    );
    const operation = await prisma.registrarOperation.findUniqueOrThrow({
      where: { domainId: domain.id },
    });
    await new RegistrarProcessor(prisma, env.CREDENTIAL_ENCRYPTION_KEY).process(
      operation.id,
    );
    const registered = await prisma.domain.findUniqueOrThrow({
      where: { id: domain.id },
    });
    const expiresAt = new Date(Date.now() + 5 * 86400000);
    await prisma.fakeRegistrarRegistration.update({
      where: { id: registered.providerOrderId! },
      data: { expiresAt },
    });
    const facts = module.get(DomainFactsService);
    const sync = await facts.synchronize(
      domain.id,
      { submissionKey: randomUUID(), confirmation: domain.domainName },
      admin,
    );
    if (sync.canReview)
      await facts.review(
        domain.id,
        sync.attemptId!,
        {
          confirmation: domain.domainName,
          reason: 'Fictional legacy expiry corrected.',
        },
        admin,
      );
    return prisma.domain.findUniqueOrThrow({ where: { id: domain.id } });
  }

  if (phase === 'legacy') {
    it('creates a populated 56-migration legacy fixture with issued cash and pending renewal work', async () => {
      expect(
        await prisma.$queryRaw`SELECT column_name FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='invoice_items' AND column_name='product_attribution_snapshot'`,
      ).toEqual([]);
      const totp = module.get(TotpService);
      const owner = await prisma.user.create({
        data: {
          email: `upgrade-admin-${randomUUID()}@example.test`,
          role: 'ADMIN',
          status: 'ACTIVE',
          emailVerifiedAt: new Date(),
          adminProfile: {
            create: {
              displayName: 'Fictional upgrade administrator',
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
          email: `upgrade-buyer-${randomUUID()}@example.test`,
          role: 'CUSTOMER',
          status: 'ACTIVE',
          emailVerifiedAt: new Date(),
          customer: {
            create: {
              customerNumber: `UPGRADE-${randomUUID().slice(0, 16)}`,
              firstName: 'Fictional',
              lastName: 'Upgrade',
              addressLine1: '228 Test Road',
              city: 'Dhaka',
              countryCode: 'BD',
            },
          },
        },
        include: { customer: true },
      });
      // Only actor fields are read until the complete fixture is saved below.
      state = stateSchema.parse({
        adminUserId: owner.id,
        profileId: owner.adminProfile!.id,
        customerUserId: buyer.id,
        customerId: buyer.customer!.id,
        ...Object.fromEntries(
          [
            'reviewDomainId',
            'pendingDomainId',
            'queuedDomainId',
            'pendingInvoiceId',
            'queuedInvoiceId',
            'pendingPaymentId',
            'pendingKey',
            'queuedOperationId',
            'legacyLineId',
          ].map((key) => [key, randomUUID()]),
        ),
      });
      await actors();
      await module.get(DomainService).setup('150000', admin);
      const domains = [
        await register('review'),
        await register('pending'),
        await register('queued'),
      ];
      const offer = await prisma.domainOffer.findFirstOrThrow({
        where: { tld: 'com' },
      });
      await prisma.domainCatalogueTld.create({
        data: {
          tld: 'com',
          productId: offer.productId,
          renewalAmount: 170000n,
          enabled: false,
        },
      });
      const records: Array<{
        invoiceId: string;
        recordId: string;
        lineId: string;
      }> = [];
      for (const [index, domain] of domains.entries()) {
        const source = await prisma.$transaction((tx) =>
          domainRenewalContext(tx, domain.id, new Date()),
        );
        expect(source?.factCode).toBeNull();
        const terms = {
          schemaVersion: 1,
          years: 1,
          currency: 'BDT',
          amount: '170000',
          catalogueRevision: 1,
          bindingHash: source!.hash,
        };
        await prisma.domainRenewalPreference.create({
          data: { domainId: domain.id, enabled: true, terms },
        });
        await prisma.activityLog.create({
          data: {
            actorUserId: state.adminUserId,
            action: 'DOMAIN_RENEWAL_TERMS_CONFIRMED',
            entityType: 'DOMAIN',
            entityId: domain.id,
            metadata: { fictionalLegacyFixture: true, amount: '170000' },
          },
        });
        if (index === 0) continue;
        const end = addBillingPeriod(domain.expiresAt!, 'ANNUAL');
        const invoice = await prisma.invoice.create({
          data: {
            invoiceNumber: `LEGACY-228-${index}`,
            submissionKey: `legacy-228-${domain.id}`,
            customerId: state.customerId,
            status: 'UNPAID',
            currency: 'BDT',
            subtotal: 170000n,
            total: 170000n,
            balanceDue: 170000n,
            customerNameSnapshot: 'Fictional upgrade',
            customerEmailSnapshot: buyer.email,
            customerAddressSnapshot: {},
            businessIdentitySnapshot: { name: 'Fictional upgrade host' },
            issuedAt: new Date(Date.now() - 2 * 86400000),
            dueAt: domain.expiresAt!,
          },
        });
        const lineId = randomUUID();
        // Deliberately use only the legacy column set, before migration 57.
        await prisma.$executeRaw`INSERT INTO invoice_items(id,invoice_id,line_position,description_snapshot,currency,unit_amount,line_total,service_period_start,service_period_end) VALUES (${lineId}::uuid,${invoice.id}::uuid,1,'Fictional legacy renewal','BDT',170000,170000,${domain.expiresAt},${end})`;
        const renewal = await prisma.domainRenewalInvoice.create({
          data: {
            domainId: domain.id,
            customerId: state.customerId,
            invoiceId: invoice.id,
            sourceFactId: source!.latest!.id,
            termStart: domain.expiresAt!,
            termEnd: end,
            termsSnapshot: { ...terms, reminderPolicy: policy },
          },
        });
        records.push({ invoiceId: invoice.id, recordId: renewal.id, lineId });
      }
      state.reviewDomainId = domains[0].id;
      state.pendingDomainId = domains[1].id;
      state.queuedDomainId = domains[2].id;
      state.pendingInvoiceId = records[0].invoiceId;
      state.queuedInvoiceId = records[1].invoiceId;
      state.legacyLineId = records[0].lineId;
      const pending = await payments().submitManual(
        pendingInput(),
        customer,
        context,
      );
      state.pendingPaymentId = pending.payment.id;
      await payments().recordManual(
        {
          invoiceId: state.queuedInvoiceId,
          amount: '170000',
          submissionKey: randomUUID(),
          proof: { method: 'BANK_TRANSFER', reference: 'FICTIONAL-228-PAID' },
        },
        admin,
        context,
      );
      const credential = await prisma.registrarCredential.findFirstOrThrow({
        where: {
          accountId: domains[2].executionAccountId ?? domains[2].accountId,
        },
      });
      const queuedContext = await prisma.$transaction((tx) =>
        domainRenewalContext(tx, domains[2].id, new Date()),
      );
      const queued = await prisma.domainRenewalOperation.create({
        data: {
          id: state.queuedOperationId,
          renewalInvoiceId: records[1].recordId,
          domainId: domains[2].id,
          accountId: credential.accountId,
          customerId: state.customerId,
          credentialId: credential.id,
          approvedByUserId: state.adminUserId,
          bindingHash: queuedContext!.hash,
          reference: {
            accountId: credential.accountId,
            customerId: state.customerId,
            domainName: domains[2].domainName,
            providerOrderId: domains[2].providerOrderId,
            years: 1,
            previousExpiry: domains[2].expiresAt!.toISOString(),
            targetExpiry: addBillingPeriod(
              domains[2].expiresAt!,
              'ANNUAL',
            ).toISOString(),
          },
          costCeiling: 1000n,
          costCurrency: 'USD',
          attempt: 1,
          status: 'QUEUED',
        },
      });
      await prisma.outboxEvent.create({
        data: {
          aggregateType: 'DOMAIN_RENEWAL_OPERATION',
          aggregateId: queued.id,
          eventType: 'DOMAIN_RENEWAL_REQUESTED',
          idempotencyKey: `domain-renewal:${queued.id}`,
          payload: { schemaVersion: 1 },
        },
      });
      await prisma.$executeRaw`UPDATE __browser_e2e_scope SET fixture=${JSON.stringify(state)}::jsonb`;
      expect(await prisma.fakeRegistrarRenewal.count()).toBe(0);
      expect(
        await prisma.payment.count({
          where: { id: state.pendingPaymentId, status: 'PENDING' },
        }),
      ).toBe(1);
    }, 60000);
  } else {
    it('retains pending work, legacy reminders and a stable new-invoice review hold after migration', async () => {
      const queued = await prisma.domainRenewalOperation.findUniqueOrThrow({
        where: { id: state.queuedOperationId },
      });
      expect(
        await prisma.$transaction((tx) =>
          paidDomainRenewal(tx, queued.renewalInvoiceId),
        ),
      ).toBe(true);
      const source = await prisma.$transaction((tx) =>
        domainRenewalContext(tx, state.queuedDomainId, new Date()),
      );
      expect(source?.hash).toBe(queued.bindingHash);
      expect(
        (
          await prisma.domainRenewalOperation.findUniqueOrThrow({
            where: { id: state.queuedOperationId },
          })
        ).status,
      ).toBe('QUEUED');
      expect(
        (
          await prisma.payment.findUniqueOrThrow({
            where: { id: state.pendingPaymentId },
          })
        ).status,
      ).toBe('PENDING');
      expect(
        (
          await prisma.invoice.findUniqueOrThrow({
            where: { id: state.queuedInvoiceId },
          })
        ).status,
      ).toBe('PAID');
      await billing();
      await billing();
      expect(
        (await preferences().view(state.reviewDomainId, admin)).reviewCode,
      ).toBe('ATTRIBUTION_REQUIRES_REVIEW');
      expect(
        await prisma.domainRenewalInvoice.count({
          where: { domainId: state.reviewDomainId },
        }),
      ).toBe(0);
      expect(
        await prisma.outboxEvent.count({
          where: {
            aggregateId: state.pendingInvoiceId,
            eventType: 'EMAIL_RENEWAL_REMINDER',
          },
        }),
      ).toBe(1);
      expect(
        (await payments().submitManual(pendingInput(), customer, context))
          .duplicate,
      ).toBe(true);
      const before = await income();
      expect(BigInt(before.totals[2])).toBe(740000n + BigInt(alpha4.addedCash));
      const rollbackKey = `command228-rollback-${randomUUID()}`;
      await expect(
        prisma.$transaction(async (tx) => {
          await tx.setting.create({
            data: {
              key: rollbackKey,
              value: { fictional: true },
              category: 'BILLING',
            },
          });
          await tx.invoiceItem.update({
            where: { id: state.legacyLineId },
            data: {
              productAttributionSnapshot: snapshotDomainRenewalProduct({
                productId: randomUUID(),
                catalogueId: randomUUID(),
                catalogueRevision: 1,
                name: 'Rejected retroactive identity',
              }),
            },
          });
        }),
      ).rejects.toThrow();
      expect(await prisma.setting.count({ where: { key: rollbackKey } })).toBe(
        0,
      );
      expect(
        (
          await prisma.invoiceItem.findUniqueOrThrow({
            where: { id: state.legacyLineId },
          })
        ).productAttributionSnapshot,
      ).toBeNull();
    });
    it('requires administrator reconfirmation and creates one new attributed invoice on retries', async () => {
      const view = await preferences().view(state.reviewDomainId, admin);
      const domain = await prisma.domain.findUniqueOrThrow({
        where: { id: state.reviewDomainId },
      });
      const input = {
        confirmation: domain.domainName,
        expectedRevision: view.revision,
        enabled: true,
        years: 1 as const,
        sellingAmount: view.suggestedAmount!,
        catalogueRevision: view.catalogueRevision!,
        ordinaryRenewalConfirmed: true as const,
        reason: 'Fictional upgrade review of current annual terms.',
      };
      await expect(
        preferences().update(domain.id, input, customer, true),
      ).rejects.toMatchObject({ status: 403 });
      await expect(
        preferences().update(
          domain.id,
          input,
          { ...admin, supportAdministratorId: state.adminUserId },
          true,
        ),
      ).rejects.toMatchObject({ status: 403 });
      await preferences().update(domain.id, input, admin, true);
      await Promise.all([billing(), billing()]);
      const renewal = await prisma.domainRenewalInvoice.findFirstOrThrow({
        where: { domainId: domain.id },
      });
      expect(
        await prisma.domainRenewalInvoice.count({
          where: { domainId: domain.id },
        }),
      ).toBe(1);
      const line = await prisma.invoiceItem.findFirstOrThrow({
        where: { invoiceId: renewal.invoiceId },
      });
      expect(line.productAttributionSnapshot).toMatchObject({
        version: 2,
        kind: 'DOMAIN',
        source: 'DOMAIN_RENEWAL',
      });
      const pay = {
        invoiceId: renewal.invoiceId,
        amount: '170000',
        submissionKey: randomUUID(),
        proof: {
          method: 'BANK_TRANSFER' as const,
          reference: 'FICTIONAL-228-NEW',
        },
      };
      const charged = await payments().recordManual(pay, admin, context);
      expect(
        (await payments().recordManual(pay, admin, context)).payment.id,
      ).toBe(charged.payment.id);
      expect(
        await prisma.payment.count({
          where: {
            invoiceId: renewal.invoiceId,
            status: 'SUCCEEDED',
            kind: 'CHARGE',
          },
        }),
      ).toBe(1);
      await income();
    });
    it('settles the pre-upgrade pending payment once while leaving legacy lines and queued registrar work intact', async () => {
      const before = await prisma.invoiceItem.findMany({
        where: { invoiceId: state.pendingInvoiceId },
      });
      const reviewed = await Promise.allSettled([
        payments().review(
          state.pendingPaymentId,
          { action: 'VERIFY' },
          admin,
          context,
        ),
        payments().review(
          state.pendingPaymentId,
          { action: 'VERIFY' },
          admin,
          context,
        ),
      ]);
      expect(
        reviewed.filter((result) => result.status === 'fulfilled'),
      ).toHaveLength(1);
      expect(
        await prisma.invoice.findUniqueOrThrow({
          where: { id: state.pendingInvoiceId },
        }),
      ).toMatchObject({ status: 'PAID', amountPaid: 170000n, balanceDue: 0n });
      expect(
        (await payments().submitManual(pendingInput(), customer, context))
          .duplicate,
      ).toBe(true);
      expect(
        await prisma.payment.count({
          where: {
            invoiceId: state.pendingInvoiceId,
            status: 'SUCCEEDED',
            kind: 'CHARGE',
          },
        }),
      ).toBe(1);
      expect(
        await prisma.invoiceItem.findMany({
          where: { invoiceId: state.pendingInvoiceId },
        }),
      ).toEqual(before);
      const after = await income();
      expect(BigInt(after.totals[2])).toBe(1080000n + BigInt(alpha4.addedCash));
      expect(
        after.rows
          .filter((row) => row.id.startsWith('unknown|'))
          .reduce((sum, row) => sum + BigInt(row.cells[2]), 0n),
      ).toBe(340000n);
      expect(
        (
          await prisma.domainRenewalOperation.findUniqueOrThrow({
            where: { id: state.queuedOperationId },
          })
        ).status,
      ).toBe('QUEUED');
      expect(await prisma.fakeRegistrarRenewal.count()).toBe(0);
      expect(
        await prisma.service.count({ where: { status: 'ACTIVE' } }),
      ).toBeGreaterThan(0);
    });
    it('retains alpha.4 support and cancelled add-on history and settles its pending hosting renewal once', async () => {
      const ticket = await prisma.ticket.findUniqueOrThrow({
        where: { id: '10000000-0000-4000-8000-000000000015' },
      });
      expect(ticket.departmentId).toBe('21600000-0000-4000-8000-000000000001');
      expect(
        (
          await prisma.ticketMessage.findUniqueOrThrow({
            where: { id: alpha4.noteId },
          })
        ).kind,
      ).toBe('SYSTEM');
      const extras = await module
        .get(ServiceAddOnsService)
        .list(alpha4.serviceId, admin);
      expect(extras).toEqual([
        expect.objectContaining({
          id: alpha4.addOnId,
          recurringAmount: { amount: '25000', currency: 'BDT' },
          renewalEndsAt: '2026-09-01T03:00:00.000Z',
          manualCompletion: null,
        }),
      ]);
      expect(
        (
          await prisma.outboxEvent.findUniqueOrThrow({
            where: { id: alpha4.outboxId },
          })
        ).status,
      ).toBe('PENDING');
      const before = await prisma.invoiceItem.findMany({
        where: { invoiceId: alpha4.pendingInvoiceId },
      });
      expect(before).toHaveLength(1);
      expect(before[0].lineTotal).toBe(120000n);
      expect(before[0].productAttributionSnapshot).toBeNull();
      const results = await Promise.allSettled([
        payments().review(
          alpha4.pendingPaymentId,
          { action: 'VERIFY' },
          admin,
          context,
        ),
        payments().review(
          alpha4.pendingPaymentId,
          { action: 'VERIFY' },
          admin,
          context,
        ),
      ]);
      expect(
        results.filter((result) => result.status === 'fulfilled'),
      ).toHaveLength(1);
      expect(
        await prisma.payment.count({
          where: {
            invoiceId: alpha4.pendingInvoiceId,
            kind: 'CHARGE',
            status: 'SUCCEEDED',
          },
        }),
      ).toBe(1);
      expect(
        await prisma.invoice.findUniqueOrThrow({
          where: { id: alpha4.pendingInvoiceId },
        }),
      ).toMatchObject({ status: 'PAID', amountPaid: 120000n, balanceDue: 0n });
      expect(
        await prisma.invoiceItem.findMany({
          where: { invoiceId: alpha4.pendingInvoiceId },
        }),
      ).toEqual(before);
      expect(
        (
          await prisma.service.findUniqueOrThrow({
            where: { id: alpha4.serviceId },
          })
        ).status,
      ).toBe('ACTIVE');
      expect(BigInt((await income()).totals[2])).toBe(1345000n);
      await expect(
        prisma.invoiceItem.update({
          where: { id: before[0].id },
          data: {
            productAttributionSnapshot: snapshotDomainRenewalProduct({
              productId: randomUUID(),
              catalogueId: randomUUID(),
              catalogueRevision: 1,
              name: 'Rejected legacy label',
            }),
          },
        }),
      ).rejects.toThrow(/immutable/);
    });
  }
});
