'use client';

import type {
  BackgroundFailureList,
  FailedBackgroundJob,
  FailedOutboxEvent,
} from '@webhost-billing/shared';
import { useEffect, useState, type ReactNode } from 'react';
import { authenticatedGet, authMutation } from '../../lib/auth-api';
import { Button } from '../ui/button';
import { EmptyState, LoadingState } from '../ui/feedback-state';
import { PageHeader } from '../ui/page-header';
import { StatusBadge } from '../ui/status-badge';

const emptyFailures: BackgroundFailureList = {
  queueJobs: [],
  outboxEvents: [],
};

export function AutomationManager() {
  const [failures, setFailures] =
    useState<BackgroundFailureList>(emptyFailures);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let active = true;
    void authenticatedGet<BackgroundFailureList>('/background-jobs/failures')
      .then((result) => {
        if (active) setFailures(result);
      })
      .catch((caught: unknown) => {
        if (active) setError(message(caught));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function retryQueue(job: FailedBackgroundJob) {
    const key = `queue-${job.queueName}-${job.jobId}`;
    setSavingKey(key);
    clearMessages();
    try {
      await authMutation<{ queued: true }>(
        `/background-jobs/queues/${encodeURIComponent(job.queueName)}/${encodeURIComponent(job.jobId)}/retry`,
        'POST',
        { confirmation: 'RETRY_JOB' },
      );
      setFailures((current) => ({
        ...current,
        queueJobs: current.queueJobs.filter(
          (candidate) =>
            candidate.queueName !== job.queueName ||
            candidate.jobId !== job.jobId,
        ),
      }));
      setNotice('The temporarily failed job was returned to its queue.');
    } catch (caught) {
      setError(message(caught));
    } finally {
      setSavingKey('');
    }
  }

  async function retryOutbox(event: FailedOutboxEvent) {
    const key = `outbox-${event.outboxEventId}`;
    setSavingKey(key);
    clearMessages();
    try {
      await authMutation<{ queued: true }>(
        `/background-jobs/outbox/${event.outboxEventId}/retry`,
        'POST',
        { confirmation: 'RETRY_OUTBOX' },
      );
      setFailures((current) => ({
        ...current,
        outboxEvents: current.outboxEvents.filter(
          (candidate) => candidate.outboxEventId !== event.outboxEventId,
        ),
      }));
      setNotice('The failed outbox publication was queued for dispatch.');
    } catch (caught) {
      setError(message(caught));
    } finally {
      setSavingKey('');
    }
  }

  function clearMessages() {
    setError('');
    setNotice('');
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operations"
        title="Automation and queue failures"
        description="Inspect durable outbox publication failures and retained BullMQ failures. Only explicitly temporary work can be retried."
      />

      {error ? (
        <p
          role="alert"
          className="rounded-xl bg-red-50 p-4 text-sm text-red-800"
        >
          {error}
        </p>
      ) : null}
      {notice ? (
        <p
          role="status"
          className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800"
        >
          {notice}
        </p>
      ) : null}

      {loading ? (
        <LoadingState label="Loading background failures" />
      ) : failures.queueJobs.length === 0 &&
        failures.outboxEvents.length === 0 ? (
        <EmptyState
          title="No failed background work"
          description="Retained queue jobs and durable outbox failures will appear here when intervention is required."
        />
      ) : (
        <div className="grid gap-6 xl:grid-cols-2">
          <FailureSection
            title="Queue failures"
            count={failures.queueJobs.length}
          >
            {failures.queueJobs.map((job) => {
              const key = `queue-${job.queueName}-${job.jobId}`;
              return (
                <article
                  key={key}
                  className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-bold text-slate-950">{job.jobName}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {job.queueName} · {job.jobId}
                      </p>
                    </div>
                    <StatusBadge tone="danger">
                      {job.failureKind ?? 'FAILED'}
                    </StatusBadge>
                  </div>
                  <p className="mt-4 text-sm text-slate-600">
                    Attempts {job.attemptsMade}/{job.maxAttempts} ·{' '}
                    {job.failureCode ?? 'Safe failure details unavailable'}
                  </p>
                  <div className="mt-4 flex items-center justify-between gap-3">
                    <p className="text-xs text-slate-500">
                      Correlation {job.correlationId ?? 'invalid payload'}
                    </p>
                    {job.manualRetryAllowed ? (
                      <Button
                        size="sm"
                        disabled={savingKey === key}
                        onClick={() => void retryQueue(job)}
                      >
                        Retry temporary job
                      </Button>
                    ) : (
                      <span className="text-xs font-semibold text-amber-700">
                        Reconciliation required
                      </span>
                    )}
                  </div>
                </article>
              );
            })}
          </FailureSection>

          <FailureSection
            title="Outbox failures"
            count={failures.outboxEvents.length}
          >
            {failures.outboxEvents.map((event) => {
              const key = `outbox-${event.outboxEventId}`;
              return (
                <article
                  key={key}
                  className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-bold text-slate-950">
                        {event.eventType}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {event.aggregateType} · {event.aggregateId}
                      </p>
                    </div>
                    <StatusBadge tone="danger">FAILED</StatusBadge>
                  </div>
                  <p className="mt-4 text-sm text-slate-600">
                    Publication attempts: {event.attemptCount}
                  </p>
                  <div className="mt-4 flex justify-end">
                    {event.manualRetryAllowed ? (
                      <Button
                        size="sm"
                        disabled={savingKey === key}
                        onClick={() => void retryOutbox(event)}
                      >
                        Retry publication
                      </Button>
                    ) : (
                      <span className="text-xs font-semibold text-amber-700">
                        Route repair required
                      </span>
                    )}
                  </div>
                </article>
              );
            })}
          </FailureSection>
        </div>
      )}
    </div>
  );
}

function FailureSection({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-slate-950">{title}</h2>
        <span className="rounded-full bg-slate-200 px-2.5 py-1 text-xs font-bold text-slate-700">
          {count}
        </span>
      </div>
      {count === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-500">
          No failures in this layer.
        </p>
      ) : (
        children
      )}
    </section>
  );
}

function message(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'Background operations could not be loaded.';
}
