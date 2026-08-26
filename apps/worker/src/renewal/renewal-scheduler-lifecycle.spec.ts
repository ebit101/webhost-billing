import type { WorkerEnvironment } from '@webhost-billing/config';
import type { PrismaClient } from '@webhost-billing/database';
import type { Clock } from './clock';
import { RenewalSchedulerService } from './renewal-scheduler.service';

describe('RenewalSchedulerService lifecycle', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('keeps the dedicated scheduler process alive until shutdown', async () => {
    jest.useFakeTimers();
    const prisma = {
      setting: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      $transaction: jest.fn().mockResolvedValue('LOCKED'),
    } as unknown as PrismaClient;
    const environment = {
      SCHEDULER_POLL_INTERVAL_MS: 60_000,
    } as WorkerEnvironment;
    const clock: Clock = { now: () => new Date('2026-08-26T00:00:00.000Z') };
    const service = new RenewalSchedulerService(prisma, environment, clock);

    service.onApplicationBootstrap();
    const timer = (service as unknown as { timer: NodeJS.Timeout | undefined })
      .timer;

    expect(timer?.hasRef()).toBe(true);
    await service.onApplicationShutdown();
  });
});
