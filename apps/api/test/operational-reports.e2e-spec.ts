import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { parseApiEnvironment } from '@webhost-billing/config';
import type { PrismaClient, Prisma } from '@webhost-billing/database';
import { RegistrarProcessor } from '@webhost-billing/database/registrar';
import {
  apiSuccessResponseSchema,
  operationalReportRequestSchema,
  type OperationalReportId,
} from '@webhost-billing/shared';
import { z } from 'zod';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { API_ENVIRONMENT } from '../src/infrastructure/environment/environment.module';
import { PRISMA_CLIENT } from '../src/infrastructure/database/database.module';
import type { AuthRequestContext } from '../src/modules/auth/auth.types';
import { PasswordHasherService } from '../src/modules/auth/services/password-hasher.service';
import { DomainService } from '../src/modules/domains/domain.service';
import { PaymentService } from '../src/modules/payments/payment.service';
import { TotpService } from '../src/modules/auth/services/totp.service';
import { OperationalReportService } from '../src/modules/dashboard-reports/operational-report.service';

const period = { from: '2028-04-01', to: '2028-04-01' };
const at = new Date('2028-03-31T18:00:00.000Z'); // Exactly midnight in Dhaka.
const end = new Date('2028-04-01T18:00:00.000Z');
const password = 'fictional command224 report password';
describe('operational reports with isolated fictional records', () => {
  let module: TestingModule;
  let app: INestApplication<App>;
  let db: PrismaClient;
  let reports: OperationalReportService;
  let admin: AuthRequestContext;
  let customer: AuthRequestContext;
  let customerId: string;
  let serviceId: string;
  let addOnId: string;
  let hostingCancellationId: string;
  let renewalId: string;
  let renewalInvoiceId: string;
  let departmentId: string;
  let changeId: string;
  const tag = randomUUID().slice(0, 8);
  const adminEmail = `report-admin-${tag}@example.test`;
  const customerEmail = `report-customer-${tag}@example.test`;
  const restrictedEmail = `report-support-${tag}@example.test`;
  const label = `=Fictional report ${tag}`;
  const context = { ipAddressHash: 'fictional-report-224' };
  beforeAll(async () => {
    if (
      !/^command26_e2e_[a-f0-9]{32}$/.test(
        process.env.WEBHOST_BROWSER_E2E_SCHEMA ?? '',
      )
    )
      throw new Error('Use the guarded fictional schema launcher.');
    module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(API_ENVIRONMENT)
      .useValue(
        parseApiEnvironment({
          ...process.env,
          PORT: process.env.API_PORT ?? '3001',
          NODE_ENV: 'test',
          AUTH_RATE_LIMIT_NAMESPACE: `reports-${tag}`,
          BULLMQ_PREFIX: `reports-${tag}`,
        }),
      )
      .compile();
    app = module.createNestApplication();
    await app.init();
    db = module.get(PRISMA_CLIENT);
    reports = module.get(OperationalReportService);
    const hash = await module.get(PasswordHasherService).hash(password);
    const administrator = await db.user.create({
      data: {
        email: adminEmail,
        passwordHash: hash,
        role: 'ADMIN',
        status: 'ACTIVE',
        emailVerifiedAt: new Date(),
        adminProfile: {
          create: {
            displayName: 'Fictional report administrator',
            isSuperAdmin: true,
          },
        },
      },
      include: { adminProfile: true },
    });
    const buyer = await db.user.create({
      data: {
        email: customerEmail,
        passwordHash: hash,
        role: 'CUSTOMER',
        status: 'ACTIVE',
        emailVerifiedAt: new Date(),
        customer: {
          create: {
            customerNumber: `R224-${tag}`,
            firstName: 'Fictional',
            lastName: 'Reports',
            addressLine1: '224 Fictional Road',
            city: 'Dhaka',
            countryCode: 'BD',
          },
        },
      },
      include: { customer: true },
    });
    await db.user.create({
      data: {
        email: restrictedEmail,
        passwordHash: hash,
        role: 'ADMIN',
        status: 'ACTIVE',
        emailVerifiedAt: new Date(),
        adminProfile: {
          create: {
            displayName: 'Fictional support operator',
            staffRole: 'SUPPORT_OPERATOR',
          },
        },
      },
    });
    customerId = buyer.customer!.id;
    admin = {
      sessionId: randomUUID(),
      identity: {
        role: 'ADMIN',
        userId: administrator.id,
        adminProfileId: administrator.adminProfile!.id,
        email: adminEmail,
        staffRole: 'FULL_ADMINISTRATOR',
        twoFactorEnabled: false,
      },
    };
    customer = {
      sessionId: randomUUID(),
      identity: {
        role: 'CUSTOMER',
        userId: buyer.id,
        customerId,
        email: customerEmail,
      },
    };
    const products = await Promise.all(
      (['HOSTING', 'ADD_ON', 'DOMAIN', 'ADD_ON'] as const).map((kind, index) =>
        db.product.create({
          data: {
            kind,
            slug: `report-${index}-${tag}`,
            name:
              index === 0
                ? label
                : index === 3
                  ? `Fictional migration ${tag}`
                  : `Fictional ${kind.toLowerCase()} ${tag}`,
            prices: {
              create: {
                billingPeriod:
                  kind === 'DOMAIN'
                    ? 'ANNUAL'
                    : index === 3
                      ? 'ONE_TIME'
                      : 'MONTHLY',
                currency: 'BDT',
                amount: BigInt([100, 60, 40, 20][index]),
              },
            },
          },
          include: { prices: true },
        }),
      ),
    );
    const order = await db.order.create({
      data: {
        orderNumber: `R224-${tag}`,
        submissionKey: randomUUID(),
        customerId,
        status: 'PAID',
        currency: 'BDT',
        subtotal: 220n,
        total: 220n,
        customerEmailSnapshot: customerEmail,
        items: {
          create: products.map((product, index) => ({
            kind: product.kind,
            productId: product.id,
            productPriceId: product.prices[0].id,
            productNameSnapshot: index === 0 ? label : product.name,
            billingPeriod: product.prices[0].billingPeriod,
            currency: 'BDT',
            unitAmount: BigInt([100, 60, 40, 20][index]),
            lineTotal: BigInt([100, 60, 40, 20][index]),
            fulfilledAt: at,
          })),
        },
      },
      include: { items: { orderBy: { productNameSnapshot: 'asc' } } },
    });
    const base = order.items.find((row) => row.kind === 'HOSTING')!;
    const addOn = order.items.find(
      (row) => row.kind === 'ADD_ON' && row.billingPeriod === 'MONTHLY',
    )!;
    addOnId = addOn.id;
    const server = await db.server.create({
      data: {
        name: `Fictional reports ${tag}`,
        hostname: `reports-${tag}.example.test`,
        adapterKey: 'fake-panel',
      },
    });
    const service = await db.service.create({
      data: {
        customerId,
        orderItemId: base.id,
        productId: base.productId,
        productPriceId: base.productPriceId,
        serverId: server.id,
        status: 'ACTIVE',
        externalAccountId: `fictional-report-${tag}`,
        controlPanelUsername: `r${tag}`,
        activatedAt: at,
        domain: `reports-${tag}.example.test`,
        productNameSnapshot: label,
        billingPeriod: 'MONTHLY',
        recurringAmount: 100n,
        currency: 'BDT',
        startedAt: new Date('2028-03-01T00:00:00Z'),
        nextDueAt: at,
      },
    });
    serviceId = service.id;
    const paid = await invoice(220n, 99n, {
      orderId: order.id,
      items: {
        create: order.items.map((item) => ({
          orderItemId: item.id,
          linePosition:
            item.kind === 'HOSTING'
              ? 1
              : item.kind === 'DOMAIN'
                ? 3
                : item.billingPeriod === 'ONE_TIME'
                  ? 4
                  : 2,
          descriptionSnapshot: item.productNameSnapshot,
          currency: 'BDT',
          unitAmount: item.lineTotal,
          lineTotal: item.lineTotal,
        })),
      },
    });
    const charge = await payment(paid.id, 143n, 'CHARGE', at);
    await payment(
      paid.id,
      33n,
      'REFUND',
      new Date(at.getTime() + 1),
      charge.id,
    );
    await payment(
      paid.id,
      11n,
      'REVERSAL',
      new Date(at.getTime() + 2),
      charge.id,
    );
    const unknown = await invoice(50n, 50n, {
      items: {
        create: {
          linePosition: 1,
          descriptionSnapshot: 'Unlinked fictional line',
          currency: 'BDT',
          unitAmount: 50n,
          lineTotal: 50n,
        },
      },
    });
    await payment(unknown.id, 50n, 'CHARGE', at);
    await payment(unknown.id, 999n, 'CHARGE', new Date(at.getTime() - 1));
    await payment(unknown.id, 999n, 'CHARGE', end);
    const foreign = await invoice(999n, 999n, { currency: 'USD' });
    await payment(foreign.id, 999n, 'CHARGE', at, undefined, 'USD');
    const renewal = await invoice(160n, 100n, {
      items: {
        create: [
          {
            linePosition: 1,
            serviceId,
            descriptionSnapshot: 'Renewal: historical starter',
            currency: 'BDT',
            unitAmount: 100n,
            lineTotal: 100n,
            servicePeriodStart: at,
            servicePeriodEnd: end,
          },
          {
            linePosition: 2,
            orderItemId: addOn.id,
            descriptionSnapshot: 'Renewal: historical backup',
            currency: 'BDT',
            unitAmount: 60n,
            lineTotal: 60n,
            servicePeriodStart: at,
            servicePeriodEnd: end,
          },
        ],
      },
    });
    renewalInvoiceId = renewal.id;
    // Current balances need not imply a cash movement in the selected cash period.
    const cancelled = await invoice(30n, 0n, {
      status: 'CANCELLED',
      cancelledAt: at,
      items: {
        create: {
          linePosition: 1,
          serviceId,
          descriptionSnapshot: 'Cancelled renewal',
          currency: 'BDT',
          unitAmount: 30n,
          lineTotal: 30n,
          servicePeriodStart: new Date(at.getTime() - 86400000),
          servicePeriodEnd: at,
        },
      },
    });
    expect(cancelled.status).toBe('CANCELLED');
    departmentId = (
      await db.supportDepartment.create({
        data: { name: `Fictional reports ${tag}`, enabled: false },
      })
    ).id;
    for (const [index, status] of (
      ['OPEN', 'WAITING_FOR_CUSTOMER', 'WAITING_FOR_STAFF', 'CLOSED'] as const
    ).entries())
      await db.ticket.create({
        data: {
          ticketNumber: `R224-${tag}-${index}`,
          customerId,
          departmentId,
          subject: 'Fictional workload only',
          status,
          createdAt: at,
        },
      });
    const change = await db.serviceUpgrade.create({
      data: {
        serviceId,
        status: 'QUOTED',
        quote: {
          change: 'DOWNGRADE',
          immediateCharge: { amount: '0', currency: 'BDT' },
          current: { name: label },
          target: { name: 'Fictional smaller plan' },
        },
        contextHash: 'a'.repeat(64),
        createdAt: at,
      },
    });
    changeId = change.id;
    // Register through the in-process fake adapter, then retain a fictional fact.
    const totp = module.get(TotpService);
    const operator = await db.user.create({
      data: {
        email: `report-domain-${tag}@example.test`,
        role: 'ADMIN',
        status: 'ACTIVE',
        emailVerifiedAt: new Date(),
        adminProfile: { create: { displayName: 'Fictional domain operator' } },
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
    const domainActor: AuthRequestContext = {
      sessionId: randomUUID(),
      identity: {
        role: 'ADMIN',
        userId: operator.id,
        email: operator.email,
        adminProfileId: operator.adminProfile!.id,
        staffRole: 'FULL_ADMINISTRATOR',
        twoFactorEnabled: true,
      },
    };
    const domains = module.get(DomainService);
    await domains.setup('150000', domainActor);
    const offer = (await domains.offers()).find((row) => row.tld === 'com')!;
    const quote = await domains.quote(
      {
        offerId: offer.id,
        domainName: `report-${tag}.com`,
        contact: {
          name: 'Fictional registrant',
          company: 'Fictional reports',
          address: '224 Fictional Road',
          city: 'Dhaka',
          region: 'Dhaka',
          postalCode: '1212',
          country: 'BD',
          email: 'reports@example.test',
          phoneCountryCode: '880',
          phone: '1700000000',
        },
        agreement: 'fictional-registration-v1',
        consent: true,
      },
      customer,
    );
    const purchased = await domains.purchase(
      { quoteId: quote.id, submissionKey: randomUUID() },
      customer,
    );
    await module.get(PaymentService).recordManual(
      {
        invoiceId: purchased.invoiceId!,
        amount: '150000',
        submissionKey: randomUUID(),
        proof: {
          method: 'BANK_TRANSFER',
          reference: `FICTIONAL-${randomUUID()}`,
        },
      },
      domainActor,
      context,
    );
    await domains.approve(
      purchased.id,
      {
        confirmation: purchased.domainName,
        costCeiling: '1000',
        costCurrency: 'USD',
      },
      domainActor,
    );
    const operation = await db.registrarOperation.findUniqueOrThrow({
      where: { domainId: purchased.id },
    });
    await new RegistrarProcessor(
      db,
      process.env.CREDENTIAL_ENCRYPTION_KEY!,
    ).process(operation.id);
    const domain = await db.domain.findUniqueOrThrow({
      where: { id: purchased.id },
    });
    expect(domain.state).toBe('REGISTERED');
    const accountId = domain.executionAccountId ?? domain.accountId;
    const credential = await db.registrarCredential.findFirstOrThrow({
      where: { accountId },
    });
    const fact = await db.domainFactSync.create({
      data: {
        id: randomUUID(),
        domainId: domain.id,
        customerId,
        accountId,
        providerOrderId: domain.providerOrderId!,
        bindingHash: 'b'.repeat(64),
        status: 'SUCCEEDED',
        facts: { fictional: true },
        startedAt: at,
        finishedAt: at,
        appliedAt: at,
      },
    });
    const domainInvoice = await invoice(40n, 0n, {
      items: {
        create: {
          linePosition: 1,
          descriptionSnapshot: 'Fictional domain renewal',
          currency: 'BDT',
          unitAmount: 40n,
          lineTotal: 40n,
          servicePeriodStart: at,
          servicePeriodEnd: end,
        },
      },
    });
    const domainRenewal = await db.domainRenewalInvoice.create({
      data: {
        domainId: domain.id,
        customerId,
        invoiceId: domainInvoice.id,
        sourceFactId: fact.id,
        termStart: at,
        termEnd: end,
        termsSnapshot: { amount: '40' },
      },
    });
    renewalId = domainRenewal.id;
    await db.domainRenewalOperation.create({
      data: {
        id: randomUUID(),
        renewalInvoiceId: renewalId,
        domainId: domainRenewal.domainId,
        accountId,
        customerId,
        credentialId: credential.id,
        approvedByUserId: operator.id,
        bindingHash: 'b'.repeat(64),
        reference: {
          accountId,
          customerId,
          domainName: domain.domainName,
          providerOrderId: domain.providerOrderId,
          years: 1,
          previousExpiry: at.toISOString(),
          targetExpiry: end.toISOString(),
        },
        costCeiling: 1n,
        attempt: 1,
        status: 'REJECTED',
        code: 'UNKNOWN_OUTCOME',
        createdAt: at,
      },
    });
    const rejected = await db.domainRenewalOperation.findFirstOrThrow({
      where: { renewalInvoiceId: renewalId },
    });
    await db.domainRenewalOperation.create({
      data: {
        id: randomUUID(),
        renewalInvoiceId: renewalId,
        domainId: domain.id,
        accountId,
        customerId,
        credentialId: credential.id,
        approvedByUserId: operator.id,
        bindingHash: rejected.bindingHash,
        reference: rejected.reference as Prisma.InputJsonValue,
        costCeiling: 1n,
        attempt: 2,
        status: 'NEEDS_RECONCILIATION',
        submittedAt: at,
        createdAt: at,
      },
    });
  }, 120000);
  afterAll(async () => {
    await app?.close();
  }); // The launcher owns schema removal; financial history is never hard-deleted here.
  function read(id: OperationalReportId, page = 1, pageSize = 100) {
    return reports.list(
      id,
      operationalReportRequestSchema.parse({ ...period, page, pageSize }),
      admin,
    );
  }
  async function invoice(
    total: bigint,
    paid: bigint,
    extra: Partial<Prisma.InvoiceUncheckedCreateInput> = {},
  ) {
    return db.invoice.create({
      data: {
        invoiceNumber: `R224-${randomUUID().slice(0, 16)}`,
        submissionKey: randomUUID(),
        customerId,
        status: paid === total ? 'PAID' : 'UNPAID',
        currency: 'BDT',
        subtotal: total,
        total,
        amountPaid: paid,
        balanceDue: total - paid,
        customerNameSnapshot: 'Fictional reports',
        customerEmailSnapshot: customerEmail,
        customerAddressSnapshot: { fictional: true },
        businessIdentitySnapshot: { name: 'Fictional host' },
        issuedAt: at,
        dueAt: at,
        paidAt: paid === total ? at : null,
        ...extra,
      },
    });
  }
  function payment(
    invoiceId: string,
    amount: bigint,
    kind: 'CHARGE' | 'REFUND' | 'REVERSAL',
    verifiedAt: Date,
    originalPaymentId?: string,
    currency = 'BDT',
  ) {
    return db.payment.create({
      data: {
        invoiceId,
        amount,
        kind,
        verifiedAt,
        originalPaymentId,
        currency,
        status: 'SUCCEEDED',
        provider: 'fictional-report',
        idempotencyKey: randomUUID(),
      },
    });
  }
  it('reconciles allocated product cash to successful charges and adjustments within exact Dhaka boundaries', async () => {
    const result = await read('income');
    expect(result.totals[2]).toBe('149');
    expect(result.rows.find((row) => row.cells[0] === label)?.cells[2]).toBe(
      '45',
    );
    expect(
      result.rows.find((row) => row.cells[0] === `Fictional add_on ${tag}`)
        ?.cells[2],
    ).toBe('27');
    expect(
      result.rows.find((row) => row.cells[0] === `Fictional migration ${tag}`)
        ?.cells[2],
    ).toBe('9');
    expect(result.rows.find((row) => row.cells[1] === 'Domain')?.cells[2]).toBe(
      '18',
    );
    expect(
      result.rows.find((row) => row.cells[0] === 'Unattributed product')
        ?.cells[2],
    ).toBe('50');
    expect((await read('income')).totals).toEqual(result.totals);
    const cash = await db.payment.findMany({
      where: {
        status: 'SUCCEEDED',
        currency: 'BDT',
        verifiedAt: { gte: at, lt: end },
      },
    });
    expect(
      cash
        .reduce(
          (sum, p) => sum + (p.kind === 'CHARGE' ? p.amount : -p.amount),
          0n,
        )
        .toString(),
    ).toBe(result.totals[2]);
  });
  it('counts each renewal invoice once with current paid and outstanding amounts', async () => {
    const result = await read('renewals');
    const row = result.rows.find((row) => row.id === renewalInvoiceId)!;
    expect(row.cells.slice(3)).toEqual(['160', '100', '0', '60']);
    expect(result.totals.slice(3)).toEqual(['200', '100', '0', '100']); // Includes the separate unattempted domain invoice.
    expect(
      result.rows.filter((row) => row.id === renewalInvoiceId),
    ).toHaveLength(1);
  });
  it('forecasts one next cycle from purchased hosting and add-on amounts without one-time charges or catalogue repricing', async () => {
    const before = await read('recurring');
    expect(before.totals[4]).toBe('160');
    await db.product.update({
      where: {
        id: (await db.orderItem.findUniqueOrThrow({ where: { id: addOnId } }))
          .productId,
      },
      data: { name: 'Changed catalogue label', status: 'ARCHIVED' },
    });
    expect((await read('recurring')).totals).toEqual(before.totals);
    expect(
      (await read('recurring')).rows.some(
        (row) => row.cells[0] === 'Changed catalogue label',
      ),
    ).toBe(false);
    await db.orderItem.update({
      where: { id: addOnId },
      data: { renewalEndsAt: at },
    });
    expect((await read('recurring')).totals[4]).toBe('100');
    expect(
      (await db.service.findUniqueOrThrow({ where: { id: serviceId } })).status,
    ).toBe('ACTIVE');
  });

  it('keeps cash above JavaScript integer precision exact through database aggregation and export', async () => {
    const huge = 9007199254740993n;
    const sample = await invoice(huge, huge);
    await payment(sample.id, huge, 'CHARGE', new Date('2030-04-01T00:00:00Z'));
    const scope = { from: '2030-04-01', to: '2030-04-01' };
    const result = await reports.list(
      'income',
      operationalReportRequestSchema.parse(scope),
      admin,
    );
    expect(result.totals[2]).toBe(huge.toString());
    expect(
      (await reports.exportCsv('income', scope, admin, context)).body,
    ).toContain(`"${huge}"`);
  });
  it('keeps plan-change history distinct from sales and reports unknown registrar outcomes without exposing credential data', async () => {
    const changes = await read('plan-changes');
    expect(
      changes.rows.find((row) => row.id === changeId)?.cells.slice(1, 5),
    ).toEqual(['Downgrade', label, 'Fictional smaller plan', 'Quoted']);
    const domain = await read('domain-renewals');
    expect(domain.rows).toHaveLength(1);
    expect(domain.rows[0].cells[3]).toBe('Needs reconciliation');
    expect(domain.totals.every((value) => value === '')).toBe(true); // Attempt numbers are ordinals, not additive counts.
    expect(JSON.stringify(domain)).not.toMatch(
      /credential|bindingHash|reference|costCeiling/,
    );
    const previous = await db.domainRenewalOperation.findFirstOrThrow({
      where: { renewalInvoiceId: renewalId },
      orderBy: { attempt: 'desc' },
    });
    await db.domainRenewalOperation.update({
      where: { id: previous.id },
      data: {
        status: 'SUCCEEDED',
        completedAt: new Date(at.getTime() + 100),
        expiryAfter: end,
      },
    });
    expect((await read('domain-renewals')).rows).toHaveLength(0);
  });
  it('includes archived departments and current workload while limiting created counts to the selected period', async () => {
    const result = await read('support');
    expect(
      result.rows.find((row) => row.id === departmentId)?.cells.slice(1),
    ).toEqual(['4', '1', '2', '1']);
  });
  it('shows pending manual cancellation work and excludes only an exact acknowledgement', async () => {
    await db.orderItem.update({
      where: { id: addOnId },
      data: { renewalEndsAt: at },
    });
    hostingCancellationId = (
      await db.hostingCancellationRequest.create({
        data: { serviceId, timing: 'END_OF_PERIOD', effectiveAt: at },
      })
    ).id;
    let queue = await read('cancellations');
    expect(queue.rows.some((row) => row.id === hostingCancellationId)).toBe(
      true,
    );
    expect(queue.rows.some((row) => row.id === addOnId)).toBe(true);
    await db.activityLog.create({
      data: {
        actorUserId: admin.identity.userId,
        action: 'HOSTING_ADD_ON_CANCELLATION_COMPLETED',
        entityType: 'SERVICE',
        entityId: serviceId,
        createdAt: new Date(at.getTime() + 100),
        metadata: {
          orderItemId: addOnId,
          renewalEndsAt: end.toISOString(),
          completedByUserId: admin.identity.userId,
          completedByName: 'Fictional admin',
        },
      },
    });
    expect(
      (await read('cancellations')).rows.some((row) => row.id === addOnId),
    ).toBe(true);
    await db.activityLog.create({
      data: {
        actorUserId: admin.identity.userId,
        action: 'HOSTING_ADD_ON_CANCELLATION_COMPLETED',
        entityType: 'SERVICE',
        entityId: serviceId,
        createdAt: new Date(at.getTime() + 200),
        metadata: {
          orderItemId: addOnId,
          renewalEndsAt: at.toISOString(),
          completedByUserId: admin.identity.userId,
          completedByName: 'Fictional admin',
        },
      },
    });
    queue = await read('cancellations');
    expect(queue.rows.some((row) => row.id === addOnId)).toBe(false);
    expect(
      (await read('recurring')).rows.some((row) => row.cells[0] === label),
    ).toBe(false);
    expect(
      (await db.service.findUniqueOrThrow({ where: { id: serviceId } })).status,
    ).toBe('ACTIVE');
  });
  it('paginates complete result totals, handles an empty page and exports safe audited exact values', async () => {
    const full = await read('income');
    const first = await read('income', 1, 1);
    const second = await read('income', 2, 1);
    expect(first.rows).toHaveLength(1);
    expect(first.rows[0].id).not.toBe(second.rows[0].id);
    expect(first.totals).toEqual(full.totals);
    expect(first.pagination.totalItems).toBe(full.rows.length);
    const empty = await read('income', 100, 1);
    expect(empty.rows).toHaveLength(0);
    expect(empty.totals).toEqual(full.totals);
    const csv = await reports.exportCsv('income', period, admin, context);
    expect(csv.rowCount).toBe(full.rows.length);
    expect(csv.body).toContain(`"'${label}"`);
    expect(csv.body).toContain('Net collected (minor units)');
    expect(csv.body).not.toMatch(/password|credential|@example.test/);
    const audit = await db.activityLog.findFirstOrThrow({
      where: {
        actorUserId: admin.identity.userId,
        action: 'REPORT_CSV_EXPORTED_BY_ADMIN',
      },
      orderBy: { createdAt: 'desc' },
    });
    expect(audit.metadata).toMatchObject({
      report: 'income',
      rowCount: full.rows.length,
      currency: 'BDT',
      timeZone: 'Asia/Dhaka',
      ...period,
    });
  });
  it('denies customer, restricted staff and support sessions at the service boundary before reading', async () => {
    const query = operationalReportRequestSchema.parse(period);
    if (admin.identity.role !== 'ADMIN')
      throw new Error('Expected fictional administrator.');
    for (const actor of [
      customer,
      {
        ...admin,
        identity: { ...admin.identity, staffRole: 'SUPPORT_OPERATOR' as const },
      },
      { ...admin, supportAdministratorId: admin.identity.userId },
    ]) {
      await expect(reports.list('income', query, actor)).rejects.toMatchObject({
        status: 403,
      });
      await expect(
        reports.exportCsv('income', period, actor, context),
      ).rejects.toMatchObject({ status: 403 });
    }
  });
  it('serves authenticated report routes and protects filters and exports with role and CSRF guards', async () => {
    const full = request.agent(app.getHttpServer());
    const csrf = await login(full, adminEmail);
    await full.get('/reports/operations/income').query(period).expect(200);
    await full
      .get('/reports/operations/income')
      .query({ ...period, currency: 'USD' })
      .expect(400);
    await full.get('/reports/operations/not-a-report').expect(400);
    await full
      .post('/reports/operations/income/export')
      .send(period)
      .expect(403);
    const csv = await full
      .post('/reports/operations/income/export')
      .set('X-CSRF-Token', csrf)
      .send(period)
      .expect(200);
    expect(csv.headers['cache-control']).toBe('no-store');
    expect(csv.headers['x-content-type-options']).toBe('nosniff');
    const buyer = request.agent(app.getHttpServer());
    await login(buyer, customerEmail);
    await buyer.get('/reports/operations/income').expect(403);
    const staff = request.agent(app.getHttpServer());
    await login(staff, restrictedEmail);
    await staff.get('/reports/operations/income').expect(403);
    await request(app.getHttpServer())
      .get('/reports/operations/income')
      .expect(401);
  });
  async function login(agent: ReturnType<typeof request.agent>, email: string) {
    const csrfResponse = await agent.get('/auth/csrf').expect(200);
    const csrf = apiSuccessResponseSchema(
      z.object({ csrfToken: z.string().min(32) }).strict(),
    ).parse(csrfResponse.body).data.csrfToken;
    await agent
      .post('/auth/login')
      .set('X-CSRF-Token', csrf)
      .send({ email, password })
      .expect(200);
    return csrf;
  }
});
