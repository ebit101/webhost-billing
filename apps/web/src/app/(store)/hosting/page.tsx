import type { Metadata } from 'next';
import { PublicProductCatalog } from '../../../components/products/public-product-catalog';

export const metadata: Metadata = { title: 'Hosting plans' };

export default function HostingPage() {
  return (
    <main id="main-content" className="flex-1 bg-slate-50">
      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-16 text-center sm:px-6 lg:px-8 lg:py-20">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-700">
            Hosting catalogue
          </p>
          <h1 className="mx-auto mt-4 max-w-3xl text-4xl font-bold tracking-tight text-slate-950 sm:text-5xl">
            Clear hosting plans with room to grow.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl leading-7 text-slate-600">
            Compare current public products and billing periods. Your selected
            product and price will carry into checkout.
          </p>
        </div>
      </section>
      <PublicProductCatalog />
    </main>
  );
}
