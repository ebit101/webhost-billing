'use client';

import type { Order } from '@webhost-billing/shared';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { authenticatedPaginatedGet } from '../../lib/auth-api';
import { buttonStyles } from '../ui/button';
import { DataTable, type DataColumn } from '../ui/data-table';
import { EmptyState, ErrorState, LoadingState } from '../ui/feedback-state';
import { Icon } from '../ui/icon';
import { PageHeader } from '../ui/page-header';
import { StatusBadge } from '../ui/status-badge';
import { errorMessage, formatMinor, orderTone } from './order-ui';

export function CustomerOrderList() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    void authenticatedPaginatedGet<Order>('/orders/my?pageSize=100')
      .then((result) => {
        if (active) setOrders(result.data);
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

  const columns = useMemo<DataColumn<Order>[]>(
    () => [
      {
        key: 'number',
        header: 'Order',
        render: (order) => (
          <div>
            <p className="font-bold text-slate-950">{order.orderNumber}</p>
            <p className="text-xs text-slate-500">
              {new Date(order.placedAt).toLocaleDateString()}
            </p>
          </div>
        ),
      },
      {
        key: 'plan',
        header: 'Hosting',
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
        key: 'invoice',
        header: 'Invoice',
        render: (order) => (
          <div>
            <p>{order.invoice.invoiceNumber}</p>
            <p className="text-xs text-slate-500">
              {order.invoice.status.replaceAll('_', ' ')}
            </p>
          </div>
        ),
      },
      {
        key: 'status',
        header: 'Order status',
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
    ],
    [],
  );

  if (loading) return <LoadingState label="Loading your orders" />;
  if (error) return <ErrorState description={error} />;
  return (
    <div className="grid gap-7">
      <PageHeader
        eyebrow="Customer portal"
        title="My orders"
        description="Follow order, invoice, and fulfilment progress as independent states."
        actions={
          <Link href="/portal/checkout" className={buttonStyles()}>
            <Icon name="plus" className="size-4" />
            New order
          </Link>
        }
      />
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {orders.length ? (
          <DataTable
            caption="Your hosting orders"
            columns={columns}
            rows={orders}
            rowKey={(order) => order.id}
          />
        ) : (
          <EmptyState
            title="No orders yet"
            description="Choose an active hosting plan to place your first order."
            action={
              <Link href="/hosting" className={buttonStyles()}>
                Browse hosting plans
              </Link>
            }
          />
        )}
      </section>
    </div>
  );
}
