'use client';

import type { EmailLogSummary } from '@webhost-billing/shared';
import { useEffect, useState } from 'react';
import { authenticatedGet } from '../../lib/auth-api';
import { EmptyState, ErrorState, LoadingState } from '../ui/feedback-state';
import { PageHeader } from '../ui/page-header';
import { StatusBadge } from '../ui/status-badge';

export function EmailDeliveryManager() {
  const [logs, setLogs] = useState<EmailLogSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    void authenticatedGet<EmailLogSummary[]>('/email-notifications')
      .then((result) => {
        if (active) setLogs(result);
      })
      .catch((caught: unknown) => {
        if (active) {
          setError(
            caught instanceof Error
              ? caught.message
              : 'Email delivery logs could not be loaded.',
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Notifications"
        title="Email delivery"
        description="Review the latest queued email outcomes and safe attempt-level failure classifications. Message bodies, tokens, credentials, and raw provider errors are never shown."
      />
      {loading ? (
        <LoadingState label="Loading email delivery logs" />
      ) : error ? (
        <ErrorState title="Email logs unavailable" description={error} />
      ) : logs.length === 0 ? (
        <EmptyState
          title="No email attempts yet"
          description="Queued notification attempts will appear after the email worker processes a supported event."
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3">Message</th>
                  <th className="px-5 py-3">Recipient</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Attempts</th>
                  <th className="px-5 py-3">Last activity</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {logs.map((log) => {
                  const attempt = log.attempts[0];
                  return (
                    <tr key={log.id} className="align-top">
                      <td className="px-5 py-4">
                        <p className="font-semibold text-slate-950">
                          {log.subject}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {log.templateKey} · {log.provider ?? 'not started'}
                        </p>
                      </td>
                      <td className="px-5 py-4 text-slate-700">
                        {log.recipientEmail}
                      </td>
                      <td className="px-5 py-4">
                        <StatusBadge tone={tone(log.status)}>
                          {log.status}
                        </StatusBadge>
                        {attempt?.failureCode ? (
                          <p className="mt-2 max-w-xs text-xs text-amber-700">
                            {attempt.failureKind} · {attempt.failureCode}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-5 py-4 text-slate-700">
                        {log.attemptCount}
                      </td>
                      <td className="whitespace-nowrap px-5 py-4 text-slate-600">
                        {formatDate(log.sentAt ?? log.failedAt ?? log.queuedAt)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function tone(status: EmailLogSummary['status']) {
  if (status === 'SENT') return 'success' as const;
  if (status === 'FAILED') return 'danger' as const;
  if (status === 'SENDING') return 'warning' as const;
  return 'neutral' as const;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en-BD', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}
