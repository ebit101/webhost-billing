'use client';

import type { CustomerDetail } from '@webhost-billing/shared';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { authenticatedGet } from '../../lib/auth-api';
import { formatMinor, invoiceDate, invoiceTone } from '../invoices/invoice-ui';
import { serviceTone } from '../services/service-ui';
import { ticketTone } from '../support/support-ui';
import { Button, buttonStyles } from '../ui/button';
import { DataTable, type DataColumn } from '../ui/data-table';
import { EmptyState, ErrorState, LoadingState } from '../ui/feedback-state';
import { Icon } from '../ui/icon';
import { PageHeader } from '../ui/page-header';
import { StatusBadge } from '../ui/status-badge';
import { MetricCard } from './metric-card';

type RecentService = CustomerDetail['linked']['services'][number];

export function CustomerPortalOverview({ customerId }: { customerId: string }) {
  const [customer, setCustomer] = useState<CustomerDetail>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setCustomer(
        await authenticatedGet<CustomerDetail>(`/customers/${customerId}`),
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Your portal overview could not be loaded.',
      );
    } finally {
      setLoading(false);
    }
  }, [customerId]);

  useEffect(() => {
    let active = true;
    void authenticatedGet<CustomerDetail>(`/customers/${customerId}`)
      .then((result) => {
        if (active) setCustomer(result);
      })
      .catch((caught: unknown) => {
        if (!active) return;
        setError(
          caught instanceof Error
            ? caught.message
            : 'Your portal overview could not be loaded.',
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [customerId]);

  const serviceColumns = useMemo<DataColumn<RecentService>[]>(
    () => [
      {
        key: 'service',
        header: 'Service',
        render: (service) => (
          <div>
            <Link
              href={`/portal/services/${service.id}`}
              className="font-semibold text-brand-700 hover:text-brand-900 hover:underline"
            >
              {service.domain ?? service.productName}
            </Link>
            <p className="mt-1 text-xs text-slate-500">{service.productName}</p>
          </div>
        ),
      },
      {
        key: 'status',
        header: 'Status',
        render: (service) => (
          <StatusBadge tone={serviceTone(service.status)}>
            {service.status.replaceAll('_', ' ')}
          </StatusBadge>
        ),
      },
      {
        key: 'recurring',
        header: 'Recurring',
        align: 'right',
        render: (service) =>
          formatMinor(
            service.recurringAmount.amount,
            service.recurringAmount.currency,
          ),
      },
    ],
    [],
  );

  if (loading) return <LoadingState label="Loading your portal overview" />;

  if (error || !customer) {
    return (
      <ErrorState
        title="Portal overview unavailable"
        description={error || 'Your portal overview could not be loaded.'}
        action={
          <Button type="button" variant="secondary" onClick={() => void load()}>
            Try again
          </Button>
        }
      />
    );
  }

  const recentInvoice = customer.linked.invoices[0];
  const recentTicket = customer.linked.tickets[0];

  return (
    <div className="grid gap-8">
      <PageHeader
        eyebrow="Customer portal"
        title={`Welcome, ${customer.firstName}`}
        description="Review your current account totals and most recent hosting, billing, and support activity."
        actions={
          <Link href="/portal/support" className={buttonStyles()}>
            <Icon name="support" className="size-4" /> Open support
          </Link>
        }
      />

      <section
        aria-label="Account summary"
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        <MetricCard
          label="Services"
          value={String(customer.linked.counts.services)}
          icon="server"
          tone="brand"
          detail="Total hosting services on this account"
        />
        <MetricCard
          label="Invoices"
          value={String(customer.linked.counts.invoices)}
          icon="invoice"
          tone="amber"
          detail="Total billing documents on this account"
        />
        <MetricCard
          label="Support tickets"
          value={String(customer.linked.counts.tickets)}
          icon="support"
          tone="emerald"
          detail="Total support conversations on this account"
        />
        <MetricCard
          label="Account status"
          value={customer.status.replaceAll('_', ' ')}
          icon="activity"
          tone="slate"
          detail={`Customer ${customer.customerNumber}`}
        />
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.65fr)_minmax(19rem,0.7fr)]">
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between gap-4 border-b border-slate-200 px-5 py-5 sm:px-6">
            <div>
              <h2 className="font-bold text-slate-950">Recent services</h2>
              <p className="mt-1 text-sm text-slate-500">
                Up to ten most recently created services
              </p>
            </div>
            <Link
              href="/portal/services"
              className="text-sm font-bold text-brand-700 hover:text-brand-900"
            >
              View all
            </Link>
          </div>
          {customer.linked.services.length ? (
            <DataTable
              caption="Recent hosting services"
              columns={serviceColumns}
              rows={customer.linked.services}
              rowKey={(service) => service.id}
            />
          ) : (
            <EmptyState
              title="No hosting services"
              description="A paid order remains separate until an administrator creates its hosting service."
              action={
                <Link href="/hosting" className={buttonStyles()}>
                  Browse hosting plans
                </Link>
              }
            />
          )}
        </section>

        <aside className="grid content-start gap-5">
          {recentInvoice ? (
            <section className="rounded-2xl bg-slate-950 p-6 text-white shadow-lg shadow-slate-950/10">
              <span className="grid size-11 place-items-center rounded-2xl bg-cyan-400/15 text-cyan-300">
                <Icon name="invoice" className="size-5" />
              </span>
              <p className="mt-6 text-xs font-bold uppercase tracking-[0.14em] text-slate-400">
                Recent invoice
              </p>
              <p className="mt-2 text-3xl font-bold">
                {formatMinor(
                  recentInvoice.balanceDue.amount,
                  recentInvoice.balanceDue.currency,
                )}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-slate-300">
                <span>{recentInvoice.invoiceNumber}</span>
                <span aria-hidden="true">·</span>
                <span>Due {invoiceDate(recentInvoice.dueAt)}</span>
                <StatusBadge tone={invoiceTone(recentInvoice.status)}>
                  {recentInvoice.status.replaceAll('_', ' ')}
                </StatusBadge>
              </div>
              <Link
                href={`/portal/invoices/${recentInvoice.id}`}
                className={`${buttonStyles('secondary')} mt-6 w-full border-white/15 bg-white/10 text-white hover:bg-white/15`}
              >
                Review invoice <Icon name="arrow-right" className="size-4" />
              </Link>
            </section>
          ) : (
            <EmptyState
              title="No invoices yet"
              description="Issued order and renewal invoices will appear here."
              action={
                <Link
                  href="/portal/invoices"
                  className={buttonStyles('secondary')}
                >
                  View invoices
                </Link>
              }
            />
          )}

          {recentTicket ? (
            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
                    Recent support
                  </p>
                  <h2 className="mt-2 font-bold text-slate-950">
                    {recentTicket.subject}
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    {recentTicket.ticketNumber} · Updated{' '}
                    {invoiceDate(recentTicket.updatedAt)}
                  </p>
                </div>
                <StatusBadge tone={ticketTone(recentTicket.status)}>
                  {recentTicket.status.replaceAll('_', ' ')}
                </StatusBadge>
              </div>
              <Link
                href="/portal/support"
                className="mt-5 inline-flex font-semibold text-brand-700 hover:text-brand-900 hover:underline"
              >
                Open support →
              </Link>
            </section>
          ) : (
            <EmptyState
              title="No support tickets"
              description="Start a ticket whenever you need help with an account or service."
              action={
                <Link
                  href="/portal/support"
                  className={buttonStyles('secondary')}
                >
                  Open support
                </Link>
              }
            />
          )}
        </aside>
      </div>
    </div>
  );
}
