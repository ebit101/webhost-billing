'use client';

import type {
  PaymentGatewayFailure,
  PaymentWebhookResult,
} from '@webhost-billing/shared';
import { useCallback, useEffect, useState } from 'react';
import { authMutation, authenticatedGet } from '../../lib/auth-api';
import { Button } from '../ui/button';
import { EmptyState } from '../ui/feedback-state';
import { StatusBadge } from '../ui/status-badge';
import { paymentDate, paymentError } from './payment-ui';

export function GatewayFailurePanel() {
  const [failures, setFailures] = useState<PaymentGatewayFailure[]>([]);
  const [active, setActive] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setFailures(
      await authenticatedGet<PaymentGatewayFailure[]>(
        '/payment-gateways/failures',
      ),
    );
  }, []);

  useEffect(() => {
    let active = true;
    void authenticatedGet<PaymentGatewayFailure[]>('/payment-gateways/failures')
      .then((items) => {
        if (active) setFailures(items);
      })
      .catch((caught: unknown) => {
        if (active) setError(paymentError(caught));
      });
    return () => {
      active = false;
    };
  }, []);

  async function reconcile(item: PaymentGatewayFailure) {
    setActive(item.paymentId);
    setError('');
    try {
      await authMutation<PaymentWebhookResult>(
        `/payment-gateways/${item.provider}/payments/${item.paymentId}/reconcile`,
        'POST',
      );
      await load();
    } catch (caught) {
      setError(paymentError(caught));
    } finally {
      setActive('');
    }
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-5 py-4">
        <h2 className="font-bold text-slate-950">Gateway attention queue</h2>
        <p className="mt-1 text-sm text-slate-600">
          Safe provider failures and uncertain outcomes. Credentials and raw
          provider responses are never displayed.
        </p>
      </div>
      {error ? (
        <p
          role="alert"
          className="m-5 rounded-xl bg-red-50 p-4 text-sm font-semibold text-red-800"
        >
          {error}
        </p>
      ) : null}
      {failures.length ? (
        <div className="divide-y divide-slate-200">
          {failures.map((item) => (
            <div
              key={item.paymentId}
              className="grid gap-3 p-5 md:grid-cols-[1fr_auto] md:items-center"
            >
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-bold text-slate-950">
                    {item.invoiceNumber}
                  </p>
                  <StatusBadge
                    tone={item.status === 'FAILED' ? 'danger' : 'warning'}
                  >
                    {item.provider} · {item.status}
                  </StatusBadge>
                </div>
                <p className="mt-2 text-sm text-slate-700">
                  {item.failureReason}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Updated {paymentDate(item.updatedAt)}
                </p>
              </div>
              {item.status === 'PENDING' ? (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={Boolean(active)}
                  onClick={() => void reconcile(item)}
                >
                  {active === item.paymentId ? 'Checking…' : 'Reconcile'}
                </Button>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <div className="p-5">
          <EmptyState
            title="No gateway failures"
            description="bKash and SSLCOMMERZ issues that need attention will appear here."
          />
        </div>
      )}
    </section>
  );
}
