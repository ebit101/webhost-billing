import type { Metadata } from 'next';
import Link from 'next/link';
import { PublicProductCatalog } from '../../components/products/public-product-catalog';
import { buttonStyles } from '../../components/ui/button';
import { Icon } from '../../components/ui/icon';
import { StatusBadge } from '../../components/ui/status-badge';

export const metadata: Metadata = {
  title: 'Simple hosting that stays personal',
};

const features = [
  {
    icon: 'server' as const,
    title: 'Managed cPanel hosting',
    description:
      'A practical home for business websites, with clear limits and a team that knows the server.',
  },
  {
    icon: 'shield' as const,
    title: 'Billing you can understand',
    description:
      'Straightforward renewal dates, invoice history, and service status in one focused portal.',
  },
  {
    icon: 'support' as const,
    title: 'Human support',
    description:
      'Talk to the same small hosting team instead of navigating a global support maze.',
  },
] as const;

export default function HomePage() {
  return (
    <main id="main-content" className="flex-1">
      <section className="relative isolate overflow-hidden bg-slate-950 text-white">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_78%_18%,rgba(34,211,238,0.22),transparent_32%),radial-gradient(circle_at_8%_70%,rgba(14,116,144,0.25),transparent_30%)]" />
        <div className="absolute -right-28 top-20 -z-10 size-96 rounded-full border border-cyan-300/10" />
        <div className="absolute -right-8 top-40 -z-10 size-64 rounded-full border border-cyan-300/10" />
        <div className="mx-auto grid max-w-7xl gap-14 px-4 py-20 sm:px-6 sm:py-28 lg:grid-cols-[1.08fr_0.92fr] lg:items-center lg:px-8 lg:py-32">
          <div>
            <StatusBadge tone="info">Built for growing businesses</StatusBadge>
            <h1 className="mt-7 max-w-3xl text-4xl font-bold tracking-[-0.045em] text-balance sm:text-6xl lg:text-7xl">
              Hosting that feels calm, clear, and cared for.
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-8 text-slate-300 sm:text-lg">
              Reliable cPanel hosting with simple billing, a focused customer
              portal, and help from people who know your account.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/hosting"
                className={`${buttonStyles('primary')} min-w-40 bg-cyan-400 text-slate-950 hover:bg-cyan-300`}
              >
                Explore plans
                <Icon name="arrow-right" className="size-4" />
              </Link>
              <Link
                href="/login"
                className={`${buttonStyles('secondary')} min-w-40 border-white/20 bg-white/8 text-white hover:bg-white/15`}
              >
                Customer sign in
              </Link>
            </div>
            <dl className="mt-12 grid max-w-2xl grid-cols-3 gap-4 border-t border-white/10 pt-7">
              <div>
                <dt className="text-xs text-slate-400">Support reply</dt>
                <dd className="mt-1 text-lg font-bold">Under 2h</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-400">Daily backups</dt>
                <dd className="mt-1 text-lg font-bold">Included</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-400">Local billing</dt>
                <dd className="mt-1 text-lg font-bold">BDT</dd>
              </div>
            </dl>
          </div>

          <div className="relative mx-auto w-full max-w-xl">
            <div className="rounded-[2rem] border border-white/15 bg-white/8 p-3 shadow-2xl shadow-cyan-950/50 backdrop-blur">
              <div className="rounded-[1.35rem] bg-white p-5 text-slate-950 sm:p-7">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.14em] text-brand-700">
                      Customer portal
                    </p>
                    <p className="mt-1 text-xl font-bold">
                      Good morning, Amina
                    </p>
                  </div>
                  <span className="grid size-11 place-items-center rounded-2xl bg-slate-950 text-sm font-bold text-white">
                    AR
                  </span>
                </div>
                <div className="mt-7 grid grid-cols-2 gap-3">
                  <div className="rounded-2xl bg-slate-950 p-5 text-white">
                    <Icon name="server" className="size-5 text-cyan-300" />
                    <p className="mt-7 text-3xl font-bold">02</p>
                    <p className="mt-1 text-xs text-slate-400">
                      Active services
                    </p>
                  </div>
                  <div className="rounded-2xl bg-brand-50 p-5">
                    <Icon name="invoice" className="size-5 text-brand-700" />
                    <p className="mt-7 text-2xl font-bold">৳1,200</p>
                    <p className="mt-1 text-xs text-slate-500">Next renewal</p>
                  </div>
                </div>
                <div className="mt-3 rounded-2xl border border-slate-200 p-4">
                  <div className="flex items-center gap-3">
                    <span className="grid size-10 place-items-center rounded-xl bg-emerald-50 text-emerald-700">
                      <Icon name="check" className="size-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold">
                        amina-studio.example.test
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        Business Hosting · Active
                      </p>
                    </div>
                    <Icon
                      name="arrow-right"
                      className="size-4 text-slate-400"
                    />
                  </div>
                </div>
              </div>
            </div>
            <div className="absolute -bottom-5 -left-4 rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 shadow-xl sm:-left-10">
              <div className="flex items-center gap-3">
                <span className="grid size-8 place-items-center rounded-xl bg-emerald-400/15 text-emerald-300">
                  <Icon name="shield" className="size-4" />
                </span>
                <div>
                  <p className="text-xs font-bold text-white">
                    Account protected
                  </p>
                  <p className="mt-0.5 text-[0.68rem] text-slate-400">
                    Secure session active
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section
        id="why-us"
        className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-28"
      >
        <div className="max-w-2xl">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-700">
            Less software, better service
          </p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
            Everything you need to keep your website online.
          </h2>
          <p className="mt-4 leading-7 text-slate-600">
            No reseller maze, surprise add-ons, or oversized control panel—just
            the hosting essentials and a clean view of your account.
          </p>
        </div>
        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {features.map((feature) => (
            <article
              key={feature.title}
              className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm"
            >
              <span className="grid size-12 place-items-center rounded-2xl bg-brand-50 text-brand-700">
                <Icon name={feature.icon} className="size-6" />
              </span>
              <h3 className="mt-6 text-lg font-bold text-slate-950">
                {feature.title}
              </h3>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                {feature.description}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className="bg-slate-50 py-20 lg:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-700">
                Simple plans
              </p>
              <h2 className="mt-3 text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
                Start small. Move up when you need to.
              </h2>
            </div>
            <Link
              href="/hosting"
              className="inline-flex items-center gap-2 text-sm font-bold text-brand-700 hover:text-brand-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600"
            >
              Compare every plan <Icon name="arrow-right" className="size-4" />
            </Link>
          </div>
        </div>
        <PublicProductCatalog />
      </section>

      <section
        id="support"
        className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-28"
      >
        <div className="overflow-hidden rounded-[2rem] bg-brand-700 px-6 py-12 text-white sm:px-10 lg:flex lg:items-center lg:justify-between lg:px-14">
          <div className="max-w-2xl">
            <p className="text-sm font-bold text-cyan-200">
              Questions before you move?
            </p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight">
              Tell us what your website needs.
            </h2>
            <p className="mt-4 leading-7 text-cyan-50/85">
              We will help you choose a sensible plan without selling capacity
              you will not use.
            </p>
          </div>
          <Link
            href="/register"
            className={`${buttonStyles('secondary')} mt-8 bg-white text-brand-800 lg:mt-0`}
          >
            Start a conversation <Icon name="arrow-right" className="size-4" />
          </Link>
        </div>
      </section>
    </main>
  );
}
