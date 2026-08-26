import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import type { WorkerEnvironment } from '@webhost-billing/config';
import {
  AutomationStatus,
  Prisma,
  type PrismaClient,
} from '@webhost-billing/database';
import { WORKER_PRISMA } from '../infrastructure/database.module';
import { WORKER_ENVIRONMENT } from '../infrastructure/environment.module';
import { CLOCK, type Clock } from './clock';
import { businessDate } from './renewal-calendar';
import { loadRenewalPolicy } from './renewal-policy';

const SCHEDULER_LOCK = 'webhost-billing:renewal-scheduler:v1';

@Injectable()
export class RenewalSchedulerService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(RenewalSchedulerService.name);
  private timer?: NodeJS.Timeout;
  private active?: Promise<'CREATED' | 'EXISTS' | 'LOCKED'>;

  constructor(
    @Inject(WORKER_PRISMA) private readonly prisma: PrismaClient,
    @Inject(WORKER_ENVIRONMENT) private readonly environment: WorkerEnvironment,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  onApplicationBootstrap(): void {
    this.timer = setInterval(
      () => void this.tick(),
      this.environment.SCHEDULER_POLL_INTERVAL_MS,
    );
    void this.tick();
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    await this.active;
  }

  async scheduleCurrentCycle(): Promise<'CREATED' | 'EXISTS' | 'LOCKED'> {
    const now = this.clock.now();
    const policy = await loadRenewalPolicy(this.prisma);
    const date = businessDate(now, policy.timeZone);
    return this.prisma.$transaction(async (transaction) => {
      const [lock] = await transaction.$queryRaw<
        Array<{ acquired: boolean }>
      >(Prisma.sql`
        SELECT pg_try_advisory_xact_lock(hashtext(${SCHEDULER_LOCK})) AS acquired
      `);
      if (!lock?.acquired) return 'LOCKED';
      const idempotencyKey = `renewal-cycle:${date}`;
      const existing = await transaction.automationRun.findUnique({
        where: { idempotencyKey },
        select: { id: true },
      });
      if (existing) return 'EXISTS';
      const run = await transaction.automationRun.create({
        data: {
          jobName: 'renewal-cycle',
          idempotencyKey,
          status: policy.enabled
            ? AutomationStatus.RUNNING
            : AutomationStatus.SKIPPED,
          startedAt: now,
          ...(policy.enabled ? {} : { completedAt: now }),
          metadata: { businessDate: date, policy },
        },
      });
      if (policy.enabled) {
        await transaction.outboxEvent.create({
          data: {
            aggregateType: 'AUTOMATION_RUN',
            aggregateId: run.id,
            eventType: 'RENEWAL_INVOICE_GENERATION_REQUESTED',
            idempotencyKey: `renewal-cycle-request:${date}`,
            payload: {
              schemaVersion: 1,
              automationRunId: run.id,
              businessDate: date,
              scheduledFor: now.toISOString(),
              policy,
            },
          },
        });
      }
      return 'CREATED';
    });
  }

  private async tick(): Promise<void> {
    if (this.active) return;
    this.active = this.scheduleCurrentCycle();
    try {
      const outcome = await this.active;
      if (outcome === 'CREATED') {
        this.logger.log(JSON.stringify({ event: 'renewal_cycle_scheduled' }));
      }
    } catch {
      this.logger.error(
        JSON.stringify({ event: 'renewal_scheduler_cycle_failed' }),
      );
    } finally {
      this.active = undefined;
    }
  }
}
