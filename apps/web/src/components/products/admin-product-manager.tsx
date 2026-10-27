'use client';
import { sentenceCaseLabel } from '@webhost-billing/shared';

import type { Product, ProductGroup } from '@webhost-billing/shared';
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
import { DataTable, type DataColumn } from '../ui/data-table';
import { RecordAction, RecordDialog } from '../ui/record-dialog';
import { formatMinor } from '../invoices/invoice-ui';
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
  const [groups, setGroups] = useState<ProductGroup[]>([]);
  const [groupsOpen, setGroupsOpen] = useState(false);
  const [selected, setSelected] = useState<Product>();
  const [editorOpen, setEditorOpen] = useState(false);
  const [groupEditor, setGroupEditor] = useState<ProductGroup>();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [productTab, setProductTab] = useState<'details' | 'pricing'>(
    'details',
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);

  useEffect(() => {
    let active = true;
    void Promise.all([
      authenticatedGet<Product[]>('/products'),
      authenticatedGet<ProductGroup[]>('/products/groups'),
    ])
      .then(([result, productGroups]) => {
        if (!active) return;
        setProducts(result);
        setGroups(productGroups);
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
      const [result, productGroups] = await Promise.all([
        authenticatedGet<Product[]>('/products'),
        authenticatedGet<ProductGroup[]>('/products/groups'),
      ]);
      setProducts(result);
      setGroups(productGroups);
      setSelected((current) => result.find((item) => item.id === current?.id));
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
      groupId: raw.groupId || null,
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
      setEditorOpen(true);
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
      groupId: raw.groupId || null,
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

  async function saveGroup(event: FormEvent<HTMLFormElement>, id?: string) {
    event.preventDefault();
    const form = event.currentTarget;
    const raw = valuesFromForm(form);
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const group = await authMutation<ProductGroup>(
        id ? `/products/groups/${id}` : '/products/groups',
        id ? 'PATCH' : 'POST',
        { name: raw.name, displayOrder: Number(raw.displayOrder) },
      );
      setGroups((current) =>
        [...current.filter((item) => item.id !== group.id), group].sort(
          byDisplayOrder,
        ),
      );
      if (!id) form.reset();
      setGroupEditor(undefined);
      setNotice('Product group saved.');
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setSaving(false);
    }
  }

  const visibleProducts = products.filter(
    (product) =>
      (!status || product.status === status) &&
      [product.name, product.slug, product.hostingPackageIdentifier ?? ''].some(
        (value) => value.toLowerCase().includes(search.trim().toLowerCase()),
      ),
  );
  const columns: DataColumn<Product>[] = [
    {
      key: 'name',
      header: 'Product',
      render: (product) => (
        <button
          type="button"
          className="font-semibold text-brand-700 hover:underline"
          onClick={() => {
            setSelected(product);
            setEditorOpen(true);
            setProductTab('details');
            setError('');
            setNotice('');
          }}
        >
          {product.name}
        </button>
      ),
    },
    { key: 'type', header: 'Type', render: () => 'Shared hosting' },
    {
      key: 'package',
      header: 'cPanel package',
      render: (product) => product.hostingPackageIdentifier ?? 'Not mapped',
    },
    {
      key: 'prices',
      header: 'Active prices',
      render: (product) =>
        product.prices
          .filter((price) => price.isActive)
          .map((price) => (
            <div key={price.id}>
              {sentenceCaseLabel(price.billingPeriod)} ·{' '}
              {formatMinor(price.amount.amount, price.amount.currency)}
            </div>
          )),
    },
    {
      key: 'status',
      header: 'Status',
      render: (product) => (
        <StatusBadge tone={product.status === 'ACTIVE' ? 'success' : 'neutral'}>
          {sentenceCaseLabel(product.status)}
        </StatusBadge>
      ),
    },
    {
      key: 'visibility',
      header: 'Visibility',
      render: (product) =>
        product.publicVisible && product.status === 'ACTIVE'
          ? 'Public'
          : 'Hidden',
    },
    {
      key: 'order',
      header: 'Sort order',
      render: (product) => product.displayOrder,
    },
    {
      key: 'edit',
      header: 'Actions',
      render: (product) => (
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            setSelected(product);
            setEditorOpen(true);
            setProductTab('details');
          }}
        >
          Edit <span className="sr-only">{product.name}</span>
        </Button>
      ),
    },
  ];

  if (loading) return <LoadingState label="Loading products" />;

  return (
    <div className="grid min-w-0 grid-cols-1 gap-7">
      <PageHeader
        eyebrow="Administrator"
        title="Products & pricing"
        description="Maintain the focused hosting catalogue, public ordering, cPanel package mapping, features, and versioned prices."
        actions={
          <div className="flex flex-wrap gap-3">
            <Button
              variant="secondary"
              onClick={() => setGroupsOpen(!groupsOpen)}
              aria-expanded={groupsOpen}
            >
              Manage groups
            </Button>
            <Button onClick={() => setCreateOpen(true)}>
              <Icon name="plus" className="size-4" /> Create product
            </Button>
          </div>
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
      <div className="flex flex-wrap items-end gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
        <label className="min-w-48 flex-1 text-sm font-semibold">
          Search products
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className={fieldClass}
            placeholder="Name, slug or cPanel package"
          />
        </label>
        <label className="text-sm font-semibold">
          Status
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            className={fieldClass}
          >
            <option value="">All statuses</option>
            {['DRAFT', 'ACTIVE', 'ARCHIVED'].map((value) => (
              <option key={value} value={value}>
                {sentenceCaseLabel(value)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="text-sm text-slate-600">
        {visibleProducts.length} of {products.length} products
      </p>
      {products.length ? (
        <div className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white">
          {[...groups, { id: null, name: 'Ungrouped' }].map((group) => {
            const rows = visibleProducts.filter(
              (product) => product.groupId === group.id,
            );
            if (!rows.length) return null;
            return (
              <section key={group.id ?? 'ungrouped'} aria-label={group.name}>
                <h2 className="border-b border-slate-200 bg-slate-100 px-4 py-2 text-sm font-semibold">
                  {group.name}{' '}
                  <span className="font-normal text-slate-500">
                    ({rows.length})
                  </span>
                </h2>
                <DataTable
                  nowrap
                  caption={group.name + ' products'}
                  columns={columns}
                  rows={rows}
                  rowKey={(product) => product.id}
                />
              </section>
            );
          })}
          {!visibleProducts.length ? (
            <EmptyState
              title="No matching products"
              description="Change your search or status filter."
            />
          ) : null}
        </div>
      ) : (
        <EmptyState
          title="No products yet"
          description="Create the first hosting product as a draft."
        />
      )}
      <RecordDialog
        open={groupsOpen}
        title="Product groups"
        busy={saving}
        feedback={error || notice}
        onClose={() => setGroupsOpen(false)}
      >
        <RecordAction
          label="Create group"
          busy={saving}
          feedback={error || notice}
        >
          <GroupForm
            saving={saving}
            onSubmit={(event) => void saveGroup(event)}
          />
        </RecordAction>
        <DataTable
          caption="Product groups"
          rows={groups}
          rowKey={(group) => group.id}
          columns={[
            {
              key: 'name',
              header: 'Group name',
              render: (group) => group.name,
            },
            {
              key: 'order',
              header: 'Sort order',
              render: (group) => group.displayOrder,
            },
            {
              key: 'count',
              header: 'Products',
              render: (group) =>
                products.filter((product) => product.groupId === group.id)
                  .length,
            },
            {
              key: 'edit',
              header: 'Actions',
              render: (group) => (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setGroupEditor(group)}
                >
                  Edit <span className="sr-only">{group.name}</span>
                </Button>
              ),
            },
          ]}
        />
        <p className="text-sm text-slate-600">
          Groups organize administrator records. Product visibility and
          historical billing records stay independent.
        </p>
      </RecordDialog>
      {groupEditor ? (
        <RecordDialog
          open
          title={'Edit ' + groupEditor.name}
          busy={saving}
          feedback={error || notice}
          onClose={() => setGroupEditor(undefined)}
        >
          <GroupForm
            group={groupEditor}
            saving={saving}
            onSubmit={(event) => void saveGroup(event, groupEditor.id)}
          />
        </RecordDialog>
      ) : null}
      {selected ? (
        <RecordDialog
          key={selected.id}
          open={editorOpen}
          title={selected.name}
          busy={saving}
          feedback={error || notice}
          onClose={() => setEditorOpen(false)}
        >
          <div className="flex gap-2" aria-label="Product sections">
            <Button
              variant={productTab === 'details' ? 'primary' : 'secondary'}
              aria-pressed={productTab === 'details'}
              onClick={() => setProductTab('details')}
            >
              Details
            </Button>
            <Button
              variant={productTab === 'pricing' ? 'primary' : 'secondary'}
              aria-pressed={productTab === 'pricing'}
              onClick={() => setProductTab('pricing')}
            >
              Pricing
            </Button>
          </div>
          <div hidden={productTab !== 'details'}>
            <ProductEditor
              product={selected}
              groups={groups}
              saving={saving}
              onSubmit={updateProduct}
              onActivate={() => void changeStatus('ACTIVE')}
              onDraft={() => void changeStatus('DRAFT')}
              onArchive={() => setArchiveOpen(true)}
            />
          </div>
          <div
            hidden={productTab !== 'pricing'}
            className={productTab === 'pricing' ? 'grid gap-5' : 'hidden'}
          >
            <PriceForm
              saving={saving}
              archived={selected.status === 'ARCHIVED'}
              onSubmit={definePrice}
            />
            <PriceHistory product={selected} />
          </div>
        </RecordDialog>
      ) : null}
      {createOpen ? (
        <CreateProductDialog
          groups={groups}
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
  groups,
  saving,
  onSubmit,
  onActivate,
  onDraft,
  onArchive,
}: {
  product: Product;
  groups: ProductGroup[];
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
        <GroupSelect groups={groups} groupId={product.groupId} />
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
  groups,
  saving,
  error,
  onClose,
  onSubmit,
}: {
  groups: ProductGroup[];
  saving: boolean;
  error: string;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <RecordDialog
      open
      title="Create draft product"
      busy={saving}
      onClose={onClose}
    >
      <form className="mt-7 grid gap-4 sm:grid-cols-2" onSubmit={onSubmit}>
        <Field label="Name" name="name" required />
        <GroupSelect groups={groups} />
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
    </RecordDialog>
  );
}

function GroupSelect({
  groups,
  groupId,
}: {
  groups: ProductGroup[];
  groupId?: string | null;
}) {
  return (
    <label className="text-sm font-semibold text-slate-700">
      Product group
      <select
        name="groupId"
        className={fieldClass}
        defaultValue={groupId ?? ''}
      >
        <option value="">Ungrouped</option>
        {groups.map((group) => (
          <option key={group.id} value={group.id}>
            {group.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function GroupForm({
  group,
  saving,
  onSubmit,
}: {
  group?: ProductGroup;
  saving: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form
      aria-label={group ? `Edit ${group.name}` : 'Create product group'}
      onSubmit={onSubmit}
      className="grid items-end gap-3 rounded-xl border border-slate-200 p-4 sm:grid-cols-[1fr_10rem_auto]"
    >
      <Field
        label="Group name"
        name="name"
        required
        maxLength={160}
        defaultValue={group?.name ?? ''}
        placeholder="Shared hosting"
      />
      <Field
        label="Group order"
        name="displayOrder"
        type="number"
        required
        defaultValue={String(group?.displayOrder ?? 0)}
      />
      <Button type="submit" disabled={saving}>
        {group ? 'Save group' : 'Create group'}
      </Button>
    </form>
  );
}

function byDisplayOrder(
  left: { displayOrder: number; name: string },
  right: { displayOrder: number; name: string },
) {
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
