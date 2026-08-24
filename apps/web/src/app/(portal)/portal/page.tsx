import type { Metadata } from 'next';
import Link from 'next/link';
import { DemoActions } from '../../../components/dashboard/demo-actions';
import { MetricCard } from '../../../components/dashboard/metric-card';
import { buttonStyles } from '../../../components/ui/button';
import { DataTable, type DataColumn } from '../../../components/ui/data-table';
import { EmptyState } from '../../../components/ui/feedback-state';
import { Icon } from '../../../components/ui/icon';
import { PageHeader } from '../../../components/ui/page-header';
import { StatusBadge } from '../../../components/ui/status-badge';

export const metadata: Metadata = { title: 'Portal overview' };

interface ServiceRow {
  id: string;
  domain: string;
  plan: string;
  status: 'Active' | 'Pending';
  renews: string;
}

const services: ServiceRow[] = [
  {
    id: 'SVC-1042',
    domain: 'amina-studio.example.test',
    plan: 'Business Hosting',
    status: 'Active',
    renews: '12 Sep 2026',
  },
  {
    id: 'SVC-1184',
    domain: 'portfolio.example.test',
    plan: 'Starter Hosting',
    status: 'Active',
    renews: '04 Dec 2026',
  },
];

const columns: DataColumn<ServiceRow>[] = [
  {
    key: 'service',
    header: 'Service',
    render: (row) => (
      <div>
        <p className="font-semibold text-slate-950">{row.domain}</p>
        <p className="mt-1 text-xs text-slate-500">{row.id}</p>
      </div>
    ),
  },
  { key: 'plan', header: 'Plan', render: (row) => row.plan },
  {
    key: 'status',
    header: 'Status',
    render: (row) => (
      <StatusBadge tone={row.status === 'Active' ? 'success' : 'warning'}>
        {row.status}
      </StatusBadge>
    ),
  },
  { key: 'renews', header: 'Renews', render: (row) => row.renews },
  {
    key: 'action',
    header: '',
    align: 'right',
    render: () => (
      <Link
        href="/portal/services"
        className="font-semibold text-brand-700 hover:text-brand-900"
      >
        View
      </Link>
    ),
  },
];

export default function PortalDashboard() {
  return (
    <div className="grid gap-8">
      <PageHeader
        eyebrow="Customer portal"
        title="Good morning, Amina"
        description="Here is a clear view of your fictional hosting services, invoices, and support activity."
        actions={<DemoActions mode="portal" />}
      />

      <section
        aria-label="Account summary"
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        <MetricCard
          label="Active services"
          value="2"
          icon="server"
          tone="brand"
          detail={
            <span className="font-medium text-emerald-700">
              All services are online
            </span>
          }
        />
        <MetricCard
          label="Amount due"
          value="৳1,200"
          icon="invoice"
          tone="amber"
          detail="One invoice due 12 September"
        />
        <MetricCard
          label="Open tickets"
          value="0"
          icon="support"
          tone="emerald"
          detail="No response is waiting"
        />
        <MetricCard
          label="Next renewal"
          value="19 days"
          icon="activity"
          tone="slate"
          detail="Business Hosting"
        />
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.65fr)_minmax(19rem,0.7fr)]">
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between gap-4 border-b border-slate-200 px-5 py-5 sm:px-6">
            <div>
              <h2 className="font-bold text-slate-950">Your services</h2>
              <p className="mt-1 text-sm text-slate-500">
                Fictional account inventory
              </p>
            </div>
            <Link
              href="/portal/services"
              className="text-sm font-bold text-brand-700 hover:text-brand-900"
            >
              View all
            </Link>
          </div>
          <DataTable
            caption="Fictional hosting services"
            columns={columns}
            rows={services}
            rowKey={(row) => row.id}
          />
        </section>

        <aside className="grid content-start gap-5">
          <section className="rounded-2xl bg-slate-950 p-6 text-white shadow-lg shadow-slate-950/10">
            <span className="grid size-11 place-items-center rounded-2xl bg-cyan-400/15 text-cyan-300">
              <Icon name="invoice" className="size-5" />
            </span>
            <p className="mt-6 text-xs font-bold uppercase tracking-[0.14em] text-slate-400">
              Next invoice
            </p>
            <p className="mt-2 text-3xl font-bold">৳1,200</p>
            <p className="mt-2 text-sm text-slate-400">
              INV-2026-0142 · Due 12 Sep
            </p>
            <Link
              href="/portal/invoices"
              className={`${buttonStyles('secondary')} mt-6 w-full border-white/15 bg-white/10 text-white hover:bg-white/15`}
            >
              Review invoice <Icon name="arrow-right" className="size-4" />
            </Link>
          </section>
          <div className="[&>section]:min-h-0 [&>section]:p-6">
            <EmptyState
              title="No open tickets"
              description="You are all caught up. Start a ticket whenever you need help."
            />
          </div>
        </aside>
      </div>
    </div>
  );
}
