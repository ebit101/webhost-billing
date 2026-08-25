import { randomUUID } from 'node:crypto';
import {
  loadEnvironmentFiles,
  parseWorkerEnvironment,
} from '@webhost-billing/config';
import {
  BillingPeriod,
  InvoiceStatus,
  OutboxStatus,
  PaymentKind,
  PaymentStatus,
  ProductStatus,
  ServiceStatus,
  UserRole,
  UserStatus,
  createPrismaClient,
} from '@webhost-billing/database';
import type {
  BackgroundJobData,
  RenewalAutomationPolicy,
} from '@webhost-billing/shared';
import type { Clock } from './clock';
import { HostingAutomationService } from './hosting-automation.service';
import { RenewalProcessorService } from './renewal-processor.service';

loadEnvironmentFiles();
const environment = parseWorkerEnvironment(process.env);
const prisma = createPrismaClient(environment.DATABASE_URL);

class MutableClock implements Clock {
  constructor(private value: Date) {}
  now(): Date {
    return new Date(this.value);
  }
  set(value: string): void {
    this.value = new Date(value);
  }
}

describe('renewal lifecycle integration', () => {
  const marker = randomUUID();
  const ids = {
    user: randomUUID(),
    customer: randomUUID(),
    product: randomUUID(),
    price: randomUUID(),
    server: randomUUID(),
    service: randomUUID(),
  };
  const runIds: string[] = [];
  const clock = new MutableClock(new Date('2026-07-27T06:00:00.000Z'));
  const processor = new RenewalProcessorService(prisma, clock);
  const hosting = new HostingAutomationService(prisma, environment, clock);
  const policy: RenewalAutomationPolicy = {
    enabled: true,
    invoiceLeadDays: 14,
    reminderDaysBeforeDue: [7, 3, 1],
    gracePeriodDays: 3,
    timeZone: 'Asia/Dhaka',
  };

  beforeAll(async () => {
    await prisma.user.create({
      data: {
        id: ids.user,
        email: `command19-${marker}@example.test`,
        role: UserRole.CUSTOMER,
        status: UserStatus.ACTIVE,
        emailVerifiedAt: new Date(),
        customer: {
          create: {
            id: ids.customer,
            customerNumber: `C19-${marker.slice(0, 8)}`,
            firstName: 'Renewal',
            lastName: 'Customer',
            addressLine1: '19 Fictional Road',
            city: 'Dhaka',
            countryCode: 'BD',
          },
        },
      },
    });
    await prisma.product.create({
      data: {
        id: ids.product,
        slug: `command19-${marker}`,
        name: 'Command Nineteen Hosting',
        status: ProductStatus.ACTIVE,
        hostingPackageIdentifier: 'command19_package',
        prices: {
          create: {
            id: ids.price,
            billingPeriod: BillingPeriod.MONTHLY,
            currency: 'BDT',
            amount: 125_000n,
          },
        },
      },
    });
    await prisma.server.create({
      data: {
        id: ids.server,
        name: `Command 19 ${marker}`,
        hostname: `${marker}.example.test`,
        adapterKey: 'fake-panel',
      },
    });
    await prisma.service.create({
      data: {
        id: ids.service,
        customerId: ids.customer,
        productId: ids.product,
        productPriceId: ids.price,
        serverId: ids.server,
        status: ServiceStatus.ACTIVE,
        domain: `renewal-${marker}.example.test`,
        productNameSnapshot: 'Command Nineteen Hosting',
        provisioningSnapshot: {
          hostingPackageIdentifier: 'command19_package',
        },
        controlPanelUsername: `c19${marker.replaceAll('-', '').slice(0, 8)}`,
        externalAccountId: `fake-whm-${marker}`,
        billingPeriod: BillingPeriod.MONTHLY,
        recurringAmount: 125_000n,
        currency: 'BDT',
        startedAt: new Date('2026-07-10T00:00:00.000Z'),
        nextDueAt: new Date('2026-08-10T00:00:00.000Z'),
        activatedAt: new Date('2026-07-10T00:00:00.000Z'),
      },
    });
  });

  afterAll(async () => {
    await prisma.hostingPanelOperation.deleteMany({
      where: { serviceId: ids.service },
    });
    const invoices = await prisma.invoice.findMany({
      where: { items: { some: { serviceId: ids.service } } },
      select: { id: true },
    });
    const invoiceIds = invoices.map(({ id }) => id);
    const payments = await prisma.payment.findMany({
      where: { invoiceId: { in: invoiceIds } },
      select: { id: true },
    });
    const paymentIds = payments.map(({ id }) => id);
    const automationRuns = await prisma.automationRun.findMany({
      where: {
        OR: [
          { id: { in: runIds } },
          {
            idempotencyKey: {
              in: paymentIds.map((id) => `renewal-payment:${id}`),
            },
          },
        ],
      },
      select: { id: true },
    });
    const allRunIds = automationRuns.map(({ id }) => id);
    await prisma.activityLog.deleteMany({
      where: {
        OR: [
          { entityId: ids.service },
          { entityId: { in: invoiceIds } },
          { entityId: { in: paymentIds } },
          { correlationId: { in: allRunIds } },
        ],
      },
    });
    await prisma.outboxEvent.deleteMany({
      where: {
        OR: [
          { aggregateId: ids.service },
          { aggregateId: { in: invoiceIds } },
          { aggregateId: { in: paymentIds } },
          { aggregateId: { in: allRunIds } },
        ],
      },
    });
    await prisma.payment.deleteMany({ where: { id: { in: paymentIds } } });
    await prisma.invoiceItem.deleteMany({
      where: { invoiceId: { in: invoiceIds } },
    });
    await prisma.service.updateMany({
      where: { id: ids.service },
      data: { suspensionInvoiceId: null },
    });
    await prisma.invoice.deleteMany({ where: { id: { in: invoiceIds } } });
    await prisma.service.deleteMany({ where: { id: ids.service } });
    await prisma.automationRun.deleteMany({
      where: { id: { in: allRunIds } },
    });
    await prisma.server.deleteMany({ where: { id: ids.server } });
    await prisma.productPrice.deleteMany({ where: { id: ids.price } });
    await prisma.product.deleteMany({ where: { id: ids.product } });
    await prisma.customer.deleteMany({ where: { id: ids.customer } });
    await prisma.user.deleteMany({ where: { id: ids.user } });
    await prisma.$disconnect();
  });

  it('is idempotent through invoice, delayed notices, suspension, payment, and unsuspension', async () => {
    const first = await cycle('2026-07-27T06:00:00.000Z');
    await processor.process(first);
    await processor.process(first);

    const invoice = await prisma.invoice.findFirstOrThrow({
      where: { items: { some: { serviceId: ids.service } } },
      include: { items: true },
    });
    expect(invoice.status).toBe(InvoiceStatus.UNPAID);
    expect(invoice.items).toHaveLength(1);
    expect(invoice.items[0]?.servicePeriodEnd?.toISOString()).toBe(
      '2026-09-10T00:00:00.000Z',
    );
    expect(
      await prisma.invoiceItem.count({ where: { serviceId: ids.service } }),
    ).toBe(1);

    await processor.process(await cycle('2026-08-08T06:00:00.000Z'));
    expect(
      await prisma.outboxEvent.count({
        where: {
          eventType: 'EMAIL_RENEWAL_REMINDER',
          aggregateId: invoice.id,
        },
      }),
    ).toBe(2);

    const overdueCycle = await cycle('2026-08-15T06:00:00.000Z');
    await processor.process(overdueCycle);
    expect(
      (await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } }))
        .status,
    ).toBe(InvoiceStatus.OVERDUE);
    expect(
      await prisma.outboxEvent.count({
        where: {
          eventType: 'HOSTING_SUSPENSION_REQUESTED',
          aggregateId: ids.service,
        },
      }),
    ).toBe(1);
    expect(
      await prisma.outboxEvent.count({
        where: {
          eventType: { contains: 'TERMINAT' },
          aggregateId: ids.service,
        },
      }),
    ).toBe(0);

    const suspendEvent = await publishedHostingEvent(
      'HOSTING_SUSPENSION_REQUESTED',
    );
    const failedAttempt = await prisma.hostingPanelOperation.create({
      data: {
        serviceId: ids.service,
        serverId: ids.server,
        automationRunId: overdueCycle.aggregateId,
        type: 'SUSPEND_ACCOUNT',
        status: 'FAILED',
        adapterKey: 'fake-panel',
        idempotencyKey: `automation:suspend:${ids.service}:${invoice.id}`,
        requestFingerprint: 'f'.repeat(64),
        retryable: true,
        errorKind: 'TEMPORARY',
        errorCode: 'HOSTING_AUTOMATION_TEMPORARILY_UNAVAILABLE',
        errorMessage: 'The automated hosting-panel operation did not complete.',
        requestMetadata: { invoiceId: invoice.id },
        completedAt: clock.now(),
      },
    });
    await hosting.process(suspendEvent);
    await hosting.process(suspendEvent);
    expect(
      await prisma.hostingPanelOperation.count({
        where: { serviceId: ids.service, type: 'SUSPEND_ACCOUNT' },
      }),
    ).toBe(2);
    expect(
      await prisma.hostingPanelOperation.findFirst({
        where: { retryOfOperationId: failedAttempt.id },
      }),
    ).toMatchObject({ status: 'SUCCEEDED', attemptNumber: 2 });
    expect(
      await prisma.service.findUniqueOrThrow({ where: { id: ids.service } }),
    ).toMatchObject({
      status: ServiceStatus.SUSPENDED,
      suspensionInvoiceId: invoice.id,
    });

    const paymentId = randomUUID();
    await prisma.$transaction([
      prisma.invoice.update({
        where: { id: invoice.id },
        data: {
          status: InvoiceStatus.PAID,
          amountPaid: invoice.total,
          balanceDue: 0n,
          paidAt: clock.now(),
        },
      }),
      prisma.payment.create({
        data: {
          id: paymentId,
          invoiceId: invoice.id,
          kind: PaymentKind.CHARGE,
          status: PaymentStatus.SUCCEEDED,
          provider: 'fake-gateway',
          idempotencyKey: `command19-payment-${marker}`,
          amount: invoice.total,
          currency: invoice.currency,
          verifiedAt: clock.now(),
        },
      }),
    ]);
    const paymentEvent = await publishedPaymentEvent(paymentId, invoice.id);
    await processor.process(paymentEvent);
    await processor.process(paymentEvent);
    expect(
      (
        await prisma.service.findUniqueOrThrow({ where: { id: ids.service } })
      ).nextDueAt.toISOString(),
    ).toBe('2026-09-10T00:00:00.000Z');

    const unsuspendEvent = await publishedHostingEvent(
      'HOSTING_UNSUSPENSION_REQUESTED',
    );
    await hosting.process(unsuspendEvent);
    await hosting.process(unsuspendEvent);
    expect(
      await prisma.service.findUniqueOrThrow({ where: { id: ids.service } }),
    ).toMatchObject({
      status: ServiceStatus.ACTIVE,
      suspensionInvoiceId: null,
    });
  });

  async function cycle(instant: string): Promise<BackgroundJobData> {
    clock.set(instant);
    const run = await prisma.automationRun.create({
      data: {
        jobName: 'renewal-cycle',
        idempotencyKey: `command19-cycle-${marker}-${instant}`,
      },
    });
    runIds.push(run.id);
    const event = await prisma.outboxEvent.create({
      data: {
        aggregateType: 'AUTOMATION_RUN',
        aggregateId: run.id,
        eventType: 'RENEWAL_INVOICE_GENERATION_REQUESTED',
        idempotencyKey: `command19-cycle-request-${marker}-${instant}`,
        payload: {
          schemaVersion: 1,
          automationRunId: run.id,
          businessDate: instant.slice(0, 10),
          scheduledFor: instant,
          policy,
        },
        status: OutboxStatus.PUBLISHED,
        publishedAt: clock.now(),
      },
    });
    return job(
      event.id,
      event.aggregateType,
      event.aggregateId,
      event.eventType,
    );
  }

  async function publishedHostingEvent(
    eventType: string,
  ): Promise<BackgroundJobData> {
    const event = await prisma.outboxEvent.findFirstOrThrow({
      where: { aggregateId: ids.service, eventType },
      orderBy: { createdAt: 'desc' },
    });
    await prisma.outboxEvent.update({
      where: { id: event.id },
      data: { status: OutboxStatus.PUBLISHED, publishedAt: clock.now() },
    });
    return job(
      event.id,
      event.aggregateType,
      event.aggregateId,
      event.eventType,
    );
  }

  async function publishedPaymentEvent(
    paymentId: string,
    invoiceId: string,
  ): Promise<BackgroundJobData> {
    const event = await prisma.outboxEvent.create({
      data: {
        aggregateType: 'PAYMENT',
        aggregateId: paymentId,
        eventType: 'RENEWAL_PAYMENT_COMPLETED',
        idempotencyKey: `renewal-payment:${paymentId}`,
        payload: { schemaVersion: 1, paymentId, invoiceId },
        status: OutboxStatus.PUBLISHED,
        publishedAt: clock.now(),
      },
    });
    return job(
      event.id,
      event.aggregateType,
      event.aggregateId,
      event.eventType,
    );
  }
});

function job(
  outboxEventId: string,
  aggregateType: string,
  aggregateId: string,
  eventType: string,
): BackgroundJobData {
  return {
    schemaVersion: 1,
    outboxEventId,
    aggregateType,
    aggregateId,
    eventType,
    correlationId: outboxEventId,
  };
}
