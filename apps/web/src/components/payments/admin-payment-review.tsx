'use client';

import {
  apiSuccessResponseSchema,
  businessLocalizationSettingsSchema,
  manualPaymentSchema,
  type ManualPayment,
} from '@webhost-billing/shared';
import Link from 'next/link';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Button, buttonStyles } from '../ui/button';
import { EmptyState, ErrorState, LoadingState } from '../ui/feedback-state';
import { formatMinor } from '../invoices/invoice-ui';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
const paymentResponse = apiSuccessResponseSchema(manualPaymentSchema);
const timeZoneResponse = apiSuccessResponseSchema(
  businessLocalizationSettingsSchema.pick({ timeZone: true }).strip(),
);
type Result =
  | { kind: 'ready'; payment: ManualPayment; timeZone: string }
  | { kind: 'unavailable' }
  | { kind: 'malformed' }
  | { kind: 'error' };

export function AdminPaymentReview(props: {
  paymentId: string;
  customerId?: string;
  onClose: () => void;
}) {
  return (
    <ReviewRequest
      key={`${props.paymentId}:${props.customerId ?? ''}`}
      {...props}
    />
  );
}

function ReviewRequest({
  paymentId,
  customerId,
  onClose,
}: {
  paymentId: string;
  customerId?: string;
  onClose: () => void;
}) {
  const valid =
    manualPaymentSchema.shape.id.safeParse(paymentId).success &&
    (customerId === undefined ||
      manualPaymentSchema.shape.customerId.safeParse(customerId).success);
  const [result, setResult] = useState<Result | undefined>(
    valid ? undefined : { kind: 'unavailable' },
  );
  const [attempt, setAttempt] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    heading.current?.focus();
  }, []);
  useEffect(() => {
    if (!valid) return;
    let active = true;
    const controller = new AbortController();
    void loadReview(paymentId, customerId, controller.signal)
      .then((value) => {
        if (active) setResult(value);
      })
      .catch(() => {
        if (active) setResult({ kind: 'error' });
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [paymentId, customerId, valid, attempt]);

  const retry = () => {
    setResult(undefined);
    setAttempt((value) => value + 1);
  };
  return (
    <section
      id="admin-payment-review"
      aria-labelledby="payment-review-heading"
      className="grid min-w-0 gap-5 rounded-2xl border border-slate-200 bg-white p-5 sm:p-7"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2
          id="payment-review-heading"
          ref={heading}
          tabIndex={-1}
          className="text-xl font-bold text-slate-950 focus-visible:outline-brand-600"
        >
          Payment review
        </h2>
        <Button type="button" variant="secondary" onClick={onClose}>
          Close payment review
        </Button>
      </div>
      <p className="text-sm text-slate-600">
        Read-only context as of this request, not a required approval gate.
        Payment, invoice, order and service states are separate. Payment is not
        proof of hosting provisioning. Submitted proof is unverified text, not
        independent bank or provider evidence.
      </p>
      {!result ? (
        <LoadingState label="Loading payment review" />
      ) : result.kind === 'unavailable' ? (
        <EmptyState
          title="Payment review unavailable"
          description="This payment is missing, unavailable, mismatched, or outside the selected customer context. Select an available payment."
          action={
            valid ? (
              <Button type="button" onClick={retry}>
                Retry payment review
              </Button>
            ) : undefined
          }
        />
      ) : result.kind === 'error' || result.kind === 'malformed' ? (
        <ErrorState
          title={
            result.kind === 'malformed'
              ? 'Payment review response is invalid'
              : 'Payment review could not be loaded'
          }
          description="No payment context was applied. Retry or close this review."
          action={
            <Button type="button" onClick={retry}>
              Retry payment review
            </Button>
          }
        />
      ) : (
        <ReviewDetails payment={result.payment} timeZone={result.timeZone} />
      )}
    </section>
  );
}

async function loadReview(
  paymentId: string,
  customerId: string | undefined,
  signal: AbortSignal,
): Promise<Result> {
  const options: RequestInit = {
    credentials: 'include',
    cache: 'no-store',
    signal,
  };
  const response = await fetch(`${API_URL}/payments/${paymentId}`, options);
  if (response.status === 403 || response.status === 404)
    return { kind: 'unavailable' };
  if (!response.ok) return { kind: 'error' };
  signal.throwIfAborted();
  const body: unknown = await response.json().catch(() => undefined);
  const parsed = paymentResponse.safeParse(body);
  if (!parsed.success) return { kind: 'malformed' };
  const payment = parsed.data.data;
  if (
    payment.id !== paymentId ||
    (customerId !== undefined && payment.customerId !== customerId)
  )
    return { kind: 'unavailable' };
  signal.throwIfAborted();
  const settings = await fetch(`${API_URL}/settings`, options);
  if (!settings.ok) return { kind: 'error' };
  const settingsBody: unknown = await settings.json().catch(() => undefined);
  const parsedSettings = timeZoneResponse.safeParse(settingsBody);
  if (!parsedSettings.success) return { kind: 'malformed' };
  signal.throwIfAborted();
  return {
    kind: 'ready',
    payment,
    timeZone: parsedSettings.data.data.timeZone,
  };
}

function ReviewDetails({
  payment,
  timeZone,
}: {
  payment: ManualPayment;
  timeZone: string;
}) {
  const date = (value: string | null) =>
    value
      ? new Intl.DateTimeFormat('en-GB', {
          timeZone,
          dateStyle: 'medium',
          timeStyle: 'short',
        }).format(new Date(value))
      : 'Not recorded';
  const money = (value: ManualPayment['amount']) =>
    formatMinor(value.amount, value.currency);
  return (
    <div className="grid min-w-0 gap-6">
      <h3 className="break-words text-lg font-bold">{payment.reference}</h3>
      <div className="grid min-w-0 gap-5 md:grid-cols-2">
        <div className="grid min-w-0 content-start gap-3">
          <h3 className="font-bold">Historical invoice context</h3>
          <p className="break-words">
            {payment.customerName} · {payment.invoiceNumber}
          </p>
          <p className="text-sm text-slate-600">
            Names come from the invoice snapshot, not the current customer
            profile. Invoice balance and status are not supplied here.
          </p>
          <Link
            prefetch={false}
            href={`/admin/customers/${payment.customerId}`}
            className={buttonStyles('secondary')}
          >
            View customer
          </Link>
          <Link
            prefetch={false}
            href={`/admin/invoices/${payment.invoiceId}`}
            className={buttonStyles('secondary')}
          >
            View invoice
          </Link>
          <dl className="grid gap-3 text-sm">
            <Fact label="Transaction kind">{payment.kind}</Fact>
            <Fact label="Payment state">{payment.state}</Fact>
            <Fact label="Manual method">
              {payment.method.replaceAll('_', ' ')}
            </Fact>
            <Fact label="Submitted by role">
              {payment.submittedByRole ?? 'Not recorded'}
            </Fact>
            <Fact label="Original transaction amount">
              {money(payment.amount)}
            </Fact>
            <Fact label="Adjusted amount">{money(payment.adjustedAmount)}</Fact>
            <Fact label="Remaining refundable capacity">
              {money(payment.refundableAmount)}
            </Fact>
          </dl>
          <p className="text-sm text-slate-600">
            Refundable capacity is not invoice balance. Zero capacity on pending
            or rejected payments does not prove settlement.
          </p>
          {payment.kind !== 'CHARGE' ? (
            <p className="break-words text-sm">
              This is a separate {payment.kind.toLowerCase()} transaction; the
              original payment remains unchanged. Original payment ID:{' '}
              {payment.originalPaymentId ?? 'Not recorded'}. Original-payment
              navigation and adjustment history are not supplied here.
            </p>
          ) : null}
        </div>
        <div className="grid min-w-0 content-start gap-3">
          <h3 className="font-bold">Submitted proof and recorded dates</h3>
          <dl className="grid gap-3 text-sm">
            <Fact label="Payer name">
              {payment.proof.payerName ?? 'Not recorded'}
            </Fact>
            <Fact label="Submitted note">
              {payment.proof.note ?? 'Not recorded'}
            </Fact>
            <Fact label="Rejection or failure reason">
              {payment.failureReason ?? 'Not recorded'}
            </Fact>
            <Fact label="Received">{date(payment.receivedAt)}</Fact>
            <Fact label="Reviewed">{date(payment.reviewedAt)}</Fact>
            <Fact label="Verified">{date(payment.verifiedAt)}</Fact>
            <Fact label="Created">{date(payment.createdAt)}</Fact>
            <Fact label="Updated">{date(payment.updatedAt)}</Fact>
          </dl>
          <p className="text-xs text-slate-500">
            Dates shown in {timeZone}. Existing API rules govern every explicit
            action.
          </p>
        </div>
      </div>
    </div>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-slate-500">{label}</dt>
      <dd className="whitespace-pre-wrap break-words font-semibold text-slate-950">
        {children}
      </dd>
    </div>
  );
}
