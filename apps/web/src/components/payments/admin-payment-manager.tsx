'use client';

import type {
  CustomerDetail,
  Invoice,
  ManualPayment,
  ManualPaymentCreationResult,
  PaymentSettings,
} from '@webhost-billing/shared';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import {
  authMutation,
  authenticatedGet,
  authenticatedPaginatedGet,
} from '../../lib/auth-api';
import {
  emptyAdminCustomerFilter,
  type AdminCustomerFilter,
  withAdminCustomerFilter,
} from '../../lib/admin-customer-filter';
import {
  AdminCustomerFilterNotice,
  filteredEmptyTitle,
} from '../customers/admin-customer-filter-notice';
import { fieldClass } from '../customers/customer-fields';
import { formatMinor } from '../invoices/invoice-ui';
import { Button } from '../ui/button';
import { DataTable, type DataColumn } from '../ui/data-table';
import { EmptyState, LoadingState } from '../ui/feedback-state';
import { PageHeader } from '../ui/page-header';
import { StatusBadge } from '../ui/status-badge';
import { paymentDate, paymentError, paymentTone } from './payment-ui';
import { GatewayFailurePanel } from './gateway-failure-panel';
import { AdminPaymentReview } from './admin-payment-review';

export function AdminPaymentManager({
  customerFilter = emptyAdminCustomerFilter,
}: {
  customerFilter?: AdminCustomerFilter;
} = {}) {
  return (
    <PaymentWorkspace
      key={`${customerFilter.customerId ?? ''}:${customerFilter.invalid}`}
      customerFilter={customerFilter}
    />
  );
}

