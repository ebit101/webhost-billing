import type { Metadata } from 'next';
import Link from 'next/link';
import { buttonStyles } from '../../components/ui/button';
import { Icon, type IconName } from '../../components/ui/icon';

export const metadata: Metadata = {
  title: 'Hosting and billing in one clear place',
};

const reasons: { icon: IconName; title: string; description: string }[] = [
  {
    icon: 'product',
    title: 'Plans you can compare',
    description:
      'See the active billing periods, prices, and hosting limits before you begin checkout.',
  },
  {
    icon: 'invoice',
    title: 'Billing you can follow',
    description:
      'Orders, invoices, payments, and hosting activation stay visible as separate steps.',
  },
  {
    icon: 'support',
    title: 'Support with context',
    description:
      'Signed-in customers can keep support conversations connected to their hosting account.',
  },
];

export default function HomePage() {
  return (
    <main id="main-content" className="flex-1">
      <section className="overflow-hidden border-b border-slate-200 bg-slate-950 text-white">
        <div className="mx-auto grid max-w-7xl gap-12 px-4 py-20 sm:px-6 lg:grid-cols-[1.15fr_0.85fr] lg:px-8 lg:py-28">
          <div className="max-w-3xl">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-300">
              Independent hosting, clear billing
            </p>
            <h1 className="mt-5 text-4xl font-bold tracking-tight sm:text-6xl">
              Hosting that keeps service and billing in view.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-300">
              Compare available hosting plans, create your customer account, and
              follow each invoice and service from one focused portal.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link href="/hosting" className={buttonStyles('primary')}>
                Explore hosting plans
                <Icon name="arrow-right" className="size-4" />
              </Link>
              <Link
                href="/register"
                className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-600 px-4 text-sm font-semibold text-white transition hover:border-slate-400 hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                Create customer account
              </Link>
            </div>
            <p className="mt-5 text-sm text-slate-400">
              Already a customer?{' '}
              <Link
                href="/login"
                className="font-semibold text-cyan-300 underline-offset-4 hover:underline"
              >
                Sign in to your portal
              </Link>
              .
            </p>
          </div>
          <div className="self-end rounded-3xl border border-white/10 bg-white/5 p-7 shadow-2xl shadow-black/30 backdrop-blur">
            <p className="text-sm font-bold text-cyan-300">A clearer path</p>
            <ol className="mt-5 grid gap-5">
              {[
                'Choose an available plan and billing period.',
                'Create or sign in to your customer account.',
                'Confirm the server-calculated order before any payment.',
              ].map((step, index) => (
                <li key={step} className="flex gap-4 text-sm text-slate-200">
                  <span className="grid size-7 shrink-0 place-items-center rounded-full bg-cyan-300 font-bold text-slate-950">
                    {index + 1}
                  </span>
                  <span className="pt-1 leading-6">{step}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      <section id="why-us" className="scroll-mt-24 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
          <div className="max-w-2xl">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-700">
              Why Webhost Billing
            </p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-slate-950">
              The essential hosting journey, without hidden steps.
            </h2>
          </div>
          <div className="mt-9 grid gap-5 md:grid-cols-3">
            {reasons.map((reason) => (
              <article
                key={reason.title}
                className="rounded-2xl border border-slate-200 bg-slate-50 p-6"
              >
                <span className="grid size-11 place-items-center rounded-xl bg-brand-100 text-brand-800">
                  <Icon name={reason.icon} className="size-5" />
                </span>
                <h3 className="mt-5 text-lg font-bold text-slate-950">
                  {reason.title}
                </h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {reason.description}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="support" className="scroll-mt-24 bg-slate-100">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-14 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
          <div className="max-w-2xl">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-700">
              Customer support
            </p>
            <h2 className="mt-3 text-2xl font-bold tracking-tight text-slate-950">
              Support starts with your account context.
            </h2>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Sign in to open or review a support conversation linked to your
              customer account and hosting service.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-3">
            <Link href="/login" className={buttonStyles('primary')}>
              Sign in for support
            </Link>
            <Link href="/register" className={buttonStyles('secondary')}>
              Create an account
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
