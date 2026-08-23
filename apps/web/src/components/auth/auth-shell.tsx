import Link from 'next/link';
import type { ReactNode } from 'react';

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
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-12 text-slate-950">
      <section className="w-full max-w-xl overflow-hidden rounded-3xl border border-white/10 bg-white shadow-2xl shadow-cyan-950/40">
        <div className="bg-gradient-to-br from-cyan-500 to-blue-700 px-7 py-7 text-white sm:px-10">
          <Link href="/" className="text-sm font-semibold text-cyan-50">
            Webhost Billing
          </Link>
          <h1 className="mt-5 text-3xl font-bold tracking-tight">{title}</h1>
          <p className="mt-2 max-w-lg text-sm leading-6 text-cyan-50">
            {description}
          </p>
        </div>
        <div className="px-7 py-8 sm:px-10">{children}</div>
      </section>
    </main>
  );
}
