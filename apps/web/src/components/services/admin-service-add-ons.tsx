'use client';

import {
  businessLocalizationSettingsSchema,
  sentenceCaseLabel,
  adminServiceAddOnSchema,
  type Service,
  type AdminServiceAddOn,
} from '@webhost-billing/shared';
import { useEffect, useState } from 'react';
import {
  authenticatedGet,
  authMutation,
  ApiMutationError,
} from '../../lib/auth-api';
import { formatMinor } from '../invoices/invoice-ui';
import { Button } from '../ui/button';
import { DataTable } from '../ui/data-table';
import { ErrorState, LoadingState } from '../ui/feedback-state';
import { RecordDialog } from '../ui/record-dialog';

export function AdminServiceAddOns(props: {
  service: Service;
  timeZone?: string;
}) {
  return (
    <AddOns
      key={`${props.service.id}:${props.service.customerId}`}
      {...props}
    />
  );
}

function AddOns({
  service,
  timeZone,
}: {
  service: Service;
  timeZone?: string;
}) {
  const [result, setResult] = useState<{
    items: AdminServiceAddOn[];
    timeZone: string;
  }>();
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [selected, setSelected] = useState<AdminServiceAddOn>();
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [mutationError, setMutationError] = useState('');
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    let active = true;
    void (async () => {
      const items = adminServiceAddOnSchema
        .array()
        .parse(
          await authenticatedGet(
            `/services/${service.id}/add-ons?customerId=${encodeURIComponent(service.customerId)}`,
          ),
        );
      const zone =
        timeZone ??
        businessLocalizationSettingsSchema
          .pick({ timeZone: true })
          .strip()
          .parse(await authenticatedGet('/settings')).timeZone;
      if (active) setResult({ items, timeZone: zone });
    })().catch(() => {
      if (active) setError(true);
    });
    return () => {
      active = false;
    };
  }, [service.id, service.customerId, timeZone, attempt]);

  async function complete() {
    if (!selected?.renewalEndsAt || !acknowledged || busy) return;
    setBusy(true);
    setMutationError('');
    try {
      const item = adminServiceAddOnSchema.parse(
        await authMutation<unknown>(
          `/services/${service.id}/add-ons/${selected.id}/complete-cancellation?customerId=${encodeURIComponent(service.customerId)}`,
          'POST',
          { expectedEndAt: selected.renewalEndsAt, acknowledged: true },
        ),
      );
      if (
        item.id !== selected.id ||
        item.renewalEndsAt !== selected.renewalEndsAt ||
        !item.manualCompletion
      )
        throw new Error('Invalid completion response');
      setResult((current) =>
        current
          ? {
              ...current,
              items: current.items.map((row) =>
                row.id === item.id ? item : row,
              ),
            }
          : current,
      );
      setSelected(undefined);
    } catch (caught) {
      setMutationError(
        caught instanceof ApiMutationError
          ? caught.message
          : 'Completion could not be recorded. Reload and retry.',
      );
    } finally {
      setBusy(false);
    }
  }

  const date = (value: string) =>
    new Intl.DateTimeFormat('en-GB', {
      timeZone: result?.timeZone,
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date(value));
  return (
    <section
      aria-label="Purchased recurring add-ons"
      className="grid min-w-0 gap-3 rounded-xl border border-slate-200 p-4"
    >
      <h3 className="text-lg font-bold">Purchased recurring add-ons</h3>
      {error ? (
        <ErrorState
          title="Add-ons could not be loaded"
          description="Retry to review cancellation dates and manual follow-up."
          action={
            <Button
              variant="secondary"
              onClick={() => {
                setError(false);
                setResult(undefined);
                setAttempt((value) => value + 1);
              }}
            >
              Retry add-ons
            </Button>
          }
        />
      ) : !result ? (
        <LoadingState label="Loading purchased add-ons" />
      ) : !result.items.length ? (
        <p className="text-sm text-slate-600">
          No fulfilled recurring add-ons recorded for this service.
        </p>
      ) : (
        <>
          <p className="text-sm text-slate-600">
            Prices are recorded at purchase, per{' '}
            {sentenceCaseLabel(service.billingPeriod).toLowerCase()} hosting
            billing period. Cancelling an add-on renewal leaves hosting on its
            existing cycle. Issued invoices remain unchanged.
          </p>
          <DataTable
            caption="Purchased recurring add-ons"
            rows={result.items}
            rowKey={(item) => item.id}
            columns={[
              { key: 'name', header: 'Add-on', render: (item) => item.name },
              {
                key: 'price',
                header: 'Purchased price',
                render: (item) =>
                  formatMinor(
                    item.recurringAmount.amount,
                    item.recurringAmount.currency,
                  ),
              },
              {
                key: 'status',
                header: 'Renewal status',
                render: (item) =>
                  item.renewalEndsAt
                    ? 'Renewal cancelled'
                    : 'No cancellation requested',
              },
              {
                key: 'end',
                header: 'Effective end date',
                render: (item) =>
                  item.renewalEndsAt
                    ? date(item.renewalEndsAt)
                    : 'Not scheduled',
              },
              {
                key: 'follow-up',
                header: 'Manual follow-up',
                render: (item) =>
                  item.manualCompletion ? (
                    <p>
                      Completion confirmed by{' '}
                      {item.manualCompletion.completedByName} on{' '}
                      {date(item.manualCompletion.completedAt)}.
                    </p>
                  ) : item.renewalEndsAt ? (
                    <div className="grid gap-2">
                      <p>
                        Stop providing {item.name} from{' '}
                        {date(item.renewalEndsAt)}. Confirm any manual work with
                        the responsible team.
                      </p>
                      <Button
                        variant="secondary"
                        disabled={busy || Date.parse(item.renewalEndsAt) > now}
                        aria-label={`Mark ${item.name} completed`}
                        onClick={() => {
                          setSelected(item);
                          setAcknowledged(false);
                          setMutationError('');
                        }}
                      >
                        Mark completed
                      </Button>
                      {Date.parse(item.renewalEndsAt) > now && (
                        <p className="text-xs text-slate-500">
                          Completion is available once the end date arrives.
                        </p>
                      )}
                    </div>
                  ) : (
                    'No cancellation follow-up requested'
                  ),
              },
            ]}
          />
          <p className="text-xs text-slate-500">
            Dates shown in {result.timeZone}. Completion is an administrator
            acknowledgement; provider delivery is not checked automatically.
          </p>
        </>
      )}
      <RecordDialog
        open={Boolean(selected)}
        title="Confirm add-on cancellation completion"
        busy={busy}
        onClose={() => {
          setSelected(undefined);
          setMutationError('');
        }}
      >
        {selected?.renewalEndsAt && (
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              void complete();
            }}
          >
            <p>
              Confirm the manual cancellation work for {selected.name} is
              complete. Scheduled end: {date(selected.renewalEndsAt)}. Your name
              and acknowledgement time will be recorded in the audit log.
            </p>
            <p>Hosting and issued invoices remain unchanged.</p>
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={acknowledged}
                disabled={busy}
                onChange={(event) => setAcknowledged(event.target.checked)}
              />
              I confirm the manual cancellation work is complete.
            </label>
            {mutationError && (
              <p role="alert" className="text-sm text-red-700">
                {mutationError}
              </p>
            )}
            <Button type="submit" disabled={busy || !acknowledged}>
              {busy ? 'Recording completion…' : 'Record completion'}
            </Button>
          </form>
        )}
      </RecordDialog>
    </section>
  );
}
