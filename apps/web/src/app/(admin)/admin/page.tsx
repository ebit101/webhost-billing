import type { Metadata } from 'next';
import Link from 'next/link';
import { DemoActions } from '../../../components/dashboard/demo-actions';
import { MetricCard } from '../../../components/dashboard/metric-card';
import { DataTable, type DataColumn } from '../../../components/ui/data-table';
import { Icon } from '../../../components/ui/icon';
import { PageHeader } from '../../../components/ui/page-header';
import {
  StatusBadge,
  type StatusTone,
} from '../../../components/ui/status-badge';

export const metadata: Metadata = { title: 'Admin dashboard' };

interface ActivityRow {
  id: string;
  subject: string;
  reference: string;
  kind: string;
  status: string;
  tone: StatusTone;
  amount: string;
  time: string;
}

const activity: ActivityRow[] = [
  {
    id: 'A-101',
    subject: 'Amina Rahman',
    reference: 'INV-2026-0142',
    kind: 'Invoice issued',
    status: 'Unpaid',
    tone: 'warning',
    amount: '৳1,200',
    time: '12 min ago',
  },
  {
    id: 'A-102',
    subject: 'Fictional Foods Ltd.',
    reference: 'ORD-2026-0088',
    kind: 'Order received',
    status: 'Pending',
    tone: 'info',
    amount: '৳2,400',
    time: '37 min ago',
  },
  {
    id: 'A-103',
    subject: 'Rafiq Design',
    reference: 'PAY-2026-0214',
    kind: 'Payment recorded',
    status: 'Completed',
    tone: 'success',
    amount: '৳4,800',
    time: '1 hr ago',
  },
  {
    id: 'A-104',
    subject: 'Nila Commerce',
    reference: 'SVC-1192',
    kind: 'Service review',
    status: 'Attention',
    tone: 'danger',
    amount: '—',
    time: '2 hrs ago',
  },
];

const columns: DataColumn<ActivityRow>[] = [
  {
    key: 'subject',
    header: 'Customer',
    render: (row) => (
      <div>
        <p className="font-semibold text-slate-950">{row.subject}</p>
        <p className="mt-1 text-xs text-slate-500">{row.reference}</p>
      </div>
    ),
  },
  { key: 'kind', header: 'Activity', render: (row) => row.kind },
  {
    key: 'status',
    header: 'Status',
    render: (row) => <StatusBadge tone={row.tone}>{row.status}</StatusBadge>,
  },
  {
    key: 'amount',
    header: 'Amount',
    align: 'right',
    render: (row) => (
      <span className="font-semibold text-slate-950">{row.amount}</span>
    ),
  },
  { key: 'time', header: 'Time', align: 'right', render: (row) => row.time },
];

const activityFeed = [
  [
    'payment',
    'Manual payment recorded',
    'PAY-2026-0214 · Rafiq Design',
    '1 hr',
  ],
  ['users', 'Customer profile updated', 'CUST-1047 · Nila Commerce', '2 hrs'],
  [
    'server',
    'Service status reviewed',
    'SVC-1192 · No automatic action',
    '2 hrs',
  ],
] as const;

export default function AdminDashboard() {
  return (
    <div className="grid gap-8">
      <PageHeader
        eyebrow="Monday, 24 August"
        title="Business overview"
        description="A fictional operations snapshot for the private hosting business."
        actions={<DemoActions mode="admin" />}
      />

      <section
        aria-label="Business summary"
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        <MetricCard
          label="Active services"
          value="128"
          icon="server"
          tone="brand"
          detail={
            <span>
              <strong className="text-emerald-700">+6</strong> this month
            </span>
          }
        />
        <MetricCard
          label="Pending orders"
          value="4"
          icon="order"
          tone="amber"
          detail="Two await manual review"
        />
        <MetricCard
          label="Overdue invoices"
          value="7"
          icon="invoice"
          tone="amber"
          detail="৳12,600 outstanding"
        />
        <MetricCard
          label="Collected this month"
          value="৳84,200"
          icon="payment"
          tone="emerald"
          detail={
            <span>
              <strong className="text-emerald-700">+8.4%</strong> from July
            </span>
          }
        />
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.7fr)_minmax(20rem,0.72fr)]">
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between gap-4 border-b border-slate-200 px-5 py-5 sm:px-6">
            <div>
              <h2 className="font-bold text-slate-950">
                Recent billing activity
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Fictional operational events
              </p>
            </div>
            <Link
              href="/admin/invoices"
              className="text-sm font-bold text-brand-700 hover:text-brand-900"
            >
              View invoices
            </Link>
          </div>
          <DataTable
            caption="Recent fictional billing activity"
            columns={columns}
            rows={activity}
            rowKey={(row) => row.id}
          />
        </section>

        <aside className="grid content-start gap-6">
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-bold text-slate-950">Revenue pulse</h2>
                <p className="mt-1 text-xs text-slate-500">
                  Last six fictional months
                </p>
              </div>
              <StatusBadge tone="success">Healthy</StatusBadge>
            </div>
            <div
              className="mt-7 flex h-40 items-end gap-2"
              aria-label="Illustrative revenue bars from March to August"
            >
              {[42, 58, 48, 70, 64, 88].map((height, index) => (
                <div
                  key={height + index}
                  className="flex flex-1 flex-col items-center gap-2"
                >
                  <div
                    className={`w-full rounded-t-lg ${index === 5 ? 'bg-brand-500' : 'bg-brand-100'}`}
                    style={{ height: `${height}%` }}
                  />
                  <span className="text-[0.65rem] text-slate-400">
                    {['Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug'][index]}
                  </span>
                </div>
              ))}
            </div>
          </section>
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-slate-950">
                Recent audit activity
              </h2>
              <Link
                href="/admin/automation"
                className="text-xs font-bold text-brand-700"
              >
                View log
              </Link>
            </div>
            <ol className="mt-5 grid gap-5">
              {activityFeed.map(([icon, title, detail, time]) => (
                <li key={title} className="flex gap-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-700">
                    <Icon name={icon} className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-900">
                      {title}
                    </p>
                    <p className="mt-1 truncate text-xs text-slate-500">
                      {detail}
                    </p>
                  </div>
                  <span className="text-xs text-slate-400">{time}</span>
                </li>
              ))}
            </ol>
          </section>
        </aside>
      </div>
    </div>
  );
}
