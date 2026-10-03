'use client';

import type { CustomerPortalSummary } from '@webhost-billing/shared';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { authenticatedGet } from '../../lib/auth-api';
import { formatMinor, invoiceDate, invoiceTone } from '../invoices/invoice-ui';
import { serviceTone } from '../services/service-ui';
import { ticketTone } from '../support/support-ui';
import { Button, buttonStyles } from '../ui/button';
import { DataTable, type DataColumn } from '../ui/data-table';
import { ErrorState, LoadingState } from '../ui/feedback-state';
import { Icon } from '../ui/icon';
import { PageHeader } from '../ui/page-header';
import { StatusBadge } from '../ui/status-badge';
import { MetricCard } from './metric-card';

type RecentService = CustomerPortalSummary['recent']['services'][number];

export function CustomerPortalOverview({ customerId }: { customerId: string }) {
  const [summary, setSummary] = useState<CustomerPortalSummary>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setSummary(
        await authenticatedGet<CustomerPortalSummary>(
          `/customers/${customerId}/portal-summary`,
        ),
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
    void authenticatedGet<CustomerPortalSummary>(
      `/customers/${customerId}/portal-summary`,
    )
      .then((result) => {
        if (active) setSummary(result);
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
        key: 'renewal',
        header: 'Next due',
        align: 'right',
        render: (service) => invoiceDate(service.nextDueAt),
      },
    ],
    [],
  );

  if (loading) return <LoadingState label="Loading your portal overview" />;

  if (error || !summary) {
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

  const { billing, service, support, recent, counts, customer } = summary;
  const suspendedService =
    service.nextDue?.status === 'SUSPENDED' ? service.nextDue : null;
  const activeRenewal =
    service.nextDue?.status === 'ACTIVE' ? service.nextDue : null;
  const needsAttention = Boolean(
    billing.nextInvoice || suspendedService || support.nextWaitingForCustomer,
  );
  const isEmpty = counts.services + counts.invoices + counts.tickets === 0;

  return (
    <div className="grid gap-8">
      <PageHeader
        eyebrow="Customer portal"
        title={`Welcome, ${customer.firstName}`}
        description="See what needs your attention first, then review your account activity."
        actions={
          <Link href="/portal/support" className={buttonStyles()}>
            <Icon name="support" className="size-4" /> Open support
          </Link>
        }
      />

      <section aria-labelledby="next-actions-heading" className="grid gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-brand-700">
            Next actions
          </p>
          <h2
            id="next-actions-heading"
            className="mt-1 text-xl font-bold text-slate-950"
          >
            {needsAttention ? 'Your attention is needed' : 'No action needed'}
          </h2>
        </div>

        {needsAttention ? (
          <div className="grid gap-4 lg:grid-cols-3">
            {billing.nextInvoice ? (
              <article className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
                <StatusBadge tone="warning">
                  {billing.overdueInvoiceCount > 0 ? 'Overdue' : 'Payment due'}
                </StatusBadge>
                <h3 className="mt-4 text-lg font-bold text-slate-950">
                  {billing.overdueInvoiceCount > 0
                    ? 'Overdue payment'
                    : 'Payment due'}
                </h3>
                <p className="mt-2 text-2xl font-bold text-slate-950">
                  {formatMinor(
                    billing.outstandingBalance.amount,
                    billing.outstandingBalance.currency,
                  )}
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Across {billing.outstandingInvoiceCount}{' '}
                  {billing.outstandingInvoiceCount === 1
                    ? 'invoice'
                    : 'invoices'}
                  . Next: {billing.nextInvoice.invoiceNumber}, due{' '}
                  {invoiceDate(billing.nextInvoice.dueAt)}.
                </p>
                <Link
                  href={`/portal/invoices/${billing.nextInvoice.id}`}
                  className={`${buttonStyles()} mt-5`}
                >
                  Review invoice <Icon name="arrow-right" className="size-4" />
                </Link>
              </article>
            ) : null}

            {suspendedService ? (
              <article className="rounded-2xl border border-rose-200 bg-rose-50 p-6">
                <StatusBadge tone="danger">Suspended</StatusBadge>
                <h3 className="mt-4 text-lg font-bold text-slate-950">
                  Service needs attention
                </h3>
                <p className="mt-2 font-semibold text-slate-800">
                  {suspendedService.domain ?? suspendedService.productName}
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Review this suspended service and its billing context before
                  taking the next step.
                </p>
                <Link
                  href={`/portal/services/${suspendedService.id}`}
                  className={`${buttonStyles()} mt-5`}
                >
                  Review service <Icon name="arrow-right" className="size-4" />
                </Link>
              </article>
            ) : null}

            {support.nextWaitingForCustomer ? (
              <article className="rounded-2xl border border-sky-200 bg-sky-50 p-6">
                <StatusBadge tone="info">Reply needed</StatusBadge>
                <h3 className="mt-4 text-lg font-bold text-slate-950">
                  Your reply is needed
                </h3>
                <p className="mt-2 font-semibold text-slate-800">
                  {support.nextWaitingForCustomer.subject}
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {support.waitingForCustomerCount}{' '}
                  {support.waitingForCustomerCount === 1
                    ? 'ticket is'
                    : 'tickets are'}{' '}
                  waiting for you.
                </p>
                <Link
                  href="/portal/support"
                  className={`${buttonStyles()} mt-5`}
                >
                  Open support <Icon name="arrow-right" className="size-4" />
                </Link>
              </article>
            ) : null}
          </div>
        ) : (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6">
            <h3 className="text-lg font-bold text-emerald-950">
              {isEmpty ? 'Your account is ready' : "You're all caught up"}
            </h3>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-emerald-900/75">
              {isEmpty
                ? 'There are no services, invoices, or support tickets on this account yet.'
                : 'There are no overdue payments, suspended services, or support replies waiting for you.'}
            </p>
            {isEmpty ? (
              <Link
                href="/hosting"
                className={`${buttonStyles('secondary')} mt-5`}
              >
                Browse hosting plans
              </Link>
            ) : null}
          </div>
        )}
      </section>

      {activeRenewal || support.nextWaitingForStaff ? (
        <section aria-label="Coming up" className="grid gap-4 md:grid-cols-2">
          {activeRenewal ? (
            <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
                Next service renewal
              </p>
              <h2 className="mt-2 font-bold text-slate-950">
                {activeRenewal.domain ?? activeRenewal.productName}
              </h2>
              <p className="mt-2 text-sm text-slate-600">
                {formatMinor(
                  activeRenewal.recurringAmount.amount,
                  activeRenewal.recurringAmount.currency,
                )}{' '}
                due {invoiceDate(activeRenewal.nextDueAt)}
              </p>
              <Link
                href={`/portal/services/${activeRenewal.id}`}
                className="mt-4 inline-flex font-semibold text-brand-700 hover:underline"
              >
                View service →
              </Link>
            </article>
          ) : null}
          {support.nextWaitingForStaff ? (
            <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
                Support is reviewing
              </p>
              <h2 className="mt-2 font-bold text-slate-950">
                {support.nextWaitingForStaff.subject}
              </h2>
              <p className="mt-2 text-sm text-slate-600">
                {support.waitingForStaffCount}{' '}
                {support.waitingForStaffCount === 1
                  ? 'ticket is'
                  : 'tickets are'}{' '}
                with the support team.
              </p>
              <Link
                href="/portal/support"
                className="mt-4 inline-flex font-semibold text-brand-700 hover:underline"
              >
                View support →
              </Link>
            </article>
          ) : null}
        </section>
      ) : null}

      <section
        aria-label="Account summary"
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        <MetricCard
          label="Services"
          value={String(counts.services)}
          icon="server"
          tone="brand"
          detail="Hosting services on this account"
        />
        <MetricCard
          label="Invoices"
          value={String(counts.invoices)}
          icon="invoice"
          tone="amber"
          detail="Billing documents on this account"
        />
        <MetricCard
          label="Support tickets"
          value={String(counts.tickets)}
          icon="support"
          tone="emerald"
          detail="Support conversations on this account"
        />
        <MetricCard
          label="Account status"
          value={customer.status.replaceAll('_', ' ')}
          icon="activity"
          tone="slate"
          detail={`Customer ${customer.customerNumber}`}
        />
      </section>

      <section aria-labelledby="recent-activity-heading" className="grid gap-5">
        <div>
          <h2
            id="recent-activity-heading"
            className="text-xl font-bold text-slate-950"
          >
            Recent activity
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Recent records are context only; the actions above use the full
            account.
          </p>
        </div>
        {recent.services.length +
          recent.invoices.length +
          recent.tickets.length ===
        0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
            <h3 className="font-bold text-slate-950">No recent activity</h3>
            <p className="mt-2 text-sm text-slate-500">
              New services, invoices, and support updates will appear here.
            </p>
          </div>
        ) : (
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(20rem,0.8fr)]">
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
                <h3 className="font-bold text-slate-950">Services</h3>
                <Link
                  href="/portal/services"
                  className="text-sm font-bold text-brand-700 hover:underline"
                >
                  View all
                </Link>
              </div>
              {recent.services.length ? (
                <DataTable
                  caption="Recent hosting services"
                  columns={serviceColumns}
                  rows={recent.services}
                  rowKey={(serviceItem) => serviceItem.id}
                />
              ) : (
                <p className="p-5 text-sm text-slate-500">
                  No recent services.
                </p>
              )}
            </div>
            <div className="grid content-start gap-4">
              {recent.invoices[0] ? (
                <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
                        Recent invoice
                      </p>
                      <h3 className="mt-2 font-bold text-slate-950">
                        {recent.invoices[0].invoiceNumber}
                      </h3>
                    </div>
                    <StatusBadge tone={invoiceTone(recent.invoices[0].status)}>
                      {recent.invoices[0].status.replaceAll('_', ' ')}
                    </StatusBadge>
                  </div>
                  <p className="mt-3 text-sm text-slate-600">
                    Balance{' '}
                    {formatMinor(
                      recent.invoices[0].balanceDue.amount,
                      recent.invoices[0].balanceDue.currency,
                    )}
                  </p>
                  <Link
                    href={`/portal/invoices/${recent.invoices[0].id}`}
                    className="mt-4 inline-flex font-semibold text-brand-700 hover:underline"
                  >
                    View invoice →
                  </Link>
                </article>
              ) : null}
              {recent.tickets[0] ? (
                <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
                        Recent support
                      </p>
                      <h3 className="mt-2 font-bold text-slate-950">
                        {recent.tickets[0].subject}
                      </h3>
                    </div>
                    <StatusBadge tone={ticketTone(recent.tickets[0].status)}>
                      {recent.tickets[0].status.replaceAll('_', ' ')}
                    </StatusBadge>
                  </div>
                  <Link
                    href="/portal/support"
                    className="mt-4 inline-flex font-semibold text-brand-700 hover:underline"
                  >
                    Open support →
                  </Link>
                </article>
              ) : null}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
