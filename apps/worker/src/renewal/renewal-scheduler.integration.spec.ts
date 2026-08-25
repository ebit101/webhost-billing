import {
  loadEnvironmentFiles,
  parseWorkerEnvironment,
} from '@webhost-billing/config';
import { createPrismaClient } from '@webhost-billing/database';
import type { Clock } from './clock';
import { businessDate } from './renewal-calendar';
import { RenewalSchedulerService } from './renewal-scheduler.service';

loadEnvironmentFiles();
const environment = parseWorkerEnvironment(process.env);
const prisma = createPrismaClient(environment.DATABASE_URL);

class FixedClock implements Clock {
  constructor(private readonly value: Date) {}
  now(): Date {
    return new Date(this.value);
  }
}

describe('RenewalSchedulerService integration', () => {
  const instant = new Date('2096-07-14T18:30:00.000Z');
  const businessDay = businessDate(instant, 'Asia/Dhaka');
  const runKey = `renewal-cycle:${businessDay}`;

  afterAll(async () => {
    const run = await prisma.automationRun.findUnique({
      where: { idempotencyKey: runKey },
    });
    if (run) {
      await prisma.outboxEvent.deleteMany({
        where: { aggregateType: 'AUTOMATION_RUN', aggregateId: run.id },
      });
      await prisma.automationRun.delete({ where: { id: run.id } });
    }
    await prisma.$disconnect();
  });

  it('creates one daily run and request across concurrent schedulers and replays', async () => {
    const clock = new FixedClock(instant);
    const first = new RenewalSchedulerService(prisma, environment, clock);
    const second = new RenewalSchedulerService(prisma, environment, clock);
    const outcomes = await Promise.all([
      first.scheduleCurrentCycle(),
      second.scheduleCurrentCycle(),
      first.scheduleCurrentCycle(),
    ]);

    expect(outcomes.filter((outcome) => outcome === 'CREATED')).toHaveLength(1);
    const run = await prisma.automationRun.findUniqueOrThrow({
      where: { idempotencyKey: runKey },
    });
    expect(
      await prisma.outboxEvent.count({
        where: {
          aggregateType: 'AUTOMATION_RUN',
          aggregateId: run.id,
          eventType: 'RENEWAL_INVOICE_GENERATION_REQUESTED',
        },
      }),
    ).toBe(1);
  });
});
