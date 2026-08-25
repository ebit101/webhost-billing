import { randomUUID } from 'node:crypto';
import {
  loadEnvironmentFiles,
  parseWorkerEnvironment,
} from '@webhost-billing/config';
import {
  createPrismaClient,
  OutboxStatus,
  type PrismaClient,
} from '@webhost-billing/database';
import { BackgroundQueueCatalog } from '@webhost-billing/queue';
import { OutboxDispatcherService } from './outbox-dispatcher.service';

describe('OutboxDispatcherService integration', () => {
  loadEnvironmentFiles();
  const environment = parseWorkerEnvironment(process.env);
  const prefix = `test-outbox-${randomUUID().replaceAll('-', '')}`;
  let prisma: PrismaClient;
  let queues: BackgroundQueueCatalog;
  let dispatcher: OutboxDispatcherService;
  const eventIds: string[] = [];

  beforeAll(() => {
    prisma = createPrismaClient(environment.DATABASE_URL);
    queues = new BackgroundQueueCatalog(environment.REDIS_URL, prefix);
    dispatcher = new OutboxDispatcherService(prisma, queues, {
      ...environment,
      BULLMQ_PREFIX: prefix,
      OUTBOX_BATCH_SIZE: 1,
    });
  });

  afterAll(async () => {
    if (eventIds.length > 0) {
      await prisma.outboxEvent.deleteMany({ where: { id: { in: eventIds } } });
    }
    for (const queueName of ['emails', 'payment-reconciliation'] as const) {
      await queues.queue(queueName).obliterate({ force: true });
    }
    await queues.close();
    await prisma.$disconnect();
  });

  it('publishes committed references exactly once without copying payload data', async () => {
    const eventId = randomUUID();
    eventIds.push(eventId);
    await prisma.outboxEvent.create({
      data: {
        id: eventId,
        aggregateType: 'USER',
        aggregateId: randomUUID(),
        eventType: 'AUTH_EMAIL_VERIFICATION_REQUESTED',
        idempotencyKey: `worker-test-${eventId}`,
        availableAt: new Date(0),
        payload: {
          recipientEmail: 'fictional@example.test',
          privateMarker: 'must-remain-in-postgres',
        },
      },
    });

    expect(await dispatcher.dispatchOnce()).toBe(1);

    const stored = await prisma.outboxEvent.findUniqueOrThrow({
      where: { id: eventId },
    });
    expect(stored.status).toBe(OutboxStatus.PUBLISHED);
    expect(stored.attemptCount).toBe(1);
    const job = await queues
      .queue('emails')
      .getJob(`outbox-${eventId.replaceAll('-', '')}`);
    expect(job).not.toBeNull();
    expect(JSON.stringify(job?.data)).not.toContain('privateMarker');
    expect(JSON.stringify(job?.data)).not.toContain('fictional@example.test');
    expect(job?.data.outboxEventId).toBe(eventId);
  });

  it('retains unsupported events as visible non-retryable outbox failures', async () => {
    const eventId = randomUUID();
    eventIds.push(eventId);
    await prisma.outboxEvent.create({
      data: {
        id: eventId,
        aggregateType: 'SETTING',
        aggregateId: randomUUID(),
        eventType: 'UNSUPPORTED_TEST_EVENT',
        idempotencyKey: `worker-test-${eventId}`,
        availableAt: new Date(0),
        payload: {},
      },
    });

    expect(await dispatcher.dispatchOnce()).toBe(1);

    const stored = await prisma.outboxEvent.findUniqueOrThrow({
      where: { id: eventId },
    });
    expect(stored.status).toBe(OutboxStatus.FAILED);
    expect(stored.lastError).toBe('OUTBOX_EVENT_UNROUTABLE');
    expect(stored.lockedAt).toBeNull();
    expect(stored.lockedBy).toBeNull();
  });
});
