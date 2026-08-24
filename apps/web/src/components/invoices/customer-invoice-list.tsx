'use client';

import type { Invoice } from '@webhost-billing/shared';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { authenticatedPaginatedGet } from '../../lib/auth-api';
import { buttonStyles } from '../ui/button';
import { DataTable, type DataColumn } from '../ui/data-table';
import { EmptyState, ErrorState, LoadingState } from '../ui/feedback-state';
import { PageHeader } from '../ui/page-header';
import { StatusBadge } from '../ui/status-badge';
import {
  formatMinor,
  invoiceDate,
  invoiceError,
  invoiceTone,
} from './invoice-ui';

export function CustomerInvoiceList() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    void authenticatedPaginatedGet<Invoice>('/invoices/my?pageSize=100')
      .then((result) => {
        if (active) setInvoices(result.data);
      })
      .catch((caught: unknown) => {
        if (active) setError(invoiceError(caught));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const columns = useMemo<DataColumn<Invoice>[]>(
    () => [
      {
        key: 'number',
        header: 'Invoice',
        render: (invoice) => (
          <Link
            className="font-bold text-brand-700 hover:underline"
            href={`/portal/invoices/${invoice.id}`}
          >
            {invoice.invoiceNumber}
          </Link>
        ),
      },
      {
        key: 'status',
        header: 'Status',
        render: (invoice) => (
          <StatusBadge tone={invoiceTone(invoice.status)}>
            {invoice.status.replaceAll('_', ' ')}
          </StatusBadge>
        ),
      },
      {
        key: 'issued',
        header: 'Issued',
        render: (invoice) => invoiceDate(invoice.issuedAt),
      },
      {
        key: 'due',
        header: 'Due',
        render: (invoice) => invoiceDate(invoice.dueAt),
      },
      {
        key: 'total',
        header: 'Total',
        align: 'right',
        render: (invoice) =>
          formatMinor(invoice.total.amount, invoice.total.currency),
      },
      {
        key: 'balance',
        header: 'Balance',
        align: 'right',
        render: (invoice) => (
          <span className="font-bold text-slate-950">
            {formatMinor(
              invoice.balanceDue.amount,
              invoice.balanceDue.currency,
            )}
          </span>
        ),
      },
    ],
    [],
  );

  if (loading) return <LoadingState label="Loading your invoices" />;
  if (error) return <ErrorState description={error} />;
  return (
    <div className="grid gap-7">
      <PageHeader
        eyebrow="Customer portal"
        title="Invoices"
        description="Review issued billing documents, due dates, credits, payments, and current balances."
      />
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {invoices.length ? (
          <DataTable
            caption="Your invoices"
            columns={columns}
            rows={invoices}
            rowKey={(invoice) => invoice.id}
          />
        ) : (
          <EmptyState
            title="No invoices yet"
            description="Issued order and renewal invoices will appear here."
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
