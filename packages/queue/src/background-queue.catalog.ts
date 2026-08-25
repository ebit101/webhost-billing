import { Queue, type Job } from 'bullmq';
import {
  backgroundJobDataSchema,
  backgroundQueueNames,
  backgroundQueuePolicies,
  failedBackgroundJobSchema,
  type BackgroundJobData,
  type BackgroundQueueName,
  type FailedBackgroundJob,
  type OutboxQueueRoute,
} from '@webhost-billing/shared';
import { createBullConnectionOptions } from './connection';

export interface OutboxJobReference {
  id: string;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
}

export interface QueueConnectionLog {
  event: 'background_queue_error';
  queueName: BackgroundQueueName;
}

export class BackgroundQueueCatalog {
  private readonly queues = new Map<
    BackgroundQueueName,
    Queue<BackgroundJobData, void, string>
  >();

  constructor(
    redisUrl: string,
    prefix: string,
    onConnectionError: (entry: QueueConnectionLog) => void = () => undefined,
  ) {
    const connection = {
      ...createBullConnectionOptions(redisUrl),
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
    };
    for (const queueName of backgroundQueueNames) {
      const queue = new Queue<BackgroundJobData, void, string>(queueName, {
        connection,
        prefix,
      });
      queue.on('error', () =>
        onConnectionError({ event: 'background_queue_error', queueName }),
      );
      this.queues.set(queueName, queue);
    }
  }

  queue(
    queueName: BackgroundQueueName,
  ): Queue<BackgroundJobData, void, string> {
    const queue = this.queues.get(queueName);
    if (!queue) throw new Error('Background queue is not configured.');
    return queue;
  }

  async addOutboxJob(
    route: OutboxQueueRoute,
    event: OutboxJobReference,
  ): Promise<Job<BackgroundJobData, void, string>> {
    const policy = backgroundQueuePolicies[route.queueName];
    const data = backgroundJobDataSchema.parse({
      schemaVersion: 1,
      outboxEventId: event.id,
      aggregateType: event.aggregateType,
      aggregateId: event.aggregateId,
      eventType: event.eventType,
      correlationId: event.id,
    });
    return this.queue(route.queueName).add(route.jobName, data, {
      jobId: `outbox-${event.id.replaceAll('-', '')}`,
      attempts: policy.attempts,
      ...(policy.backoffMilliseconds > 0
        ? {
            backoff: {
              type: 'exponential' as const,
              delay: policy.backoffMilliseconds,
            },
          }
        : {}),
      removeOnComplete: { age: 7 * 86_400, count: 10_000 },
      removeOnFail: false,
      stackTraceLimit: 3,
      sizeLimit: 2_048,
    });
  }

  async failedJobs(limit = 100): Promise<FailedBackgroundJob[]> {
    const groups = await Promise.all(
      backgroundQueueNames.map(async (queueName) => {
        const jobs = await this.queue(queueName).getJobs(
          ['failed'],
          0,
          Math.max(0, limit - 1),
          false,
        );
        return Promise.all(
          jobs.map(async (job) => this.toFailedJob(queueName, job)),
        );
      }),
    );
    return groups
      .flat()
      .sort((left, right) =>
        (right.failedAt ?? '').localeCompare(left.failedAt ?? ''),
      )
      .slice(0, limit);
  }

  async close(): Promise<void> {
    await Promise.all([...this.queues.values()].map((queue) => queue.close()));
  }

  private async toFailedJob(
    queueName: BackgroundQueueName,
    job: Job<BackgroundJobData, void, string>,
  ): Promise<FailedBackgroundJob> {
    const parsed = backgroundJobDataSchema.safeParse(job.data);
    const data = parsed.success ? parsed.data : null;
    const state = await job.getState();
    return failedBackgroundJobSchema.parse({
      source: 'QUEUE',
      queueName,
      jobId: job.id,
      jobName: job.name,
      state,
      correlationId: data?.correlationId ?? null,
      outboxEventId: data?.outboxEventId ?? null,
      attemptsMade: job.attemptsMade,
      maxAttempts: job.opts.attempts ?? 1,
      failureKind: data?.failureKind ?? (parsed.success ? null : 'PERMANENT'),
      failureCode:
        data?.failureCode ??
        (parsed.success ? null : 'BACKGROUND_JOB_PAYLOAD_INVALID'),
      manualRetryAllowed:
        data?.failureKind === 'TEMPORARY' && data.manualRetryAllowed === true,
      failedAt: job.finishedOn ? new Date(job.finishedOn).toISOString() : null,
    });
  }
}
