'use client';

import {
  businessLocalizationSettingsSchema,
  sentenceCaseLabel,
  serviceAddOnSchema,
  type Service,
  type ServiceAddOn,
} from '@webhost-billing/shared';
import { useEffect, useState } from 'react';
import { authenticatedGet } from '../../lib/auth-api';
import { formatMinor } from '../invoices/invoice-ui';
import { Button } from '../ui/button';
import { DataTable } from '../ui/data-table';
import { ErrorState, LoadingState } from '../ui/feedback-state';

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
    items: ServiceAddOn[];
    timeZone: string;
  }>();
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    void (async () => {
      const items = serviceAddOnSchema
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
                  item.renewalEndsAt
                    ? `Stop providing ${item.name} from ${date(item.renewalEndsAt)}. Confirm any manual work with the responsible team; completion is not tracked here.`
                    : 'No cancellation follow-up requested',
              },
            ]}
          />
          <p className="text-xs text-slate-500">
            Dates shown in {result.timeZone}. Renewal exclusion is recorded;
            provider delivery must be reviewed separately.
          </p>
        </>
      )}
    </section>
  );
}
