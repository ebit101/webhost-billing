'use client';

import {
  formatCalendarDate,
  invoiceAgingBuckets,
  invoiceAgingResponseSchema,
  type InvoiceAgingResponse,
} from '@webhost-billing/shared';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { adminInvoiceHref } from '../../lib/admin-invoice-ledger-query';
import { authenticatedGet } from '../../lib/auth-api';
import { formatMinor } from '../orders/order-ui';
import { Button } from '../ui/button';
import { DataTable } from '../ui/data-table';
import { ErrorState, LoadingState } from '../ui/feedback-state';

export function InvoiceAgingReport() {
  const [attempt, setAttempt] = useState(0);
  const [report, setReport] = useState<InvoiceAgingResponse>();
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    void authenticatedGet<unknown>('/reports/invoice-aging')
      .then((result) => {
        if (!active) return;
        const parsed = invoiceAgingResponseSchema.safeParse(result);
        if (!parsed.success)
          throw new Error('The aging report returned an invalid response.');
        setReport(parsed.data);
      })
      .catch((caught: unknown) => {
        if (active)
          setError(
            caught instanceof Error ? caught.message : 'Please try again.',
          );
      });
    return () => {
      active = false;
    };
  }, [attempt]);

  if (error) {
    return (
      <ErrorState
        title="Invoice aging could not be loaded"
        description={error}
        action={
          <Button
            onClick={() => {
              setError('');
              setAttempt(attempt + 1);
            }}
          >
            Try again
          </Button>
        }
      />
    );
  }
  if (!report) return <LoadingState label="Loading invoice aging" />;

  const total = report.buckets.reduce(
    (sum, bucket) => sum + BigInt(bucket.balance),
    0n,
  );
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 p-5">
        <h2 className="font-bold text-slate-950">Overdue invoice aging</h2>
        <p className="mt-1 text-sm text-slate-600">
          As of {formatCalendarDate(report.asOf)} ·{' '}
          {formatMinor(total.toString(), report.currency)} overdue. Balances are
          grouped by days past the invoice due date.
        </p>
      </div>
      <DataTable
        caption="Overdue invoice aging"
        rows={report.buckets}
        rowKey={(bucket) => bucket.id}
        columns={[
          {
            key: 'age',
            header: 'Days overdue',
            render: (bucket) =>
              invoiceAgingBuckets.find(({ id }) => id === bucket.id)?.label,
          },
          {
            key: 'count',
            header: 'Invoices',
            align: 'right',
            render: (bucket) => bucket.count,
          },
          {
            key: 'balance',
            header: 'Outstanding balance',
            align: 'right',
            render: (bucket) => formatMinor(bucket.balance, report.currency),
          },
          {
            key: 'invoices',
            header: 'Details',
            render: (bucket) => (
              <Link
                className="font-semibold text-brand-700 hover:underline"
                href={adminInvoiceHref({
                  status: 'OVERDUE',
                  agingBucket: bucket.id,
                  agingAsOf: report.asOf,
                  agingCurrency: report.currency,
                  page: 1,
                  pageSize: 20,
                })}
                aria-label={`View invoices overdue by ${invoiceAgingBuckets.find(({ id }) => id === bucket.id)?.label}`}
              >
                View invoices
              </Link>
            ),
          },
        ]}
      />
    </section>
  );
}
