import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { Test, type TestingModule } from '@nestjs/testing';
import { parseApiEnvironment } from '@webhost-billing/config';
import { Prisma, type PrismaClient } from '@webhost-billing/database';
import type { AuthRequestContext } from '../src/modules/auth/auth.types';
import { AppModule } from '../src/app.module';
import { API_ENVIRONMENT } from '../src/infrastructure/environment/environment.module';
import { PRISMA_CLIENT } from '../src/infrastructure/database/database.module';
import { HostingUpgradeService } from '../src/modules/services/hosting-upgrade.service';
import { PaymentService } from '../src/modules/payments/payment.service';
import { FakeHostingPanel } from '../src/modules/hosting-panels/fake-hosting-panel';
import { HostingPanelProviderError } from '../src/modules/hosting-panels/hosting-panel.error';
import { HostingPanelService } from '../src/modules/hosting-panels/hosting-panel.service';
import { HostingCancellationService } from '../src/modules/services/hosting-cancellation.service';
import { ServiceAddOnsService } from '../src/modules/services/service-add-ons.service';
import { ServiceService } from '../src/modules/services/service.service';
import { nextServiceDueAt } from '../src/modules/services/service-period';
import { hostingUpgradeQuoteSchema } from '@webhost-billing/shared';
import {
  invoiceProductAttributionSchema,
  operationalReportRequestSchema,
  PARTIAL_PAYMENT_POLICY_CONFIRMATION,
} from '@webhost-billing/shared';
import { OperationalReportService } from '../src/modules/dashboard-reports/operational-report.service';
import { businessDate } from '../src/modules/dashboard-reports/dashboard-period';

