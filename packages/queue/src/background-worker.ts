import { UnrecoverableError, Worker, type Job } from 'bullmq';
import {
  backgroundJobDataSchema,
  type BackgroundFailureKind,
  type BackgroundJobData,
  type BackgroundQueueName,
  runWithStructuredLogContext,
} from '@webhost-billing/shared';
import { createBullConnectionOptions } from './connection';

export class BackgroundJobError extends Error {
  constructor(
    readonly kind: BackgroundFailureKind,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'BackgroundJobError';
  }
}

export interface StructuredJobLog {
  level: 'info' | 'error';
  event: string;
  queueName: BackgroundQueueName;
  jobId: string;
  correlationId: string | null;
  failureKind?: BackgroundFailureKind;
  failureCode?: string;
}

export type BackgroundJobHandler = (
  data: BackgroundJobData,
  signal: AbortSignal | undefined,
) => Promise<void>;

export class BackgroundWorker {
  private readonly workers: Worker<BackgroundJobData, void, string>[] = [];

  constructor(
    private readonly redisUrl: string,
    private readonly prefix: string,
    private readonly log: (entry: StructuredJobLog) => void,
  ) {}

  register(
    queueName: BackgroundQueueName,
    handler: BackgroundJobHandler,
    concurrency = 1,
  ): Worker<BackgroundJobData, void, string> {
    const worker = new Worker<BackgroundJobData, void, string>(
      queueName,
      async (job, _token, signal) =>
        this.process(queueName, job, handler, signal),
      {
        connection: {
          ...createBullConnectionOptions(this.redisUrl),
          maxRetriesPerRequest: null,
        },
        prefix: this.prefix,
        concurrency,
        maxStalledCount: 1,
      },
    );
    worker.on('error', () => {
      this.log({
        level: 'error',
        event: 'background_worker_error',
        queueName,
        jobId: 'worker',
        correlationId: null,
      });
    });
    this.workers.push(worker);
    return worker;
  }

  async close(): Promise<void> {
    await Promise.all(this.workers.map((worker) => worker.close()));
  }

  private async process(
    queueName: BackgroundQueueName,
    job: Job<BackgroundJobData, void, string>,
    handler: BackgroundJobHandler,
    signal: AbortSignal | undefined,
  ): Promise<void> {
    let data: BackgroundJobData;
    try {
      data = backgroundJobDataSchema.parse(job.data);
    } catch {
      throw new UnrecoverableError('BACKGROUND_JOB_PAYLOAD_INVALID');
    }
    await runWithStructuredLogContext(
      {
        correlationId: data.correlationId,
        jobId: job.id ?? 'unknown',
        queueName,
      },
      async () => {
        this.log({
          level: 'info',
          event: 'background_job_started',
          queueName,
          jobId: job.id ?? 'unknown',
          correlationId: data.correlationId,
        });
        try {
          await handler(data, signal);
          this.log({
            level: 'info',
            event: 'background_job_succeeded',
            queueName,
            jobId: job.id ?? 'unknown',
            correlationId: data.correlationId,
          });
        } catch (error) {
          const classified =
            error instanceof BackgroundJobError
              ? error
              : new BackgroundJobError(
                  'TEMPORARY',
                  'BACKGROUND_JOB_UNEXPECTED',
                  'The background job failed unexpectedly.',
                );
          await job.updateData({
            ...data,
            failureKind: classified.kind,
            failureCode: classified.code,
            manualRetryAllowed: classified.kind === 'TEMPORARY',
          });
          this.log({
            level: 'error',
            event: 'background_job_failed',
            queueName,
            jobId: job.id ?? 'unknown',
            correlationId: data.correlationId,
            failureKind: classified.kind,
            failureCode: classified.code,
          });
          if (classified.kind !== 'TEMPORARY') {
            throw new UnrecoverableError(classified.code);
          }
          throw new Error(classified.code);
        }
      },
    );
  }
}
