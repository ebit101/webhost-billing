'use client';
import { sentenceCaseLabel } from '@webhost-billing/shared';

import {
  apiSuccessResponseSchema,
  businessTimeZoneSchema,
  orderSchema,
  type Order,
} from '@webhost-billing/shared';
import Link from 'next/link';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { authenticatedGet } from '../../lib/auth-api';
import { Button, buttonStyles } from '../ui/button';
import { EmptyState, ErrorState, LoadingState } from '../ui/feedback-state';
import { formatMinor } from './order-ui';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
const responseSchema = apiSuccessResponseSchema(orderSchema);
type ReviewResult =
  | { kind: 'ready'; order: Order; timeZone: string }
  | { kind: 'unavailable' }
  | { kind: 'error' };

export function AdminOrderReview(props: {
  orderId: string;
  customerId?: string;
  onClose: () => void;
}) {
  return (
    <ReviewRequest
      key={`${props.orderId}:${props.customerId ?? ''}`}
      {...props}
    />
  );
}

function ReviewRequest({
  orderId,
  customerId,
  onClose,
}: {
  orderId: string;
  customerId?: string;
  onClose: () => void;
}) {
  const valid =
    orderSchema.shape.id.safeParse(orderId).success &&
    (customerId === undefined ||
      orderSchema.shape.customerId.safeParse(customerId).success);
  const [result, setResult] = useState<ReviewResult | undefined>(
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
    void loadReview(orderId, customerId, controller.signal)
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
  }, [orderId, customerId, valid, attempt]);

  const retry = () => {
    setResult(undefined);
    setAttempt((value) => value + 1);
  };
  return (
    <section
      id="admin-order-review"
      aria-labelledby="order-review-heading"
      className="grid gap-5 rounded-2xl border border-slate-200 bg-white p-5 sm:p-7"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2
          id="order-review-heading"
          ref={heading}
          tabIndex={-1}
          className="text-xl font-bold text-slate-950 focus-visible:outline-brand-600"
        >
          Order review
        </h2>
        <Button type="button" variant="secondary" onClick={onClose}>
          Close order review
        </Button>
      </div>
      <p className="text-sm text-slate-600">
        Read-only context as of this request. Order and invoice states are
        separate. Payment is not proof of hosting provisioning. Current service
        state is not supplied here.
      </p>
      {!result ? (
        <LoadingState label="Loading order review" />
      ) : result.kind === 'unavailable' ? (
        <EmptyState
          title="Order review unavailable"
          description="This order is missing, unavailable, or outside the selected customer context. Close this review and select an available order."
          action={
            valid ? (
              <Button type="button" variant="secondary" onClick={retry}>
                Retry order review
              </Button>
            ) : undefined
          }
        />
      ) : result.kind === 'error' ? (
        <ErrorState
          title="Order review could not be loaded"
          description="No order context was applied. Please retry or close this review."
          action={
            <Button type="button" onClick={retry}>
              Retry order review
            </Button>
          }
        />
      ) : (
        <ReviewDetails order={result.order} timeZone={result.timeZone} />
      )}
    </section>
  );
}

async function loadReview(
  orderId: string,
  customerId: string | undefined,
  signal: AbortSignal,
): Promise<ReviewResult> {
  const response = await fetch(`${API_URL}/orders/${orderId}`, {
    credentials: 'include',
    cache: 'no-store',
    signal,
  });
  if (response.status === 403 || response.status === 404)
    return { kind: 'unavailable' };
  if (!response.ok) throw new Error('Order review request failed');
  signal.throwIfAborted();
  const body: unknown = await response.json();
  const { data: order } = responseSchema.parse(body);
  if (
    order.id !== orderId ||
    (customerId !== undefined && order.customerId !== customerId)
  ) {
    return { kind: 'unavailable' };
  }
  signal.throwIfAborted();
  const settings = await authenticatedGet<unknown>('/settings');
  const timeZone = businessTimeZoneSchema.parse(
    typeof settings === 'object' && settings !== null && 'timeZone' in settings
      ? settings.timeZone
      : undefined,
  );
  return { kind: 'ready', order, timeZone };
}

