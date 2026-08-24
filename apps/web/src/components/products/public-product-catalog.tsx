'use client';

import type {
  HostingBillingPeriod,
  PublicProduct,
} from '@webhost-billing/shared';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { publicGet } from '../../lib/auth-api';
import { Button, buttonStyles } from '../ui/button';
import { DataTable, type DataColumn } from '../ui/data-table';
import { EmptyState, ErrorState, LoadingState } from '../ui/feedback-state';
import { Icon } from '../ui/icon';

const periods: {
  value: HostingBillingPeriod;
  label: string;
  suffix: string;
}[] = [
  { value: 'MONTHLY', label: 'Monthly', suffix: '/ month' },
  { value: 'QUARTERLY', label: 'Quarterly', suffix: '/ quarter' },
  { value: 'ANNUAL', label: 'Yearly', suffix: '/ year' },
];

export function PublicProductCatalog() {
  const [products, setProducts] = useState<PublicProduct[]>([]);
  const [period, setPeriod] = useState<HostingBillingPeriod>('ANNUAL');
  const [currency, setCurrency] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    void publicGet<PublicProduct[]>('/products/public')
      .then((result) => {
        if (!active) return;
        setProducts(result);
        setCurrency(
          result.flatMap((item) => item.prices)[0]?.amount.currency ?? '',
        );
      })
      .catch((caught: unknown) => {
        if (active) {
          setError(
            caught instanceof Error
              ? caught.message
              : 'Plans could not be loaded.',
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const currencies = useMemo(
    () => [
      ...new Set(
        products.flatMap((product) =>
          product.prices.map((price) => price.amount.currency),
        ),
      ),
    ],
    [products],
  );
  const comparisonColumns = useMemo<DataColumn<ComparisonRow>[]>(
    () => [
      {
        key: 'feature',
        header: 'Feature',
        render: (row) => (
          <span className="font-semibold text-slate-950">{row.label}</span>
        ),
      },
      ...products.map((product) => ({
        key: product.id,
        header: product.name,
        render: (row: ComparisonRow) => row.values[product.id] ?? '—',
      })),
    ],
    [products],
  );

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <LoadingState label="Loading hosting plans" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <ErrorState
          description={error}
          action={
            <Button onClick={() => window.location.reload()}>Try again</Button>
          }
        />
      </div>
    );
  }
  if (!products.length) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <EmptyState
          title="Hosting plans are being prepared"
          description="No active public products are currently available."
        />
      </div>
    );
  }

  const rows: ComparisonRow[] = [
    comparisonRow(products, 'Storage', 'storage'),
    comparisonRow(products, 'Websites', 'websites'),
    comparisonRow(products, 'Email', 'email'),
    comparisonRow(products, 'Bandwidth', 'bandwidth'),
  ];
  const suffix = periods.find((item) => item.value === period)?.suffix ?? '';

  return (
    <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
      <div className="mb-8 flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div
          className="flex flex-wrap gap-2"
          role="group"
          aria-label="Billing period"
        >
          {periods.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => setPeriod(item.value)}
              aria-pressed={period === item.value}
              className={`rounded-xl px-4 py-2 text-sm font-bold transition ${period === item.value ? 'bg-slate-950 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
            >
              {item.label}
            </button>
          ))}
        </div>
        {currencies.length > 1 ? (
          <label className="text-sm font-semibold text-slate-700">
            Currency
            <select
              value={currency}
              onChange={(event) => setCurrency(event.target.value)}
              className="ml-3 rounded-xl border border-slate-300 bg-white px-3 py-2"
            >
              {currencies.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
        ) : (
          <span className="text-sm font-semibold text-slate-500">
            Prices in {currency}
          </span>
        )}
      </div>
      <div className="grid gap-5 lg:grid-cols-3">
        {products.map((product, index) => {
          const price = product.prices.find(
            (item) =>
              item.billingPeriod === period &&
              item.amount.currency === currency,
          );
          return (
            <article
              key={product.id}
              className={`flex rounded-3xl border bg-white p-7 ${index === 1 ? 'border-brand-500 shadow-xl shadow-brand-900/10' : 'border-slate-200 shadow-sm'}`}
            >
              <div className="flex w-full flex-col">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-xl font-bold text-slate-950">
                    {product.name}
                  </h2>
                  {index === 1 ? (
                    <span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-bold text-brand-700">
                      Popular
                    </span>
                  ) : null}
                </div>
                <p className="mt-3 min-h-12 text-sm leading-6 text-slate-600">
                  {product.description ??
                    'Focused cPanel hosting for your website.'}
                </p>
                <p className="mt-7 text-3xl font-bold tracking-tight text-slate-950">
                  {price
                    ? formatMinor(price.amount.amount, price.amount.currency)
                    : 'Not available'}
                  {price ? (
                    <span className="text-sm font-medium text-slate-500">
                      {' '}
                      {suffix}
                    </span>
                  ) : null}
                </p>
                {price && price.setupFee.amount !== '0' ? (
                  <p className="mt-2 text-xs font-semibold text-slate-500">
                    Plus a one-time setup fee of{' '}
                    {formatMinor(
                      price.setupFee.amount,
                      price.setupFee.currency,
                    )}
                  </p>
                ) : null}
                <ul className="mt-7 grid gap-3 text-sm text-slate-700">
                  {Object.values(product.features).map(
                    (feature, featureIndex) =>
                      feature ? (
                        <li
                          key={`${feature}-${featureIndex}`}
                          className="flex gap-2"
                        >
                          <Icon
                            name="check"
                            className="mt-0.5 size-4 shrink-0 text-emerald-600"
                          />
                          {feature}
                        </li>
                      ) : null,
                  )}
                </ul>
                {price ? (
                  <Link
                    href={`/portal/checkout?productId=${product.id}&priceId=${price.id}`}
                    className={`${buttonStyles(index === 1 ? 'primary' : 'secondary')} mt-8 w-full`}
                  >
                    Choose {product.name}
                    <Icon name="arrow-right" className="size-4" />
                  </Link>
                ) : (
                  <Button className="mt-8 w-full" variant="secondary" disabled>
                    Unavailable for this period
                  </Button>
                )}
              </div>
            </article>
          );
        })}
      </div>
      <div className="mt-12 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-5 sm:px-7">
          <h2 className="text-lg font-bold text-slate-950">Compare plans</h2>
          <p className="mt-1 text-sm text-slate-600">
            Public limits configured by your hosting administrator.
          </p>
        </div>
        <DataTable
          caption="Comparison of active hosting plans"
          columns={comparisonColumns}
          rows={rows}
          rowKey={(row) => row.label}
        />
      </div>
    </section>
  );
}

interface ComparisonRow {
  label: string;
  values: Record<string, string>;
}

function comparisonRow(
  products: PublicProduct[],
  label: string,
  feature: keyof PublicProduct['features'],
): ComparisonRow {
  return {
    label,
    values: Object.fromEntries(
      products.map((product) => [product.id, product.features[feature] ?? '—']),
    ),
  };
}

function formatMinor(amount: string, currency: string) {
  const fractionDigits =
    new Intl.NumberFormat('en', {
      style: 'currency',
      currency,
    }).resolvedOptions().maximumFractionDigits ?? 2;
  const value = BigInt(amount);
  const divisor = 10n ** BigInt(fractionDigits);
  const whole = value / divisor;
  if (fractionDigits === 0) {
    return `${currency} ${whole.toLocaleString('en-US')}`;
  }
  const fraction = (value % divisor).toString().padStart(fractionDigits, '0');
  return `${currency} ${whole.toLocaleString('en-US')}.${fraction}`;
}
