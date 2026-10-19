'use client';

import type { PublicProduct } from '@webhost-billing/shared';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { LoginForm } from '../auth/login-form';
import { RegisterForm } from '../auth/register-form';
import { publicGet } from '../../lib/auth-api';
import {
  adminOrderEntryHref,
  checkoutIntentQuery,
  type CheckoutIntent,
} from '../../lib/checkout-intent';
import { readOrderDraft, type OrderDraft } from '../../lib/order-draft';
import { buttonStyles } from '../ui/button';
import { formatHostingSubtotal, formatMinor } from './order-ui';

export function CheckoutPreview({
  selection,
  audience,
}: {
  selection?: CheckoutIntent;
  audience: 'guest' | 'admin';
}) {
  const [catalog, setCatalog] = useState<PublicProduct[]>([]);
  const [draft, setDraft] = useState<OrderDraft>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [accountMode, setAccountMode] = useState<'register' | 'login'>(
    'register',
  );
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

  return (
    <main
      id="main-content"
      className="min-h-screen bg-slate-50 px-4 py-10 sm:px-6"
    >
      <div className="mx-auto max-w-5xl">
        <Link
          href={
            selection
              ? `/order/review?${checkoutIntentQuery(selection)}`
              : '/shared-hosting'
          }
          className="text-sm font-semibold text-brand-700 hover:underline"
        >
          ← Review cart
        </Link>
        <p className="mt-8 text-sm font-bold text-brand-700">
          Step 4 of 4 · Checkout
        </p>
        <h1 className="mt-2 text-3xl font-bold text-slate-950">Checkout</h1>
        <p className="mt-3 text-slate-600">
          Review your hosting plan and domain before creating an unpaid invoice.
        </p>
        {loading ? (
          <p className="mt-8">Loading checkout…</p>
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
            <p className="mt-2 text-sm">
              Choose a hosting plan and domain again. No order has been placed.
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
                Order details
              </h2>
              <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2">
                <div>
                  <dt className="font-semibold text-slate-600">Hosting plan</dt>
                  <dd className="mt-1 font-bold text-slate-950">
                    {product.name}
                  </dd>
                </div>
                <div>
                  <dt className="font-semibold text-slate-600">
                    Billing period
                  </dt>
                  <dd className="mt-1 text-slate-950">
                    {price.billingPeriod.toLowerCase()}
                  </dd>
                </div>
                <div>
                  <dt className="font-semibold text-slate-600">Domain</dt>
                  <dd className="mt-1 font-bold text-slate-950">
                    {draft.requestedDomain}
                  </dd>
                </div>
                <div>
                  <dt className="font-semibold text-slate-600">
                    Domain choice
                  </dt>
                  <dd className="mt-1 text-slate-950">
                    {draft.domainChoice === 'REGISTER'
                      ? 'New registration'
                      : 'Existing domain'}
                  </dd>
                </div>
              </dl>
              {draft.domainChoice === 'REGISTER' ? (
                <p className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
                  Domain availability, registration price and registrant consent
                  are confirmed after customer account access.
                </p>
              ) : null}
              <div className="mt-7 border-t border-slate-200 pt-6">
                <h2 className="text-lg font-bold text-slate-950">
                  Customer details
                </h2>
                {audience === 'admin' ? (
                  <>
                    <p className="mt-2 text-sm text-slate-600">
                      You are signed in as an administrator. Choose the customer
                      in the administrator order form to create their unpaid
                      invoice.
                    </p>
                    {draft.domainChoice === 'REGISTER' ? (
                      <p className="mt-3 text-sm text-amber-900">
                        A combined hosting and new-domain invoice requires a
                        customer account. The administrator form offers separate
                        hosting and domain orders.
                      </p>
                    ) : null}
                    <Link
                      href={adminOrderEntryHref(selection)}
                      className={`${buttonStyles('primary')} mt-5`}
                    >
                      Continue to administrator order
                    </Link>
                  </>
                ) : (
                  <>
                    <p className="mt-2 text-sm text-slate-600">
                      Enter your account details to continue. Your selection
                      will be carried forward; no order is placed during account
                      creation or sign-in.
                    </p>
                    <div
                      className="mt-5 flex flex-wrap gap-2"
                      role="group"
                      aria-label="Account access"
                    >
                      <button
                        type="button"
                        aria-pressed={accountMode === 'register'}
                        onClick={() => setAccountMode('register')}
                        className={
                          accountMode === 'register'
                            ? buttonStyles('primary')
                            : buttonStyles('secondary')
                        }
                      >
                        New customer
                      </button>
                      <button
                        type="button"
                        aria-pressed={accountMode === 'login'}
                        onClick={() => setAccountMode('login')}
                        className={
                          accountMode === 'login'
                            ? buttonStyles('primary')
                            : buttonStyles('secondary')
                        }
                      >
                        Existing customer
                      </button>
                    </div>
                    <div className="mt-6">
                      {accountMode === 'register' ? (
                        <RegisterForm
                          checkoutIntent={selection}
                          onChooseSignIn={() => setAccountMode('login')}
                        />
                      ) : (
                        <LoginForm
                          checkoutIntent={selection}
                          onChooseRegister={() => setAccountMode('register')}
                        />
                      )}
                    </div>
                  </>
                )}
              </div>
            </section>
            <aside className="h-fit rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-bold text-slate-950">
                Price summary
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
              <p className="mt-5 text-xs leading-5 text-slate-600">
                {draft.domainChoice === 'REGISTER'
                  ? 'Domain registration is priced after the availability check. '
                  : ''}
                The server confirms the final total before creating an unpaid
                invoice. No payment or order has been made.
              </p>
            </aside>
          </div>
        )}
      </div>
    </main>
  );
}
