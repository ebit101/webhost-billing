import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';
import { QueueEvents } from 'bullmq';
import {
  backgroundQueueNames,
  type BackgroundJobData,
} from '@webhost-billing/shared';
import { BackgroundQueueCatalog } from './background-queue.catalog';
import {
  BackgroundJobError,
  BackgroundWorker,
  type StructuredJobLog,
} from './background-worker';
import { createBullConnectionOptions } from './connection';

describe('BullMQ background infrastructure integration', () => {
  const environmentPath = [
    resolve(process.cwd(), '.env'),
    resolve(process.cwd(), '../../.env'),
  ].find((candidate) => existsSync(candidate));
  if (!environmentPath)
    throw new Error('Queue integration .env was not found.');
  for (const [key, value] of Object.entries(
    parseEnv(readFileSync(environmentPath, 'utf8')),
  )) {
    if (process.env[key] === undefined) process.env[key] = value;
  }
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl)
    throw new Error('REDIS_URL is required for queue integration.');

  const prefix = `test-queue-${randomUUID().replaceAll('-', '')}`;
  const catalog = new BackgroundQueueCatalog(redisUrl, prefix);
  const logs: StructuredJobLog[] = [];
  const workers = new BackgroundWorker(redisUrl, prefix, (entry) =>
    logs.push(entry),
  );
  const queueEvents: QueueEvents[] = [];

  afterAll(async () => {
    await workers.close();
    await Promise.all(queueEvents.map((events) => events.close()));
    await Promise.all(
      backgroundQueueNames.map((queueName) =>
        catalog.queue(queueName).obliterate({ force: true }),
      ),
    );
    await catalog.close();
  });

  it('deduplicates outbox publication and keeps Redis payloads reference-only', async () => {
    const event = {
      id: randomUUID(),
      aggregateType: 'USER',
      aggregateId: randomUUID(),
      eventType: 'AUTH_EMAIL_VERIFICATION_REQUESTED',
    };
    const route = { queueName: 'emails', jobName: 'send-auth-email' } as const;
    const first = await catalog.addOutboxJob(route, event);
    const duplicate = await catalog.addOutboxJob(route, event);

    expect(duplicate.id).toBe(first.id);
    expect(await catalog.queue('emails').getJobCountByTypes('waiting')).toBe(1);
    expect(first.data).toEqual({
      schemaVersion: 1,
      outboxEventId: event.id,
      aggregateType: 'USER',
      aggregateId: event.aggregateId,
      eventType: event.eventType,
      correlationId: event.id,
    });
    expect(JSON.stringify(first.data)).not.toContain('recipient');
    expect(first.opts.attempts).toBe(5);
    await first.remove();
  });

  it('retries temporary work with bounded attempts and structured correlation logs', async () => {
    let executions = 0;
    workers.register('emails', async () => {
      executions += 1;
      if (executions === 1) {
        throw new BackgroundJobError(
          'TEMPORARY',
          'SMTP_TEMPORARILY_UNAVAILABLE',
          'Temporary test failure.',
        );
      }
    });
    const events = new QueueEvents('emails', {
      connection: createBullConnectionOptions(redisUrl),
      prefix,
    });
    queueEvents.push(events);
    await events.waitUntilReady();
    const data = jobData('EMAIL_DELIVERY_REQUESTED');
    const job = await catalog.queue('emails').add('send-email', data, {
      jobId: `test-${randomUUID().replaceAll('-', '')}`,
      attempts: 2,
      backoff: { type: 'exponential', delay: 10 },
    });

    await job.waitUntilFinished(events, 5_000);

    expect(executions).toBe(2);
    expect(logs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: 'background_job_failed',
          correlationId: data.correlationId,
          failureKind: 'TEMPORARY',
        }),
        expect.objectContaining({
          event: 'background_job_succeeded',
          correlationId: data.correlationId,
        }),
      ]),
    );
  });

  it('stops retries for permanent failures and retains them for inspection', async () => {
    let executions = 0;
    workers.register('hosting-status-reconciliation', async () => {
      executions += 1;
      throw new BackgroundJobError(
        'PERMANENT',
        'ACCOUNT_REFERENCE_INVALID',
        'Permanent test failure.',
      );
    });
    const events = new QueueEvents('hosting-status-reconciliation', {
      connection: createBullConnectionOptions(redisUrl),
      prefix,
    });
    queueEvents.push(events);
    await events.waitUntilReady();
    const data = jobData('HOSTING_STATUS_RECONCILIATION_REQUESTED');
    const job = await catalog
      .queue('hosting-status-reconciliation')
      .add('reconcile-hosting', data, {
        jobId: `test-${randomUUID().replaceAll('-', '')}`,
        attempts: 5,
        backoff: { type: 'exponential', delay: 10 },
      });

    await expect(job.waitUntilFinished(events, 5_000)).rejects.toThrow(
      'ACCOUNT_REFERENCE_INVALID',
    );

    expect(executions).toBe(1);
    const retained = await catalog.failedJobs();
    expect(retained).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          jobId: job.id,
          failureKind: 'PERMANENT',
          failureCode: 'ACCOUNT_REFERENCE_INVALID',
          manualRetryAllowed: false,
        }),
      ]),
    );
  });
});

function jobData(eventType: string): BackgroundJobData {
  const eventId = randomUUID();
  return {
    schemaVersion: 1,
    outboxEventId: eventId,
    aggregateType: 'SERVICE',
    aggregateId: randomUUID(),
    eventType,
    correlationId: eventId,
  };
}
