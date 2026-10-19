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
  clearOrderDraft,
  readOrderDraft,
  type OrderDraft,
} from '../../lib/order-draft';
import { buttonStyles } from '../ui/button';
import { formatHostingSubtotal, formatMinor } from './order-ui';

export function OrderReview({ selection }: { selection?: CheckoutIntent }) {
  const router = useRouter();
  const [catalog, setCatalog] = useState<PublicProduct[]>([]);
  const [draft, setDraft] = useState<OrderDraft>();
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
  const price = product?.prices.find(
    (item) => item.id === selection?.priceId && item.amount.currency === 'BDT',
  );
  const ready = !loading && !error && draft && product && price;
  const query = selection ? checkoutIntentQuery(selection) : '';

  return (
    <main
      id="main-content"
      className="min-h-screen bg-slate-50 px-4 py-10 sm:px-6"
    >
      <div className="mx-auto max-w-5xl">
        <Link
          href={query ? `/order/configure?${query}` : '/shared-hosting'}
          className="text-sm font-semibold text-brand-700 hover:underline"
        >
          ← Configure hosting
        </Link>
        <p className="mt-8 text-sm font-bold text-brand-700">
          Step 3 of 4 · Review cart
        </p>
        <h1 className="mt-2 text-3xl font-bold text-slate-950">
          Review your cart
        </h1>
        <p className="mt-3 text-slate-600">
          Check your hosting plan, billing period and domain before checkout.
        </p>
        {loading ? (
          <p className="mt-8">Loading cart…</p>
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
                Hosting and domain
              </h2>
              <div className="mt-5 border-t border-slate-200 pt-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="font-semibold text-slate-950">
                      {product.name}
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      {price.billingPeriod.toLowerCase()} billing ·{' '}
                      {draft.domainChoice === 'REGISTER'
                        ? 'New domain registration'
                        : 'Existing domain'}
                    </p>
                    <p className="mt-2 text-sm font-semibold text-brand-700">
                      {draft.requestedDomain}
                    </p>
                  </div>
                  <p className="font-semibold text-slate-950">
                    {formatMinor(price.amount.amount, price.amount.currency)}
                  </p>
                </div>
                <div className="mt-5 flex flex-wrap gap-4 text-sm">
                  <Link
                    href={`/order/configure?${query}`}
                    className="font-semibold text-brand-700 underline"
                  >
                    Edit plan
                  </Link>
                  <Link
                    href={`/order?${query}`}
                    className="font-semibold text-brand-700 underline"
                  >
                    Edit domain
                  </Link>
                  <button
                    type="button"
                    onClick={() => {
                      clearOrderDraft();
                      router.push('/shared-hosting');
                    }}
                    className="font-semibold text-slate-600 underline"
                  >
                    Remove and choose another plan
                  </button>
                </div>
              </div>
            </section>
            <aside className="h-fit rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-bold text-slate-950">
                Order summary
              </h2>
              <div className="mt-5 flex justify-between text-sm">
                <span>Hosting</span>
                <strong>
                  {formatMinor(price.amount.amount, price.amount.currency)}
                </strong>
              </div>
              {price.setupFee.amount !== '0' ? (
                <div className="mt-3 flex justify-between text-sm">
                  <span>Setup fee</span>
                  <strong>
                    {formatMinor(
                      price.setupFee.amount,
                      price.setupFee.currency,
                    )}
                  </strong>
                </div>
              ) : null}
              {formatHostingSubtotal(price) ? (
                <div className="mt-5 flex justify-between border-t border-slate-200 pt-4 font-bold text-slate-950">
                  <span>
                    {draft.domainChoice === 'REGISTER'
                      ? 'Hosting subtotal'
                      : 'Estimated total'}
                  </span>
                  <strong>{formatHostingSubtotal(price)}</strong>
                </div>
              ) : null}
              {draft.domainChoice === 'REGISTER' ? (
                <p className="mt-5 text-xs leading-5 text-amber-900">
                  Domain availability and registration price are confirmed after
                  customer account access.
                </p>
              ) : null}
              <p className="mt-5 text-xs leading-5 text-slate-600">
                The final total is confirmed by the server. No order or payment
                has been made.
              </p>
              <Link
                href={`/checkout?${query}`}
                className={`${buttonStyles('primary')} mt-5 w-full`}
              >
                Continue to checkout
              </Link>
            </aside>
          </div>
        )}
      </div>
    </main>
  );
}
