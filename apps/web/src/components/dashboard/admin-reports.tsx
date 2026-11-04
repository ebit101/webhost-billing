'use client';

import { formatCalendarDate } from '@webhost-billing/shared';
import Link from 'next/link';
import { formatMinor } from '../orders/order-ui';
import { Button } from '../ui/button';
import { ErrorState, LoadingState } from '../ui/feedback-state';
import { PageHeader } from '../ui/page-header';
import {
  ReportPeriodForm,
  useDashboardReport,
} from './dashboard-report-period';
import { InvoiceAgingReport } from './invoice-aging-report';
import { MetricCard } from './metric-card';
import { ReportCsvDownloads } from './report-csv-downloads';
import { RevenueReportChart } from './revenue-report-chart';

const tabs = [
  { id: 'overview', label: 'Overview', href: '/admin/reports' },
  { id: 'billing', label: 'Billing', href: '/admin/reports?tab=billing' },
  { id: 'exports', label: 'Exports', href: '/admin/reports?tab=exports' },
] as const;

export function AdminReports({ tab }: { tab: (typeof tabs)[number]['id'] }) {
  return (
    <div className="grid min-w-0 gap-6">
      <PageHeader
        eyebrow="Administration"
        title="Reports"
        description="Review collected revenue, overdue invoices and CSV exports."
      />
      <nav
        aria-label="Report sections"
        className="flex flex-wrap gap-1.5 border-b border-slate-200 pb-2"
      >
        {tabs.map(({ id, label, href }) => (
          <Link
            key={id}
            href={href}
            aria-current={tab === id ? 'page' : undefined}
            className={`rounded-lg px-3 py-2 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600 ${tab === id ? 'bg-brand-600 text-white' : 'text-slate-700 hover:bg-slate-100'}`}
          >
            {label}
          </Link>
        ))}
      </nav>
      {tab === 'billing' ? (
        <InvoiceAgingReport />
      ) : (
        <PeriodReports showExports={tab === 'exports'} />
      )}
    </div>
  );
}

function PeriodReports({ showExports }: { showExports: boolean }) {
  const report = useDashboardReport();
  const { dashboard, error, loading, load } = report;
  if (!dashboard && loading)
    return <LoadingState label="Loading report period" />;
  return (
    <>
      {dashboard ? <ReportPeriodForm {...report} /> : null}
      {error ? (
        <ErrorState
          title="Report period could not be loaded"
          description={error}
          action={
            dashboard ? undefined : (
              <Button onClick={() => void load()}>Try again</Button>
            )
          }
        />
      ) : null}
      {dashboard && showExports ? (
        <ReportCsvDownloads period={dashboard.period} />
      ) : null}
      {dashboard && !showExports ? (
        <>
          <section
            aria-label="Reporting summary"
            className="grid gap-4 sm:grid-cols-2"
          >
            <MetricCard
              label="Collected revenue"
              href="/admin/payments"
              value={formatMinor(
                dashboard.metrics.collectedRevenue.amount,
                dashboard.currency,
              )}
              icon="payment"
              tone="emerald"
              detail={`${formatCalendarDate(dashboard.period.from)} to ${formatCalendarDate(dashboard.period.to)}`}
            />
            <MetricCard
              label="Overdue balance"
              href="/admin/reports?tab=billing"
              value={formatMinor(
                dashboard.metrics.overdueBalance.amount,
                dashboard.currency,
              )}
              icon="invoice"
              tone="amber"
              detail="Current overdue invoice balances"
            />
          </section>
          <RevenueReportChart dashboard={dashboard} />
        </>
      ) : null}
    </>
  );
}
