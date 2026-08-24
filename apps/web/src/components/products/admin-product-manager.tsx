'use client';

import type { Product } from '@webhost-billing/shared';
import { useEffect, useState, type FormEvent } from 'react';
import { authMutation, authenticatedGet } from '../../lib/auth-api';
import {
  Card,
  Field,
  fieldClass,
  valuesFromForm,
} from '../customers/customer-fields';
import { Button } from '../ui/button';
import { ConfirmationDialog } from '../ui/confirmation-dialog';
import { EmptyState, LoadingState } from '../ui/feedback-state';
import { Icon } from '../ui/icon';
import { PageHeader } from '../ui/page-header';
import { StatusBadge } from '../ui/status-badge';

const nullableFields = [
  'description',
  'hostingPackageIdentifier',
  'storageFeature',
  'websiteFeature',
  'emailFeature',
  'bandwidthFeature',
] as const;

export function AdminProductManager() {
  const [products, setProducts] = useState<Product[]>([]);
  const [selected, setSelected] = useState<Product>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);

  useEffect(() => {
    let active = true;
    void authenticatedGet<Product[]>('/products')
      .then((result) => {
        if (!active) return;
        setProducts(result);
        setSelected(result[0]);
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
  }, []);

  async function reload() {
    await Promise.resolve();
    setLoading(true);
    try {
      const result = await authenticatedGet<Product[]>('/products');
      setProducts(result);
      setSelected(
        (current) =>
          result.find((item) => item.id === current?.id) ?? result[0],
      );
      setError('');
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }

  async function createProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const raw = valuesFromForm(form);
    const amount = String(raw.amount ?? '');
    const body: Record<string, unknown> = {
      slug: raw.slug,
      name: raw.name,
      publicVisible: new FormData(form).has('publicVisible'),
      displayOrder: Number(raw.displayOrder),
    };
    for (const field of nullableFields) {
      const value = raw[field];
      if (typeof value === 'string' && value) body[field] = value;
    }
    if (amount) {
      body.prices = [
        {
          billingPeriod: raw.billingPeriod,
          currency: raw.currency,
          amount,
          setupFee: String(raw.setupFee || '0'),
        },
      ];
    }
    setSaving(true);
    setError('');
    try {
      const created = await authMutation<Product>('/products', 'POST', body);
      setProducts((current) => [...current, created].sort(byDisplayOrder));
      setSelected(created);
      setCreateOpen(false);
      form.reset();
      setNotice('Draft product created. Review it before activation.');
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setSaving(false);
    }
  }

  async function updateProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const form = event.currentTarget;
    const raw = valuesFromForm(form);
    const body: Record<string, unknown> = {
      slug: raw.slug,
      name: raw.name,
      publicVisible: new FormData(form).has('publicVisible'),
      displayOrder: Number(raw.displayOrder),
    };
    for (const field of nullableFields) {
      const value = raw[field];
      body[field] = typeof value === 'string' && value ? value : null;
    }
    await mutate(
      `/products/${selected.id}`,
      'PATCH',
      body,
      'Product details saved.',
    );
  }

  async function definePrice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const form = event.currentTarget;
    const raw = valuesFromForm(form);
    await mutate(
      `/products/${selected.id}/prices`,
      'POST',
      {
        billingPeriod: raw.billingPeriod,
        currency: raw.currency,
        amount: raw.amount,
        setupFee: raw.setupFee || '0',
      },
      'Price saved as a new version.',
    );
    form.reset();
  }

  async function changeStatus(status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED') {
    if (!selected) return;
    await mutate(
      `/products/${selected.id}/status`,
      'PATCH',
      { status },
      status === 'ACTIVE'
        ? 'Product activated.'
        : status === 'ARCHIVED'
          ? 'Product archived without deleting its history.'
          : 'Product moved to draft.',
    );
    setArchiveOpen(false);
  }

  async function mutate(
    path: string,
    method: 'POST' | 'PATCH',
    body: Record<string, unknown>,
    success: string,
  ) {
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const updated = await authMutation<Product>(path, method, body);
      setSelected(updated);
      setProducts((current) =>
        current
          .map((item) => (item.id === updated.id ? updated : item))
          .sort(byDisplayOrder),
      );
      setNotice(success);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <LoadingState label="Loading products" />;

  return (
    <div className="grid gap-7">
      <PageHeader
        eyebrow="Administrator"
        title="Products & pricing"
        description="Maintain the focused hosting catalogue, public ordering, cPanel package mapping, features, and versioned prices."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Icon name="plus" className="size-4" /> Create product
          </Button>
        }
      />
      {error ? (
        <p
          role="alert"
          className="rounded-xl bg-red-50 p-4 text-sm font-semibold text-red-800"
        >
          {error}
        </p>
      ) : null}
      {notice ? (
        <p
          role="status"
          className="rounded-xl bg-emerald-50 p-4 text-sm font-semibold text-emerald-800"
        >
          {notice}
        </p>
      ) : null}
      {products.length === 0 ? (
        <EmptyState
          title="No products yet"
          description="Create the first hosting product as a draft."
          action={
            <Button onClick={() => setCreateOpen(true)}>Create product</Button>
          }
        />
      ) : (
        <div className="grid gap-6 xl:grid-cols-[22rem_1fr]">
          <Card
            title="Catalogue order"
            description="Select a product to manage it."
          >
            <div className="grid gap-2">
              {products.map((product) => (
                <button
                  key={product.id}
                  type="button"
                  onClick={() => {
                    setSelected(product);
                    setError('');
                    setNotice('');
                  }}
                  className={`rounded-xl border p-4 text-left transition ${selected?.id === product.id ? 'border-brand-500 bg-brand-50' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-bold text-slate-950">
                      {product.name}
                    </span>
                    <span className="text-xs font-bold text-slate-400">
                      #{product.displayOrder}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <StatusBadge
                      tone={
                        product.status === 'ACTIVE'
                          ? 'success'
                          : product.status === 'ARCHIVED'
                            ? 'danger'
                            : 'warning'
                      }
                    >
                      {product.status}
                    </StatusBadge>
                    {product.publicVisible ? (
                      <StatusBadge tone="info">Public</StatusBadge>
                    ) : null}
                  </div>
                </button>
              ))}
            </div>
          </Card>
          {selected ? (
            <div className="grid gap-6">
              <ProductEditor
                product={selected}
                saving={saving}
                onSubmit={updateProduct}
                onActivate={() => void changeStatus('ACTIVE')}
                onDraft={() => void changeStatus('DRAFT')}
                onArchive={() => setArchiveOpen(true)}
              />
              <div className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
                <PriceForm
                  saving={saving}
                  archived={selected.status === 'ARCHIVED'}
                  onSubmit={definePrice}
                />
                <PriceHistory product={selected} />
              </div>
            </div>
          ) : null}
        </div>
      )}
      {createOpen ? (
        <CreateProductDialog
          saving={saving}
          error={error}
          onClose={() => setCreateOpen(false)}
          onSubmit={createProduct}
        />
      ) : null}
      <ConfirmationDialog
        open={archiveOpen}
        destructive
        title="Archive this product?"
        description="It will disappear from the public catalogue, but historical orders, invoices, and services will keep their product references and snapshots."
        confirmLabel="Archive product"
        busy={saving}
        onClose={() => setArchiveOpen(false)}
        onConfirm={() => void changeStatus('ARCHIVED')}
      />
      {error && products.length === 0 ? (
        <Button onClick={() => void reload()}>Try again</Button>
      ) : null}
    </div>
  );
}

function ProductEditor({
  product,
  saving,
  onSubmit,
  onActivate,
  onDraft,
  onArchive,
}: {
  product: Product;
  saving: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onActivate: () => void;
  onDraft: () => void;
  onArchive: () => void;
}) {
  return (
    <Card
      title="Product details"
      description="Public visibility only takes effect while the product is active."
    >
      <form
        key={product.updatedAt}
        className="grid gap-4 sm:grid-cols-2"
        onSubmit={onSubmit}
      >
        <Field label="Name" name="name" required defaultValue={product.name} />
        <Field label="Slug" name="slug" required defaultValue={product.slug} />
        <div className="sm:col-span-2">
          <Field
            label="Description"
            name="description"
            defaultValue={product.description ?? ''}
          />
        </div>
        <Field
          label="Display order"
          name="displayOrder"
          type="number"
          required
          defaultValue={String(product.displayOrder)}
        />
        <Field
          label="cPanel package identifier"
          name="hostingPackageIdentifier"
          defaultValue={product.hostingPackageIdentifier ?? ''}
        />
        <Field
          label="Storage display"
          name="storageFeature"
          defaultValue={product.storageFeature ?? ''}
          placeholder="10 GB SSD"
        />
        <Field
          label="Websites display"
          name="websiteFeature"
          defaultValue={product.websiteFeature ?? ''}
          placeholder="1 website"
        />
        <Field
          label="Email display"
          name="emailFeature"
          defaultValue={product.emailFeature ?? ''}
          placeholder="10 email accounts"
        />
        <Field
          label="Bandwidth display"
          name="bandwidthFeature"
          defaultValue={product.bandwidthFeature ?? ''}
          placeholder="100 GB monthly"
        />
        <label className="flex items-center gap-3 rounded-xl border border-slate-200 p-4 text-sm font-semibold text-slate-700 sm:col-span-2">
          <input
            className="size-4 accent-brand-600"
            type="checkbox"
            name="publicVisible"
            defaultChecked={product.publicVisible}
          />
          Show this active product in the public catalogue
        </label>
        <div className="flex flex-wrap justify-between gap-3 sm:col-span-2">
          <div className="flex gap-2">
            {product.status !== 'ACTIVE' ? (
              <Button type="button" disabled={saving} onClick={onActivate}>
                Activate
              </Button>
            ) : (
              <Button
                type="button"
                variant="secondary"
                disabled={saving}
                onClick={onDraft}
              >
                Move to draft
              </Button>
            )}
            <Button
              type="button"
              variant="danger"
              disabled={saving || product.status === 'ARCHIVED'}
              onClick={onArchive}
            >
              Archive
            </Button>
          </div>
          <Button type="submit" disabled={saving}>
            {saving ? 'Saving…' : 'Save details'}
          </Button>
        </div>
      </form>
    </Card>
  );
}

function PriceForm({
  saving,
  archived,
  onSubmit,
}: {
  saving: boolean;
  archived: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <Card
      title="Define price"
      description="Saving the same period and currency retires the previous active version."
    >
      <form className="grid gap-4" onSubmit={onSubmit}>
        <label className="text-sm font-semibold text-slate-700">
          Billing period
          <select
            className={fieldClass}
            name="billingPeriod"
            defaultValue="MONTHLY"
          >
            <option value="MONTHLY">Monthly</option>
            <option value="QUARTERLY">Quarterly</option>
            <option value="ANNUAL">Yearly</option>
          </select>
        </label>
        <Field label="Currency" name="currency" required defaultValue="BDT" />
        <Field
          label="Amount in minor units"
          name="amount"
          required
          placeholder="120000"
        />
        <Field
          label="Setup fee in minor units"
          name="setupFee"
          defaultValue="0"
        />
        <Button type="submit" disabled={saving || archived}>
          Save price
        </Button>
      </form>
    </Card>
  );
}

function PriceHistory({ product }: { product: Product }) {
  return (
    <Card
      title="Price history"
      description={`${product.prices.filter((price) => price.isActive).length} active price definitions`}
    >
      {product.prices.length ? (
        <ul className="divide-y divide-slate-100">
          {product.prices.map((price) => (
            <li
              key={price.id}
              className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"
            >
              <div>
                <p className="text-sm font-bold text-slate-900">
                  {periodLabel(price.billingPeriod)} · {minor(price.amount)}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Setup {minor(price.setupFee)} ·{' '}
                  {new Date(price.createdAt).toLocaleDateString()}
                </p>
              </div>
              <StatusBadge tone={price.isActive ? 'success' : 'neutral'}>
                {price.isActive ? 'Active' : 'Retired'}
              </StatusBadge>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-slate-500">No prices defined.</p>
      )}
    </Card>
  );
}

function CreateProductDialog({
  saving,
  error,
  onClose,
  onSubmit,
}: {
  saving: boolean;
  error: string;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/60 p-4 backdrop-blur-sm">
      <div className="mx-auto my-8 max-w-3xl rounded-3xl bg-white p-6 shadow-2xl sm:p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-slate-950">
              Create draft product
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Add catalogue details and an optional first price.
            </p>
          </div>
          <Button
            variant="ghost"
            onClick={onClose}
            aria-label="Close create product form"
          >
            <Icon name="close" className="size-5" />
          </Button>
        </div>
        <form className="mt-7 grid gap-4 sm:grid-cols-2" onSubmit={onSubmit}>
          <Field label="Name" name="name" required />
          <Field
            label="Slug"
            name="slug"
            required
            placeholder="starter-hosting"
          />
          <div className="sm:col-span-2">
            <Field label="Description" name="description" />
          </div>
          <Field
            label="Display order"
            name="displayOrder"
            type="number"
            required
            defaultValue="0"
          />
          <Field
            label="cPanel package identifier"
            name="hostingPackageIdentifier"
          />
          <Field
            label="Storage display"
            name="storageFeature"
            placeholder="10 GB SSD"
          />
          <Field
            label="Websites display"
            name="websiteFeature"
            placeholder="1 website"
          />
          <Field
            label="Email display"
            name="emailFeature"
            placeholder="10 email accounts"
          />
          <Field
            label="Bandwidth display"
            name="bandwidthFeature"
            placeholder="100 GB monthly"
          />
          <label className="flex items-center gap-3 rounded-xl border border-slate-200 p-4 text-sm font-semibold text-slate-700 sm:col-span-2">
            <input
              className="size-4 accent-brand-600"
              type="checkbox"
              name="publicVisible"
            />
            Show after activation
          </label>
          <div className="border-t border-slate-200 pt-5 sm:col-span-2">
            <h3 className="font-bold text-slate-950">Optional first price</h3>
          </div>
          <label className="text-sm font-semibold text-slate-700">
            Billing period
            <select
              className={fieldClass}
              name="billingPeriod"
              defaultValue="MONTHLY"
            >
              <option value="MONTHLY">Monthly</option>
              <option value="QUARTERLY">Quarterly</option>
              <option value="ANNUAL">Yearly</option>
            </select>
          </label>
          <Field label="Currency" name="currency" defaultValue="BDT" />
          <Field label="Amount in minor units" name="amount" />
          <Field
            label="Setup fee in minor units"
            name="setupFee"
            defaultValue="0"
          />
          {error ? (
            <p
              role="alert"
              className="text-sm font-semibold text-red-700 sm:col-span-2"
            >
              {error}
            </p>
          ) : null}
          <div className="flex justify-end gap-3 sm:col-span-2">
            <Button
              type="button"
              variant="secondary"
              onClick={onClose}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Creating…' : 'Create draft'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function byDisplayOrder(left: Product, right: Product) {
  return (
    left.displayOrder - right.displayOrder ||
    left.name.localeCompare(right.name)
  );
}
function errorMessage(caught: unknown) {
  return caught instanceof Error
    ? caught.message
    : 'The request could not be completed.';
}
function periodLabel(period: string) {
  return period === 'ANNUAL'
    ? 'Yearly'
    : period.charAt(0) + period.slice(1).toLowerCase();
}
function minor(value: { amount: string; currency: string }) {
  return `${value.currency} ${value.amount} minor units`;
}
