'use client';

import type {
  Invoice,
  ManualPayment,
  ManualPaymentCreationResult,
  ManualPaymentInstructions,
} from '@webhost-billing/shared';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  authenticatedGet,
  authMutation,
  authenticatedPaginatedGet,
} from '../../lib/auth-api';
import { formatMinor } from '../invoices/invoice-ui';
import { Button } from '../ui/button';
import { EmptyState } from '../ui/feedback-state';
import { StatusBadge } from '../ui/status-badge';
import { fieldClass } from '../customers/customer-fields';
import { paymentDate, paymentError, paymentTone } from './payment-ui';

export function CustomerManualPayment({ invoice }: { invoice: Invoice }) {
  const [payments, setPayments] = useState<ManualPayment[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [instructions, setInstructions] = useState('');
  const submissionKey = useRef('');
  const payable = invoice.status === 'UNPAID' || invoice.status === 'OVERDUE';

  useEffect(() => {
    let active = true;
    void Promise.all([
      authenticatedPaginatedGet<ManualPayment>(
        `/payments/my?invoiceId=${invoice.id}&pageSize=100`,
      ),
      authenticatedGet<ManualPaymentInstructions>(
        '/payments/manual/instructions',
      ),
    ])
      .then(([result, paymentInstructions]) => {
        if (active) {
          setPayments(result.data);
          setInstructions(paymentInstructions.instructions);
        }
      })
      .catch((caught: unknown) => {
        if (active) setError(paymentError(caught));
      });
    return () => {
      active = false;
    };
  }, [invoice.id]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    if (!submissionKey.current) submissionKey.current = crypto.randomUUID();
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const result = await authMutation<ManualPaymentCreationResult>(
        '/payments/manual/customer',
        'POST',
        {
          invoiceId: invoice.id,
          amount: String(values.get('amount')),
          submissionKey: submissionKey.current,
          proof: {
            method: String(values.get('method')),
            reference: String(values.get('reference')),
            ...(String(values.get('payerName')).trim()
              ? { payerName: String(values.get('payerName')) }
              : {}),
            ...(String(values.get('note')).trim()
              ? { note: String(values.get('note')) }
              : {}),
          },
        },
      );
      setPayments((current) => [
        result.payment,
        ...current.filter((payment) => payment.id !== result.payment.id),
      ]);
      submissionKey.current = '';
      form.reset();
      setNotice(
        result.duplicate
          ? 'This reference was already submitted.'
          : 'Payment reference submitted for administrator verification.',
      );
    } catch (caught) {
      setError(paymentError(caught));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="grid gap-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-brand-700">
          Manual payment
        </p>
        <h2 className="mt-1 text-xl font-bold text-slate-950">
          Submit a bank or mobile-payment reference
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Only text proof is accepted. Never submit passwords, PINs, full card
          numbers, or secret codes.
        </p>
      </div>
      {instructions ? (
        <div className="rounded-xl border border-cyan-200 bg-cyan-50 p-4">
          <h3 className="text-sm font-bold text-cyan-950">
            Payment instructions
          </h3>
          <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-cyan-900">
            {instructions}
          </p>
        </div>
      ) : null}
      {error ? <Message error>{error}</Message> : null}
      {notice ? <Message>{notice}</Message> : null}
      {payable ? (
        <form onSubmit={submit} className="grid gap-4 md:grid-cols-2">
          <label className="text-sm font-semibold text-slate-700">
            Amount in minor units
            <input
              className={fieldClass}
              name="amount"
              inputMode="numeric"
              pattern="[0-9]+"
              defaultValue={invoice.balanceDue.amount}
              required
            />
          </label>
          <label className="text-sm font-semibold text-slate-700">
            Method
            <select className={fieldClass} name="method" required>
              <option value="BANK_TRANSFER">Bank transfer</option>
              <option value="MOBILE_FINANCIAL_SERVICE">
                Mobile financial service
              </option>
              <option value="CASH">Cash</option>
              <option value="OTHER">Other</option>
            </select>
          </label>
          <label className="text-sm font-semibold text-slate-700">
            Transaction/reference ID
            <input className={fieldClass} name="reference" required />
          </label>
          <label className="text-sm font-semibold text-slate-700">
            Payer name (optional)
            <input className={fieldClass} name="payerName" />
          </label>
          <label className="text-sm font-semibold text-slate-700 md:col-span-2">
            Note (optional)
            <textarea className={fieldClass} name="note" rows={3} />
          </label>
          <div className="md:col-span-2">
            <Button disabled={saving} type="submit">
              {saving ? 'Submitting…' : 'Submit payment reference'}
            </Button>
          </div>
        </form>
      ) : (
        <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
          This invoice is not accepting new payments in its current state.
        </p>
      )}
      <div>
        <h3 className="text-sm font-bold text-slate-950">
          Submitted references
        </h3>
        {payments.length ? (
          <ul className="mt-3 grid gap-3">
            {payments.map((payment) => (
              <li
                key={payment.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-4"
              >
                <div>
                  <p className="font-bold text-slate-950">
                    {payment.reference}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {formatMinor(
                      payment.amount.amount,
                      payment.amount.currency,
                    )}{' '}
                    · submitted {paymentDate(payment.createdAt)}
                  </p>
                </div>
                <StatusBadge tone={paymentTone(payment.state)}>
                  {payment.state}
                </StatusBadge>
              </li>
            ))}
          </ul>
        ) : (
          <div className="mt-3">
            <EmptyState
              title="No manual references"
              description="Submitted references and their review state will appear here."
            />
          </div>
        )}
      </div>
    </section>
  );
}

function Message({
  children,
  error = false,
}: {
  children: string;
  error?: boolean;
}) {
  return (
    <p
      role={error ? 'alert' : 'status'}
      className={`rounded-xl p-4 text-sm font-semibold ${
        error ? 'bg-red-50 text-red-800' : 'bg-emerald-50 text-emerald-800'
      }`}
    >
      {children}
    </p>
  );
}
