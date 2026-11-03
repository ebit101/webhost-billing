'use client';

import type {
  HostingCancellation,
  HostingCancellationInput,
  Service,
} from '@webhost-billing/shared';
import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import { authenticatedGet, authMutation } from '../../lib/auth-api';
import { fieldClass } from '../customers/customer-fields';
import { Button } from '../ui/button';
import { RecordDialog } from '../ui/record-dialog';
import { serviceError } from './service-ui';

export function CustomerHostingCancellation({ service }: { service: Service }) {
  const path = `/services/${service.id}/cancellation-request`;
  const [request, setRequest] = useState<HostingCancellation | null>();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [now, setNow] = useState(() => Date.now());
  const hasFuturePeriod = Date.parse(service.nextDueAt) > now;
  const [timing, setTiming] = useState<HostingCancellationInput['timing']>(
    hasFuturePeriod ? 'END_OF_PERIOD' : 'IMMEDIATE',
  );
  useEffect(() => {
    let active = true;
    void authenticatedGet<HostingCancellation | null>(path)
      .then((result) => {
        if (active) {
          setNow(Date.now());
          setRequest(result);
        }
      })
      .catch((caught: unknown) => {
        if (active) setError(serviceError(caught));
      });
    return () => {
      active = false;
    };
  }, [path]);

  async function mutate(target: string, input?: HostingCancellationInput) {
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const result = await authMutation<HostingCancellation>(
        target,
        'POST',
        input,
      );
      setNow(Date.now());
      setRequest(result);
      setOpen(false);
      setNotice(
        result.status === 'WITHDRAWN'
          ? 'Cancellation request withdrawn.'
          : 'Cancellation request submitted.',
      );
    } catch (caught) {
      setError(serviceError(caught));
    } finally {
      setSaving(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const reason = String(
      new FormData(event.currentTarget).get('reason') ?? '',
    ).trim();
    void mutate(
      path,
      timing === 'END_OF_PERIOD'
        ? { timing, reason, expectedEffectiveAt: service.nextDueAt }
        : { timing, reason },
    );
  }

  const eligible =
    service.status === 'ACTIVE' || service.status === 'SUSPENDED';
  const canWithdraw =
    request?.status === 'OPEN' &&
    !request.approvedAt &&
    (!request.effectiveAt || Date.parse(request.effectiveAt) > now);
  if (!eligible && !request && !error) return null;
  return (
    <section className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-6">
      <h2 className="text-lg font-bold">Hosting cancellation</h2>
      {!open && error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="text-sm text-emerald-700">
          {notice}
        </p>
      )}
      {request?.status === 'OPEN' && (
        <p>
          {request.effectiveAt
            ? canWithdraw
              ? `Cancellation scheduled for ${cancellationDate(request.effectiveAt)}.`
              : `Cancellation due since ${cancellationDate(request.effectiveAt)}. Suspension is being processed.`
            : request.approvedAt
              ? 'Cancellation approved. Suspension is being processed.'
              : 'Immediate cancellation pending administrator review.'}
        </p>
      )}
      {request?.status === 'COMPLETED' && (
        <p>Hosting cancellation completed.</p>
      )}
      {request?.status === 'WITHDRAWN' && (
        <p>Last cancellation request withdrawn.</p>
      )}
      <div>
        {eligible && (request === null || request?.status === 'WITHDRAWN') && (
          <Button
            variant="secondary"
            onClick={() => {
              const openedAt = Date.now();
              setNow(openedAt);
              setTiming(
                Date.parse(service.nextDueAt) > openedAt
                  ? 'END_OF_PERIOD'
                  : 'IMMEDIATE',
              );
              setError('');
              setOpen(true);
            }}
          >
            Request cancellation
          </Button>
        )}
        {canWithdraw && (
          <Button
            variant="secondary"
            disabled={saving}
            onClick={() => void mutate(`${path}/${request.id}/withdraw`)}
          >
            Withdraw request
          </Button>
        )}
      </div>
      <RecordDialog
        open={open}
        title="Request cancellation"
        busy={saving}
        onClose={() => {
          setOpen(false);
          setError('');
        }}
      >
        <form className="grid gap-4" onSubmit={submit}>
          <p>
            {service.productName}
            {service.domain ? ` · ${service.domain}` : ''}
          </p>
          <p>
            Hosting access ends when suspension is processed. Future hosting
            renewals stop while the request is open. Existing invoices stay on
            your account, and domain renewals are handled separately. Paying an
            existing renewal invoice can extend the scheduled end date.
          </p>
          <Link href="/portal/invoices" className="text-brand-700 underline">
            Review existing invoices
          </Link>
          <label>
            Cancellation timing
            <select
              className={fieldClass}
              value={timing}
              onChange={(event) =>
                setTiming(
                  event.target.value === 'IMMEDIATE'
                    ? 'IMMEDIATE'
                    : 'END_OF_PERIOD',
                )
              }
            >
              <option value="END_OF_PERIOD" disabled={!hasFuturePeriod}>
                End of billing period
              </option>
              <option value="IMMEDIATE">Immediate</option>
            </select>
          </label>
          <p>
            {timing === 'END_OF_PERIOD'
              ? `Scheduled end date ${cancellationDate(service.nextDueAt)}.`
              : 'An administrator reviews immediate requests before suspension.'}
          </p>
          <label>
            Reason (optional)
            <textarea
              name="reason"
              className={fieldClass}
              maxLength={1000}
              rows={3}
            />
          </label>
          {error && (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          )}
          <Button type="submit" variant="danger" disabled={saving}>
            Submit cancellation request
          </Button>
        </form>
      </RecordDialog>
    </section>
  );
}

function cancellationDate(value: string) {
  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}