describe('paid hosting upgrade acceptance', () => {
  let module: TestingModule;
  let prisma: PrismaClient;
  let upgrades: HostingUpgradeService;
  let payments: PaymentService;
  let fake: FakeHostingPanel;
  const context = { ipAddressHash: 'fictional-upgrade-ip' };
  beforeAll(async () => {
    module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(API_ENVIRONMENT)
      .useValue(
        parseApiEnvironment({
          ...process.env,
          PORT: process.env.API_PORT ?? '3001',
          NODE_ENV: 'test',
          AUTH_RATE_LIMIT_NAMESPACE: `upgrade-${randomUUID()}`,
        }),
      )
      .compile();
    await module.init();
    prisma = module.get(PRISMA_CLIENT);
    upgrades = module.get(HostingUpgradeService);
    payments = module.get(PaymentService);
    fake = module.get(FakeHostingPanel);
  });
  afterEach(() => jest.restoreAllMocks());
  afterAll(async () => module?.close());

  async function fixture(withAddOns = false) {
    const suffix = randomUUID();
    const adminUser = await prisma.user.create({
      data: {
        email: `upgrade-admin-${suffix}@example.test`,
        role: 'ADMIN',
        status: 'ACTIVE',
        emailVerifiedAt: new Date(),
        adminProfile: { create: { displayName: 'Fictional upgrade admin' } },
      },
      include: { adminProfile: true },
    });
    const user = await prisma.user.create({
      data: {
        email: `upgrade-buyer-${suffix}@example.test`,
        role: 'CUSTOMER',
        status: 'ACTIVE',
        emailVerifiedAt: new Date(),
        customer: {
          create: {
            customerNumber: `CUS-${suffix.slice(0, 20)}`,
            firstName: 'Fictional',
            lastName: 'Upgrade',
            addressLine1: '211 Test Road',
            city: 'Dhaka',
            countryCode: 'BD',
          },
        },
      },
      include: { customer: true },
    });
    const admin: AuthRequestContext = {
      sessionId: randomUUID(),
      identity: {
        role: 'ADMIN',
        userId: adminUser.id,
        adminProfileId: adminUser.adminProfile!.id,
        email: adminUser.email,
        staffRole: 'FULL_ADMINISTRATOR',
        twoFactorEnabled: false,
      },
    };
    const customer: AuthRequestContext = {
      sessionId: randomUUID(),
      identity: {
        role: 'CUSTOMER',
        userId: user.id,
        customerId: user.customer!.id,
        email: user.email,
      },
    };
    const source = await prisma.product.create({
      data: {
        slug: `source-${suffix}`,
        name: 'Fictional starter',
        status: 'ACTIVE',
        publicVisible: true,
        hostingPackageIdentifier: 'fictional_starter',
        prices: {
          create: {
            billingPeriod: 'MONTHLY',
            currency: 'BDT',
            amount: 100_000n,
          },
        },
      },
      include: { prices: true },
    });
    const target = await prisma.product.create({
      data: {
        slug: `target-${suffix}`,
        name: 'Fictional business',
        status: 'ACTIVE',
        publicVisible: true,
        hostingPackageIdentifier: 'fictional_business',
        prices: {
          create: {
            billingPeriod: 'MONTHLY',
            currency: 'BDT',
            amount: 160_000n,
          },
        },
      },
      include: { prices: true },
    });
    const extras = withAddOns
      ? await Promise.all(
          (['MONTHLY', 'ONE_TIME'] as const).map((billingPeriod, index) =>
            prisma.product.create({
              data: {
                kind: 'ADD_ON',
                slug: `attribution-extra-${index}-${suffix}`,
                name:
                  index === 0
                    ? 'Fictional purchased backup'
                    : 'Fictional migration',
                status: 'ACTIVE',
                eligibleHostingPlans: {
                  create: [
                    { hostingProductId: source.id },
                    { hostingProductId: target.id },
                  ],
                },
                prices: {
                  create: {
                    billingPeriod,
                    currency: 'BDT',
                    amount: index === 0 ? 15000n : 5000n,
                  },
                },
              },
              include: { prices: true },
            }),
          ),
        )
      : [];
    const total = withAddOns ? 120000n : 100000n;
    const server = await prisma.server.create({
      data: {
        name: `Upgrade ${suffix}`,
        hostname: `${suffix}.example.test`,
        adapterKey: 'fake-panel',
      },
    });
    const order = await prisma.order.create({
      data: {
        orderNumber: `UP-${suffix.slice(0, 12)}`,
        submissionKey: suffix,
        customerId: user.customer!.id,
        status: 'AWAITING_PAYMENT',
        currency: 'BDT',
        subtotal: total,
        total,
        customerEmailSnapshot: user.email,
        items: {
          create: [
            {
              productId: source.id,
              productPriceId: source.prices[0].id,
              productNameSnapshot: source.name,
              billingPeriod: 'MONTHLY',
              currency: 'BDT',
              unitAmount: 100_000n,
              lineTotal: 100_000n,
              requestedDomain: `${suffix}.example.test`,
              provisioningSnapshot: {
                hostingPackageIdentifier: 'fictional_starter',
                hostingProvisioningMode: 'STANDARD',
              },
            },
            ...extras.map((extra) => ({
              kind: 'ADD_ON' as const,
              productId: extra.id,
              productPriceId: extra.prices[0].id,
              productNameSnapshot: extra.name,
              billingPeriod: extra.prices[0].billingPeriod,
              currency: 'BDT',
              unitAmount: extra.prices[0].amount,
              lineTotal: extra.prices[0].amount,
              fulfilledAt: new Date(),
            })),
          ],
        },
      },
      include: { items: true },
    });
    const hostingItem = order.items.find((item) => item.kind === 'HOSTING')!;
    const initial = await prisma.invoice.create({
      data: {
        invoiceNumber: `UI-${suffix.slice(0, 12)}`,
        submissionKey: randomUUID(),
        orderId: order.id,
        customerId: user.customer!.id,
        status: 'UNPAID',
        issuedAt: new Date(),
        dueAt: new Date(),
        currency: 'BDT',
        subtotal: total,
        total,
        balanceDue: total,
        customerNameSnapshot: 'Fictional Upgrade',
        customerEmailSnapshot: user.email,
        customerAddressSnapshot: {
          line1: '211 Test Road',
          city: 'Dhaka',
          countryCode: 'BD',
        },
        businessIdentitySnapshot: { name: 'Fictional host' },
        items: {
          create: [
            {
              orderItemId: hostingItem.id,
              linePosition: 1,
              descriptionSnapshot: source.name,
              currency: 'BDT',
              unitAmount: 100_000n,
              lineTotal: 100_000n,
            },
            ...order.items
              .filter((item) => item.kind === 'ADD_ON')
              .map((item, index) => ({
                orderItemId: item.id,
                linePosition: index + 2,
                descriptionSnapshot: item.productNameSnapshot,
                currency: 'BDT',
                unitAmount: item.unitAmount,
                lineTotal: item.lineTotal,
              })),
          ],
        },
      },
    });
    await payments.recordManual(
      {
        invoiceId: initial.id,
        amount: total.toString(),
        submissionKey: randomUUID(),
        proof: { method: 'BANK_TRANSFER', reference: `INITIAL-${suffix}` },
      },
      admin,
      context,
    );
    const startedAt = new Date(Date.now() - (withAddOns ? 45 : 14) * 86400000);
    const service = await prisma.service.create({
      data: {
        customerId: user.customer!.id,
        orderItemId: hostingItem.id,
        productId: source.id,
        productPriceId: source.prices[0].id,
        productNameSnapshot: source.name,
        serverId: server.id,
        domain: `${suffix}.example.test`,
        billingPeriod: 'MONTHLY',
        currency: 'BDT',
        recurringAmount: 100_000n,
        startedAt,
        nextDueAt: nextServiceDueAt(startedAt, 'MONTHLY'),
        provisioningSnapshot: {
          hostingPackageIdentifier: 'fictional_starter',
          hostingProvisioningMode: 'STANDARD',
        },
      },
    });
    const account = await fake.createAccount(
      {
        serverId: server.id,
        hostname: server.hostname,
        port: 2087,
        useTls: true,
        apiUsername: null,
        credential: null,
      },
      {
        serviceReference: service.id,
        domain: service.domain!,
        packageIdentifier: 'fictional_starter',
        contactEmail: user.email,
        idempotencyKey: service.id,
      },
    );
    await prisma.service.update({
      where: { id: service.id },
      data: {
        status: 'ACTIVE',
        externalAccountId: account.account.externalAccountId,
        controlPanelUsername: account.account.username,
        activatedAt: startedAt,
      },
    });
    const offer = (change: 'UPGRADE' | 'DOWNGRADE' = 'UPGRADE') =>
      upgrades.offer(
        service.id,
        {
          submissionKey: randomUUID(),
          targetPriceId: target.prices[0].id,
          requirementsVerified: true,
          change,
          reason:
            'Fictional package, target capacity and retained add-ons verified.',
        },
        admin,
        context,
      );
    const pay = async (invoiceId: string) => {
      const invoice = await prisma.invoice.findUniqueOrThrow({
        where: { id: invoiceId },
      });
      return payments.recordManual(
        {
          invoiceId,
          amount: invoice.balanceDue.toString(),
          submissionKey: randomUUID(),
          proof: { method: 'BANK_TRANSFER', reference: `UPGRADE-${invoiceId}` },
        },
        admin,
        context,
      );
    };
    return {
      service,
      source,
      target,
      initial,
      admin,
      customer,
      offer,
      pay,
      extras,
    };
  }

  async function downgradeFixture() {
    const f = await fixture();
    await prisma.productPrice.update({
      where: { id: f.target.prices[0].id },
      data: { amount: 70_000n },
    });
    return f;
  }
  const capacity = {
    capacityFits: true,
    reason:
      'Fictional usage, target limits and retained add-ons rechecked at the boundary.',
  };
  function boundary(f: Awaited<ReturnType<typeof fixture>>) {
    jest
      .spyOn(Date, 'now')
      .mockReturnValue(f.service.nextDueAt.getTime() + 1000);
  }
  async function renew(
    serviceId: string,
    late = false,
    paymentInvoiceId?: string,
  ) {
    const args = [
      'exec',
      'tsx',
      '--tsconfig',
      'e2e/tsconfig.json',
      'e2e/automation-runner.ts',
      paymentInvoiceId
        ? 'apply-renewal-payment'
        : late
          ? 'create-renewal-after-boundary'
          : 'create-renewal',
      serviceId,
      ...(paymentInvoiceId ? [paymentInvoiceId] : []),
    ];
    const windows = process.platform === 'win32';
    await promisify(execFile)(
      windows ? (process.env.ComSpec ?? 'cmd.exe') : 'pnpm',
      windows ? ['/d', '/s', '/c', 'pnpm', ...args] : args,
      {
        cwd: resolve(__dirname, '../../web'),
        env: process.env,
        timeout: 90_000,
        maxBuffer: 1024 * 1024,
        windowsHide: true,
      },
    );
  }

  it('schedules a zero-charge downgrade once and supports owned withdrawal before the boundary', async () => {
    const f = await downgradeFixture();
    const quote = await f.offer('DOWNGRADE');
    expect(quote).toMatchObject({
      change: 'DOWNGRADE',
      amount: { amount: '0' },
      invoiceId: null,
    });
    const accepted = await Promise.all([
      upgrades.accept(f.service.id, quote.id, f.customer, context),
      upgrades.accept(f.service.id, quote.id, f.customer, context),
    ]);
    expect(
      accepted.every(
        (row) => row.status === 'SCHEDULED' && row.invoiceId === null,
      ),
    ).toBe(true);
    expect(accepted.every((row) => row.canWithdraw)).toBe(true);
    await expect(
      upgrades.approve(
        f.service.id,
        quote.id,
        f.admin,
        context,
        undefined,
        capacity,
      ),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      upgrades.withdraw(
        f.service.id,
        quote.id,
        { ...f.customer, supportAdministratorId: f.admin.identity.userId },
        context,
      ),
    ).rejects.toMatchObject({ status: 403 });
    if (f.customer.identity.role !== 'CUSTOMER')
      throw new Error('Expected customer');
    await expect(
      upgrades.withdraw(
        f.service.id,
        quote.id,
        {
          ...f.customer,
          identity: { ...f.customer.identity, customerId: randomUUID() },
        },
        context,
      ),
    ).rejects.toMatchObject({ status: 403 });
    const cancelled = await Promise.all([
      upgrades.withdraw(f.service.id, quote.id, f.customer, context),
      upgrades.withdraw(f.service.id, quote.id, f.customer, context),
    ]);
    expect(cancelled.every((row) => row.status === 'CANCELLED')).toBe(true);
    expect(
      await prisma.activityLog.count({
        where: { entityId: f.service.id, action: 'HOSTING_UPGRADE_WITHDRAWN' },
      }),
    ).toBe(1);
    expect(
      await prisma.invoice.count({
        where: { customerId: f.service.customerId },
      }),
    ).toBe(1);
    expect(
      await prisma.hostingPanelOperation.count({
        where: { serviceId: f.service.id, type: 'CHANGE_PACKAGE' },
      }),
    ).toBe(0);
    await renew(f.service.id);
    expect(
      await prisma.invoiceItem.findFirst({
        where: {
          serviceId: f.service.id,
          servicePeriodStart: f.service.nextDueAt,
        },
      }),
    ).toMatchObject({ lineTotal: 100_000n });
  });

  it('holds early renewal and applies a boundary downgrade once while racing actual renewal generation', async () => {
    const f = await downgradeFixture();
    const addon = await prisma.product.create({
      data: {
        slug: `backup-${randomUUID()}`,
        name: 'Fictional managed backup',
        kind: 'ADD_ON',
        status: 'ACTIVE',
        eligibleHostingPlans: { create: { hostingProductId: f.target.id } },
      },
    });
    const orderItem = await prisma.orderItem.findUniqueOrThrow({
      where: { id: f.service.orderItemId! },
    });
    const addonPrice = await prisma.productPrice.create({
      data: {
        productId: addon.id,
        billingPeriod: 'MONTHLY',
        currency: 'BDT',
        amount: 20_000n,
      },
    });
    await prisma.orderItem.create({
      data: {
        orderId: orderItem.orderId,
        kind: 'ADD_ON',
        productId: addon.id,
        productPriceId: addonPrice.id,
        productNameSnapshot: addon.name,
        billingPeriod: 'MONTHLY',
        currency: 'BDT',
        unitAmount: 20_000n,
        lineTotal: 20_000n,
        fulfilledAt: new Date(),
      },
    });
    const quote = await f.offer('DOWNGRADE');
    await upgrades.accept(f.service.id, quote.id, f.customer, context);
    await renew(f.service.id);
    expect(
      await prisma.invoiceItem.count({
        where: {
          serviceId: f.service.id,
          servicePeriodStart: f.service.nextDueAt,
        },
      }),
    ).toBe(0);
    boundary(f);
    const write = jest.spyOn(fake, 'changePackage');
    await expect(
      upgrades.withdraw(f.service.id, quote.id, f.customer, context),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      upgrades.approve(f.service.id, quote.id, f.admin, context),
    ).rejects.toMatchObject({ status: 409 });
    await Promise.all([
      upgrades.approve(
        f.service.id,
        quote.id,
        f.admin,
        context,
        undefined,
        capacity,
      ),
      renew(f.service.id, true),
    ]);
    await upgrades.approve(
      f.service.id,
      quote.id,
      f.admin,
      context,
      undefined,
      capacity,
    );
    await renew(f.service.id, true);
    expect(write).toHaveBeenCalledTimes(1);
    const service = await prisma.service.findUniqueOrThrow({
      where: { id: f.service.id },
    });
    expect(service).toMatchObject({
      status: 'ACTIVE',
      productId: f.target.id,
      recurringAmount: 70_000n,
      nextDueAt: f.service.nextDueAt,
      provisioningSnapshot: f.service.provisioningSnapshot,
    });
    const lines = await prisma.invoiceItem.findMany({
      where: {
        serviceId: f.service.id,
        servicePeriodStart: f.service.nextDueAt,
      },
      include: { invoice: { include: { items: true } } },
    });
    expect(lines).toHaveLength(1);
    expect(lines[0].invoice).toMatchObject({
      total: 90_000n,
      status: 'UNPAID',
    });
    expect(lines[0].invoice.items.map((line) => line.lineTotal)).toEqual([
      70_000n,
      20_000n,
    ]);
    expect(lines[0].invoice.dueAt.getTime()).toBeGreaterThan(
      f.service.nextDueAt.getTime(),
    );
    expect(
      await prisma.invoice.findUniqueOrThrow({ where: { id: f.initial.id } }),
    ).toMatchObject({ total: 100_000n, status: 'PAID' });
    expect(
      await prisma.payment.count({ where: { invoiceId: lines[0].invoiceId } }),
    ).toBe(0);
    expect(
      await prisma.outboxEvent.count({
        where: {
          aggregateId: f.service.id,
          eventType: 'HOSTING_SUSPENSION_REQUESTED',
        },
      }),
    ).toBe(0);
  }, 180_000);

  it('keeps insufficient or unknown capacity in review without changing hosting or creating credit', async () => {
    const f = await downgradeFixture();
    const quote = await f.offer('DOWNGRADE');
    await upgrades.accept(f.service.id, quote.id, f.customer, context);
    boundary(f);
    const write = jest.spyOn(fake, 'changePackage');
    expect(
      await upgrades.approve(
        f.service.id,
        quote.id,
        f.admin,
        context,
        undefined,
        {
          capacityFits: false,
          reason: 'Fictional usage exceeds target disk allowance.',
        },
      ),
    ).toMatchObject({ status: 'REVIEW_REQUIRED', invoiceId: null });
    expect(write).not.toHaveBeenCalled();
    expect(
      await prisma.service.findUniqueOrThrow({ where: { id: f.service.id } }),
    ).toMatchObject({ status: 'ACTIVE', productId: f.source.id });
    expect(
      await prisma.payment.count({
        where: {
          invoice: { customerId: f.service.customerId },
          kind: { in: ['REFUND', 'REVERSAL'] },
        },
      }),
    ).toBe(0);
    expect(
      await prisma.activityLog.count({
        where: {
          entityId: f.service.id,
          action: 'HOSTING_UPGRADE_CAPACITY_REVIEW',
        },
      }),
    ).toBe(1);
  });

  it('retains the source after downgrade failure and recovers with one linked retry at the boundary', async () => {
    const f = await downgradeFixture();
    const quote = await f.offer('DOWNGRADE');
    await upgrades.accept(f.service.id, quote.id, f.customer, context);
    boundary(f);
    const original = fake.changePackage.bind(fake);
    const write = jest
      .spyOn(fake, 'changePackage')
      .mockRejectedValueOnce(
        new HostingPanelProviderError(
          'TEMPORARY',
          'FICTIONAL_DOWNGRADE_RETRY',
          'Fictional definite failure.',
        ),
      );
    expect(
      await upgrades.approve(
        f.service.id,
        quote.id,
        f.admin,
        context,
        undefined,
        capacity,
      ),
    ).toMatchObject({ status: 'REVIEW_REQUIRED' });
    expect(
      await prisma.service.findUniqueOrThrow({ where: { id: f.service.id } }),
    ).toMatchObject({ productId: f.source.id, recurringAmount: 100_000n });
    write.mockImplementation(original);
    expect(
      await upgrades.approve(
        f.service.id,
        quote.id,
        f.admin,
        context,
        undefined,
        capacity,
      ),
    ).toMatchObject({ status: 'COMPLETED', invoiceId: null });
    expect(write).toHaveBeenCalledTimes(2);
    expect(
      await prisma.hostingPanelOperation.count({
        where: {
          serviceId: f.service.id,
          type: 'CHANGE_PACKAGE',
          retryOfOperationId: { not: null },
        },
      }),
    ).toBe(1);
  });

  it('rejects a renewal issued between quotation and customer acceptance', async () => {
    const f = await downgradeFixture();
    const quote = await f.offer('DOWNGRADE');
    await renew(f.service.id);
    await expect(
      upgrades.accept(f.service.id, quote.id, f.customer, context),
    ).rejects.toMatchObject({ status: 409 });
    await expect(f.offer('DOWNGRADE')).rejects.toMatchObject({ status: 409 });
    expect(
      await prisma.serviceUpgrade.count({ where: { serviceId: f.service.id } }),
    ).toBe(1);
  }, 120_000);

  it('rejects incompatible retained recurring add-ons rather than dropping them', async () => {
    const f = await downgradeFixture();
    const item = await prisma.orderItem.findUniqueOrThrow({
      where: { id: f.service.orderItemId! },
    });
    const addon = await prisma.product.create({
      data: {
        slug: `incompatible-${randomUUID()}`,
        name: 'Fictional incompatible extra',
        kind: 'ADD_ON',
        status: 'ACTIVE',
        prices: {
          create: {
            billingPeriod: 'MONTHLY',
            currency: 'BDT',
            amount: 10_000n,
          },
        },
        eligibleHostingPlans: { create: { hostingProductId: f.source.id } },
      },
      include: { prices: true },
    });
    await prisma.orderItem.create({
      data: {
        orderId: item.orderId,
        kind: 'ADD_ON',
        productId: addon.id,
        productPriceId: addon.prices[0].id,
        productNameSnapshot: addon.name,
        billingPeriod: 'MONTHLY',
        currency: 'BDT',
        unitAmount: 10_000n,
        lineTotal: 10_000n,
        fulfilledAt: new Date(),
      },
    });
    await expect(f.offer('DOWNGRADE')).rejects.toMatchObject({ status: 409 });
    expect(
      await prisma.serviceUpgrade.count({ where: { serviceId: f.service.id } }),
    ).toBe(0);
    expect(
      await prisma.orderItem.count({
        where: { orderId: item.orderId, kind: 'ADD_ON' },
      }),
    ).toBe(1);
  });

  it('preserves product cash attribution through a paid source renewal, upgrade, catalogue edits and target renewal', async () => {
    const f = await fixture(true);
    const legacyBefore = await prisma.invoiceItem.findMany({
      where: { invoiceId: f.initial.id },
      orderBy: { linePosition: 'asc' },
    });
    expect(
      legacyBefore.every((item) => item.productAttributionSnapshot === null),
    ).toBe(true);
    await renew(f.service.id, true);
    await renew(f.service.id, true);
    const before = await prisma.invoice.findMany({
      where: {
        items: {
          some: { serviceId: f.service.id, servicePeriodStart: { not: null } },
        },
      },
      include: { items: { orderBy: { linePosition: 'asc' } } },
    });
    expect(before).toHaveLength(1);
    expect(before[0].total).toBe(115000n);
    expect(before[0].items).toHaveLength(2);
    const sourceSnapshot = invoiceProductAttributionSchema.parse(
      before[0].items[0].productAttributionSnapshot,
    );
    expect(sourceSnapshot).toMatchObject({
      productId: f.source.id,
      productPriceId: f.source.prices[0].id,
      name: f.source.name,
      kind: 'HOSTING',
      source: 'HOSTING_RENEWAL',
    });
    const backup = f.extras.find(
      (item) => item.prices[0].billingPeriod === 'MONTHLY',
    )!;
    expect(
      invoiceProductAttributionSchema.parse(
        before[0].items[1].productAttributionSnapshot,
      ),
    ).toMatchObject({
      productId: backup.id,
      name: backup.name,
      source: 'ADD_ON_RENEWAL',
    });
    await f.pay(before[0].id);
    await renew(f.service.id, false, before[0].id);
    await renew(f.service.id, false, before[0].id);
    const quote = await f.offer();
    const accepted = await Promise.all([
      upgrades.accept(f.service.id, quote.id, f.customer, context),
      upgrades.accept(f.service.id, quote.id, f.customer, context),
    ]);
    expect(accepted[0].invoiceId).toBe(accepted[1].invoiceId);
    const upgradeLine = await prisma.invoiceItem.findFirstOrThrow({
      where: { invoiceId: accepted[0].invoiceId! },
    });
    expect(
      invoiceProductAttributionSchema.parse(
        upgradeLine.productAttributionSnapshot,
      ),
    ).toMatchObject({
      productId: f.target.id,
      productPriceId: f.target.prices[0].id,
      name: f.target.name,
      source: 'HOSTING_PLAN_CHANGE',
    });
    await f.pay(accepted[0].invoiceId!);
    await upgrades.approve(f.service.id, quote.id, f.admin, context);
    await prisma.product.update({
      where: { id: f.source.id },
      data: { name: 'Renamed source catalogue' },
    });
    await prisma.product.update({
      where: { id: f.target.id },
      data: { name: 'Renamed target catalogue' },
    });
    await prisma.product.update({
      where: { id: backup.id },
      data: { name: 'Renamed backup catalogue' },
    });
    await prisma.productPrice.update({
      where: { id: f.target.prices[0].id },
      data: { amount: 999999n },
    });
    await renew(f.service.id);
    await renew(f.service.id);
    const invoices = await prisma.invoice.findMany({
      where: {
        items: {
          some: { serviceId: f.service.id, servicePeriodStart: { not: null } },
        },
      },
      include: { items: { orderBy: { linePosition: 'asc' } } },
      orderBy: { createdAt: 'asc' },
    });
    expect(invoices).toHaveLength(2);
    const targetInvoice = invoices.find(
      (invoice) => invoice.id !== before[0].id,
    )!;
    expect(targetInvoice.total).toBe(175000n);
    expect(targetInvoice.items).toHaveLength(2);
    expect(
      invoiceProductAttributionSchema.parse(
        targetInvoice.items[0].productAttributionSnapshot,
      ),
    ).toMatchObject({
      productId: f.target.id,
      productPriceId: f.target.prices[0].id,
      name: f.target.name,
      source: 'HOSTING_RENEWAL',
    });
    expect(
      invoiceProductAttributionSchema.parse(
        targetInvoice.items[1].productAttributionSnapshot,
      ),
    ).toMatchObject({
      productId: backup.id,
      name: backup.name,
      source: 'ADD_ON_RENEWAL',
    });
    const report = module.get(OperationalReportService);
    const today = businessDate(new Date(), 'Asia/Dhaka');
    const load = () =>
      report.list(
        'income',
        operationalReportRequestSchema.parse({
          from: today,
          to: today,
          pageSize: 100,
        }),
        f.admin,
      );
    const baseline = await load();
    expect(baseline.pagination.totalPages).toBe(1);
    const amount = (rows: typeof baseline.rows, id: string) =>
      rows
        .filter((row) => row.id.startsWith(id + '|'))
        .reduce((sum, row) => sum + BigInt(row.cells[2]), 0n);
    const previousPolicy = await payments.getSettings();
    await payments.updateSettings(
      {
        partialPaymentsEnabled: true,
        partialPaymentPolicyConfirmation: PARTIAL_PAYMENT_POLICY_CONFIRMATION,
      },
      f.admin,
      context,
    );
    const partial = await payments.recordManual(
      {
        invoiceId: targetInvoice.id,
        amount: '10001',
        submissionKey: randomUUID(),
        proof: {
          method: 'BANK_TRANSFER',
          reference: 'FICTIONAL-ATTRIBUTION-' + randomUUID(),
        },
      },
      f.admin,
      context,
    );
    await payments.updateSettings(
      {
        ...previousPolicy,
        partialPaymentPolicyConfirmation: PARTIAL_PAYMENT_POLICY_CONFIRMATION,
      },
      f.admin,
      context,
    );
    const refund = {
      kind: 'REFUND' as const,
      amount: '500',
      reference: 'FICTIONAL-REFUND-' + randomUUID(),
      note: 'Fictional attribution refund',
      submissionKey: randomUUID(),
    };
    const refunds = await Promise.all([
      payments.adjust(partial.payment.id, refund, f.admin, context),
      payments.adjust(partial.payment.id, refund, f.admin, context),
    ]);
    expect(refunds[0].payment.id).toBe(refunds[1].payment.id);
    await payments.adjust(
      partial.payment.id,
      {
        kind: 'REVERSAL',
        amount: '1',
        reference: 'FICTIONAL-REVERSAL-' + randomUUID(),
        note: 'Fictional attribution reversal',
        submissionKey: randomUUID(),
      },
      f.admin,
      context,
    );
    const after = await load();
    expect(amount(after.rows, f.source.id)).toBe(200000n);
    expect(
      amount(after.rows, f.target.id) - amount(baseline.rows, f.target.id),
    ).toBe(8686n);
    expect(
      amount(after.rows, backup.id) - amount(baseline.rows, backup.id),
    ).toBe(814n);
    expect(BigInt(after.totals[2]) - BigInt(baseline.totals[2])).toBe(9500n);
    expect(
      after.rows
        .filter((row) => row.id.startsWith(f.target.id + '|'))
        .every((row) => row.cells[0] === f.target.name),
    ).toBe(true);
    expect(
      await prisma.payment.findUniqueOrThrow({
        where: { id: partial.payment.id },
      }),
    ).toMatchObject({ amount: 10001n, status: 'SUCCEEDED', kind: 'CHARGE' });
    expect(
      await prisma.invoiceItem.findMany({
        where: { invoiceId: f.initial.id },
        orderBy: { linePosition: 'asc' },
      }),
    ).toEqual(legacyBefore);
    expect(
      (
        await prisma.invoiceItem.findUniqueOrThrow({
          where: { id: before[0].items[0].id },
        })
      ).productAttributionSnapshot,
    ).toEqual(sourceSnapshot);
    expect(
      await prisma.invoice.count({
        where: { submissionKey: `hosting-upgrade:${quote.id}` },
      }),
    ).toBe(1);
  }, 180000);

  it('rejects attribution rewrites, detachment, forged source identity and retroactive legacy tagging', async () => {
    const f = await fixture();
    await renew(f.service.id);
    const line = await prisma.invoiceItem.findFirstOrThrow({
      where: { serviceId: f.service.id, servicePeriodStart: { not: null } },
    });
    const snapshot = invoiceProductAttributionSchema.parse(
      line.productAttributionSnapshot,
    );
    for (const data of [
      { productAttributionSnapshot: { ...snapshot, name: 'Rewritten' } },
      { productAttributionSnapshot: Prisma.DbNull },
      { descriptionSnapshot: 'Rewritten line' },
      { lineTotal: line.lineTotal + 1n },
      { invoiceId: f.initial.id },
    ])
      await expect(
        prisma.invoiceItem.update({ where: { id: line.id }, data }),
      ).rejects.toThrow();
    await expect(
      prisma.invoiceItem.delete({ where: { id: line.id } }),
    ).rejects.toThrow();
    const legacy = await prisma.invoiceItem.findFirstOrThrow({
      where: { invoiceId: f.initial.id },
    });
    await expect(
      prisma.invoiceItem.update({
        where: { id: legacy.id },
        data: { productAttributionSnapshot: snapshot },
      }),
    ).rejects.toThrow();
    for (const forged of [
      { ...snapshot, productId: randomUUID() },
      { ...snapshot, productPriceId: randomUUID() },
      { ...snapshot, version: 2 },
      { ...snapshot, source: 'HOSTING_PLAN_CHANGE' },
      { ...snapshot, privateData: 'forbidden' },
    ])
      await expect(
        prisma.invoiceItem.create({
          data: {
            invoiceId: line.invoiceId,
            linePosition: 99,
            serviceId: f.service.id,
            descriptionSnapshot: 'Fictional rejected line',
            currency: 'BDT',
            unitAmount: 1n,
            lineTotal: 1n,
            servicePeriodStart: new Date('2050-01-01T00:00:00Z'),
            servicePeriodEnd: new Date('2050-02-01T00:00:00Z'),
            productAttributionSnapshot: forged,
          },
        }),
      ).rejects.toThrow();
    for (const currency of ['USD', 'BDT']) {
      const issued = currency === 'USD';
      const parent = await prisma.invoice.create({
        data: {
          invoiceNumber: `FORGED-${randomUUID().slice(0, 12)}`,
          submissionKey: randomUUID(),
          customerId: f.service.customerId,
          status: issued ? 'UNPAID' : 'DRAFT',
          issuedAt: issued ? new Date() : null,
          dueAt: new Date(),
          currency,
          subtotal: 1n,
          total: 1n,
          balanceDue: 1n,
          customerNameSnapshot: 'Fictional attribution',
          customerEmailSnapshot: 'attribution@example.test',
          customerAddressSnapshot: {},
          businessIdentitySnapshot: {},
        },
      });
      await expect(
        prisma.invoiceItem.create({
          data: {
            invoiceId: parent.id,
            linePosition: 1,
            serviceId: f.service.id,
            descriptionSnapshot: 'Rejected currency or draft attribution',
            currency: 'BDT',
            unitAmount: 1n,
            lineTotal: 1n,
            servicePeriodStart: new Date('2050-01-01T00:00:00Z'),
            servicePeriodEnd: new Date('2050-02-01T00:00:00Z'),
            productAttributionSnapshot: snapshot,
          },
        }),
      ).rejects.toThrow();
    }
    expect(
      await prisma.invoiceItem.findUniqueOrThrow({ where: { id: line.id } }),
    ).toEqual(line);
    expect(
      (await prisma.invoiceItem.findUniqueOrThrow({ where: { id: legacy.id } }))
        .productAttributionSnapshot,
    ).toBeNull();
  });

  it('issues one invoice on concurrent acceptance and applies one paid, approved package change', async () => {
    const f = await fixture();
    const quote = await f.offer();
    const write = jest.spyOn(fake, 'changePackage');
    const accepted = await Promise.all([
      upgrades.accept(f.service.id, quote.id, f.customer, context),
      upgrades.accept(f.service.id, quote.id, f.customer, context),
    ]);
    expect(accepted[0].invoiceId).toBe(accepted[1].invoiceId);
    expect(
      await prisma.invoice.count({
        where: { submissionKey: `hosting-upgrade:${quote.id}` },
      }),
    ).toBe(1);
    await expect(
      upgrades.approve(f.service.id, quote.id, f.admin, context),
    ).rejects.toMatchObject({ status: 409 });
    expect(write).not.toHaveBeenCalled();
    const invoiceId = accepted[0].invoiceId!;
    const settlements = await Promise.allSettled([
      f.pay(invoiceId),
      f.pay(invoiceId),
    ]);
    expect(
      settlements.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      await prisma.payment.count({
        where: { invoiceId, status: 'SUCCEEDED', kind: 'CHARGE' },
      }),
    ).toBe(1);
    const attempts = await Promise.allSettled([
      upgrades.approve(f.service.id, quote.id, f.admin, context),
      upgrades.approve(f.service.id, quote.id, f.admin, context),
    ]);
    expect(attempts.some((result) => result.status === 'fulfilled')).toBe(true);
    const final = await prisma.serviceUpgrade.findUniqueOrThrow({
      where: { id: quote.id },
    });
    expect(final.status).toBe('COMPLETED');
    expect(write).toHaveBeenCalledTimes(1);
    expect(
      await prisma.service.findUniqueOrThrow({ where: { id: f.service.id } }),
    ).toMatchObject({
      productId: f.target.id,
      currentPackageIdentifier: 'fictional_business',
      provisioningSnapshot: f.service.provisioningSnapshot,
      recurringAmount: 160_000n,
      nextDueAt: f.service.nextDueAt,
    });
    expect(
      await upgrades.approve(f.service.id, quote.id, f.admin, context),
    ).toMatchObject({
      status: 'COMPLETED',
      paymentStatus: 'PAID',
      operationStatus: 'SUCCEEDED',
    });
    expect(write).toHaveBeenCalledTimes(1);
    expect(
      await prisma.invoice.findUniqueOrThrow({ where: { id: f.initial.id } }),
    ).toMatchObject({ total: 100_000n, status: 'PAID' });
    expect(
      await prisma.activityLog.count({
        where: { entityId: f.service.id, action: 'HOSTING_UPGRADE_COMPLETED' },
      }),
    ).toBe(1);
  });

  it('rejects stale pricing and expired quotes before issuing an invoice', async () => {
    const f = await fixture();
    const quote = await f.offer();
    await prisma.productPrice.update({
      where: { id: f.target.prices[0].id },
      data: { amount: 170_000n },
    });
    await expect(
      upgrades.accept(f.service.id, quote.id, f.customer, context),
    ).rejects.toMatchObject({ status: 409 });
    expect(
      await prisma.invoice.count({
        where: { submissionKey: `hosting-upgrade:${quote.id}` },
      }),
    ).toBe(0);
    const expired = await f.offer();
    const stored = await prisma.serviceUpgrade.findUniqueOrThrow({
      where: { id: expired.id },
    });
    const snapshot = hostingUpgradeQuoteSchema.parse(stored.quote);
    await prisma.serviceUpgrade.update({
      where: { id: expired.id },
      data: {
        quote: {
          ...snapshot,
          expiresAt: new Date(Date.now() - 1000).toISOString(),
        },
      },
    });
    await expect(
      upgrades.accept(f.service.id, expired.id, f.customer, context),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('keeps the original plan after definite failure and safely retries the linked operation', async () => {
    const f = await fixture();
    const quote = await f.offer();
    const accepted = await upgrades.accept(
      f.service.id,
      quote.id,
      f.customer,
      context,
    );
    await f.pay(accepted.invoiceId!);
    const change = jest
      .spyOn(fake, 'changePackage')
      .mockRejectedValueOnce(
        new HostingPanelProviderError(
          'TEMPORARY',
          'FICTIONAL_UPGRADE_BUSY',
          'Fictional provider busy.',
        ),
      );
    expect(
      await upgrades.approve(f.service.id, quote.id, f.admin, context),
    ).toMatchObject({
      status: 'REVIEW_REQUIRED',
      paymentStatus: 'PAID',
      operationStatus: 'FAILED',
    });
    expect(
      await prisma.service.findUniqueOrThrow({ where: { id: f.service.id } }),
    ).toMatchObject({ productId: f.source.id, recurringAmount: 100_000n });
    expect(
      await upgrades.approve(f.service.id, quote.id, f.admin, context),
    ).toMatchObject({ status: 'COMPLETED', paymentStatus: 'PAID' });
    expect(change).toHaveBeenCalledTimes(2);
    const operations = await prisma.hostingPanelOperation.findMany({
      where: { serviceId: f.service.id, type: 'CHANGE_PACKAGE' },
      orderBy: { attemptNumber: 'asc' },
    });
    expect(operations).toHaveLength(2);
    expect(operations[1].retryOfOperationId).toBe(operations[0].id);
  });

  it('recovers a confirmed provider change after finalization was blocked, without changing the package twice', async () => {
    const f = await fixture();
    const quote = await f.offer();
    const accepted = await upgrades.accept(
      f.service.id,
      quote.id,
      f.customer,
      context,
    );
    await f.pay(accepted.invoiceId!);
    const original = fake.changePackage.bind(fake);
    const change = jest
      .spyOn(fake, 'changePackage')
      .mockImplementationOnce(async (...args) => {
        const result = await original(...args);
        await prisma.productPrice.update({
          where: { id: f.target.prices[0].id },
          data: { isActive: false },
        });
        return result;
      });
    await expect(
      upgrades.approve(f.service.id, quote.id, f.admin, context),
    ).rejects.toMatchObject({ status: 409 });
    expect(
      await prisma.service.findUniqueOrThrow({ where: { id: f.service.id } }),
    ).toMatchObject({ productId: f.source.id, recurringAmount: 100_000n });
    await prisma.productPrice.update({
      where: { id: f.target.prices[0].id },
      data: { isActive: true },
    });
    expect(
      await upgrades.approve(f.service.id, quote.id, f.admin, context),
    ).toMatchObject({ status: 'COMPLETED' });
    expect(change).toHaveBeenCalledTimes(1);
  });

  it('closes a failed upgrade only after full manual refund and original-package verification', async () => {
    const f = await fixture();
    const quote = await f.offer();
    const accepted = await upgrades.accept(
      f.service.id,
      quote.id,
      f.customer,
      context,
    );
    await f.pay(accepted.invoiceId!);
    jest
      .spyOn(fake, 'changePackage')
      .mockRejectedValueOnce(
        new HostingPanelProviderError(
          'PERMANENT',
          'FICTIONAL_PACKAGE_UNAVAILABLE',
          'Fictional package unavailable.',
        ),
      );
    expect(
      await upgrades.approve(f.service.id, quote.id, f.admin, context),
    ).toMatchObject({ status: 'REVIEW_REQUIRED' });
    await expect(
      upgrades.cancel(f.service.id, quote.id, f.admin, context),
    ).rejects.toMatchObject({ status: 409 });
    const original = await prisma.payment.findFirstOrThrow({
      where: {
        invoiceId: accepted.invoiceId!,
        kind: 'CHARGE',
        status: 'SUCCEEDED',
      },
    });
    await payments.adjust(
      original.id,
      {
        kind: 'REFUND',
        amount: original.amount.toString(),
        submissionKey: randomUUID(),
        reference: 'FICTIONAL-UPGRADE-REFUND',
      },
      f.admin,
      context,
    );
    expect(
      await upgrades.cancel(f.service.id, quote.id, f.admin, context),
    ).toMatchObject({ status: 'CANCELLED', paymentStatus: 'REFUNDED' });
    expect(
      await prisma.payment.findUniqueOrThrow({ where: { id: original.id } }),
    ).toMatchObject({ status: 'SUCCEEDED', amount: original.amount });
    expect(await f.offer()).toMatchObject({ status: 'QUOTED' });
  });

  it('reconciles a provider timeout after a package change without a second mutation', async () => {
    const f = await fixture();
    const quote = await f.offer();
    const accepted = await upgrades.accept(
      f.service.id,
      quote.id,
      f.customer,
      context,
    );
    await f.pay(accepted.invoiceId!);
    const original = fake.changePackage.bind(fake);
    const change = jest
      .spyOn(fake, 'changePackage')
      .mockImplementationOnce(async (...args) => {
        await original(...args);
        throw new HostingPanelProviderError(
          'INCONSISTENT',
          'FICTIONAL_LOST_REPLY',
          'Fictional reply lost after change.',
        );
      });
    expect(
      await upgrades.approve(f.service.id, quote.id, f.admin, context),
    ).toMatchObject({ status: 'COMPLETED', operationStatus: 'RECONCILED' });
    expect(change).toHaveBeenCalledTimes(1);
  });

  it('enforces ownership, support read-only access, admin approval and pending-request isolation', async () => {
    const f = await fixture();
    const quote = await f.offer();
    if (f.customer.identity.role !== 'CUSTOMER')
      throw new Error('Expected buyer');
    const other = {
      ...f.customer,
      identity: { ...f.customer.identity, customerId: randomUUID() },
    };
    await expect(
      upgrades.accept(f.service.id, quote.id, other, context),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      upgrades.accept(
        f.service.id,
        quote.id,
        { ...f.customer, supportAdministratorId: f.admin.identity.userId },
        context,
      ),
    ).rejects.toMatchObject({ status: 403 });
    expect(
      (
        await upgrades.list(f.service.id, {
          ...f.customer,
          supportAdministratorId: f.admin.identity.userId,
        })
      )[0]?.canAccept,
    ).toBe(false);
    await expect(
      upgrades.approve(f.service.id, quote.id, f.customer, context),
    ).rejects.toMatchObject({ status: 403 });
    await upgrades.accept(f.service.id, quote.id, f.customer, context);
    await expect(
      module
        .get(HostingCancellationService)
        .request(
          f.service.id,
          { timing: 'IMMEDIATE', reason: 'Fictional conflict check' },
          f.customer,
          context,
        ),
    ).rejects.toMatchObject({
      status: 422,
      message:
        'Resolve the pending hosting upgrade before requesting cancellation.',
    });
    await expect(
      module
        .get(ServiceService)
        .transition(
          f.service.id,
          { status: 'SUSPENDED', reason: 'Fictional conflict check' },
          f.admin,
          context,
        ),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      module
        .get(ServiceAddOnsService)
        .cancel(
          f.service.id,
          randomUUID(),
          f.service.nextDueAt.toISOString(),
          f.customer,
          context,
        ),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      module.get(HostingPanelService).execute(
        f.service.id,
        {
          type: 'CHANGE_PACKAGE',
          packageIdentifier: 'fictional_business',
          submissionKey: randomUUID(),
        },
        f.admin,
        context,
      ),
    ).rejects.toMatchObject({ status: 409 });
    await expect(f.offer()).rejects.toMatchObject({ status: 409 });
    expect(
      await upgrades.cancel(f.service.id, quote.id, f.admin, context),
    ).toMatchObject({ status: 'CANCELLED', paymentStatus: 'CANCELLED' });
    expect(await f.offer()).toMatchObject({ status: 'QUOTED' });
  });
});
