import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import type { ApiEnvironment } from '@webhost-billing/config';
import { OutboxStatus, type PrismaClient } from '@webhost-billing/database';
import { BackgroundQueueCatalog } from '@webhost-billing/queue';
import {
  backgroundFailureListSchema,
  backgroundJobDataSchema,
  backgroundQueueNameSchema,
  routeOutboxEvent,
  type BackgroundFailureList,
  type BackgroundQueueName,
} from '@webhost-billing/shared';
import { ApplicationException } from '../../common/errors/application.exception';
import type { SecurityRequestContext } from '../../common/http/request-context';
import { PRISMA_CLIENT } from '../../infrastructure/database/database.module';
import type { AuthRequestContext } from '../auth/auth.types';

export const API_BACKGROUND_QUEUES = Symbol('API_BACKGROUND_QUEUES');

@Injectable()
export class BackgroundJobService {
  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient,
    @Inject(API_BACKGROUND_QUEUES)
    private readonly queues: BackgroundQueueCatalog,
  ) {}

  async failures(): Promise<BackgroundFailureList> {
    const [queueJobs, outbox] = await Promise.all([
      this.queues.failedJobs(100),
      this.prisma.outboxEvent.findMany({
        where: { status: OutboxStatus.FAILED },
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        take: 100,
      }),
    ]);
    return backgroundFailureListSchema.parse({
      queueJobs,
      outboxEvents: outbox.map((event) => ({
        source: 'OUTBOX',
        outboxEventId: event.id,
        eventType: event.eventType,
        aggregateType: event.aggregateType,
        aggregateId: event.aggregateId,
        attemptCount: event.attemptCount,
        manualRetryAllowed: routeOutboxEvent(event.eventType) !== null,
        failedAt: event.updatedAt.toISOString(),
      })),
    });
  }

  async retryQueueJob(
    queueNameInput: string,
    jobId: string,
    actor: AuthRequestContext,
    context: SecurityRequestContext,
  ): Promise<{ queued: true }> {
    this.assertAdministrator(actor);
    const queueName = backgroundQueueNameSchema.parse(queueNameInput);
    const job = await this.queues.queue(queueName).getJob(jobId);
    if (!job) throw this.notFound('Background job was not found.');
    const parsed = backgroundJobDataSchema.safeParse(job.data);
    if (!parsed.success) {
      throw this.conflict('The job payload is invalid and cannot be retried.');
    }
    const state = await job.getState();
    if (
      state !== 'failed' ||
      parsed.data.failureKind !== 'TEMPORARY' ||
      parsed.data.manualRetryAllowed !== true
    ) {
      throw this.conflict(
        'Only failed jobs classified as temporarily retryable may be retried.',
      );
    }
    await job.retry('failed');
    await this.auditRetry(
      actor,
      context,
      'BACKGROUND_JOB_RETRIED',
      parsed.data.outboxEventId,
      {
        queueName,
        jobId,
        correlationId: parsed.data.correlationId,
      },
    );
    return { queued: true };
  }

  async retryOutboxEvent(
    eventId: string,
    actor: AuthRequestContext,
    context: SecurityRequestContext,
  ): Promise<{ queued: true }> {
    this.assertAdministrator(actor);
    await this.prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`
        SELECT "id" FROM "outbox_events"
        WHERE "id" = ${eventId}::uuid FOR UPDATE
      `;
      const event = await transaction.outboxEvent.findUnique({
        where: { id: eventId },
      });
      if (!event) throw this.notFound('Outbox event was not found.');
      if (
        event.status !== OutboxStatus.FAILED ||
        !routeOutboxEvent(event.eventType)
      ) {
        throw this.conflict(
          'Only failed events with a recognized safe route may be retried.',
        );
      }
      await transaction.outboxEvent.update({
        where: { id: event.id },
        data: {
          status: OutboxStatus.PENDING,
          attemptCount: 0,
          availableAt: new Date(),
          lockedAt: null,
          lockedBy: null,
          lastError: null,
        },
      });
      await transaction.activityLog.create({
        data: {
          actorUserId: actor.identity.userId,
          action: 'OUTBOX_EVENT_RETRIED',
          entityType: 'OUTBOX_EVENT',
          entityId: event.id,
          correlationId: event.id,
          ipAddressHash: context.ipAddressHash,
          metadata: {
            eventType: event.eventType,
            previousAttemptCount: event.attemptCount,
          },
        },
      });
    });
    return { queued: true };
  }

  private async auditRetry(
    actor: AuthRequestContext,
    context: SecurityRequestContext,
    action: string,
    entityId: string,
    metadata: {
      queueName: BackgroundQueueName;
      jobId: string;
      correlationId: string;
    },
  ): Promise<void> {
    await this.prisma.activityLog.create({
      data: {
        actorUserId: actor.identity.userId,
        action,
        entityType: 'BACKGROUND_JOB',
        entityId,
        correlationId: metadata.correlationId,
        ipAddressHash: context.ipAddressHash,
        metadata,
      },
    });
  }

  private assertAdministrator(actor: AuthRequestContext): void {
    if (actor.identity.role !== 'ADMIN') {
      throw new ApplicationException({
        status: HttpStatus.FORBIDDEN,
        code: 'FORBIDDEN',
        message: 'Only administrators can manage background jobs.',
      });
    }
  }

  private notFound(message: string): ApplicationException {
    return new ApplicationException({
      status: HttpStatus.NOT_FOUND,
      code: 'RESOURCE_NOT_FOUND',
      message,
    });
  }

  private conflict(message: string): ApplicationException {
    return new ApplicationException({
      status: HttpStatus.CONFLICT,
      code: 'CONFLICT',
      message,
    });
  }
}

export function createApiBackgroundQueues(
  environment: ApiEnvironment,
): BackgroundQueueCatalog {
  return new BackgroundQueueCatalog(
    environment.REDIS_URL,
    environment.BULLMQ_PREFIX,
    (entry) => new Logger('BackgroundQueues').error(JSON.stringify(entry)),
  );
}
