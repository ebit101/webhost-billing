'use client';
import { sentenceCaseLabel } from '@webhost-billing/shared';

import type {
  CustomerDetail,
  CustomerSummary,
  Order,
  OrderCreationResult,
  Product,
} from '@webhost-billing/shared';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  authMutation,
  authenticatedGet,
  authenticatedPaginatedGet,
} from '../../lib/auth-api';
import {
  emptyAdminCustomerFilter,
  type AdminCustomerFilter,
} from '../../lib/admin-customer-filter';
import { AdminCustomerFilterNotice } from '../customers/admin-customer-filter-notice';
import { Card, Field, fieldClass } from '../customers/customer-fields';
import { Button } from '../ui/button';
import { type DataColumn } from '../ui/data-table';
import { LoadingState } from '../ui/feedback-state';
import { Icon } from '../ui/icon';
import { PageHeader } from '../ui/page-header';
import { StatusBadge } from '../ui/status-badge';
import { errorMessage, formatMinor, orderTone } from './order-ui';
import { AdminOrderReview } from './admin-order-review';
import { AdminOrderLedger } from './admin-order-ledger';
import { AdminDomainOrderForm } from './admin-domain-order-form';
import Link from 'next/link';
import {
  adminOrderHref,
  adminOrderQueryString,
  readAdminOrderQuery,
  type AdminOrderSelection,
} from '../../lib/admin-order-ledger-query';
import { type CheckoutIntent } from '../../lib/checkout-intent';
import { clearOrderDraft, readOrderDraft } from '../../lib/order-draft';

