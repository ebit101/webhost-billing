import type { ReactNode } from 'react';
import Link from 'next/link';
import { Icon, type IconName } from '../ui/icon';

export function MetricCard({
  label,
  value,
  detail,
  icon,
  tone = 'brand',
  href,
}: {
  label: string;
  value: string;
  detail: ReactNode;
  icon: IconName;
  tone?: 'brand' | 'emerald' | 'amber' | 'slate';
  href: string;
}) {
  const colors = {
    brand: 'bg-brand-50 text-brand-700',
    emerald: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-700',
    slate: 'bg-slate-100 text-slate-700',
  } as const;

  return (
    <Link
      href={href}
      className="block rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-brand-400 hover:bg-brand-50/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-slate-500">{label}</p>
          <p className="mt-2 text-2xl font-bold tracking-tight text-slate-950">
            {value}
          </p>
        </div>
        <span
          className={`grid size-11 place-items-center rounded-2xl ${colors[tone]}`}
        >
          <Icon name={icon} className="size-5" />
        </span>
      </div>
      <div className="mt-4 text-xs leading-5 text-slate-500">{detail}</div>
      <span className="mt-3 block text-xs font-semibold text-brand-700">
        View details →
      </span>
    </Link>
  );
}
