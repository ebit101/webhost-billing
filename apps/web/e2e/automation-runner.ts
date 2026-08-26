import { randomUUID } from 'node:crypto';
import {
  AutomationStatus,
  OutboxStatus,
  createPrismaClient,
} from '@webhost-billing/database';
import { parseWorkerEnvironment } from '@webhost-billing/config';
import {
  DEFAULT_RENEWAL_AUTOMATION_POLICY,
  type BackgroundJobData,
} from '@webhost-billing/shared';
import type { Clock } from '../../worker/dist/renewal/clock.js';
import { HostingAutomationService } from '../../worker/dist/renewal/hosting-automation.service.js';
import { businessDate } from '../../worker/dist/renewal/renewal-calendar.js';
import { RenewalProcessorService } from '../../worker/dist/renewal/renewal-processor.service.js';
import { E2E_DATABASE_URL, e2eApiEnvironment } from './environment';

const prisma = createPrismaClient(E2E_DATABASE_URL);
const workerEnvironment = parseWorkerEnvironment(e2eApiEnvironment);

class FixedClock implements Clock {
  constructor(private readonly instant: Date) {}

  now(): Date {
    return new Date(this.instant);
  }
}

async function main(): Promise<void> {
  const [action, serviceId, invoiceId] = process.argv.slice(2);
  if (!action || !serviceId)
    throw new Error('Missing automation action or service ID.');

  if (action === 'create-renewal') {
    const service = await prisma.service.findUniqueOrThrow({
      where: { id: serviceId },
    });
    const instant = new Date(
      service.nextDueAt.getTime() -
        DEFAULT_RENEWAL_AUTOMATION_POLICY.invoiceLeadDays * 86_400_000 +
        43_200_000,
    );
    await processCycle(instant);
    return;
  }

  if (!invoiceId) throw new Error('Missing invoice ID.');
  const invoice = await prisma.invoice.findUniqueOrThrow({
    where: { id: invoiceId },
  });

  if (action === 'suspend-overdue') {
    const instant = new Date(
      invoice.dueAt.getTime() +
        (DEFAULT_RENEWAL_AUTOMATION_POLICY.gracePeriodDays + 2) * 86_400_000 +
        43_200_000,
    );
    await processCycle(instant);
    await processHostingEvent(
      serviceId,
      invoiceId,
      'HOSTING_SUSPENSION_REQUESTED',
      instant,
    );
    return;
  }

  if (action === 'apply-payment') {
    const payment = await prisma.payment.findFirstOrThrow({
      where: { invoiceId, status: 'SUCCEEDED', provider: 'fake' },
      orderBy: { createdAt: 'desc' },
    });
    const paymentEvent = await publishOutboxEvent(
      'PAYMENT',
      payment.id,
      'RENEWAL_PAYMENT_COMPLETED',
    );
    const instant = new Date(invoice.dueAt.getTime() + 6 * 86_400_000);
    const processor = new RenewalProcessorService(
      prisma,
      new FixedClock(instant),
    );
    await processor.process(jobData(paymentEvent));
    await processHostingEvent(
      serviceId,
      invoiceId,
      'HOSTING_UNSUSPENSION_REQUESTED',
      instant,
    );
    return;
  }

  throw new Error(`Unsupported automation action: ${action}`);
}

async function processCycle(instant: Date): Promise<void> {
  const run = await prisma.automationRun.create({
    data: {
      jobName: 'renewal-cycle',
      idempotencyKey: `command26-cycle:${randomUUID()}`,
      status: AutomationStatus.RUNNING,
      startedAt: instant,
      metadata: {
        businessDate: businessDate(
          instant,
          DEFAULT_RENEWAL_AUTOMATION_POLICY.timeZone,
        ),
        policy: DEFAULT_RENEWAL_AUTOMATION_POLICY,
      },
    },
  });
  const event = await prisma.outboxEvent.create({
    data: {
      aggregateType: 'AUTOMATION_RUN',
      aggregateId: run.id,
      eventType: 'RENEWAL_INVOICE_GENERATION_REQUESTED',
      idempotencyKey: `command26-cycle-request:${run.id}`,
      status: OutboxStatus.PUBLISHED,
      publishedAt: instant,
      payload: {
        schemaVersion: 1,
        automationRunId: run.id,
        businessDate: businessDate(
          instant,
          DEFAULT_RENEWAL_AUTOMATION_POLICY.timeZone,
        ),
        scheduledFor: instant.toISOString(),
        policy: DEFAULT_RENEWAL_AUTOMATION_POLICY,
      },
    },
  });
  const processor = new RenewalProcessorService(
    prisma,
    new FixedClock(instant),
  );
  await processor.process(jobData(event));
}

async function processHostingEvent(
  serviceId: string,
  invoiceId: string,
  eventType: 'HOSTING_SUSPENSION_REQUESTED' | 'HOSTING_UNSUSPENSION_REQUESTED',
  instant: Date,
): Promise<void> {
  const event = await prisma.outboxEvent.findFirstOrThrow({
    where: {
      aggregateId: serviceId,
      eventType,
      payload: { path: ['invoiceId'], equals: invoiceId },
    },
    orderBy: { createdAt: 'desc' },
  });
  const published = await prisma.outboxEvent.update({
    where: { id: event.id },
    data: { status: OutboxStatus.PUBLISHED, publishedAt: instant },
  });
  const hosting = new HostingAutomationService(
    prisma,
    workerEnvironment,
    new FixedClock(instant),
  );
  await hosting.process(jobData(published));
}

async function publishOutboxEvent(
  aggregateType: string,
  aggregateId: string,
  eventType: string,
) {
  const event = await prisma.outboxEvent.findFirstOrThrow({
    where: { aggregateType, aggregateId, eventType },
    orderBy: { createdAt: 'desc' },
  });
  return prisma.outboxEvent.update({
    where: { id: event.id },
    data: { status: OutboxStatus.PUBLISHED, publishedAt: new Date() },
  });
}

function jobData(event: {
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
    correlationId: event.aggregateId,
  };
}

main()
  .finally(async () => prisma.$disconnect())
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