function ReviewDetails({
  order,
  timeZone,
}: {
  order: Order;
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
  return (
    <div className="grid min-w-0 gap-6">
      <h3 className="break-words text-lg font-bold">{order.orderNumber}</h3>
      <div className="grid gap-5 md:grid-cols-2">
        <div className="grid min-w-0 gap-3">
          <h3 className="font-bold">Customer context</h3>
          <p className="break-words">
            {order.customerName} · {order.customerEmail}
          </p>
          <Link
            prefetch={false}
            href={`/admin/customers/${order.customerId}`}
            className={buttonStyles('secondary')}
          >
            View customer
          </Link>
          <dl className="grid gap-3 text-sm">
            <Fact label="Order status">{sentenceCaseLabel(order.status)}</Fact>
            <Fact label="Placed">{date(order.placedAt)}</Fact>
            <Fact label="Completed">{date(order.completedAt)}</Fact>
            <Fact label="Cancelled">{date(order.cancelledAt)}</Fact>
            <Fact label="Order subtotal">
              {formatMinor(order.subtotal.amount, order.subtotal.currency)}
            </Fact>
            <Fact label="Order setup total">
              {formatMinor(order.setupTotal.amount, order.setupTotal.currency)}
            </Fact>
            <Fact label="Order total">
              {formatMinor(order.total.amount, order.total.currency)}
            </Fact>
          </dl>
        </div>
        <div className="grid min-w-0 content-start gap-3">
          <h3 className="font-bold">Linked invoice</h3>
          <p className="break-words font-semibold">
            {order.invoice.invoiceNumber}
          </p>
          <Link
            prefetch={false}
            href={`/admin/invoices/${order.invoice.id}`}
            className={buttonStyles('secondary')}
          >
            View invoice
          </Link>
          <dl className="grid gap-3 text-sm">
            <Fact label="Invoice status">
              {sentenceCaseLabel(order.invoice.status)}
            </Fact>
            <Fact label="Invoice due">{date(order.invoice.dueAt)}</Fact>
            <Fact label="Invoice total">
              {formatMinor(
                order.invoice.total.amount,
                order.invoice.total.currency,
              )}
            </Fact>
            <Fact label="Invoice balance">
              {formatMinor(
                order.invoice.balanceDue.amount,
                order.invoice.balanceDue.currency,
              )}
            </Fact>
          </dl>
        </div>
      </div>
      <p className="text-xs text-slate-500">
        Dates shown in {timeZone}. API rules govern every explicit action.
      </p>
      <div className="grid gap-4">
        <h3 className="font-bold">Historical order items</h3>
        {order.items.map((item, index) => (
          <article
            key={item.id}
            aria-label={`Order item ${index + 1}`}
            className="min-w-0 rounded-xl border border-slate-200 p-4"
          >
            <h4 className="break-words font-semibold">{item.productName}</h4>
            {item.description ? (
              <p className="whitespace-pre-wrap break-words text-sm">
                {item.description}
              </p>
            ) : null}
            <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
              <Fact label="Requested domain">{item.requestedDomain}</Fact>
              <Fact label="Billing period">
                {sentenceCaseLabel(item.billingPeriod)}
              </Fact>
              <Fact label="Quantity">{item.quantity}</Fact>
              <Fact label="Unit price snapshot">
                {formatMinor(item.unitAmount.amount, item.unitAmount.currency)}
              </Fact>
              <Fact label="Setup fee snapshot">
                {formatMinor(item.setupFee.amount, item.setupFee.currency)}
              </Fact>
              <Fact label="Line total snapshot">
                {formatMinor(item.lineTotal.amount, item.lineTotal.currency)}
              </Fact>
            </dl>
          </article>
        ))}
      </div>
      {order.notes ? (
        <div>
          <h3 className="font-bold">Internal order notes</h3>
          <p className="mt-2 whitespace-pre-wrap break-words text-sm">
            {order.notes}
          </p>
        </div>
      ) : null}
    </div>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-slate-500">{label}</dt>
      <dd className="break-words font-semibold text-slate-950">{children}</dd>
    </div>
  );
}
