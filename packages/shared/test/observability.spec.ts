import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  StructuredLogger,
  operationalOverviewSchema,
  redactLogValue,
  runWithStructuredLogContext,
} from '../src';

describe('observability contracts', () => {
  it('redacts sensitive keys and common inline credentials', () => {
    assert.deepEqual(
      redactLogValue({
        email: 'admin@example.test',
        password: 'never-log-this',
        nested: { apiKey: 'also-secret', accessHash: 'legacy-panel-secret' },
        message: 'authorization=Bearer abc123 token=xyz',
      }),
      {
        email: 'admin@example.test',
        password: '[REDACTED]',
        nested: { apiKey: '[REDACTED]', accessHash: '[REDACTED]' },
        message: 'authorization=[REDACTED] token=[REDACTED]',
      },
    );
  });

  it('emits one structured JSON line with the active correlation context', () => {
    const lines: string[] = [];
    const logger = new StructuredLogger({
      service: 'test-api',
      environment: 'test',
      now: () => new Date('2026-08-26T03:00:00.000Z'),
      write: (line) => lines.push(line),
    });

    runWithStructuredLogContext(
      { requestId: '10000000-0000-4000-8000-000000000001' },
      () => logger.log({ event: 'safe_event', cookie: 'session-value' }),
    );

    assert.equal(lines.length, 1);
    assert.deepEqual(JSON.parse(lines[0] ?? ''), {
      timestamp: '2026-08-26T03:00:00.000Z',
      level: 'info',
      service: 'test-api',
      environment: 'test',
      event: 'safe_event',
      requestId: '10000000-0000-4000-8000-000000000001',
      cookie: '[REDACTED]',
    });
  });

  it('rejects malformed operational metrics', () => {
    assert.equal(
      operationalOverviewSchema.safeParse({
        generatedAt: '2026-08-26T03:00:00.000Z',
        queues: [],
        queueTotals: { waiting: -1, active: 0, delayed: 0, failed: 0 },
        failedOutboxEvents: 0,
        automation: { running: 0, failedLast24Hours: 0, latestRuns: [] },
        providerFailures: [],
      }).success,
      false,
    );
  });
});
