'use client';

import { serviceAddOnSchema, type ServiceAddOn } from '@webhost-billing/shared';
import { useEffect, useState } from 'react';
import { authenticatedGet, authMutation } from '../../lib/auth-api';
import { formatMinor } from '../invoices/invoice-ui';
import { Button } from '../ui/button';
import { RecordDialog } from '../ui/record-dialog';
import { serviceDate, serviceError } from './service-ui';

export function CustomerServiceAddOns({ serviceId }: { serviceId: string }) {
  const path = `/services/${serviceId}/add-ons`;
  const [items, setItems] = useState<ServiceAddOn[]>([]);
  const [selected, setSelected] = useState<ServiceAddOn>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    void authenticatedGet<unknown>(path)
      .then((response) => serviceAddOnSchema.array().parse(response))
      .then((result) => {
        if (active) setItems(result);
      })
      .catch((caught: unknown) => {
        if (active) setError(serviceError(caught));
      });
    return () => {
      active = false;
    };
  }, [path]);

  async function cancelRenewal() {
    if (!selected?.availableEndAt) return;
    setBusy(true);
    setError('');
    try {
      const result = serviceAddOnSchema.parse(
        await authMutation<unknown>(`${path}/${selected.id}/cancel`, 'POST', {
          expectedEndAt: selected.availableEndAt,
        }),
      );
      setItems((current) =>
        current.map((item) => (item.id === result.id ? result : item)),
      );
      setSelected(undefined);
    } catch (caught) {
      setError(serviceError(caught));
    } finally {
      setBusy(false);
    }
  }

  if (!items.length && !error) return null;
  return (
    <section className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-6">
      <h2 className="text-lg font-bold">Recurring add-ons</h2>
      {!selected && error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      <ul className="divide-y divide-slate-200">
        {items.map((item) => (
          <li
            key={item.id}
            className="flex flex-wrap items-center justify-between gap-3 py-3"
          >
            <div>
              <p className="font-semibold">{item.name}</p>
              <p className="text-sm text-slate-600">
                {formatMinor(
                  item.recurringAmount.amount,
                  item.recurringAmount.currency,
                )}{' '}
                per billing period
              </p>
              {item.renewalEndsAt && (
                <p className="mt-1 text-sm text-slate-700">
                  Renewal cancelled from {serviceDate(item.renewalEndsAt)}.
                </p>
              )}
            </div>
            {item.availableEndAt && (
              <Button
                variant="secondary"
                aria-label={`Cancel renewal for ${item.name}`}
                onClick={() => {
                  setError('');
                  setSelected(item);
                }}
              >
                Cancel renewal
              </Button>
            )}
          </li>
        ))}
      </ul>
      <RecordDialog
        open={Boolean(selected)}
        title="Cancel add-on renewal"
        onClose={() => {
          setError('');
          setSelected(undefined);
        }}
        busy={busy}
      >
        {selected && (
          <div className="grid gap-4">
            <p>
              {selected.name} will stop renewing from{' '}
              {serviceDate(selected.availableEndAt)}. Hosting continues on its
              regular billing cycle. Any invoice already issued still applies.
            </p>
            {error && (
              <p role="alert" className="text-sm text-red-700">
                {error}
              </p>
            )}
            <Button
              variant="danger"
              disabled={busy}
              onClick={() => void cancelRenewal()}
            >
              Confirm cancellation
            </Button>
          </div>
        )}
      </RecordDialog>
    </section>
  );
}
