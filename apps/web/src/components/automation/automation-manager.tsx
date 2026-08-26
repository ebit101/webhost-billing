'use client';

import type {
  AutomationRunSummary,
  BackgroundFailureList,
  FailedBackgroundJob,
  FailedOutboxEvent,
  OperationalOverview,
  RenewalAutomationPolicy,
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

const defaultPolicy: RenewalAutomationPolicy = {
  enabled: true,
  invoiceLeadDays: 14,
  reminderDaysBeforeDue: [7, 3, 1],
  gracePeriodDays: 3,
  timeZone: 'Asia/Dhaka',
};

export function AutomationManager() {
  const [failures, setFailures] =
    useState<BackgroundFailureList>(emptyFailures);
  const [policy, setPolicy] = useState(defaultPolicy);
  const [runs, setRuns] = useState<AutomationRunSummary[]>([]);
  const [overview, setOverview] = useState<OperationalOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let active = true;
    void Promise.all([
      authenticatedGet<BackgroundFailureList>('/background-jobs/failures'),
      authenticatedGet<RenewalAutomationPolicy>('/renewal-automation/policy'),
      authenticatedGet<AutomationRunSummary[]>('/renewal-automation/runs'),
      authenticatedGet<OperationalOverview>('/observability/overview'),
    ])
      .then(([failureResult, policyResult, runResult, overviewResult]) => {
        if (active) {
          setFailures(failureResult);
          setPolicy(policyResult);
          setRuns(runResult);
          setOverview(overviewResult);
        }
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

  async function savePolicy() {
    setSavingKey('renewal-policy');
    clearMessages();
    try {
      const saved = await authMutation<RenewalAutomationPolicy>(
        '/renewal-automation/policy',
        'PUT',
        policy,
      );
      setPolicy(saved);
      setNotice('Renewal automation settings were saved.');
    } catch (caught) {
      setError(message(caught));
    } finally {
      setSavingKey('');
    }
  }

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

      {overview ? (
        <section className="space-y-4" aria-labelledby="operational-health">
          <div>
            <h2
              id="operational-health"
              className="text-lg font-bold text-slate-950"
            >
              Operational health
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Queue backlog and failures recorded during the last 24 hours.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
            <MetricCard label="Waiting" value={overview.queueTotals.waiting} />
            <MetricCard label="Active" value={overview.queueTotals.active} />
            <MetricCard label="Delayed" value={overview.queueTotals.delayed} />
            <MetricCard
              label="Failed jobs"
              value={overview.queueTotals.failed}
            />
            <MetricCard
              label="Failed outbox"
              value={overview.failedOutboxEvents}
            />
            <MetricCard
              label="Failed automation"
              value={overview.automation.failedLast24Hours}
            />
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Queue</th>
                    <th className="px-4 py-3">Backlog</th>
                    <th className="px-4 py-3">Failed</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {overview.queues.map((queue) => (
                    <tr key={queue.queueName}>
                      <td className="px-4 py-3 font-semibold text-slate-900">
                        {queue.queueName}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {queue.waiting + queue.active + queue.delayed}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {queue.failed}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <h3 className="font-bold text-slate-950">Provider failures</h3>
              {overview.providerFailures.length === 0 ? (
                <p className="mt-3 text-sm text-slate-500">
                  No payment, hosting, or email provider failures in 24 hours.
                </p>
              ) : (
                <ul className="mt-3 divide-y divide-slate-100 text-sm">
                  {overview.providerFailures.map((metric) => (
                    <li
                      key={`${metric.providerType}-${metric.provider}`}
                      className="flex items-center justify-between gap-4 py-3"
                    >
                      <span className="font-semibold text-slate-900">
                        {metric.providerType.replaceAll('_', ' ')} ·{' '}
                        {metric.provider}
                      </span>
                      <span className="text-slate-600">
                        {metric.failedLast24Hours} failed ·{' '}
                        {metric.inconsistentLast24Hours} inconsistent
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </section>
      ) : null}

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-950">Renewal policy</h2>
            <p className="mt-1 text-sm text-slate-600">
              Daily invoice, reminder, overdue, suspension, and verified-payment
              reactivation rules.
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <input
              type="checkbox"
              checked={policy.enabled}
              onChange={(event) =>
                setPolicy((current) => ({
                  ...current,
                  enabled: event.target.checked,
                }))
              }
            />
            Automation enabled
          </label>
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <PolicyField label="Invoice lead days">
            <input
              aria-label="Invoice lead days"
              className={inputStyles}
              type="number"
              min={1}
              max={90}
              value={policy.invoiceLeadDays}
              onChange={(event) =>
                setPolicy((current) => ({
                  ...current,
                  invoiceLeadDays: Number(event.target.value),
                }))
              }
            />
          </PolicyField>
          <PolicyField label="Reminder days">
            <input
              aria-label="Reminder days"
              className={inputStyles}
              value={policy.reminderDaysBeforeDue.join(', ')}
              onChange={(event) =>
                setPolicy((current) => ({
                  ...current,
                  reminderDaysBeforeDue: event.target.value
                    .split(',')
                    .map((value) => value.trim())
                    .filter((value) => value.length > 0)
                    .map(Number)
                    .filter(Number.isFinite),
                }))
              }
            />
          </PolicyField>
          <PolicyField label="Grace period days">
            <input
              aria-label="Grace period days"
              className={inputStyles}
              type="number"
              min={0}
              max={60}
              value={policy.gracePeriodDays}
              onChange={(event) =>
                setPolicy((current) => ({
                  ...current,
                  gracePeriodDays: Number(event.target.value),
                }))
              }
            />
          </PolicyField>
          <PolicyField label="Business time zone">
            <input
              aria-label="Business time zone"
              className={inputStyles}
              value={policy.timeZone}
              onChange={(event) =>
                setPolicy((current) => ({
                  ...current,
                  timeZone: event.target.value,
                }))
              }
            />
          </PolicyField>
        </div>
        <div className="mt-5 flex justify-end">
          <Button
            disabled={loading || savingKey === 'renewal-policy'}
            onClick={() => void savePolicy()}
          >
            Save renewal policy
          </Button>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-950">
            Recent renewal runs
          </h2>
          <span className="text-xs font-semibold text-slate-500">
            Latest 50
          </span>
        </div>
        {runs.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-500">
            No renewal automation cycle has run yet.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Run</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Results</th>
                  <th className="px-4 py-3">Started</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {runs.map((run) => (
                  <tr key={run.id}>
                    <td className="px-4 py-3 font-semibold text-slate-900">
                      {run.jobName}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge
                        tone={
                          run.status === 'SUCCEEDED'
                            ? 'success'
                            : run.status === 'FAILED'
                              ? 'danger'
                              : 'warning'
                        }
                      >
                        {run.status}
                      </StatusBadge>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {run.succeededCount} succeeded · {run.failedCount} failed
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {new Date(run.startedAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

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

const inputStyles =
  'mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3 text-sm text-slate-950 outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-100';

function PolicyField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="text-sm font-semibold text-slate-700">
      {label}
      {children}
    </label>
  );
}

function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-2 text-2xl font-black text-slate-950">{value}</p>
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
