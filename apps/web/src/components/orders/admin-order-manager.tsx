'use client';

import type {
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
import { Card, Field, fieldClass } from '../customers/customer-fields';
import { Button } from '../ui/button';
import { DataTable, type DataColumn } from '../ui/data-table';
import { EmptyState, LoadingState } from '../ui/feedback-state';
import { Icon } from '../ui/icon';
import { PageHeader } from '../ui/page-header';
import { StatusBadge } from '../ui/status-badge';
import { errorMessage, formatMinor, orderTone } from './order-ui';

export function AdminOrderManager() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const submissionKey = useRef('');

  useEffect(() => {
    let active = true;
    void Promise.all([
      authenticatedPaginatedGet<Order>('/orders?pageSize=100'),
      authenticatedPaginatedGet<CustomerSummary>('/customers?pageSize=100'),
      authenticatedGet<Product[]>('/products'),
    ])
      .then(([orderResult, customerResult, productResult]) => {
        if (!active) return;
        setOrders(orderResult.data);
        setCustomers(customerResult.data);
        setProducts(productResult);
        setSelectedProductId(
          productResult.find((product) => product.status === 'ACTIVE')?.id ??
            '',
        );
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
  }, []);

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
            {order.status.replaceAll('_', ' ')}
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
        key: 'actions',
        header: 'Actions',
        align: 'right',
        render: (order) =>
          order.status === 'PAID' ? (
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
    [saving],
  );

  async function createOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    if (!submissionKey.current) submissionKey.current = crypto.randomUUID();
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
      setOrders((current) => [
        result.order,
        ...current.filter((order) => order.id !== result.order.id),
      ]);
      submissionKey.current = '';
      form.reset();
      setNotice(
        `${result.order.orderNumber} created with unpaid invoice ${result.order.invoice.invoiceNumber}.`,
      );
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(
    orderId: string,
    status: 'PROCESSING' | 'REJECTED' | 'CANCELLED',
  ) {
    setSaving(true);
    setError('');
    try {
      const updated = await authMutation<Order>(
        `/orders/${orderId}/status`,
        'PATCH',
        { status },
      );
      setOrders((current) =>
        current.map((order) => (order.id === updated.id ? updated : order)),
      );
      setNotice(`${updated.orderNumber} moved to ${status.toLowerCase()}.`);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <LoadingState label="Loading orders" />;

  return (
    <div className="grid gap-7">
      <PageHeader
        eyebrow="Administrator"
        title="Orders"
        description="Create customer orders with server-authoritative prices, then track payment and fulfilment states independently."
      />
      {error ? <Message tone="error">{error}</Message> : null}
      {notice ? <Message tone="success">{notice}</Message> : null}
      <Card
        title="Create an order"
        description="The API revalidates the customer, product, active price, domain, and every total before creating the order and unpaid invoice."
      >
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
              onChange={(event) => setSelectedProductId(event.target.value)}
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
            <select name="priceId" required className={fieldClass}>
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
          />
          <Field label="Internal note" name="notes" />
          <div className="md:col-span-2 xl:col-span-5">
            <Button type="submit" disabled={saving || !customers.length}>
              <Icon name="plus" className="size-4" />
              {saving ? 'Creating…' : 'Create order and invoice'}
            </Button>
          </div>
        </form>
      </Card>
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {orders.length ? (
          <DataTable
            caption="Hosting orders"
            columns={columns}
            rows={orders}
            rowKey={(order) => order.id}
          />
        ) : (
          <EmptyState
            title="No orders yet"
            description="Create an order for an active customer and hosting plan."
          />
        )}
      </section>
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
