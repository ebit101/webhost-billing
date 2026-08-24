import type { Metadata } from 'next';
import Link from 'next/link';
import { buttonStyles } from '../../../components/ui/button';
import { DataTable, type DataColumn } from '../../../components/ui/data-table';
import { Icon } from '../../../components/ui/icon';

export const metadata: Metadata = { title: 'Hosting plans' };

interface PlanFeature {
  label: string;
  starter: string;
  business: string;
  scale: string;
}

const comparison: PlanFeature[] = [
  { label: 'Websites', starter: '1', business: '5', scale: '10' },
  { label: 'SSD storage', starter: '10 GB', business: '30 GB', scale: '75 GB' },
  {
    label: 'Email accounts',
    starter: '10',
    business: '50',
    scale: 'Unlimited',
  },
  {
    label: 'Daily backups',
    starter: 'Included',
    business: 'Included',
    scale: 'Included',
  },
];

const columns: DataColumn<PlanFeature>[] = [
  {
    key: 'feature',
    header: 'Feature',
    render: (row) => (
      <span className="font-semibold text-slate-950">{row.label}</span>
    ),
  },
  { key: 'starter', header: 'Starter', render: (row) => row.starter },
  { key: 'business', header: 'Business', render: (row) => row.business },
  { key: 'scale', header: 'Scale', render: (row) => row.scale },
];

export default function HostingPage() {
  return (
    <main id="main-content" className="flex-1 bg-slate-50">
      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-16 text-center sm:px-6 lg:px-8 lg:py-20">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-700">
            Fictional plan catalogue
          </p>
          <h1 className="mx-auto mt-4 max-w-3xl text-4xl font-bold tracking-tight text-slate-950 sm:text-5xl">
            Clear hosting plans with room to grow.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl leading-7 text-slate-600">
            All plans include cPanel access, SSL, daily backups, and personal
            support. Prices shown are fictional layout data.
          </p>
        </div>
      </section>
      <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="grid gap-5 lg:grid-cols-3">
          {[
            ['Starter', '1,200', 'For a portfolio or focused company website.'],
            ['Business', '2,400', 'For growing teams with several websites.'],
            ['Scale', '4,800', 'For larger sites that need more headroom.'],
          ].map(([name, price, description], index) => (
            <article
              key={name}
              className={`rounded-3xl border bg-white p-7 ${index === 1 ? 'border-brand-500 shadow-xl shadow-brand-900/10' : 'border-slate-200 shadow-sm'}`}
            >
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-slate-950">{name}</h2>
                {index === 1 ? (
                  <span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-bold text-brand-700">
                    Recommended
                  </span>
                ) : null}
              </div>
              <p className="mt-3 min-h-12 text-sm leading-6 text-slate-600">
                {description}
              </p>
              <p className="mt-7 text-4xl font-bold tracking-tight text-slate-950">
                ৳{price}
                <span className="text-sm font-medium text-slate-500">
                  {' '}
                  / year
                </span>
              </p>
              <Link
                href="/register"
                className={`${buttonStyles(index === 1 ? 'primary' : 'secondary')} mt-7 w-full`}
              >
                Choose {name}
                <Icon name="arrow-right" className="size-4" />
              </Link>
            </article>
          ))}
        </div>
        <div className="mt-12 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-5 py-5 sm:px-7">
            <h2 className="text-lg font-bold text-slate-950">Compare plans</h2>
            <p className="mt-1 text-sm text-slate-600">
              The essentials at a glance.
            </p>
          </div>
          <DataTable
            caption="Comparison of fictional hosting plans"
            columns={columns}
            rows={comparison}
            rowKey={(row) => row.label}
          />
        </div>
      </section>
    </main>
  );
}
