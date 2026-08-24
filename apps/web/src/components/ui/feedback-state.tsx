import type { ReactNode } from 'react';
import { Icon, type IconName } from './icon';

function StateFrame({
  icon,
  title,
  description,
  action,
  tone = 'neutral',
}: {
  icon: IconName;
  title: string;
  description: string;
  action?: ReactNode;
  tone?: 'neutral' | 'danger';
}) {
  return (
    <section
      className="grid min-h-56 place-items-center rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center"
      aria-live={tone === 'danger' ? 'assertive' : 'polite'}
    >
      <div className="max-w-md">
        <span
          className={`mx-auto grid size-12 place-items-center rounded-2xl ${
            tone === 'danger'
              ? 'bg-red-50 text-red-700'
              : 'bg-brand-50 text-brand-700'
          }`}
        >
          <Icon name={icon} className="size-6" />
        </span>
        <h2 className="mt-4 text-base font-bold text-slate-950">{title}</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
        {action ? <div className="mt-5">{action}</div> : null}
      </div>
    </section>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <StateFrame
      icon="product"
      title={title}
      description={description}
      action={action}
    />
  );
}

export function ErrorState({
  title = 'Something went wrong',
  description,
  action,
}: {
  title?: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <StateFrame
      icon="alert"
      title={title}
      description={description}
      action={action}
      tone="danger"
    />
  );
}

export function LoadingState({
  label = 'Loading content',
}: {
  label?: string;
}) {
  return (
    <div
      role="status"
      aria-label={label}
      className="grid gap-5 rounded-2xl border border-slate-200 bg-white p-6"
    >
      <span className="sr-only">{label}</span>
      <div className="h-6 w-40 animate-pulse rounded bg-slate-200 motion-reduce:animate-none" />
      <div className="grid gap-3">
        <div className="h-12 animate-pulse rounded-xl bg-slate-100 motion-reduce:animate-none" />
        <div className="h-12 animate-pulse rounded-xl bg-slate-100 motion-reduce:animate-none" />
        <div className="h-12 animate-pulse rounded-xl bg-slate-100 motion-reduce:animate-none" />
      </div>
    </div>
  );
}
