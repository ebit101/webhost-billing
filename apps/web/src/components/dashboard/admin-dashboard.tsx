'use client';

import type {
  DashboardResponse,
  ReportResource,
} from '@webhost-billing/shared';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { authenticatedDownload, authenticatedGet } from '../../lib/auth-api';
import { formatMinor } from '../orders/order-ui';
import { DataTable, type DataColumn } from '../ui/data-table';
import { PageHeader } from '../ui/page-header';
import { StatusBadge } from '../ui/status-badge';
import { MetricCard } from './metric-card';

type Activity = DashboardResponse['recentActivity'][number];
const exportLabels: Record<ReportResource, string> = {
  customers: 'Customers CSV',
  invoices: 'Invoices CSV',
  payments: 'Payments CSV',
  services: 'Services CSV',
};

export function AdminDashboard() {
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState<ReportResource | null>(null);

  async function load(path = '/dashboard') {
    setLoading(true);
    setError('');
    try {
      const result = await authenticatedGet<DashboardResponse>(path);
      setDashboard(result);
      setFrom(result.period.from);
      setTo(result.period.to);
    } catch (requestError) {
      setError(message(requestError));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    void authenticatedGet<DashboardResponse>('/dashboard')
      .then((result) => {
        if (!active) return;
        setDashboard(result);
        setFrom(result.period.from);
        setTo(result.period.to);
      })
      .catch((requestError: unknown) => {
        if (active) setError(message(requestError));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function applyPeriod(event: FormEvent) {
    event.preventDefault();
    await load(`/dashboard?${new URLSearchParams({ from, to })}`);
  }

  async function exportReport(resource: ReportResource) {
    setExporting(resource);
    setError('');
    try {
      const download = await authenticatedDownload(
        `/reports/exports/${resource}`,
        { from, to },
      );
      const url = URL.createObjectURL(download.blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = download.filename;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (requestError) {
      setError(message(requestError));
    } finally {
      setExporting(null);
    }
  }

  const activityColumns = useMemo<DataColumn<Activity>[]>(
    () => [
      {
        key: 'activity',
        header: 'Activity',
        render: (row) => (
          <div>
            <p className="font-semibold text-slate-950">{row.label}</p>
            <p className="mt-1 text-xs text-slate-500">{row.action}</p>
          </div>
        ),
      },
      {
        key: 'entity',
        header: 'Entity',
        render: (row) => (
          <StatusBadge tone="neutral">{row.entityType}</StatusBadge>
        ),
      },
      { key: 'actor', header: 'Actor', render: (row) => row.actor },
      {
        key: 'time',
        header: 'Time',
        align: 'right',
        render: (row) =>
          new Intl.DateTimeFormat('en-GB', {
            dateStyle: 'medium',
            timeStyle: 'short',
            timeZone: dashboard?.timeZone,
          }).format(new Date(row.createdAt)),
      },
    ],
    [dashboard?.timeZone],
  );

  if (!dashboard) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-xl font-bold text-slate-950">Business overview</h1>
        <p className="mt-3 text-sm text-slate-600">
          {loading ? 'Loading current business data…' : error}
        </p>
        {!loading ? (
          <button
            className="mt-5 rounded-xl bg-slate-950 px-4 py-2 text-sm font-bold text-white"
            onClick={() => void load()}
          >
            Try again
          </button>
        ) : null}
      </div>
    );
  }

  const metrics = dashboard.metrics;
  const maxRevenue = dashboard.revenueSeries.reduce((maximum, point) => {
    const value = BigInt(point.amount);
    return value > maximum ? value : maximum;
  }, 0n);

  return (
    <div className="grid gap-8">
      <PageHeader
        eyebrow={`Updated ${new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: dashboard.timeZone }).format(new Date(dashboard.generatedAt))}`}
        title="Business overview"
        description={`Live operational and financial data in ${dashboard.currency}, using ${dashboard.timeZone} business dates.`}
      />
      <form
        onSubmit={(event) => void applyPeriod(event)}
        className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
      >
        <DateField label="From" value={from} onChange={setFrom} />
        <DateField label="To" value={to} onChange={setTo} />
        <button
          disabled={loading}
          className="rounded-xl bg-slate-950 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50"
        >
          {loading ? 'Refreshing…' : 'Apply period'}
        </button>
        <p className="ml-auto text-xs text-slate-500">
          Inclusive business dates · maximum 366 days
        </p>
      </form>
      {error ? (
        <p
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          {error}
        </p>
      ) : null}
      <section
        aria-label="Business summary"
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        <MetricCard
          label="Collected revenue"
          value={formatMinor(
            metrics.collectedRevenue.amount,
            dashboard.currency,
          )}
          icon="payment"
          tone="emerald"
          detail={`${from} to ${to} · charges less refunds and reversals`}
        />
        <MetricCard
          label="Outstanding balance"
          value={formatMinor(
            metrics.outstandingBalance.amount,
            dashboard.currency,
          )}
          icon="invoice"
          tone="amber"
          detail="Current unpaid and overdue invoices"
        />
        <MetricCard
          label="Overdue balance"
          value={formatMinor(metrics.overdueBalance.amount, dashboard.currency)}
          icon="alert"
          tone="amber"
          detail="Current overdue invoices only"
        />
        <MetricCard
          label="Active services"
          value={String(metrics.activeServices)}
          icon="server"
          tone="brand"
          detail="Current service state"
        />
        <MetricCard
          label="Suspended services"
          value={String(metrics.suspendedServices)}
          icon="server"
          tone="amber"
          detail="Current service state"
        />
        <MetricCard
          label="Pending orders"
          value={String(metrics.pendingOrders)}
          icon="order"
          tone="brand"
          detail="All non-terminal order workflow states"
        />
        <MetricCard
          label="Open tickets"
          value={String(metrics.openTickets)}
          icon="support"
          tone="slate"
          detail="Open and waiting support tickets"
        />
        <MetricCard
          label="Failed automation jobs"
          value={String(metrics.failedAutomationJobs)}
          icon="activity"
          tone="amber"
          detail="Failed or partly successful runs in the selected period"
        />
      </section>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(19rem,0.7fr)]">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="font-bold text-slate-950">Daily collected revenue</h2>
          <p className="mt-1 text-xs text-slate-500">
            Net successful transactions by {dashboard.timeZone} business date
          </p>
          <div
            className="mt-7 flex h-52 items-end gap-1 overflow-x-auto"
            aria-label="Daily collected revenue chart"
          >
            {dashboard.revenueSeries.map((point) => {
              const value = BigInt(point.amount);
              const height =
                maxRevenue === 0n
                  ? 3
                  : Number(((value > 0n ? value : 0n) * 100n) / maxRevenue);
              return (
                <div
                  key={point.date}
                  className="group flex min-w-3 flex-1 flex-col items-center justify-end gap-2"
                  title={`${point.date}: ${formatMinor(point.amount, dashboard.currency)}`}
                >
                  <span className="sr-only">
                    {point.date}:{' '}
                    {formatMinor(point.amount, dashboard.currency)}
                  </span>
                  <div
                    className={`w-full rounded-t transition-colors ${value < 0n ? 'bg-red-400 group-hover:bg-red-600' : 'bg-brand-500 group-hover:bg-brand-700'}`}
                    style={{ height: `${Math.max(height, 3)}%` }}
                  />
                </div>
              );
            })}
          </div>
          <div className="mt-2 flex justify-between text-xs text-slate-400">
            <span>{from}</span>
            <span>{to}</span>
          </div>
        </section>
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="font-bold text-slate-950">CSV reports</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Invoice and payment exports use the selected period. Customer and
            service exports are current snapshots. Every export is audited.
          </p>
          <div className="mt-5 grid gap-3">
            {(Object.keys(exportLabels) as ReportResource[]).map((resource) => (
              <button
                key={resource}
                type="button"
                disabled={exporting !== null}
                onClick={() => void exportReport(resource)}
                className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3 text-left text-sm font-bold text-slate-800 hover:border-brand-300 hover:bg-brand-50 disabled:opacity-50"
              >
                {exportLabels[resource]}
                <span aria-hidden="true">↓</span>
              </button>
            ))}
          </div>
        </section>
      </div>
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-5 sm:px-6">
          <h2 className="font-bold text-slate-950">
            Recent auditable activity
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            The latest safe audit events; event metadata is intentionally not
            displayed.
          </p>
        </div>
        {dashboard.recentActivity.length ? (
          <DataTable
            caption="Recent auditable activity"
            columns={activityColumns}
            rows={dashboard.recentActivity}
            rowKey={(row) => row.id}
          />
        ) : (
          <p className="p-6 text-sm text-slate-500">
            No audit activity has been recorded yet.
          </p>
        )}
      </section>
    </div>
  );
}

function DateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-1 text-xs font-bold uppercase tracking-wide text-slate-500">
      {label}
      <input
        required
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium normal-case tracking-normal text-slate-900"
      />
    </label>
  );
}

function message(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'The dashboard could not be loaded.';
}
