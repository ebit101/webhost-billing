'use client';
import { InvoiceDateText } from '../invoices/invoice-date-text';
import { formatUtcTimestamp, sentenceCaseLabel } from '@webhost-billing/shared';

import {
  apiSuccessResponseSchema,
  businessTimeZoneSchema,
  orderSchema,
  type Order,
} from '@webhost-billing/shared';
import Link from 'next/link';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { authMutation, authenticatedGet } from '../../lib/auth-api';
import { Button, buttonStyles } from '../ui/button';
import { DataTable, type DataColumn } from '../ui/data-table';
import { EmptyState, ErrorState, LoadingState } from '../ui/feedback-state';
import { addOnStatus, errorMessage, formatMinor } from './order-ui';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
const responseSchema = apiSuccessResponseSchema(orderSchema);
type ReviewResult =
  | { kind: 'ready'; order: Order; timeZone: string }
  | { kind: 'unavailable' }
  | { kind: 'error' };

type ReviewProps = {
  orderId: string;
  customerId?: string;
  onAddOnFulfilled?: () => void;
} & (
  | { onClose: () => void; backHref?: never }
  | { backHref: string; onClose?: never }
);

export function AdminOrderReview(props: ReviewProps) {
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
  backHref,
  onAddOnFulfilled,
}: ReviewProps) {
  const pageMode = backHref !== undefined;
  const canFulfillAddOn = pageMode || onAddOnFulfilled !== undefined;
  const valid =
    orderSchema.shape.id.safeParse(orderId).success &&
    (customerId === undefined ||
      orderSchema.shape.customerId.safeParse(customerId).success);
  const [result, setResult] = useState<ReviewResult | undefined>(
    valid ? undefined : { kind: 'unavailable' },
  );
  const [attempt, setAttempt] = useState(0);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState('');
  const [notice, setNotice] = useState('');
  const heading = useRef<HTMLHeadingElement>(null);
  const Heading = pageMode ? 'h1' : 'h2';

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
  async function updateOrder(itemId?: string) {
    if (saving || result?.kind !== 'ready') return;
    if (itemId ? !canFulfillAddOn : !pageMode || !canApprove(result.order))
      return;
    setSaving(true);
    setActionError('');
    setNotice('');
    try {
      const path = itemId
        ? `/orders/${orderId}/add-ons/${itemId}/fulfill`
        : `/orders/${orderId}/status`;
      const order = orderSchema.parse(
        await authMutation<unknown>(
          path,
          'PATCH',
          itemId ? {} : { status: 'PROCESSING' },
        ),
      );
      if (
        order.id !== result.order.id ||
        order.customerId !== result.order.customerId
      ) {
        throw new Error(
          'The order response could not be verified. Reload the order to check its status.',
        );
      }
      setResult({ ...result, order });
      if (itemId) onAddOnFulfilled?.();
      else setNotice(`${order.orderNumber} moved to processing.`);
    } catch (error) {
      setActionError(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }
  return (
    <section
      id="admin-order-review"
      aria-labelledby="order-review-heading"
      className="grid gap-5 rounded-2xl border border-slate-200 bg-white p-5 sm:p-7"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Heading
          id="order-review-heading"
          ref={heading}
          tabIndex={-1}
          className="text-xl font-bold text-slate-950 focus-visible:outline-brand-600"
        >
          {pageMode ? 'Order details' : 'Order review'}
        </Heading>
        {pageMode ? (
          <Link href={backHref} className={buttonStyles('secondary')}>
            Back to orders
          </Link>
        ) : (
          <Button type="button" variant="secondary" onClick={onClose}>
            Close order review
          </Button>
        )}
      </div>
      <p className="text-sm text-slate-600">
        {pageMode
          ? 'Review payment and order items before processing the order.'
          : onAddOnFulfilled &&
              result?.kind === 'ready' &&
              result.order.items.some((item) => item.kind === 'ADD_ON')
            ? 'Complete purchased add-ons here after payment is verified. Hosting provisioning is tracked separately.'
            : 'Read-only context as of this request. Order and invoice states are separate. Payment is not proof of hosting provisioning. Current service state is not supplied here.'}
      </p>
      {actionError && (
        <p role="alert" className="text-sm text-red-800">
          {actionError}
        </p>
      )}
      {notice && (
        <p role="status" className="text-sm text-emerald-800">
          {notice}
        </p>
      )}
      {!result ? (
        <LoadingState label="Loading order review" />
      ) : result.kind === 'unavailable' ? (
        <EmptyState
          title="Order review unavailable"
          description="This order is missing, unavailable, or outside the selected customer context. Return to the order list and select an available order."
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
        <>
          <ReviewDetails
            order={result.order}
            timeZone={result.timeZone}
            onFulfill={canFulfillAddOn ? updateOrder : undefined}
            fulfilling={saving}
            pageMode={pageMode}
          />
          {pageMode && (
            <OrderActions
              order={result.order}
              saving={saving}
              onApprove={() => void updateOrder()}
            />
          )}
        </>
      )}
    </section>
  );
}

async function loadReview(
  orderId: string,
  customerId: string | undefined,
  signal: AbortSignal,
): Promise<ReviewResult> {
  const response = await fetch(
    `${API_URL}/orders/${orderId}${customerId ? '?customerId=' + encodeURIComponent(customerId) : ''}`,
    {
      credentials: 'include',
      cache: 'no-store',
      signal,
    },
  );
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
  onFulfill,
  fulfilling,
  pageMode,
}: {
  order: Order;
  timeZone: string;
  onFulfill?: (itemId: string) => void;
  fulfilling: boolean;
  pageMode: boolean;
}) {
  const OrderHeading = pageMode ? 'h2' : 'h3';
  const date = (value: string | null) =>
    value
      ? new Intl.DateTimeFormat('en-GB', {
          timeZone,
          dateStyle: 'short',
          timeStyle: 'short',
        }).format(new Date(value))
      : 'Not recorded';
  return (
    <div className="grid min-w-0 gap-6">
      <OrderHeading className="break-words text-lg font-bold">
        {order.orderNumber}
      </OrderHeading>
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
            {order.termsAcceptance ? (
              <Fact label="Terms accepted">
                <a
                  href={order.termsAcceptance.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  Version {order.termsAcceptance.revision}
                </a>
                <span className="block">
                  {formatUtcTimestamp(order.termsAcceptance.acceptedAt)}
                </span>
              </Fact>
            ) : null}
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
            <Fact label="Invoice due">
              {
                <InvoiceDateText
                  value={order.invoice.dueAt}
                  audience="admin"
                  calendar
                />
              }
            </Fact>
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
      {pageMode ? (
        <OrderItems
          order={order}
          onFulfill={onFulfill}
          fulfilling={fulfilling}
        />
      ) : (
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
              {item.configuration ? (
                <p className="mt-2 text-sm text-amber-800">
                  Manual configuration: {item.configuration.fulfillmentNote}
                </p>
              ) : null}
              <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                <Fact label="Requested domain">{item.requestedDomain}</Fact>
                {item.domainAction && (
                  <Fact label="Domain action">
                    {item.domainAction === 'EXISTING'
                      ? 'Existing domain service; registration off'
                      : 'Registration request; separate paid approval required'}
                  </Fact>
                )}
                {item.domainId && (
                  <Link
                    className="text-brand-700 underline"
                    href={`/admin/customers/${order.customerId}/domains/${item.domainId}`}
                  >
                    View client domain
                  </Link>
                )}
                {(!item.kind || item.kind === 'HOSTING') && (
                  <Fact label="Hosting setup">
                    {item.hostingProvisioningMode === 'PRESERVE_EXISTING'
                      ? 'Keep existing website and email'
                      : 'Standard hosting'}
                  </Fact>
                )}
                <Fact label="Billing period">
                  {sentenceCaseLabel(item.billingPeriod)}
                </Fact>
                {item.kind === 'ADD_ON' && (
                  <Fact label="Add-on status">{addOnStatus(order, item)}</Fact>
                )}
                <Fact label="Quantity">{item.quantity}</Fact>
                <Fact label="Unit price snapshot">
                  {formatMinor(
                    item.unitAmount.amount,
                    item.unitAmount.currency,
                  )}
                </Fact>
                <Fact label="Setup fee snapshot">
                  {formatMinor(item.setupFee.amount, item.setupFee.currency)}
                </Fact>
                <Fact label="Line total snapshot">
                  {formatMinor(item.lineTotal.amount, item.lineTotal.currency)}
                </Fact>
              </dl>
              <AddOnFulfillment
                order={order}
                item={item}
                onFulfill={onFulfill}
                fulfilling={fulfilling}
              />
            </article>
          ))}
        </div>
      )}
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

function registrationItem(order: Order) {
  // Older customer registration items may have no explicit domain action.
  return order.items.find(
    (item) => item.kind === 'DOMAIN' && item.domainAction !== 'EXISTING',
  );
}

function canApprove(order: Order) {
  return (
    order.status === 'PAID' &&
    order.invoice.status === 'PAID' &&
    order.invoice.balanceDue.amount === '0' &&
    order.items.some((item) => !item.kind || item.kind === 'HOSTING') &&
    !registrationItem(order)
  );
}

function OrderActions({
  order,
  saving,
  onApprove,
}: {
  order: Order;
  saving: boolean;
  onApprove: () => void;
}) {
  const registration = registrationItem(order);
  let action: ReactNode;
  if (order.invoice.status === 'UNPAID' || order.invoice.status === 'OVERDUE') {
    action = (
      <Link
        href={`/admin/payments?customerId=${order.customerId}`}
        className={buttonStyles('secondary')}
      >
        Review payment
      </Link>
    );
  } else if (registration && order.status === 'PAID') {
    action = (
      <Link
        href={
          registration.domainId
            ? `/admin/customers/${order.customerId}/domains/${registration.domainId}`
            : `/admin/domains?customerId=${order.customerId}`
        }
        className={buttonStyles('secondary')}
      >
        Review domain registration
      </Link>
    );
  } else if (canApprove(order)) {
    action = (
      <Button type="button" disabled={saving} onClick={onApprove}>
        Approve for processing
      </Button>
    );
  }
  return action ? (
    <section
      aria-label="Order actions"
      className="border-t border-slate-200 pt-5"
    >
      {action}
    </section>
  ) : null;
}

type OrderItem = Order['items'][number];

function OrderItems({
  order,
  onFulfill,
  fulfilling,
}: {
  order: Order;
  onFulfill?: (itemId: string) => void;
  fulfilling: boolean;
}) {
  const columns: DataColumn<OrderItem>[] = [
    {
      key: 'kind',
      header: 'Item',
      render: (item) =>
        item.kind === 'DOMAIN'
          ? 'Domain'
          : item.kind === 'ADD_ON'
            ? 'Add-on'
            : 'Hosting',
    },
    {
      key: 'description',
      header: 'Description',
      render: (item) => (
        <div className="grid gap-1">
          <span className="font-semibold text-slate-950">
            {item.productName}
          </span>
          {item.domainId ? (
            <Link
              href={`/admin/customers/${order.customerId}/domains/${item.domainId}`}
              className="text-brand-700 underline"
            >
              {item.requestedDomain}
            </Link>
          ) : (
            <span>{item.requestedDomain}</span>
          )}
          {item.description && (
            <span className="whitespace-pre-wrap break-words">
              {item.description}
            </span>
          )}
          {item.hostingProvisioningMode === 'PRESERVE_EXISTING' && (
            <span>Keep existing website and email</span>
          )}
          {item.configuration && (
            <span className="text-amber-800">
              Manual configuration: {item.configuration.fulfillmentNote}
            </span>
          )}
          {item.kind === 'DOMAIN' && (
            <span>
              {item.domainAction === 'EXISTING'
                ? 'Existing domain service'
                : 'Registration request'}
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'cycle',
      header: 'Billing period',
      render: (item) => sentenceCaseLabel(item.billingPeriod),
    },
    {
      key: 'amount',
      header: 'Amount',
      align: 'right',
      render: (item) => (
        <div>
          <p className="whitespace-nowrap font-semibold">
            {formatMinor(item.lineTotal.amount, item.lineTotal.currency)}
          </p>
          <p className="text-xs">
            {item.quantity} ×{' '}
            {formatMinor(item.unitAmount.amount, item.unitAmount.currency)}
          </p>
          {item.setupFee.amount !== '0' && (
            <p className="text-xs">
              Setup {formatMinor(item.setupFee.amount, item.setupFee.currency)}
            </p>
          )}
        </div>
      ),
    },
    {
      key: 'fulfillment',
      header: 'Fulfillment',
      render: (item) =>
        item.kind === 'ADD_ON' ? (
          <div className="grid gap-2">
            <span>{addOnStatus(order, item)}</span>
            <AddOnFulfillment
              order={order}
              item={item}
              onFulfill={onFulfill}
              fulfilling={fulfilling}
            />
          </div>
        ) : item.kind === 'DOMAIN' ? (
          'See Domains'
        ) : (
          'See Services'
        ),
    },
  ];
  return (
    <section className="grid min-w-0 gap-3">
      <h3 className="font-bold">Order items</h3>
      <DataTable
        caption="Order items"
        columns={columns}
        rows={order.items}
        rowKey={(item) => item.id}
      />
    </section>
  );
}

function AddOnFulfillment({
  order,
  item,
  onFulfill,
  fulfilling,
}: {
  order: Order;
  item: OrderItem;
  onFulfill?: (itemId: string) => void;
  fulfilling: boolean;
}) {
  if (
    item.kind !== 'ADD_ON' ||
    item.fulfilledAt ||
    !onFulfill ||
    order.invoice.status !== 'PAID' ||
    (order.status !== 'PAID' && order.status !== 'PROCESSING')
  )
    return null;
  return (
    <Button
      type="button"
      disabled={fulfilling}
      onClick={() => onFulfill(item.id)}
    >
      {item.configuration
        ? 'Confirm configuration applied'
        : 'Mark as fulfilled'}{' '}
      <span className="sr-only">{item.productName}</span>
    </Button>
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
