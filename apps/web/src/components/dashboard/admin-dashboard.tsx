'use client';
import { formatCalendarDate } from '@webhost-billing/shared';
import { sentenceCaseLabel } from '@webhost-billing/shared';

import type { DashboardResponse } from '@webhost-billing/shared';
import { useMemo } from 'react';
import { formatMinor } from '../orders/order-ui';
import { DataTable, type DataColumn } from '../ui/data-table';
import { PageHeader } from '../ui/page-header';
import { StatusBadge } from '../ui/status-badge';
import {
  ReportPeriodForm,
  useDashboardReport,
} from './dashboard-report-period';
import { MetricCard } from './metric-card';
import { ReportCsvDownloads } from './report-csv-downloads';
import { RevenueReportChart } from './revenue-report-chart';

type Activity = DashboardResponse['recentActivity'][number];
export function AdminDashboard() {
  const report = useDashboardReport();
  const { dashboard, error, loading, load } = report;

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
          <StatusBadge tone="neutral">
            {sentenceCaseLabel(row.entityType)}
          </StatusBadge>
        ),
      },
      { key: 'actor', header: 'Actor', render: (row) => row.actor },
      {
        key: 'time',
        header: 'Time',
        align: 'right',
        render: (row) =>
          new Intl.DateTimeFormat('en-GB', {
            dateStyle: 'short',
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
  return (
    <div className="grid gap-8">
      <PageHeader
        eyebrow={`Updated ${new Intl.DateTimeFormat('en-GB', { dateStyle: 'short', timeStyle: 'short', timeZone: dashboard.timeZone }).format(new Date(dashboard.generatedAt))}`}
        title="Business overview"
        description={`Live operational and financial data in ${dashboard.currency}, using ${dashboard.timeZone} business dates.`}
      />
      <ReportPeriodForm {...report} />
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
          href="/admin/payments"
          value={formatMinor(
            metrics.collectedRevenue.amount,
            dashboard.currency,
          )}
          icon="payment"
          tone="emerald"
          detail={`${formatCalendarDate(dashboard.period.from)} to ${formatCalendarDate(dashboard.period.to)} · charges less refunds and reversals`}
        />
        <MetricCard
          label="Outstanding balance"
          href="/admin/invoices"
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
          href="/admin/invoices?status=OVERDUE"
          value={formatMinor(metrics.overdueBalance.amount, dashboard.currency)}
          icon="alert"
          tone="amber"
          detail="Current overdue invoices only"
        />
        <MetricCard
          label="Active services"
          href="/admin/services?status=ACTIVE"
          value={String(metrics.activeServices)}
          icon="server"
          tone="brand"
          detail="Current service state"
        />
        <MetricCard
          label="Suspended services"
          href="/admin/services?status=SUSPENDED"
          value={String(metrics.suspendedServices)}
          icon="server"
          tone="amber"
          detail="Current service state"
        />
        <MetricCard
          label="Pending orders"
          href="/admin/orders"
          value={String(metrics.pendingOrders)}
          icon="order"
          tone="brand"
          detail="All non-terminal order workflow states"
        />
        <MetricCard
          label="Open tickets"
          href="/admin/support"
          value={String(metrics.openTickets)}
          icon="support"
          tone="slate"
          detail="Open and waiting support tickets"
        />
        <MetricCard
          label="Failed automation jobs"
          href="/admin/automation"
          value={String(metrics.failedAutomationJobs)}
          icon="activity"
          tone="amber"
          detail="Failed or partly successful runs in the selected period"
        />
      </section>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(19rem,0.7fr)]">
        <RevenueReportChart dashboard={dashboard} />
        <ReportCsvDownloads period={dashboard.period} />
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
