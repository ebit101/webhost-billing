import Link from 'next/link';
import type { ReactNode } from 'react';
import { Brand } from '../layout/brand';
import { Icon } from '../ui/icon';

export function AuthShell({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <main
      id="main-content"
      className="relative grid min-h-screen place-items-center overflow-hidden bg-slate-950 px-4 py-10 text-slate-950 sm:px-6"
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_18%,rgba(34,211,238,0.18),transparent_28%),radial-gradient(circle_at_90%_82%,rgba(14,116,144,0.22),transparent_32%)]" />
      <section className="relative grid w-full max-w-5xl overflow-hidden rounded-[2rem] border border-white/10 bg-white shadow-2xl shadow-black/35 lg:grid-cols-[0.82fr_1.18fr]">
        <div className="hidden bg-brand-700 p-9 text-white lg:flex lg:flex-col lg:justify-between">
          <Brand inverse />
          <div className="py-16">
            <span className="grid size-12 place-items-center rounded-2xl bg-white/10 text-cyan-200">
              <Icon name="shield" className="size-6" />
            </span>
            <p className="mt-7 text-2xl font-bold leading-tight">
              Your hosting and billing in one calm workspace.
            </p>
            <ul className="mt-7 grid gap-4 text-sm text-cyan-50/85">
              {[
                'Secure, revocable sessions',
                'Clear service and invoice status',
                'Direct support from your hosting team',
              ].map((item) => (
                <li key={item} className="flex items-center gap-3">
                  <Icon name="check" className="size-4 text-cyan-200" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <p className="text-xs text-cyan-100/65">Private hosting workspace</p>
        </div>
        <div className="px-6 py-7 sm:px-10 sm:py-10 lg:px-12">
          <div className="mb-9 flex items-center justify-between lg:hidden">
            <Brand />
            <Link
              href="/"
              className="rounded-lg text-sm font-semibold text-slate-500 hover:text-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600"
            >
              Back home
            </Link>
          </div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-700">
            Secure account access
          </p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-950">
            {title}
          </h1>
          <p className="mt-3 max-w-lg text-sm leading-6 text-slate-600">
            {description}
          </p>
          <div className="mt-8">{children}</div>
          <p className="mt-9 text-xs leading-5 text-slate-500">
            By continuing, you are accessing a private hosting account. Never
            share your password or verification link.
          </p>
        </div>
      </section>
    </main>
  );
}
