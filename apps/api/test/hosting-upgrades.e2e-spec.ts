import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { Test, type TestingModule } from '@nestjs/testing';
import { parseApiEnvironment } from '@webhost-billing/config';
import type { PrismaClient } from '@webhost-billing/database';
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

  async function fixture() {
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
        subtotal: 100_000n,
        total: 100_000n,
        customerEmailSnapshot: user.email,
        items: {
          create: {
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
        },
      },
      include: { items: true },
    });
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
        subtotal: 100_000n,
        total: 100_000n,
        balanceDue: 100_000n,
        customerNameSnapshot: 'Fictional Upgrade',
        customerEmailSnapshot: user.email,
        customerAddressSnapshot: {
          line1: '211 Test Road',
          city: 'Dhaka',
          countryCode: 'BD',
        },
        businessIdentitySnapshot: { name: 'Fictional host' },
        items: {
          create: {
            orderItemId: order.items[0].id,
            linePosition: 1,
            descriptionSnapshot: source.name,
            currency: 'BDT',
            unitAmount: 100_000n,
            lineTotal: 100_000n,
          },
        },
      },
    });
    await payments.recordManual(
      {
        invoiceId: initial.id,
        amount: '100000',
        submissionKey: randomUUID(),
        proof: { method: 'BANK_TRANSFER', reference: `INITIAL-${suffix}` },
      },
      admin,
      context,
    );
    const startedAt = new Date(Date.now() - 14 * 86400000);
    const service = await prisma.service.create({
      data: {
        customerId: user.customer!.id,
        orderItemId: order.items[0].id,
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
          proof: { method: 'BANK_TRANSFER', reference: `UPGRADE-${suffix}` },
        },
        admin,
        context,
      );
    };
    return { service, source, target, initial, admin, customer, offer, pay };
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
  async function renew(serviceId: string, late = false) {
    const args = [
      'exec',
      'tsx',
      '--tsconfig',
      'e2e/tsconfig.json',
      'e2e/automation-runner.ts',
      late ? 'create-renewal-after-boundary' : 'create-renewal',
      serviceId,
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
