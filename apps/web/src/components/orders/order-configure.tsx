'use client';

import type { PublicProduct } from '@webhost-billing/shared';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { publicGet } from '../../lib/auth-api';
import {
  checkoutIntentQuery,
  type CheckoutIntent,
} from '../../lib/checkout-intent';
import {
  readOrderDraft,
  saveOrderDraft,
  type OrderDraft,
} from '../../lib/order-draft';
import { buttonStyles } from '../ui/button';
import { formatMinor } from './order-ui';

export function OrderConfigure({ selection }: { selection?: CheckoutIntent }) {
  const router = useRouter();
  const [catalog, setCatalog] = useState<PublicProduct[]>([]);
  const [draft, setDraft] = useState<OrderDraft>();
  const [priceId, setPriceId] = useState(selection?.priceId ?? '');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const selectionProductId = selection?.productId;
  const selectionPriceId = selection?.priceId;

  useEffect(() => {
    let active = true;
    void publicGet<PublicProduct[]>('/products/public')
      .then((products) => {
        if (!active) return;
        setCatalog(products);
        setPriceId(selectionPriceId ?? '');
        setDraft(
          selectionProductId && selectionPriceId
            ? readOrderDraft({
                productId: selectionProductId,
                priceId: selectionPriceId,
              })
            : undefined,
        );
      })
      .catch(() => {
        if (active) setError('Hosting plans could not be loaded.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [selectionPriceId, selectionProductId]);

  const product = catalog.find((item) => item.id === selection?.productId);
  const selectedPrice = product?.prices.find(
    (item) => item.id === priceId && item.amount.currency === 'BDT',
  );
  const originalPrice = product?.prices.find(
    (item) => item.id === selection?.priceId,
  );
  const ready =
    !loading && !error && draft && product && originalPrice && selectedPrice;

  function continueToReview() {
    if (!selection || !draft || !selectedPrice) return;
    const next = { productId: selection.productId, priceId: selectedPrice.id };
    if (!saveOrderDraft({ ...draft, ...next })) {
      setError(
        'Your browser could not keep this selection. Allow browser storage and try again.',
      );
      return;
    }
    router.push(`/order/review?${checkoutIntentQuery(next)}`);
  }

  return (
    <main
      id="main-content"
      className="min-h-screen bg-slate-50 px-4 py-10 sm:px-6"
    >
      <div className="mx-auto max-w-5xl">
        <Link
          href={
            selection
              ? `/order?${checkoutIntentQuery(selection)}`
              : '/shared-hosting'
          }
          className="text-sm font-semibold text-brand-700 hover:underline"
        >
          ← Choose a domain
        </Link>
        <p className="mt-8 text-sm font-bold text-brand-700">
          Step 2 of 4 · Configure
        </p>
        <h1 className="mt-2 text-3xl font-bold text-slate-950">
          Configure your hosting
        </h1>
        <p className="mt-3 text-slate-600">
          Review the included features and choose a billing period.
        </p>
        {loading ? (
          <p className="mt-8">Loading hosting plan…</p>
        ) : error ? (
          <p
            role="alert"
            className="mt-8 rounded-xl bg-red-50 p-5 text-red-800"
          >
            {error}
          </p>
        ) : !ready ? (
          <div
            role="alert"
            className="mt-8 rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-950"
          >
            <p className="font-semibold">
              Your selection is unavailable or has expired.
            </p>
            <Link
              href="/shared-hosting"
              className={`${buttonStyles('secondary')} mt-4`}
            >
              Choose a hosting plan
            </Link>
          </div>
        ) : (
          <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_20rem]">
            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-xl font-bold text-slate-950">
                {product.name}
              </h2>
              <p className="mt-2 text-sm text-slate-600">
                {product.description}
              </p>
              <dl className="mt-6 grid gap-4 border-t border-slate-200 pt-5 text-sm sm:grid-cols-2">
                {Object.entries(product.features).map(([feature, value]) => (
                  <div key={feature}>
                    <dt className="font-semibold capitalize text-slate-600">
                      {feature}
                    </dt>
                    <dd className="mt-1 text-slate-950">{value}</dd>
                  </div>
                ))}
              </dl>
              <label className="mt-7 block text-sm font-semibold text-slate-700">
                Billing period
                <select
                  value={priceId}
                  onChange={(event) => setPriceId(event.target.value)}
                  className="mt-2 h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-slate-900"
                >
                  {product.prices
                    .filter((item) => item.amount.currency === 'BDT')
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.billingPeriod.toLowerCase()} —{' '}
                        {formatMinor(item.amount.amount, item.amount.currency)}
                      </option>
                    ))}
                </select>
              </label>
              <p className="mt-6 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
                No optional add-ons are available for this plan.
              </p>
            </section>
            <aside className="h-fit rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-bold text-slate-950">
                Order summary
              </h2>
              <p className="mt-5 font-semibold text-slate-950">
                {product.name}
              </p>
              <p className="mt-1 text-sm text-slate-600">
                {draft.requestedDomain}
              </p>
              <p className="mt-4 text-xl font-bold text-slate-950">
                {formatMinor(
                  selectedPrice.amount.amount,
                  selectedPrice.amount.currency,
                )}
              </p>
              <p className="mt-1 text-sm text-slate-600">
                {selectedPrice.billingPeriod.toLowerCase()} billing
              </p>
              {selectedPrice.setupFee.amount !== '0' ? (
                <p className="mt-3 text-sm text-slate-600">
                  Setup fee:{' '}
                  {formatMinor(
                    selectedPrice.setupFee.amount,
                    selectedPrice.setupFee.currency,
                  )}
                </p>
              ) : null}
              {draft.domainChoice === 'REGISTER' ? (
                <p className="mt-4 text-xs text-amber-900">
                  Domain registration is quoted after account access.
                </p>
              ) : null}
              <button
                type="button"
                onClick={continueToReview}
                className={`${buttonStyles('primary')} mt-6 w-full`}
              >
                Continue to review
              </button>
            </aside>
          </div>
        )}
      </div>
    </main>
  );
}
