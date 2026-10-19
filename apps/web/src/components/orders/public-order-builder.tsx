'use client';

import {
  domainNameSchema,
  requestedDomainSchema,
  type PublicProduct,
} from '@webhost-billing/shared';
import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
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
import { fieldClass } from '../customers/customer-fields';
import { formatMinor } from './order-ui';

export function PublicOrderBuilder({
  selection,
}: {
  selection?: CheckoutIntent;
}) {
  const [products, setProducts] = useState<PublicProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [choice, setChoice] = useState<OrderDraft['domainChoice']>('REGISTER');
  const [domain, setDomain] = useState('');
  const [ready, setReady] = useState(false);
  const selectionProductId = selection?.productId;
  const selectionPriceId = selection?.priceId;

  useEffect(() => {
    let active = true;
    void publicGet<PublicProduct[]>('/products/public')
      .then((catalog) => {
        if (!active) return;
        setProducts(catalog);
        const draft =
          selectionProductId && selectionPriceId
            ? readOrderDraft({
                productId: selectionProductId,
                priceId: selectionPriceId,
              })
            : undefined;
        setChoice(draft?.domainChoice ?? 'REGISTER');
        setDomain(draft?.requestedDomain ?? '');
        setReady(false);
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

  const product = products.find((item) => item.id === selection?.productId);
  const price = product?.prices.find(
    (item) => item.id === selection?.priceId && item.amount.currency === 'BDT',
  );
  const parsedDomain = requestedDomainSchema.safeParse(domain);

  function review(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selection || !price || !parsedDomain.success) {
      setError('Enter a valid domain without a protocol or path.');
      return;
    }
    if (
      choice === 'REGISTER' &&
      !domainNameSchema.safeParse(parsedDomain.data).success
    ) {
      setError(
        'Simulated registration currently supports .com and .net domains.',
      );
      return;
    }
    if (
      !saveOrderDraft({
        ...selection,
        domainChoice: choice,
        requestedDomain: parsedDomain.data,
      })
    ) {
      setError(
        'Your browser could not keep this selection. Allow browser storage and try again.',
      );
      return;
    }
    setError('');
    setReady(true);
  }

  return (
    <main id="main-content" className="flex-1 bg-slate-50 px-4 py-10 sm:px-6">
      <div className="mx-auto max-w-5xl">
        <Link
          href="/shared-hosting"
          className="text-sm font-semibold text-brand-700 hover:underline"
        >
          ← Hosting plans
        </Link>
        <p className="mt-8 text-sm font-bold text-brand-700">
          Step 1 of 4 · Choose your domain
        </p>
        <h1 className="mt-2 text-3xl font-bold text-slate-950">
          Set up your hosting order
        </h1>
        <p className="mt-3 text-slate-600">
          Choose your domain and review the plan before signing in or creating
          an account.
        </p>
        {error ? (
          <p
            role="alert"
            className="mt-6 rounded-xl bg-red-50 p-4 text-sm text-red-800"
          >
            {error}
          </p>
        ) : null}
        {!selection || (!loading && !price) ? (
          <div className="mt-8 rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-950">
            <p className="font-semibold">
              This hosting plan or billing period is unavailable.
            </p>
            <Link
              href="/shared-hosting"
              className="mt-4 inline-block underline"
            >
              Choose a hosting plan
            </Link>
          </div>
        ) : loading ? (
          <p className="mt-8">Loading your plan…</p>
        ) : (
          <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_20rem]">
            <form
              onSubmit={review}
              className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
            >
              <h2 className="text-xl font-bold text-slate-950">
                Choose a domain
              </h2>
              <div className="mt-5 grid gap-3">
                <label
                  className={`flex cursor-pointer gap-3 rounded-xl border p-4 ${choice === 'REGISTER' ? 'border-brand-500 bg-brand-50' : 'border-slate-200'}`}
                >
                  <input
                    type="radio"
                    name="domainChoice"
                    checked={choice === 'REGISTER'}
                    onChange={() => {
                      setChoice('REGISTER');
                      setReady(false);
                    }}
                  />
                  <span>
                    <strong className="block">Register a new domain</strong>
                    <span className="text-sm text-slate-600">
                      Simulated .com or .net registration; availability and
                      price are checked later.
                    </span>
                  </span>
                </label>
                <label
                  className={`flex cursor-pointer gap-3 rounded-xl border p-4 ${choice === 'EXISTING' ? 'border-brand-500 bg-brand-50' : 'border-slate-200'}`}
                >
                  <input
                    type="radio"
                    name="domainChoice"
                    checked={choice === 'EXISTING'}
                    onChange={() => {
                      setChoice('EXISTING');
                      setReady(false);
                    }}
                  />
                  <span>
                    <strong className="block">Use an existing domain</strong>
                    <span className="text-sm text-slate-600">
                      I own a domain and will point it to this hosting account.
                    </span>
                  </span>
                </label>
              </div>
              <label className="mt-6 block text-sm font-semibold text-slate-700">
                Domain name
                <input
                  className={fieldClass}
                  value={domain}
                  onChange={(event) => {
                    setDomain(event.target.value);
                    setReady(false);
                  }}
                  placeholder="example.com"
                  autoComplete="off"
                  required
                  maxLength={253}
                />
              </label>
              <button
                type="submit"
                className={`${buttonStyles('primary')} mt-6`}
              >
                Review selection
              </button>
            </form>
            <aside className="h-fit rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-bold text-slate-950">
                Order summary
              </h2>
              <p className="mt-5 font-semibold">{product?.name}</p>
              <p className="text-sm text-slate-600">
                {price?.billingPeriod.toLowerCase()} billing
              </p>
              <p className="mt-4 text-xl font-bold">
                {price
                  ? formatMinor(price.amount.amount, price.amount.currency)
                  : ''}
              </p>
              {price && price.setupFee.amount !== '0' ? (
                <p className="text-sm text-slate-600">
                  Setup fee:{' '}
                  {formatMinor(price.setupFee.amount, price.setupFee.currency)}
                </p>
              ) : null}
              {ready ? (
                <>
                  <p className="mt-5 border-t border-slate-200 pt-4 text-sm">
                    <strong>Domain:</strong>{' '}
                    {parsedDomain.success ? parsedDomain.data : ''}
                  </p>
                  <p className="mt-2 text-xs leading-5 text-slate-600">
                    {choice === 'REGISTER'
                      ? 'Domain availability and registration price will be confirmed at checkout.'
                      : 'Final pricing is confirmed at checkout.'}{' '}
                    No order has been placed.
                  </p>
                  <Link
                    href={`/order/configure?${checkoutIntentQuery(selection)}`}
                    className={`${buttonStyles('primary')} mt-5 w-full`}
                  >
                    Continue to configure
                  </Link>
                  <p className="mt-3 text-xs text-slate-600">
                    Next, review the billing period and hosting details.
                  </p>
                </>
              ) : (
                <p className="mt-5 border-t border-slate-200 pt-4 text-sm text-slate-600">
                  Review your domain to continue.
                </p>
              )}
            </aside>
          </div>
        )}
      </div>
    </main>
  );
}
