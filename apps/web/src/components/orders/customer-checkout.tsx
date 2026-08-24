'use client';

import type {
  OrderCreationResult,
  PublicProduct,
} from '@webhost-billing/shared';
import Link from 'next/link';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { authMutation, publicGet } from '../../lib/auth-api';
import { Card, Field, fieldClass } from '../customers/customer-fields';
import { Button, buttonStyles } from '../ui/button';
import { LoadingState } from '../ui/feedback-state';
import { Icon } from '../ui/icon';
import { PageHeader } from '../ui/page-header';
import { StatusBadge } from '../ui/status-badge';
import { errorMessage, formatMinor } from './order-ui';

export function CustomerCheckout({
  initialProductId,
  initialPriceId,
}: {
  initialProductId?: string;
  initialPriceId?: string;
}) {
  const [products, setProducts] = useState<PublicProduct[]>([]);
  const [productId, setProductId] = useState(initialProductId ?? '');
  const [priceId, setPriceId] = useState(initialPriceId ?? '');
  const [result, setResult] = useState<OrderCreationResult>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const submissionKey = useRef('');

  useEffect(() => {
    let active = true;
    void publicGet<PublicProduct[]>('/products/public')
      .then((catalog) => {
        if (!active) return;
        setProducts(catalog);
        const selected =
          catalog.find((product) => product.id === initialProductId) ??
          catalog[0];
        setProductId(selected?.id ?? '');
        setPriceId(
          selected?.prices.find((price) => price.id === initialPriceId)?.id ??
            selected?.prices[0]?.id ??
            '',
        );
      })
      .catch((caught: unknown) => {
        if (active) setError(errorMessage(caught));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [initialPriceId, initialProductId]);

  const product = products.find((item) => item.id === productId);
  const price = product?.prices.find((item) => item.id === priceId);

  async function checkout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    if (!submissionKey.current) submissionKey.current = crypto.randomUUID();
    setSaving(true);
    setError('');
    try {
      const created = await authMutation<OrderCreationResult>(
        '/orders/checkout',
        'POST',
        {
          productId,
          priceId,
          requestedDomain: String(values.get('requestedDomain')),
          submissionKey: submissionKey.current,
        },
      );
      setResult(created);
      submissionKey.current = '';
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <LoadingState label="Loading secure checkout" />;
  if (result) {
    return (
      <div className="mx-auto grid max-w-3xl gap-6">
        <PageHeader
          eyebrow="Order received"
          title={result.order.orderNumber}
          description="Your unpaid invoice was created. Payment confirmation and hosting provisioning will be tracked separately."
        />
        <Card title="Order summary">
          <dl className="grid gap-4 sm:grid-cols-2">
            <Summary
              label="Plan"
              value={result.order.items[0]?.productName ?? ''}
            />
            <Summary
              label="Domain"
              value={result.order.items[0]?.requestedDomain ?? ''}
            />
            <Summary
              label="Invoice"
              value={result.order.invoice.invoiceNumber}
            />
            <Summary
              label="Amount due"
              value={formatMinor(
                result.order.invoice.balanceDue.amount,
                result.order.invoice.balanceDue.currency,
              )}
            />
          </dl>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <StatusBadge tone="warning">AWAITING PAYMENT</StatusBadge>
            <Link href="/portal/orders" className={buttonStyles('secondary')}>
              View my orders
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto grid max-w-5xl gap-7">
      <PageHeader
        eyebrow="Customer checkout"
        title="Create your hosting order"
        description="Choose an active plan and domain. All pricing is revalidated and calculated by the server."
      />
      {error ? (
        <div
          role="alert"
          className="rounded-xl bg-red-50 p-4 text-sm font-semibold text-red-800"
        >
          {error}{' '}
          {error.toLowerCase().includes('authentication') ? (
            <Link href="/login" className="underline">
              Sign in to continue.
            </Link>
          ) : null}
        </div>
      ) : null}
      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <Card title="Hosting details">
          <form onSubmit={checkout} className="grid gap-5">
            <label className="block text-sm font-semibold text-slate-700">
              Product
              <select
                value={productId}
                onChange={(event) => {
                  const next = products.find(
                    (item) => item.id === event.target.value,
                  );
                  setProductId(event.target.value);
                  setPriceId(next?.prices[0]?.id ?? '');
                }}
                className={fieldClass}
                required
              >
                {products.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-semibold text-slate-700">
              Billing period
              <select
                value={priceId}
                onChange={(event) => setPriceId(event.target.value)}
                className={fieldClass}
                required
              >
                {product?.prices.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.billingPeriod.toLowerCase()} —{' '}
                    {formatMinor(item.amount.amount, item.amount.currency)}
                  </option>
                ))}
              </select>
            </label>
            <Field
              label="Domain"
              name="requestedDomain"
              placeholder="example.com"
              required
            />
            <Button type="submit" disabled={saving || !price}>
              {saving ? 'Placing order…' : 'Place order'}
              <Icon name="arrow-right" className="size-4" />
            </Button>
          </form>
        </Card>
        <Card
          title="Price summary"
          description="The API calculates and confirms the order total from the selected price."
        >
          {price ? (
            <dl className="grid gap-3 text-sm">
              <PriceRow
                label="Plan"
                amount={price.amount.amount}
                currency={price.amount.currency}
              />
              <PriceRow
                label="Setup fee"
                amount={price.setupFee.amount}
                currency={price.setupFee.currency}
              />
              <p className="mt-2 border-t border-slate-200 pt-4 text-xs font-semibold leading-5 text-slate-500">
                Your confirmed total will appear after the server creates the
                order and unpaid invoice.
              </p>
            </dl>
          ) : (
            <p className="text-sm text-slate-500">Select an available price.</p>
          )}
        </Card>
      </div>
    </div>
  );
}

function PriceRow({
  label,
  amount,
  currency,
}: {
  label: string;
  amount: string;
  currency: string;
}) {
  return (
    <div className="flex justify-between">
      <dt className="text-slate-600">{label}</dt>
      <dd className="font-semibold text-slate-900">
        {formatMinor(amount, currency)}
      </dd>
    </div>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-bold uppercase tracking-wide text-slate-500">
        {label}
      </dt>
      <dd className="mt-1 font-semibold text-slate-950">{value}</dd>
    </div>
  );
}
