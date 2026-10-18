import Link from 'next/link';
import { PublicProductCatalog } from './public-product-catalog';
import { buttonStyles } from '../ui/button';
import { Icon } from '../ui/icon';

const steps = [
  {
    number: '01',
    title: 'Choose a hosting plan',
    description: 'Compare the current packages and select a billing period.',
  },
  {
    number: '02',
    title: 'Add your domain',
    description: 'Tell us which domain the hosting account will use.',
  },
  {
    number: '03',
    title: 'Review your invoice',
    description:
      'Place an unpaid order and follow payment and activation in your portal.',
  },
] as const;

export function HostingLanding() {
  return (
    <main id="main-content" className="flex-1 bg-slate-50">
      <section className="relative overflow-hidden bg-slate-950 text-white">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-20 -top-32 size-96 rounded-full bg-cyan-500/20 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute bottom-0 left-1/3 size-72 rounded-full bg-brand-600/25 blur-3xl"
        />
        <div className="relative mx-auto grid max-w-7xl gap-12 px-4 py-16 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:px-8 lg:py-24">
          <div>
            <p className="text-sm font-bold text-cyan-300">Shared hosting</p>
            <h1 className="mt-4 max-w-3xl text-4xl font-bold tracking-tight sm:text-5xl">
              A home for your website, with billing you can follow.
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-8 text-slate-300">
              Compare available hosting packages, choose your domain, and see
              your order and invoice in one customer portal.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="#plans" className={buttonStyles('primary')}>
                Explore plans <Icon name="arrow-right" className="size-4" />
              </Link>
              <Link
                href="/login"
                className="inline-flex min-h-11 items-center rounded-xl border border-slate-600 px-4 text-sm font-semibold text-white transition hover:border-slate-400 hover:bg-white/5"
              >
                Already a customer? Sign in
              </Link>
            </div>
          </div>
          <div className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-2xl shadow-black/20 backdrop-blur sm:p-8">
            <p className="text-sm font-semibold text-cyan-300">
              How ordering works
            </p>
            <ol className="mt-6 grid gap-6">
              {steps.map((step) => (
                <li key={step.number} className="flex gap-4">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-cyan-300 font-bold text-slate-950">
                    {step.number}
                  </span>
                  <div>
                    <h2 className="font-semibold text-white">{step.title}</h2>
                    <p className="mt-1 text-sm leading-6 text-slate-300">
                      {step.description}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>
      <section id="plans" className="scroll-mt-24">
        <div className="mx-auto max-w-7xl px-4 pt-14 sm:px-6 lg:px-8">
          <p className="text-sm font-bold text-brand-700">Hosting packages</p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">
            Find the right size for your site.
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
            Prices and limits below come from the active product catalogue. Your
            selected price is checked again when you place the order.
          </p>
        </div>
        <PublicProductCatalog />
      </section>
      <section className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-12 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div>
            <h2 className="text-xl font-bold text-slate-950">
              Need help choosing?
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              You can discuss a package with our team before placing an order.
            </p>
          </div>
          <Link href="/register" className={buttonStyles('secondary')}>
            Create a customer account
          </Link>
        </div>
      </section>
    </main>
  );
}
