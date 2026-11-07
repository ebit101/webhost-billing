'use client';
import { useState, type FormEvent } from 'react';
import {
  sentenceCaseLabel,
  type SslCheckoutDetail,
} from '@webhost-billing/shared';
import { authMutation, authenticatedGet } from '../../lib/auth-api';
import { moneyToMinor } from '../../lib/money-input';
import { formatMinor } from '../invoices/invoice-ui';
import { Button } from '../ui/button';
import { fieldClass } from '../customers/customer-fields';
import { paymentError } from './payment-ui';

export function SslCheckoutReview() {
  const [rows, setRows] = useState<SslCheckoutDetail[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function load() {
    setBusy(true);
    setError('');
    try {
      setRows(
        await authenticatedGet<SslCheckoutDetail[]>(
          '/payment-gateways/sslcommerz/checkouts',
        ),
      );
      setOpen(true);
    } catch (caught) {
      setError(paymentError(caught));
    } finally {
      setBusy(false);
    }
  }
  async function reconcile(paymentId: string) {
    setBusy(true);
    setError('');
    try {
      await authMutation(
        `/payment-gateways/sslcommerz/payments/${paymentId}/reconcile`,
        'POST',
      );
      await load();
    } catch (caught) {
      setError(paymentError(caught));
    } finally {
      setBusy(false);
    }
  }
  async function refund(
    event: FormEvent<HTMLFormElement>,
    row: SslCheckoutDetail,
  ) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    setError('');
    try {
      if (data.get('confirm') !== 'on')
        throw new Error('Confirm the sandbox refund before continuing.');
      let key = form.dataset.submissionKey;
      if (!key) {
        key = crypto.randomUUID();
        form.dataset.submissionKey = key;
      }
      await authMutation(
        `/payment-gateways/sslcommerz/payments/${row.paymentId}/refunds`,
        'POST',
        {
          submissionKey: key,
          amount: moneyToMinor(
            String(data.get('amount')),
            'BDT',
            'Refund amount',
          ),
          reason: String(data.get('reason')),
          confirmation: 'APPROVE_SANDBOX_REFUND',
        },
      );
      form.reset();
      delete form.dataset.submissionKey;
      await load();
    } catch (caught) {
      setError(paymentError(caught));
    } finally {
      setBusy(false);
    }
  }
  async function checkRefund(
    event: FormEvent<HTMLFormElement>,
    id: string,
    known: boolean,
  ) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    try {
      const body = known
        ? {}
        : {
            providerReference: String(data.get('reference')),
            reason: String(data.get('reason')),
            confirmation: 'LINK_REFUND_REFERENCE',
          };
      await authMutation(
        `/payment-gateways/sslcommerz/refunds/${id}/reconcile`,
        'POST',
        body,
      );
      await load();
    } catch (caught) {
      setError(paymentError(caught));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
      <h2 className="font-bold">SSLCOMMERZ checkout review</h2>
      <p className="text-sm text-slate-600">
        Review pending payments and confirmed captures. Refunds require recent
        two-step verification. This integration supports sandbox payments only.
      </p>
      <Button
        type="button"
        variant="secondary"
        disabled={busy}
        onClick={() => void load()}
      >
        {busy
          ? 'Loading…'
          : open
            ? 'Refresh online checkouts'
            : 'Review online checkouts'}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      {open && !rows.length && <p>No online checkouts found.</p>}
      {rows.map((row) => (
        <article
          key={row.paymentId}
          className="space-y-3 rounded-xl border border-slate-200 p-4"
        >
          <h3 className="font-bold">
            {row.invoiceNumber} ·{' '}
            {formatMinor(row.amount.amount, row.amount.currency)}
          </h3>
          <p className="break-all text-sm">
            {sentenceCaseLabel(row.state)} · {row.merchantReference}
            {row.bankReference ? ` · Bank reference ${row.bankReference}` : ''}
          </p>
          {row.reviewReason && (
            <p className="text-sm text-amber-800">{row.reviewReason}</p>
          )}
          {row.state === 'CAPTURED' && (
            <p className="text-sm">
              {row.appliedToInvoice
                ? 'Credited to the invoice.'
                : 'Captured but not credited to the invoice. Review a refund; hosting was not activated by this capture.'}
            </p>
          )}
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={busy}
            onClick={() => void reconcile(row.paymentId)}
          >
            Reconcile payment
          </Button>
          {row.state === 'CAPTURED' && (
            <form
              onSubmit={(event) => void refund(event, row)}
              className="grid gap-3 sm:grid-cols-2"
            >
              <label className="text-sm font-semibold">
                Refund amount (BDT)
                <input
                  name="amount"
                  inputMode="decimal"
                  required
                  className={fieldClass}
                />
              </label>
              <label className="text-sm font-semibold">
                Refund reason
                <input
                  name="reason"
                  required
                  minLength={12}
                  maxLength={500}
                  className={fieldClass}
                />
              </label>
              <label className="text-sm sm:col-span-2">
                <input name="confirm" type="checkbox" required /> I approve this
                sandbox refund. A confirmed refund will be recorded separately
                from the original payment.
              </label>
              <Button type="submit" disabled={busy}>
                Approve sandbox refund
              </Button>
            </form>
          )}
          {row.refunds.map((value) => (
            <div
              key={value.id}
              className="space-y-2 border-t border-slate-200 pt-3"
            >
              <p className="text-sm">
                Refund ·{' '}
                {formatMinor(value.amount.amount, value.amount.currency)} ·{' '}
                {sentenceCaseLabel(value.state)}
              </p>
              {!['SUCCEEDED', 'FAILED'].includes(value.state) && (
                <form
                  className="space-y-2"
                  onSubmit={(event) =>
                    void checkRefund(event, value.id, !!value.providerReference)
                  }
                >
                  {!value.providerReference && (
                    <>
                      <p className="text-sm text-amber-800">
                        The submission outcome is unknown. Do not submit another
                        refund. A provider reference must be verified against
                        this capture and amount.
                      </p>
                      <label className="block text-sm">
                        Provider refund reference
                        <input
                          name="reference"
                          required
                          className={fieldClass}
                        />
                      </label>
                      <label className="block text-sm">
                        Reference review reason
                        <input
                          name="reason"
                          required
                          minLength={12}
                          className={fieldClass}
                        />
                      </label>
                    </>
                  )}
                  <Button
                    type="submit"
                    size="sm"
                    variant="secondary"
                    disabled={busy}
                  >
                    Reconcile refund
                  </Button>
                </form>
              )}
            </div>
          ))}
        </article>
      ))}
    </section>
  );
}