export function AdminOrderManager({
  customerFilter = emptyAdminCustomerFilter,
  selection,
  checkoutIntent,
}: {
  customerFilter?: AdminCustomerFilter;
  selection?: AdminOrderSelection;
  checkoutIntent?: CheckoutIntent;
} = {}) {
  const applied = selection ?? {
    ...readAdminOrderQuery({ customerId: customerFilter.customerId }),
    customerFilter,
  };
  customerFilter = applied.customerFilter;
  const [readRevision, setReadRevision] = useState(0);
  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [filteredCustomer, setFilteredCustomer] = useState<CustomerDetail>();
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [selectedPriceId, setSelectedPriceId] = useState('');
  const [requestedDomain, setRequestedDomain] = useState('');
  const [draftNeedsRegistration, setDraftNeedsRegistration] = useState(false);
  const [selectionUnavailable, setSelectionUnavailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const submissionKey = useRef('');
  const [review, setReview] = useState<{ id: string; sequence: number }>();
  const reviewSequence = useRef(0);
  const reviewTrigger = useRef<HTMLButtonElement | null>(null);
  const filteredCustomerId = customerFilter.customerId;
  const scope = `${adminOrderQueryString(applied.query)}:${applied.invalid}:${customerFilter.invalid}`;
  const [reviewScope, setReviewScope] = useState(scope);
  const checkoutProductId = checkoutIntent?.productId;
  const checkoutPriceId = checkoutIntent?.priceId;
  // Discard old selection without remounting independent creation inputs/key.
  if (reviewScope !== scope) {
    setReviewScope(scope);
    setReview(undefined);
  }

  useEffect(() => {
    let active = true;
    void Promise.all([
      authenticatedPaginatedGet<CustomerSummary>('/customers?pageSize=100'),
      authenticatedGet<Product[]>('/products'),
    ])
      .then(([customerResult, productResult]) => {
        if (!active) return;
        setCustomers(customerResult.data);
        setProducts(productResult);
        const requestedProduct = checkoutProductId
          ? productResult.find(
              (product) =>
                product.id === checkoutProductId && product.status === 'ACTIVE',
            )
          : undefined;
        const requestedPrice = requestedProduct?.prices.find(
          (price) => price.id === checkoutPriceId && price.isActive,
        );
        setSelectionUnavailable(Boolean(checkoutProductId && !requestedPrice));
        setSelectedProductId(
          checkoutProductId
            ? (requestedProduct?.id ?? '')
            : (productResult.find((product) => product.status === 'ACTIVE')
                ?.id ?? ''),
        );
        setSelectedPriceId(requestedPrice?.id ?? '');
        const draft =
          checkoutProductId && checkoutPriceId
            ? readOrderDraft({
                productId: checkoutProductId,
                priceId: checkoutPriceId,
              })
            : undefined;
        setRequestedDomain(draft?.requestedDomain ?? '');
        setDraftNeedsRegistration(draft?.domainChoice === 'REGISTER');
      })
      .catch((caught: unknown) => {
        if (active) setError(errorMessage(caught));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [checkoutPriceId, checkoutProductId]);

  useEffect(() => {
    let active = true;
    void (
      filteredCustomerId
        ? authenticatedGet<CustomerDetail>(`/customers/${filteredCustomerId}`)
        : Promise.resolve(undefined)
    )
      .then((customer) => {
        if (active) setFilteredCustomer(customer);
      })
      .catch((caught: unknown) => {
        if (active) setError(errorMessage(caught));
      });
    return () => {
      active = false;
    };
  }, [filteredCustomerId]);

  const selectedProduct = products.find(
    (product) => product.id === selectedProductId,
  );
  const activePrices =
    selectedProduct?.prices.filter((price) => price.isActive) ?? [];
  const columns = useMemo<DataColumn<Order>[]>(
    () => [
      {
        key: 'order',
        header: 'Order',
        render: (order) => (
          <div>
            <p className="font-bold text-slate-950">{order.orderNumber}</p>
            <p className="mt-1 text-xs text-slate-500">
              {new Date(order.placedAt).toLocaleString()}
            </p>
          </div>
        ),
      },
      {
        key: 'customer',
        header: 'Customer',
        render: (order) => (
          <div>
            <p className="font-semibold text-slate-900">{order.customerName}</p>
            <p className="text-xs text-slate-500">{order.customerEmail}</p>
          </div>
        ),
      },
      {
        key: 'service',
        header: 'Plan & domain',
        render: (order) => (
          <div>
            <p>{order.items[0]?.productName}</p>
            <p className="text-xs text-slate-500">
              {order.items[0]?.requestedDomain}
            </p>
          </div>
        ),
      },
      {
        key: 'status',
        header: 'Status',
        render: (order) => (
          <StatusBadge tone={orderTone(order.status)}>
            {sentenceCaseLabel(order.status)}
          </StatusBadge>
        ),
      },
      {
        key: 'total',
        header: 'Total',
        align: 'right',
        render: (order) => (
          <span className="font-bold text-slate-950">
            {formatMinor(order.total.amount, order.total.currency)}
          </span>
        ),
      },
      {
        key: 'review',
        header: 'Review',
        render: (order) => (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={saving}
            aria-controls="admin-order-review"
            aria-expanded={review?.id === order.id}
            aria-label={`Review order ${order.orderNumber}`}
            onClick={(event) => {
              reviewTrigger.current = event.currentTarget;
              setReview({ id: order.id, sequence: ++reviewSequence.current });
            }}
          >
            Review order
          </Button>
        ),
      },
      {
        key: 'actions',
        header: 'Actions',
        align: 'right',
        render: (order) =>
          order.items[0]?.kind === 'DOMAIN' ? (
            <Link href="/admin/domains" className="text-blue-700 underline">
              Review domain
            </Link>
          ) : order.status === 'PAID' ? (
            <Button
              size="sm"
              disabled={saving}
              onClick={() => void changeStatus(order.id, 'PROCESSING')}
            >
              Approve
            </Button>
          ) : order.status === 'AWAITING_PAYMENT' ? (
            <span className="inline-flex gap-2">
              <Button
                size="sm"
                variant="ghost"
                disabled={saving}
                onClick={() => void changeStatus(order.id, 'REJECTED')}
              >
                Reject
              </Button>
              <Button
                size="sm"
                variant="danger"
                disabled={saving}
                onClick={() => void changeStatus(order.id, 'CANCELLED')}
              >
                Cancel
              </Button>
            </span>
          ) : (
            <span className="text-xs text-slate-400">No manual action</span>
          ),
      },
    ],
    [saving, review?.id],
  );

  async function createOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    if (!submissionKey.current) submissionKey.current = crypto.randomUUID();
    setReview(undefined);
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const result = await authMutation<OrderCreationResult>(
        '/orders/admin',
        'POST',
        {
          customerId: String(values.get('customerId')),
          productId: String(values.get('productId')),
          priceId: String(values.get('priceId')),
          requestedDomain: String(values.get('requestedDomain')),
          submissionKey: submissionKey.current,
          ...(values.get('notes')
            ? { notes: String(values.get('notes')) }
            : {}),
        },
      );
      submissionKey.current = '';
      form.reset();
      setRequestedDomain('');
      if (checkoutIntent) clearOrderDraft();
      setNotice(
        `${result.order.orderNumber} created with unpaid invoice ${result.order.invoice.invoiceNumber}.`,
      );
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setSaving(false);
      setReadRevision((current) => current + 1);
    }
  }

  async function changeStatus(
    orderId: string,
    status: 'PROCESSING' | 'REJECTED' | 'CANCELLED',
  ) {
    setReview(undefined);
    setSaving(true);
    setError('');
    try {
      const updated = await authMutation<Order>(
        `/orders/${orderId}/status`,
        'PATCH',
        { status },
      );
      setNotice(`${updated.orderNumber} moved to ${status.toLowerCase()}.`);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setSaving(false);
      setReadRevision((current) => current + 1);
    }
  }

  if (loading) return <LoadingState label="Loading orders" />;

  return (
    <div className="grid gap-7">
      <PageHeader
        eyebrow="Administrator"
        title={checkoutIntent ? 'Complete hosting order' : 'Orders'}
        description={
          checkoutIntent
            ? 'Choose the customer, review the selected hosting plan and domain, then create an unpaid invoice.'
            : 'Create customer orders with server-authoritative prices, then track payment and fulfilment states independently.'
        }
      />
      <AdminCustomerFilterNotice
        customer={
          filteredCustomer?.id.toLowerCase() ===
          filteredCustomerId?.toLowerCase()
            ? filteredCustomer
            : undefined
        }
        invalid={customerFilter.invalid}
        clearHref={adminOrderHref({
          ...applied.query,
          customerId: undefined,
          page: 1,
        })}
        resourceLabel="orders"
      />
      {error ? <Message tone="error">{error}</Message> : null}
      {notice ? <Message tone="success">{notice}</Message> : null}
      {!checkoutIntent && (
        <AdminDomainOrderForm
          onCreated={() => setReadRevision((current) => current + 1)}
        />
      )}
      <Card
        title="Create a hosting order"
        description="Create a hosting order and unpaid invoice for a customer. The API revalidates the customer, product, active price, domain, and every total."
      >
        {checkoutIntent && (
          <div className="mb-5 rounded-xl border border-brand-200 bg-brand-50 p-4 text-sm text-slate-800">
            <p className="font-semibold">Hosting selection carried forward</p>
            <p className="mt-1">
              No order has been placed. Select the customer and review the
              active price before creating an invoice.
            </p>
          </div>
        )}
        {selectionUnavailable && (
          <p
            role="alert"
            className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"
          >
            This hosting plan or billing period is no longer available. Select
            an active product and price below.
          </p>
        )}
        {draftNeedsRegistration && (
          <p
            role="alert"
            className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"
          >
            This selection requests a new domain registration. The administrator
            hosting form creates hosting-only orders. Use a customer account for
            a combined hosting and domain invoice, or create a separate domain
            order below with recorded offline consent.
          </p>
        )}
        <form
          onSubmit={createOrder}
          className="grid gap-4 md:grid-cols-2 xl:grid-cols-5"
        >
          <label className="block text-sm font-semibold text-slate-700">
            Customer
            <select name="customerId" required className={fieldClass}>
              <option value="">Select customer</option>
              {customers
                .filter((customer) => customer.status === 'ACTIVE')
                .map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.firstName} {customer.lastName} — {customer.email}
                  </option>
                ))}
            </select>
          </label>
          <label className="block text-sm font-semibold text-slate-700">
            Product
            <select
              name="productId"
              required
              value={selectedProductId}
              onChange={(event) => {
                setSelectedProductId(event.target.value);
                setSelectedPriceId('');
                setSelectionUnavailable(false);
              }}
              className={fieldClass}
            >
              <option value="">Select product</option>
              {products
                .filter((product) => product.status === 'ACTIVE')
                .map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name}
                  </option>
                ))}
            </select>
          </label>
          <label className="block text-sm font-semibold text-slate-700">
            Price
            <select
              name="priceId"
              required
              value={selectedPriceId}
              onChange={(event) => setSelectedPriceId(event.target.value)}
              className={fieldClass}
            >
              <option value="">Select billing period</option>
              {activePrices.map((price) => (
                <option key={price.id} value={price.id}>
                  {price.billingPeriod.toLowerCase()} —{' '}
                  {formatMinor(price.amount.amount, price.amount.currency)}
                </option>
              ))}
            </select>
          </label>
          <Field
            label="Requested domain"
            name="requestedDomain"
            placeholder="example.com"
            required
            value={requestedDomain}
            onChange={(event) => setRequestedDomain(event.target.value)}
          />
          <Field label="Internal note" name="notes" />
          <div className="md:col-span-2 xl:col-span-5">
            <Button
              type="submit"
              disabled={saving || !customers.length || draftNeedsRegistration}
            >
              <Icon name="plus" className="size-4" />
              {saving ? 'Creating…' : 'Create order and invoice'}
            </Button>
          </div>
        </form>
      </Card>
      {checkoutIntent && (
        <AdminDomainOrderForm
          onCreated={() => setReadRevision((current) => current + 1)}
        />
      )}
      <AdminOrderLedger
        selection={applied}
        revision={readRevision}
        columns={columns}
        onNavigate={() => setReview(undefined)}
      />
      {review ? (
        <AdminOrderReview
          key={`${review.id}:${review.sequence}`}
          orderId={review.id}
          customerId={filteredCustomerId}
          onClose={() => {
            setReview(undefined);
            if (reviewTrigger.current?.isConnected)
              reviewTrigger.current.focus();
          }}
        />
      ) : null}
    </div>
  );
}

function Message({
  tone,
  children,
}: {
  tone: 'error' | 'success';
  children: string;
}) {
  return (
    <p
      role={tone === 'error' ? 'alert' : 'status'}
      className={`rounded-xl p-4 text-sm font-semibold ${tone === 'error' ? 'bg-red-50 text-red-800' : 'bg-emerald-50 text-emerald-800'}`}
    >
      {children}
    </p>
  );
}
