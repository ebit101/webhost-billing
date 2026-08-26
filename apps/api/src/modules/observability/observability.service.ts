import { Inject, Injectable } from '@nestjs/common';
import {
  AutomationStatus,
  EmailAttemptStatus,
  HostingPanelOperationStatus,
  OutboxStatus,
  PaymentStatus,
  Prisma,
  type PrismaClient,
} from '@webhost-billing/database';
import { BackgroundQueueCatalog } from '@webhost-billing/queue';
import {
  automationRunSummarySchema,
  healthStatusSchema,
  operationalOverviewSchema,
  readinessStatusSchema,
  type HealthStatus,
  type OperationalOverview,
  type ProviderFailureMetric,
  type ReadinessStatus,
} from '@webhost-billing/shared';
import { PRISMA_CLIENT } from '../../infrastructure/database/database.module';
import {
  REDIS_CLIENT,
  type RedisClient,
} from '../../infrastructure/redis/redis.module';
import { API_BACKGROUND_QUEUES } from '../background-jobs/background-job.service';

const CHECK_TIMEOUT_MS = 2_000;

@Injectable()
export class ObservabilityService {
  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient,
    @Inject(REDIS_CLIENT) private readonly redis: RedisClient,
    @Inject(API_BACKGROUND_QUEUES)
    private readonly queues: BackgroundQueueCatalog,
  ) {}

  health(): HealthStatus {
    return healthStatusSchema.parse({
      status: 'OK',
      service: 'api',
      checkedAt: new Date().toISOString(),
    });
  }

  async readiness(): Promise<ReadinessStatus> {
    const [postgresql, redis] = await Promise.all([
      this.componentStatus(this.prisma.$queryRaw(Prisma.sql`SELECT 1`)),
      this.componentStatus(this.redis.ping()),
    ]);
    return readinessStatusSchema.parse({
      status: postgresql === 'UP' && redis === 'UP' ? 'READY' : 'NOT_READY',
      checkedAt: new Date().toISOString(),
      components: { postgresql, redis },
    });
  }

  async overview(): Promise<OperationalOverview> {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1_000);
    const [
      queues,
      failedOutboxEvents,
      runningAutomation,
      failedAutomation,
      latestRuns,
      paymentFailures,
      hostingFailures,
      emailFailures,
    ] = await Promise.all([
      this.queues.metrics(),
      this.prisma.outboxEvent.count({ where: { status: OutboxStatus.FAILED } }),
      this.prisma.automationRun.count({
        where: { status: AutomationStatus.RUNNING },
      }),
      this.prisma.automationRun.count({
        where: { status: AutomationStatus.FAILED, startedAt: { gte: since } },
      }),
      this.prisma.automationRun.findMany({
        orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
        take: 20,
      }),
      this.prisma.payment.groupBy({
        by: ['provider'],
        where: {
          provider: { in: ['bkash', 'sslcommerz'] },
          status: { in: [PaymentStatus.PENDING, PaymentStatus.FAILED] },
          failureReason: { not: null },
          updatedAt: { gte: since },
        },
        _count: { _all: true },
        _max: { updatedAt: true },
      }),
      this.prisma.hostingPanelOperation.groupBy({
        by: ['adapterKey', 'status'],
        where: {
          status: {
            in: [
              HostingPanelOperationStatus.FAILED,
              HostingPanelOperationStatus.INCONSISTENT,
            ],
          },
          createdAt: { gte: since },
        },
        _count: { _all: true },
        _max: { createdAt: true },
      }),
      this.prisma.emailAttempt.groupBy({
        by: ['provider', 'status'],
        where: {
          status: {
            in: [EmailAttemptStatus.FAILED, EmailAttemptStatus.INCONSISTENT],
          },
          startedAt: { gte: since },
        },
        _count: { _all: true },
        _max: { startedAt: true },
      }),
    ]);

    const queueTotals = queues.reduce(
      (totals, queue) => ({
        waiting: totals.waiting + queue.waiting,
        active: totals.active + queue.active,
        delayed: totals.delayed + queue.delayed,
        failed: totals.failed + queue.failed,
      }),
      { waiting: 0, active: 0, delayed: 0, failed: 0 },
    );
    const providerFailures: ProviderFailureMetric[] = [
      ...paymentFailures.map((entry) => ({
        providerType: 'PAYMENT_GATEWAY' as const,
        provider: entry.provider,
        failedLast24Hours: entry._count._all,
        inconsistentLast24Hours: 0,
        mostRecentAt: entry._max.updatedAt?.toISOString() ?? null,
      })),
      ...this.mergeStatusMetrics(
        hostingFailures.map((entry) => ({
          provider: entry.adapterKey,
          status: entry.status,
          count: entry._count._all,
          mostRecentAt: entry._max.createdAt,
        })),
        'HOSTING_PANEL',
      ),
      ...this.mergeStatusMetrics(
        emailFailures.map((entry) => ({
          provider: entry.provider,
          status: entry.status,
          count: entry._count._all,
          mostRecentAt: entry._max.startedAt,
        })),
        'EMAIL',
      ),
    ];

    return operationalOverviewSchema.parse({
      generatedAt: new Date().toISOString(),
      queues,
      queueTotals,
      failedOutboxEvents,
      automation: {
        running: runningAutomation,
        failedLast24Hours: failedAutomation,
        latestRuns: latestRuns.map((run) =>
          automationRunSummarySchema.parse({
            id: run.id,
            jobName: run.jobName,
            status: run.status,
            startedAt: run.startedAt.toISOString(),
            completedAt: run.completedAt?.toISOString() ?? null,
            processedCount: run.processedCount,
            succeededCount: run.succeededCount,
            failedCount: run.failedCount,
            errorSummary: run.errorSummary,
          }),
        ),
      },
      providerFailures,
    });
  }

  private async componentStatus(
    operation: Promise<unknown>,
  ): Promise<'UP' | 'DOWN'> {
    let timeout: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        operation,
        new Promise<never>((_resolve, reject) => {
          timeout = setTimeout(
            () => reject(new Error('Health check timed out.')),
            CHECK_TIMEOUT_MS,
          );
        }),
      ]);
      return 'UP';
    } catch {
      return 'DOWN';
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }

  private mergeStatusMetrics(
    entries: Array<{
      provider: string;
      status: string;
      count: number;
      mostRecentAt: Date | null;
    }>,
    providerType: 'HOSTING_PANEL' | 'EMAIL',
  ): ProviderFailureMetric[] {
    const metrics = new Map<string, ProviderFailureMetric>();
    for (const entry of entries) {
      const current = metrics.get(entry.provider) ?? {
        providerType,
        provider: entry.provider,
        failedLast24Hours: 0,
        inconsistentLast24Hours: 0,
        mostRecentAt: null,
      };
      if (entry.status === 'INCONSISTENT') {
        current.inconsistentLast24Hours += entry.count;
      } else {
        current.failedLast24Hours += entry.count;
      }
      const timestamp = entry.mostRecentAt?.toISOString() ?? null;
      if (
        timestamp &&
        (!current.mostRecentAt || timestamp > current.mostRecentAt)
      ) {
        current.mostRecentAt = timestamp;
      }
      metrics.set(entry.provider, current);
    }
    return [...metrics.values()];
  }
}