function PaymentWorkspace({
  customerFilter,
}: {
  customerFilter: AdminCustomerFilter;
}) {
  const [payments, setPayments] = useState<ManualPayment[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [filteredCustomer, setFilteredCustomer] = useState<CustomerDetail>();
  const [settings, setSettings] = useState<PaymentSettings>({
    partialPaymentsEnabled: false,
  });
  const [adjustment, setAdjustment] = useState<{
    payment: ManualPayment;
    kind: 'REFUND' | 'REVERSAL';
  }>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const recordKey = useRef('');
  const adjustmentKey = useRef('');
  const [selectedReview, setSelectedReview] = useState<{
    id: string;
    sequence: number;
  }>();
  const reviewSequence = useRef(0);
  const reviewTrigger = useRef<HTMLButtonElement | null>(null);
  const ledgerHeading = useRef<HTMLHeadingElement>(null);
  const paymentsPath = withAdminCustomerFilter(
    '/payments?pageSize=100',
    customerFilter,
  );
  const invoicesPath = withAdminCustomerFilter(
    '/invoices?pageSize=100',
    customerFilter,
  );
  const filteredCustomerId = customerFilter.customerId;

  useEffect(() => {
    let active = true;
    void Promise.all([
      authenticatedPaginatedGet<ManualPayment>(paymentsPath),
      authenticatedPaginatedGet<Invoice>(invoicesPath),
      authenticatedGet<PaymentSettings>('/payments/settings'),
      filteredCustomerId
        ? authenticatedGet<CustomerDetail>(`/customers/${filteredCustomerId}`)
        : Promise.resolve(undefined),
    ])
      .then(([paymentResult, invoiceResult, policy, customerContext]) => {
        if (!active) return;
        setPayments(paymentResult.data);
        setInvoices(invoiceResult.data);
        setSettings(policy);
        setFilteredCustomer(customerContext);
      })
      .catch((caught: unknown) => {
        if (active) setError(paymentError(caught));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [filteredCustomerId, invoicesPath, paymentsPath]);

  const payableInvoices = invoices.filter(
    (invoice) => invoice.status === 'UNPAID' || invoice.status === 'OVERDUE',
  );

  const columns: DataColumn<ManualPayment>[] = [
    {
      key: 'reference',
      header: 'Reference',
      render: (payment) => (
        <div>
          <p className="font-bold text-slate-950">{payment.reference}</p>
          <p className="mt-1 text-xs text-slate-500">
            {payment.method.replaceAll('_', ' ')} ·{' '}
            {paymentDate(payment.receivedAt)}
          </p>
        </div>
      ),
    },
    {
      key: 'invoice',
      header: 'Invoice / customer',
      render: (payment) => (
        <div>
          <p className="font-semibold text-brand-700">
            {payment.invoiceNumber}
          </p>
          <p className="text-xs text-slate-500">{payment.customerName}</p>
        </div>
      ),
    },
    {
      key: 'state',
      header: 'State',
      render: (payment) => (
        <StatusBadge tone={paymentTone(payment.state)}>
          {payment.state}
        </StatusBadge>
      ),
    },
    {
      key: 'amount',
      header: 'Amount',
      align: 'right',
      render: (payment) => (
        <span className="font-bold text-slate-950">
          {formatMinor(payment.amount.amount, payment.amount.currency)}
        </span>
      ),
    },
    {
      key: 'review',
      header: 'Review',
      render: (payment) => (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={saving}
          aria-controls="admin-payment-review"
          aria-expanded={selectedReview?.id === payment.id}
          aria-label={`Review payment ${payment.reference}`}
          onClick={(event) => {
            reviewTrigger.current = event.currentTarget;
            setSelectedReview({
              id: payment.id,
              sequence: ++reviewSequence.current,
            });
          }}
        >
          Review payment
        </Button>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (payment) => (
        <div className="flex justify-end gap-2">
          {payment.state === 'PENDING' ? (
            <>
              <Button
                size="sm"
                disabled={saving}
                onClick={() => void review(payment.id, 'VERIFY')}
              >
                Verify
              </Button>
              <Button
                size="sm"
                variant="danger"
                disabled={saving}
                onClick={() => void review(payment.id, 'REJECT')}
              >
                Reject
              </Button>
            </>
          ) : null}
          {payment.state === 'VERIFIED' &&
          BigInt(payment.refundableAmount.amount) > 0n ? (
            <>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  adjustmentKey.current = '';
                  setAdjustment({ payment, kind: 'REFUND' });
                }}
              >
                Refund
              </Button>
              <Button
                size="sm"
                variant="danger"
                onClick={() => {
                  adjustmentKey.current = '';
                  setAdjustment({ payment, kind: 'REVERSAL' });
                }}
              >
                Reverse
              </Button>
            </>
          ) : null}
        </div>
      ),
    },
  ];

  async function record(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    if (!recordKey.current) recordKey.current = crypto.randomUUID();
    setSaving(true);
    clearMessages();
    try {
      const result = await authMutation<ManualPaymentCreationResult>(
        '/payments/manual/admin',
        'POST',
        {
          invoiceId: String(values.get('invoiceId')),
          amount: String(values.get('amount')),
          submissionKey: recordKey.current,
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
      setSelectedReview(undefined);
      replacePayment(result.payment);
      await refreshInvoice(result.payment.invoiceId);
      recordKey.current = '';
      form.reset();
      setNotice('Verified manual payment recorded and invoice recalculated.');
    } catch (caught) {
      setError(paymentError(caught));
    } finally {
      setSaving(false);
    }
  }

  async function review(paymentId: string, action: 'VERIFY' | 'REJECT') {
    setSaving(true);
    clearMessages();
    try {
      const payment = await authMutation<ManualPayment>(
        `/payments/${paymentId}/review`,
        'PATCH',
        action === 'VERIFY'
          ? { action }
          : { action, reason: 'Reference rejected by administrator.' },
      );
      setSelectedReview(undefined);
      replacePayment(payment);
      await refreshInvoice(payment.invoiceId);
      setNotice(
        action === 'VERIFY'
          ? 'Payment verified and invoice recalculated.'
          : 'Payment reference rejected without changing the invoice.',
      );
    } catch (caught) {
      setError(paymentError(caught));
    } finally {
      setSaving(false);
    }
  }

  async function createAdjustment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!adjustment) return;
    const form = event.currentTarget;
    const values = new FormData(form);
    if (!adjustmentKey.current) adjustmentKey.current = crypto.randomUUID();
    setSaving(true);
    clearMessages();
    try {
      const result = await authMutation<ManualPaymentCreationResult>(
        `/payments/${adjustment.payment.id}/adjustments`,
        'POST',
        {
          kind: adjustment.kind,
          amount: String(values.get('amount')),
          submissionKey: adjustmentKey.current,
          reference: String(values.get('reference')),
          ...(String(values.get('note')).trim()
            ? { note: String(values.get('note')) }
            : {}),
        },
      );
      setSelectedReview(undefined);
      const updatedOriginal = await authenticatedGet<ManualPayment>(
        `/payments/${adjustment.payment.id}`,
      );
      setPayments((current) => [
        result.payment,
        updatedOriginal,
        ...current.filter(
          (item) =>
            item.id !== result.payment.id && item.id !== updatedOriginal.id,
        ),
      ]);
      await refreshInvoice(result.payment.invoiceId);
      adjustmentKey.current = '';
      setAdjustment(undefined);
      setNotice(`${adjustment.kind.toLowerCase()} transaction recorded.`);
    } catch (caught) {
      setError(paymentError(caught));
    } finally {
      setSaving(false);
    }
  }

  function replacePayment(payment: ManualPayment) {
    setPayments((current) => [
      payment,
      ...current.filter((item) => item.id !== payment.id),
    ]);
  }

  async function refreshInvoice(invoiceId: string) {
    const invoice = await authenticatedGet<Invoice>(`/invoices/${invoiceId}`);
    setInvoices((current) => [
      invoice,
      ...current.filter((item) => item.id !== invoice.id),
    ]);
  }

  function clearMessages() {
    setError('');
    setNotice('');
  }

  if (loading) return <LoadingState label="Loading payments" />;
  return (
    <div className="grid gap-7">
      <PageHeader
        eyebrow="Administrator"
        title="Payments"
        description="Review gateway exceptions and manual references, record verified receipts, and append refunds or reversals without rewriting financial history."
      />
      <AdminCustomerFilterNotice
        customer={filteredCustomer}
        invalid={customerFilter.invalid}
        clearHref="/admin/payments"
        resourceLabel="payments"
      />
      {error ? <Message error>{error}</Message> : null}
      {notice ? <Message>{notice}</Message> : null}

      <GatewayFailurePanel />

      <div className="grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <h2 className="text-lg font-bold text-slate-950">
            Record verified payment
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Values are integer minor units. The server derives currency and
            applies the invoice balance transactionally.
          </p>
          <form onSubmit={record} className="mt-5 grid gap-4 md:grid-cols-2">
            <label className="text-sm font-semibold text-slate-700 md:col-span-2">
              Payable invoice
              <select className={fieldClass} name="invoiceId" required>
                <option value="">Select invoice</option>
                {payableInvoices.map((invoice) => (
                  <option key={invoice.id} value={invoice.id}>
                    {invoice.invoiceNumber} — {invoice.customerName} — balance{' '}
                    {invoice.balanceDue.amount} {invoice.currency}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm font-semibold text-slate-700">
              Amount
              <input
                className={fieldClass}
                name="amount"
                inputMode="numeric"
                pattern="[0-9]+"
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
              Reference
              <input className={fieldClass} name="reference" required />
            </label>
            <label className="text-sm font-semibold text-slate-700">
              Payer name
              <input className={fieldClass} name="payerName" />
            </label>
            <label className="text-sm font-semibold text-slate-700 md:col-span-2">
              Note
              <textarea className={fieldClass} name="note" rows={2} />
            </label>
            <div className="md:col-span-2">
              <Button disabled={saving} type="submit">
                Record verified payment
              </Button>
            </div>
          </form>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-slate-950 p-5 text-white shadow-sm sm:p-6">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-brand-300">
            Settlement policy
          </p>
          <h2 className="mt-2 text-lg font-bold">Partial payments</h2>
          <p className="mt-2 text-sm leading-6 text-slate-300">
            {settings.partialPaymentsEnabled
              ? 'Manual payments may be less than the invoice’s current balance.'
              : 'Manual payments must equal the invoice’s full current balance.'}{' '}
            The effective policy is checked on submission, recording, and
            pending-reference verification.
          </p>
          <div className="mt-6 flex items-center justify-between gap-4 rounded-xl bg-white/10 p-4">
            <div>
              <p className="font-bold">
                {settings.partialPaymentsEnabled ? 'Enabled' : 'Disabled'}
              </p>
              <p className="mt-1 text-xs text-slate-400">
                Applies again when a pending reference is verified.
              </p>
            </div>
            <Link
              href="/admin/settings#billing-policy"
              className="rounded-lg px-3 py-2 text-sm font-bold text-brand-300 underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-300"
            >
              Review billing policy in settings
            </Link>
          </div>
        </section>
      </div>

      {adjustment ? (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 sm:p-6">
          <h2 className="text-lg font-bold text-slate-950">
            Record {adjustment.kind.toLowerCase()}
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Original {adjustment.payment.reference} remains unchanged.
            Refundable amount: {adjustment.payment.refundableAmount.amount}{' '}
            {adjustment.payment.refundableAmount.currency}.
          </p>
          <form
            onSubmit={createAdjustment}
            className="mt-4 grid gap-4 md:grid-cols-3"
          >
            <input
              className={fieldClass}
              aria-label="Adjustment amount"
              name="amount"
              defaultValue={adjustment.payment.refundableAmount.amount}
              required
            />
            <input
              className={fieldClass}
              aria-label="Adjustment reference"
              name="reference"
              placeholder="Reference"
              required
            />
            <input
              className={fieldClass}
              aria-label="Adjustment note"
              name="note"
              placeholder="Optional note"
            />
            <div className="flex gap-2 md:col-span-3">
              <Button disabled={saving} type="submit">
                Confirm {adjustment.kind.toLowerCase()}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setAdjustment(undefined)}
              >
                Cancel
              </Button>
            </div>
          </form>
        </section>
      ) : null}

      {selectedReview ? (
        <AdminPaymentReview
          key={selectedReview.sequence}
          paymentId={selectedReview.id}
          customerId={filteredCustomerId}
          onClose={() => {
            setSelectedReview(undefined);
            const trigger = reviewTrigger.current;
            if (trigger?.isConnected && !trigger.disabled) trigger.focus();
            else ledgerHeading.current?.focus();
          }}
        />
      ) : null}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2
            ref={ledgerHeading}
            tabIndex={-1}
            className="font-bold text-slate-950"
          >
            Payment ledger
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Pending, verified, rejected, refunded, and reversed transactions.
          </p>
        </div>
        {payments.length ? (
          <DataTable
            caption="Manual payment ledger"
            columns={columns}
            rows={payments}
            rowKey={(payment) => payment.id}
          />
        ) : (
          <div className="p-5">
            <EmptyState
              title={
                filteredEmptyTitle('payments', filteredCustomer) ??
                'No manual payments'
              }
              description={
                filteredCustomer
                  ? 'This customer has no payments in the current bounded result.'
                  : 'Customer references and administrator entries will appear here.'
              }
            />
          </div>
        )}
      </section>
    </div>
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
