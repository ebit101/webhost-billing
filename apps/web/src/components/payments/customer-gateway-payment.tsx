'use client';

import type {
  Invoice,
  PaymentGatewayDescriptor,
  PaymentSession,
} from '@webhost-billing/shared';
import { useEffect, useState } from 'react';
import { authMutation, authenticatedGet } from '../../lib/auth-api';
import { Button } from '../ui/button';
import { paymentError } from './payment-ui';

export function CustomerGatewayPayment({ invoice }: { invoice: Invoice }) {
  const [gateways, setGateways] = useState<PaymentGatewayDescriptor[]>([]);
  const [active, setActive] = useState('');
  const [error, setError] = useState('');
  const payable = invoice.status === 'UNPAID' || invoice.status === 'OVERDUE';

  useEffect(() => {
    let mounted = true;
    void authenticatedGet<PaymentGatewayDescriptor[]>('/payment-gateways')
      .then((items) => {
        if (mounted) {
          setGateways(items.filter((item) => item.key !== 'fake'));
        }
      })
      .catch((caught: unknown) => {
        if (mounted) setError(paymentError(caught));
      });
    return () => {
      mounted = false;
    };
  }, []);

  async function checkout(provider: string) {
    setActive(provider);
    setError('');
    try {
      const session = await authMutation<PaymentSession>(
        `/payment-gateways/${provider}/sessions`,
        'POST',
        { invoiceId: invoice.id, submissionKey: crypto.randomUUID() },
      );
      window.location.assign(session.checkoutUrl);
    } catch (caught) {
      setError(paymentError(caught));
      setActive('');
    }
  }

  if (!gateways.length && !error) return null;
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-brand-700">
        Online payment · sandbox
      </p>
      <h2 className="mt-1 text-xl font-bold text-slate-950">
        Pay this invoice securely
      </h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">
        You will continue on the selected provider&apos;s sandbox checkout. A
        return to this page does not by itself confirm payment.
      </p>
      {error ? (
        <p
          role="alert"
          className="mt-4 rounded-xl bg-red-50 p-4 text-sm font-semibold text-red-800"
        >
          {error}
        </p>
      ) : null}
      {payable && gateways.length ? (
        <div className="mt-5 flex flex-wrap gap-3">
          {gateways.map((gateway) => (
            <Button
              key={gateway.key}
              type="button"
              variant={gateway.key === 'bkash' ? 'primary' : 'secondary'}
              disabled={Boolean(active)}
              onClick={() => void checkout(gateway.key)}
            >
              {active === gateway.key
                ? 'Opening checkout…'
                : `Pay with ${gateway.displayName}`}
            </Button>
          ))}
        </div>
      ) : null}
    </section>
  );
}
