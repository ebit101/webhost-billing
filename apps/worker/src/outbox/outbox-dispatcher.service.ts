import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import type { WorkerEnvironment } from '@webhost-billing/config';
import {
  OutboxStatus,
  Prisma,
  type OutboxEvent,
  type PrismaClient,
} from '@webhost-billing/database';
import { BackgroundQueueCatalog } from '@webhost-billing/queue';
import { routeOutboxEvent } from '@webhost-billing/shared';
import { WORKER_PRISMA } from '../infrastructure/database.module';
import { WORKER_ENVIRONMENT } from '../infrastructure/environment.module';
import { BACKGROUND_QUEUES } from '../infrastructure/queue.module';

const MAX_PUBLICATION_ATTEMPTS = 5;

@Injectable()
export class OutboxDispatcherService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(OutboxDispatcherService.name);
  private readonly workerId = `outbox-${process.pid}`;
  private timer?: NodeJS.Timeout;
  private activeDispatch?: Promise<number>;

  constructor(
    @Inject(WORKER_PRISMA) private readonly prisma: PrismaClient,
    @Inject(BACKGROUND_QUEUES) private readonly queues: BackgroundQueueCatalog,
    @Inject(WORKER_ENVIRONMENT) private readonly environment: WorkerEnvironment,
  ) {}

  onApplicationBootstrap(): void {
    this.timer = setInterval(
      () => void this.tick(),
      this.environment.OUTBOX_POLL_INTERVAL_MS,
    );
    this.timer.unref();
    void this.tick();
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    await this.activeDispatch;
  }

  async dispatchOnce(): Promise<number> {
    const events = await this.claimBatch();
    for (const event of events) await this.publish(event);
    return events.length;
  }

  private async tick(): Promise<void> {
    if (this.activeDispatch) return;
    this.activeDispatch = this.dispatchOnce();
    try {
      await this.activeDispatch;
    } catch {
      this.logger.error(
        JSON.stringify({
          event: 'outbox_dispatch_cycle_failed',
          workerId: this.workerId,
        }),
      );
    } finally {
      this.activeDispatch = undefined;
    }
  }

  private async claimBatch(): Promise<OutboxEvent[]> {
    const lockCutoff = new Date(
      Date.now() - this.environment.OUTBOX_LOCK_TIMEOUT_SECONDS * 1_000,
    );
    const claimed = await this.prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
      WITH candidates AS (
        SELECT "id"
        FROM "outbox_events"
        WHERE (
          "status" = 'PENDING'
          AND "available_at" <= CURRENT_TIMESTAMP
        ) OR (
          "status" = 'PROCESSING'
          AND "locked_at" < ${lockCutoff}
        )
        ORDER BY "available_at" ASC, "created_at" ASC
        FOR UPDATE SKIP LOCKED
        LIMIT ${this.environment.OUTBOX_BATCH_SIZE}
      )
      UPDATE "outbox_events" AS event
      SET
        "status" = 'PROCESSING',
        "attempt_count" = event."attempt_count" + 1,
        "locked_at" = CURRENT_TIMESTAMP,
        "locked_by" = ${this.workerId},
        "updated_at" = CURRENT_TIMESTAMP
      FROM candidates
      WHERE event."id" = candidates."id"
      RETURNING event."id"
    `);
    if (claimed.length === 0) return [];
    return this.prisma.outboxEvent.findMany({
      where: { id: { in: claimed.map(({ id }) => id) } },
      orderBy: [{ availableAt: 'asc' }, { createdAt: 'asc' }],
    });
  }

  private async publish(event: OutboxEvent): Promise<void> {
    const route = routeOutboxEvent(event.eventType);
    if (!route) {
      await this.failPermanently(event.id, 'OUTBOX_EVENT_UNROUTABLE');
      return;
    }
    try {
      const job = await this.queues.addOutboxJob(route, event);
      await this.prisma.outboxEvent.updateMany({
        where: {
          id: event.id,
          status: OutboxStatus.PROCESSING,
          lockedBy: this.workerId,
        },
        data: {
          status: OutboxStatus.PUBLISHED,
          publishedAt: new Date(),
          lockedAt: null,
          lockedBy: null,
          lastError: null,
        },
      });
      this.logger.log(
        JSON.stringify({
          event: 'outbox_event_published',
          outboxEventId: event.id,
          correlationId: event.id,
          queueName: route.queueName,
          jobId: job.id,
        }),
      );
    } catch {
      await this.publicationFailed(event);
    }
  }

  private async publicationFailed(event: OutboxEvent): Promise<void> {
    const exhausted = event.attemptCount >= MAX_PUBLICATION_ATTEMPTS;
    const delayMilliseconds = Math.min(
      300_000,
      2_000 * 2 ** Math.max(0, event.attemptCount - 1),
    );
    await this.prisma.outboxEvent.updateMany({
      where: {
        id: event.id,
        status: OutboxStatus.PROCESSING,
        lockedBy: this.workerId,
      },
      data: {
        status: exhausted ? OutboxStatus.FAILED : OutboxStatus.PENDING,
        availableAt: new Date(Date.now() + delayMilliseconds),
        lockedAt: null,
        lockedBy: null,
        lastError: exhausted
          ? 'OUTBOX_PUBLICATION_ATTEMPTS_EXHAUSTED'
          : 'OUTBOX_PUBLICATION_TEMPORARILY_UNAVAILABLE',
      },
    });
    this.logger.error(
      JSON.stringify({
        event: 'outbox_event_publication_failed',
        outboxEventId: event.id,
        correlationId: event.id,
        failureKind: exhausted ? 'PERMANENT' : 'TEMPORARY',
        failureCode: exhausted
          ? 'OUTBOX_PUBLICATION_ATTEMPTS_EXHAUSTED'
          : 'OUTBOX_PUBLICATION_TEMPORARILY_UNAVAILABLE',
      }),
    );
  }

  private async failPermanently(
    eventId: string,
    failureCode: string,
  ): Promise<void> {
    await this.prisma.outboxEvent.updateMany({
      where: {
        id: eventId,
        status: OutboxStatus.PROCESSING,
        lockedBy: this.workerId,
      },
      data: {
        status: OutboxStatus.FAILED,
        lockedAt: null,
        lockedBy: null,
        lastError: failureCode,
      },
    });
    this.logger.error(
      JSON.stringify({
        event: 'outbox_event_failed',
        outboxEventId: eventId,
        correlationId: eventId,
        failureKind: 'PERMANENT',
        failureCode,
      }),
    );
  }
}
