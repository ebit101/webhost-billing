import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { Test, type TestingModule } from '@nestjs/testing';
import { parseApiEnvironment } from '@webhost-billing/config';
import type { PrismaClient } from '@webhost-billing/database';
import {
  hostingAddOnInputSchema,
  type HostingConfigurationChoice,
} from '@webhost-billing/shared';
import { AppModule } from '../src/app.module';
import { API_ENVIRONMENT } from '../src/infrastructure/environment/environment.module';
import { PRISMA_CLIENT } from '../src/infrastructure/database/database.module';
import type { AuthRequestContext } from '../src/modules/auth/auth.types';
import { ProductService } from '../src/modules/products/product.service';
import { OrderService } from '../src/modules/orders/order.service';
import { PaymentService } from '../src/modules/payments/payment.service';
import { ServiceService } from '../src/modules/services/service.service';
import { ServiceAddOnsService } from '../src/modules/services/service-add-ons.service';
import { HostingUpgradeService } from '../src/modules/services/hosting-upgrade.service';
import { HostingPanelService } from '../src/modules/hosting-panels/hosting-panel.service';
import { FakeHostingPanel } from '../src/modules/hosting-panels/fake-hosting-panel';

const context = { ipAddressHash: 'fictional-options223' };
describe('configurable hosting purchases with fictional providers', () => {
  let module: TestingModule;
  let prisma: PrismaClient;
  const productIds: string[] = [];
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
          AUTH_RATE_LIMIT_NAMESPACE: `options-${randomUUID()}`,
        }),
      )
      .compile();
    await module.init();
    prisma = module.get(PRISMA_CLIENT);
  });
  afterAll(async () => {
    // Preserve financial history; the guarded launcher owns schema disposal.
    if (prisma && productIds.length)
      await prisma.product.updateMany({
        where: { id: { in: productIds } },
        data: { status: 'ARCHIVED', publicVisible: false },
      });
    await module?.close();
  });
  async function fixture() {
    const marker = randomUUID();
    const adminUser = await prisma.user.create({
      data: {
        email: `options-admin-${marker}@example.test`,
        role: 'ADMIN',
        status: 'ACTIVE',
        emailVerifiedAt: new Date(),
        adminProfile: {
          create: {
            displayName: 'Fictional options administrator',
            isSuperAdmin: true,
          },
        },
      },
      include: { adminProfile: true },
    });
    const buyer = await prisma.user.create({
      data: {
        email: `options-buyer-${marker}@example.test`,
        role: 'CUSTOMER',
        status: 'ACTIVE',
        emailVerifiedAt: new Date(),
        customer: {
          create: {
            customerNumber: `CUS-${marker.slice(0, 20)}`,
            firstName: 'Fictional',
            lastName: 'Options',
            addressLine1: '223 Fictional Road',
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
        userId: buyer.id,
        customerId: buyer.customer!.id,
        email: buyer.email,
      },
    };
    async function plan(label: string, amount: bigint) {
      const value = await prisma.product.create({
        data: {
          slug: `options-${label}-${marker}`,
          name: `Fictional ${label} hosting`,
          status: 'ACTIVE',
          publicVisible: true,
          hostingPackageIdentifier: `fictional_${label}`,
          storageFeature: '10 GiB',
          websiteFeature: 'One website',
          emailFeature: 'Five mailboxes',
          bandwidthFeature: '100 GiB',
          prices: {
            create: {
              billingPeriod: 'MONTHLY',
              currency: 'BDT',
              amount,
              setupFee: 10000n,
            },
          },
        },
        include: { prices: true },
      });
      productIds.push(value.id);
      return value;
    }
    const base = await plan('starter', 100000n);
    const target = await plan('larger', 200000n);
    const incompatible = await plan('other', 300000n);
    const products = module.get(ProductService);
    const orders = module.get(OrderService);
    const payments = module.get(PaymentService);
    const services = module.get(ServiceService);
    const panel = module.get(HostingPanelService);
    const fake = module.get(FakeHostingPanel);
    const option: HostingConfigurationChoice = {
      version: 1,
      groupKey: 'storage',
      groupName: 'Storage tier',
      choiceName: '20 GiB',
      fulfillment: 'MANUAL',
      fulfillmentNote:
        'Apply the purchased storage limit manually after setup.',
    };
    const input = {
      name: 'Fictional storage choice',
      description: 'A fixed storage choice.',
      currency: 'BDT',
      amount: '25000',
      billingPeriod: 'MONTHLY' as const,
      hostingProductIds: [base.id, target.id],
      enabled: true,
      configuration: option,
    };
    const small = await products.saveAddOn(
      undefined,
      hostingAddOnInputSchema.parse(input),
      admin,
      context,
    );
    productIds.push(small.id);
    const large = await products.saveAddOn(
      undefined,
      hostingAddOnInputSchema.parse({
        ...input,
        amount: '40000',
        configuration: { ...option, choiceName: '40 GiB' },
      }),
      admin,
      context,
    );
    productIds.push(large.id);
    const mail = await products.saveAddOn(
      undefined,
      hostingAddOnInputSchema.parse({
        ...input,
        amount: '15000',
        billingPeriod: 'ONE_TIME',
        configuration: {
          ...option,
          groupKey: 'mailboxes',
          groupName: 'Mailbox setup',
          choiceName: '20 mailboxes',
        },
      }),
      admin,
      context,
    );
    productIds.push(mail.id);
    const migration = await products.saveAddOn(
      undefined,
      hostingAddOnInputSchema.parse({
        ...input,
        name: 'Fictional migration',
        amount: '1000',
        billingPeriod: 'ONE_TIME',
        configuration: null,
      }),
      admin,
      context,
    );
    productIds.push(migration.id);
    const request = (ids = [small.priceId]) => ({
      productId: base.id,
      priceId: base.prices[0].id,
      customerId: buyer.customer!.id,
      requestedDomain: `options-${randomUUID()}.example.test`,
      submissionKey: randomUUID(),
      addOnPriceIds: ids,
    });
    const server = await prisma.server.create({
      data: {
        name: `Fictional ${marker}`,
        hostname: `panel-${marker}.example.test`,
        adapterKey: 'fake-panel',
        status: 'ACTIVE',
        maxAccounts: 100,
      },
    });
    const pay = async (invoiceId: string) => {
      const invoice = await prisma.invoice.findUniqueOrThrow({
        where: { id: invoiceId },
      });
      return payments.recordManual(
        {
          invoiceId,
          amount: invoice.balanceDue.toString(),
          submissionKey: randomUUID(),
          proof: {
            method: 'BANK_TRANSFER',
            reference: `fictional-${randomUUID()}`,
          },
        },
        admin,
        context,
      );
    };
    const provision = async (
      created: Awaited<ReturnType<OrderService['create']>>,
      fail = false,
    ) => {
      await pay(created.order.invoice.id);
      await orders.updateStatus(
        created.order.id,
        { status: 'PROCESSING' },
        admin,
        context,
      );
      const hosting = created.order.items.find(
        (item) => item.kind === 'HOSTING',
      )!;
      const result = await services.create(
        { orderItemId: hosting.id, serverId: server.id },
        admin,
        context,
      );
      if (fail) fake.failNext('TEMPORARY');
      let operation = await panel.execute(
        result.service.id,
        { type: 'CREATE_ACCOUNT', submissionKey: randomUUID() },
        admin,
        context,
      );
      return {
        service: result.service,
        operation,
        retry: async () => {
          operation = await panel.retry(
            operation.operation.id,
            { submissionKey: randomUUID() },
            admin,
            context,
          );
          return operation;
        },
      };
    };
    return {
      marker,
      base,
      target,
      incompatible,
      small,
      large,
      mail,
      migration,
      option,
      input,
      products,
      orders,
      admin,
      customer,
      request,
      provision,
      pay,
    };
  }

  it('rejects incompatible plans, cycles, repeated groups, tampered prices and duplicate catalogue values', async () => {
    const f = await fixture();
    const before = await prisma.order.count();
    await expect(
      f.orders.create(
        f.request([f.small.priceId, f.large.priceId]),
        f.customer,
        context,
        'CUSTOMER',
      ),
    ).rejects.toMatchObject({ status: 422 });
    await expect(
      f.orders.create(
        {
          ...f.request(),
          productId: f.incompatible.id,
          priceId: f.incompatible.prices[0].id,
        },
        f.customer,
        context,
        'CUSTOMER',
      ),
    ).rejects.toMatchObject({ status: 422 });
    const annual = await prisma.productPrice.create({
      data: {
        productId: f.base.id,
        billingPeriod: 'ANNUAL',
        currency: 'BDT',
        amount: 900000n,
      },
    });
    await expect(
      f.orders.create(
        { ...f.request(), priceId: annual.id },
        f.customer,
        context,
        'CUSTOMER',
      ),
    ).rejects.toMatchObject({ status: 422 });
    await expect(
      f.orders.create(
        f.request([randomUUID()]),
        f.customer,
        context,
        'CUSTOMER',
      ),
    ).rejects.toMatchObject({ status: 422 });
    await expect(
      f.products.saveAddOn(
        undefined,
        hostingAddOnInputSchema.parse(f.input),
        f.admin,
        context,
      ),
    ).rejects.toMatchObject({ status: 422 });
    expect(await prisma.order.count()).toBe(before);
    const offers = (await f.products.listPublic({ currency: 'BDT' })).find(
      (product) => product.id === f.base.id,
    )?.addOns;
    expect(
      offers?.find((offer) => offer.id === f.small.id)?.configuration,
    ).toEqual(f.option);
    expect(
      offers?.find((offer) => offer.id === f.migration.id)?.configuration,
    ).toBeUndefined();
  });

  it('bounds each option group and rejects inconsistent group names', async () => {
    const f = await fixture();
    await expect(
      f.products.saveAddOn(
        undefined,
        hostingAddOnInputSchema.parse({
          ...f.input,
          configuration: {
            ...f.option,
            groupName: 'Different group title',
            choiceName: '60 GiB',
          },
        }),
        f.admin,
        context,
      ),
    ).rejects.toMatchObject({ status: 422 });
    const additional = await prisma.$transaction(
      Array.from({ length: 18 }, (_, index) =>
        prisma.product.create({
          data: {
            kind: 'ADD_ON',
            slug: `options-bounded-${randomUUID()}`,
            name: `Fictional choice ${index}`,
            status: 'ACTIVE',
            provisioningConfig: {
              hostingOption: {
                ...f.option,
                choiceName: `Extra choice ${index}`,
              },
            },
            prices: {
              create: {
                currency: 'BDT',
                billingPeriod: 'MONTHLY',
                amount: 1000n,
              },
            },
            eligibleHostingPlans: { create: { hostingProductId: f.base.id } },
          },
        }),
      ),
    );
    productIds.push(...additional.map((product) => product.id));
    await expect(
      f.products.saveAddOn(
        undefined,
        hostingAddOnInputSchema.parse({
          ...f.input,
          configuration: { ...f.option, choiceName: 'Twenty-first choice' },
        }),
        f.admin,
        context,
      ),
    ).rejects.toMatchObject({ status: 422 });
  });

  it('snapshots exact selections and charges once across concurrent checkout retries and catalogue edits', async () => {
    const f = await fixture();
    const input = f.request([
      f.small.priceId,
      f.mail.priceId,
      f.migration.priceId,
    ]);
    const results = await Promise.all(
      Array.from({ length: 3 }, () =>
        f.orders.create(input, f.customer, context, 'CUSTOMER'),
      ),
    );
    expect(new Set(results.map((result) => result.order.id)).size).toBe(1);
    expect(results.filter((result) => !result.duplicate)).toHaveLength(1);
    const original = results[0].order;
    expect(original.invoice.total.amount).toBe('151000');
    const purchased = original.items.find(
      (item) => item.productId === f.small.id,
    )!;
    expect(purchased).toMatchObject({
      productName: 'Storage tier: 20 GiB',
      configuration: f.option,
      unitAmount: { amount: '25000' },
    });
    const changed = await f.products.saveAddOn(
      f.small.id,
      hostingAddOnInputSchema.parse({
        ...f.input,
        configuration: {
          ...f.option,
          choiceName: '30 GiB',
          fulfillmentNote: 'A different public fulfillment note.',
        },
      }),
      f.admin,
      context,
    );
    expect(changed.priceId).not.toBe(f.small.priceId);
    await expect(
      f.orders.create(
        { ...input, submissionKey: randomUUID() },
        f.customer,
        context,
        'CUSTOMER',
      ),
    ).rejects.toMatchObject({ status: 422 });
    const replay = await f.orders.create(
      input,
      f.customer,
      context,
      'CUSTOMER',
    );
    expect(replay.duplicate).toBe(true);
    expect(replay.order).toEqual(original);
    await expect(
      f.orders.create(
        { ...input, addOnPriceIds: [changed.priceId] },
        f.customer,
        context,
        'CUSTOMER',
      ),
    ).rejects.toMatchObject({ status: 409 });
    expect(
      await prisma.invoice.count({ where: { orderId: original.id } }),
    ).toBe(1);
    expect(
      await prisma.payment.count({ where: { invoiceId: original.invoice.id } }),
    ).toBe(0);
    await expect(
      prisma.orderItem.update({
        where: { id: purchased.id },
        data: {
          provisioningSnapshot: {
            hostingOption: { ...f.option, choiceName: 'Forged' },
          },
        },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.orderItem.update({
        where: { id: purchased.id },
        data: { lineTotal: 1n },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.orderItem.delete({ where: { id: purchased.id } }),
    ).rejects.toThrow();
    await expect(
      prisma.orderItem.create({
        data: {
          orderId: original.id,
          kind: 'ADD_ON',
          productId: f.large.id,
          productPriceId: f.large.priceId,
          productNameSnapshot: 'Another storage value',
          billingPeriod: 'MONTHLY',
          currency: 'BDT',
          unitAmount: 40000n,
          lineTotal: 40000n,
          requestedDomain: input.requestedDomain,
          provisioningSnapshot: {
            hostingOption: { ...f.option, choiceName: '40 GiB' },
          },
        },
      }),
    ).rejects.toThrow();
  });

  it('keeps configuration pending through payment and failed provisioning, then records one manual completion', async () => {
    const f = await fixture();
    const created = await f.orders.create(
      f.request(),
      f.customer,
      context,
      'CUSTOMER',
    );
    const option = created.order.items.find((item) => item.configuration)!;
    await expect(
      f.orders.fulfillAddOn(created.order.id, option.id, f.admin, context),
    ).rejects.toMatchObject({ status: 409 });
    const hosting = await f.provision(created, true);
    expect(hosting.operation.operation.status).toBe('FAILED');
    await expect(
      f.orders.fulfillAddOn(created.order.id, option.id, f.admin, context),
    ).rejects.toMatchObject({ status: 409 });
    expect(
      (await prisma.orderItem.findUniqueOrThrow({ where: { id: option.id } }))
        .fulfilledAt,
    ).toBeNull();
    expect((await hosting.retry()).operation.status).toBe('SUCCEEDED');
    const first = await f.orders.fulfillAddOn(
      created.order.id,
      option.id,
      f.admin,
      context,
    );
    const repeated = await f.orders.fulfillAddOn(
      created.order.id,
      option.id,
      f.admin,
      context,
    );
    expect(
      first.items.find((item) => item.id === option.id)?.fulfilledAt,
    ).toBeTruthy();
    expect(repeated.items).toEqual(first.items);
    expect(
      await prisma.activityLog.count({
        where: {
          action: 'HOSTING_ADD_ON_FULFILLED',
          entityId: created.order.id,
        },
      }),
    ).toBe(1);
    expect(
      (
        await prisma.service.findUniqueOrThrow({
          where: { id: hosting.service.id },
        })
      ).status,
    ).toBe('ACTIVE');
    await expect(
      module.get(HostingUpgradeService).offer(
        hosting.service.id,
        {
          submissionKey: randomUUID(),
          targetPriceId: f.target.prices[0].id,
          requirementsVerified: true,
          change: 'UPGRADE',
          reason: 'Fictional target checked.',
        },
        f.admin,
        context,
      ),
    ).rejects.toThrow(/add.on review required/i);
  });

  it('renews recurring options from purchased snapshots once and never repeats one-time setup', async () => {
    const f = await fixture();
    const created = await f.orders.create(
      f.request([f.small.priceId, f.mail.priceId, f.migration.priceId]),
      f.customer,
      context,
      'CUSTOMER',
    );
    const hosting = await f.provision(created);
    for (const item of created.order.items.filter(
      (item) => item.kind === 'ADD_ON',
    ))
      await f.orders.fulfillAddOn(created.order.id, item.id, f.admin, context);
    await f.products.saveAddOn(
      f.small.id,
      hostingAddOnInputSchema.parse({
        ...f.input,
        amount: '90000',
        enabled: false,
        configuration: { ...f.option, choiceName: 'Changed catalogue label' },
      }),
      f.admin,
      context,
    );
    await renew(hosting.service.id);
    await renew(hosting.service.id);
    const invoices = await prisma.invoice.findMany({
      where: { items: { some: { serviceId: hosting.service.id } } },
      include: { items: { orderBy: { linePosition: 'asc' } } },
    });
    expect(invoices).toHaveLength(1);
    expect(invoices[0].total).toBe(125000n);
    expect(invoices[0].items).toHaveLength(2);
    expect(invoices[0].items[1]).toMatchObject({
      descriptionSnapshot: 'Renewal: Storage tier: 20 GiB',
      unitAmount: 25000n,
      lineTotal: 25000n,
    });
    expect(invoices[0].items[1].servicePeriodStart).toEqual(
      hosting.service.nextDueAt ? new Date(hosting.service.nextDueAt) : null,
    );
    expect(
      (
        await prisma.service.findUniqueOrThrow({
          where: { id: hosting.service.id },
        })
      ).status,
    ).toBe('ACTIVE');
  }, 180000);

  it('preserves period-end option cancellation and excludes it from the next renewal without cancelling hosting', async () => {
    const f = await fixture();
    const created = await f.orders.create(
      f.request(),
      f.customer,
      context,
      'CUSTOMER',
    );
    const hosting = await f.provision(created);
    const option = created.order.items.find((item) => item.configuration)!;
    await f.orders.fulfillAddOn(created.order.id, option.id, f.admin, context);
    const end = hosting.service.nextDueAt;
    const addOns = module.get(ServiceAddOnsService);
    await addOns.cancel(
      hosting.service.id,
      option.id,
      end,
      f.customer,
      context,
    );
    await addOns.cancel(
      hosting.service.id,
      option.id,
      end,
      f.customer,
      context,
    );
    await renew(hosting.service.id);
    await renew(hosting.service.id);
    const invoices = await prisma.invoice.findMany({
      where: { items: { some: { serviceId: hosting.service.id } } },
      include: { items: true },
    });
    expect(invoices).toHaveLength(1);
    expect(invoices[0].total).toBe(100000n);
    expect(invoices[0].items).toHaveLength(1);
    expect(
      (await prisma.orderItem.findUniqueOrThrow({ where: { id: option.id } }))
        .provisioningSnapshot,
    ).toEqual({ hostingOption: f.option });
    expect(
      (
        await prisma.service.findUniqueOrThrow({
          where: { id: hosting.service.id },
        })
      ).status,
    ).toBe('ACTIVE');
  }, 180000);

  async function renew(serviceId: string) {
    const args = [
      'exec',
      'tsx',
      '--tsconfig',
      'e2e/tsconfig.json',
      'e2e/automation-runner.ts',
      'create-renewal',
      serviceId,
    ];
    const windows = process.platform === 'win32';
    await promisify(execFile)(
      windows ? (process.env.ComSpec ?? 'cmd.exe') : 'pnpm',
      windows ? ['/d', '/s', '/c', 'pnpm', ...args] : args,
      {
        cwd: resolve(__dirname, '../../web'),
        env: process.env,
        timeout: 90000,
        maxBuffer: 1024 * 1024,
        windowsHide: true,
      },
    );
  }
});
