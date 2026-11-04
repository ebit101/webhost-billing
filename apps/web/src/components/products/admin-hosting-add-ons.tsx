'use client';

import {
  hostingAddOnInputSchema,
  type HostingAddOn,
  type Product,
} from '@webhost-billing/shared';
import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import { authMutation, authenticatedGet } from '../../lib/auth-api';
import { moneyForInput, moneyToMinor } from '../../lib/money-input';
import { Card, Field, fieldClass } from '../customers/customer-fields';
import {
  addOnPeriodLabel,
  errorMessage,
  formatMinor,
} from '../orders/order-ui';
import { Button, buttonStyles } from '../ui/button';
import { LoadingState } from '../ui/feedback-state';
import { PageHeader } from '../ui/page-header';

export function AdminHostingAddOns() {
  const [catalog, setCatalog] = useState<{
    plans: Product[];
    addOns: HostingAddOn[];
  }>();
  const [editing, setEditing] = useState<HostingAddOn>();
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const [formVersion, setFormVersion] = useState(0);

  useEffect(() => {
    let active = true;
    void Promise.all([
      authenticatedGet<Product[]>('/products'),
      authenticatedGet<HostingAddOn[]>('/products/add-ons'),
    ])
      .then(([plans, addOns]) => {
        if (active) setCatalog({ plans, addOns });
      })
      .catch((caught: unknown) => {
        if (active) setError(errorMessage(caught));
      });
    return () => {
      active = false;
    };
  }, []);

  function select(addOn?: HostingAddOn) {
    setEditing(addOn);
    setFormVersion((value) => value + 1);
    setError('');
    setNotice('');
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const form = new FormData(event.currentTarget);
      const currency = String(form.get('currency')).trim().toUpperCase();
      const parsed = hostingAddOnInputSchema.safeParse({
        name: form.get('name'),
        description: String(form.get('description')).trim() || null,
        currency,
        billingPeriod: form.get('billingPeriod'),
        amount: moneyToMinor(String(form.get('amount')), currency, 'Price'),
        hostingProductIds: form.getAll('hostingProductIds'),
        enabled: form.has('enabled'),
      });
      if (!parsed.success)
        throw new Error(
          parsed.error.issues[0]?.path[0] === 'hostingProductIds'
            ? 'Choose at least one eligible hosting plan.'
            : parsed.error.issues[0]?.message,
        );
      const saved = await authMutation<HostingAddOn>(
        editing ? `/products/add-ons/${editing.id}` : '/products/add-ons',
        editing ? 'PATCH' : 'POST',
        parsed.data,
      );
      setCatalog(
        (current) =>
          current && {
            plans: current.plans,
            addOns: [
              ...current.addOns.filter((item) => item.id !== saved.id),
              saved,
            ].sort((a, b) => a.name.localeCompare(b.name)),
          },
      );
      select();
      setNotice(`${saved.name} saved.`);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-6">
      <PageHeader
        eyebrow="Administrator"
        title="Product add-ons"
        description="Offer one-time or recurring extras for selected hosting plans. Recurring extras use the matching hosting billing cycle after fulfillment."
        actions={
          <Link href="/admin/products" className={buttonStyles('secondary')}>
            Back to products
          </Link>
        }
      />
      {error && (
        <p role="alert" className="rounded-xl bg-red-50 p-4 text-red-800">
          {error}
        </p>
      )}
      {notice && (
        <p
          role="status"
          className="rounded-xl bg-emerald-50 p-4 text-emerald-800"
        >
          {notice}
        </p>
      )}
      {!catalog && !error && <LoadingState label="Loading product add-ons" />}
      {catalog && (
        <div className="grid items-start gap-6 lg:grid-cols-2">
          <Card title="Add-ons">
            {catalog.addOns.length ? (
              <ul className="divide-y divide-slate-200">
                {catalog.addOns.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-center justify-between gap-4 py-3"
                  >
                    <div>
                      <strong>{item.name}</strong>
                      <p className="text-sm text-slate-600">
                        {formatMinor(item.amount.amount, item.amount.currency)}{' '}
                        {addOnPeriodLabel(item.billingPeriod)} ·{' '}
                        {item.enabled ? 'Available' : 'Disabled'}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={saving}
                      onClick={() => select(item)}
                    >
                      Edit <span className="sr-only">{item.name}</span>
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-600">No add-ons yet.</p>
            )}
          </Card>
          <Card title={editing ? 'Edit add-on' : 'Create add-on'}>
            <form key={formVersion} onSubmit={save}>
              <fieldset disabled={saving} className="grid gap-4">
                <Field
                  label="Add-on name"
                  name="name"
                  defaultValue={editing?.name}
                  maxLength={160}
                  required
                />
                <label className="block text-sm font-semibold">
                  Description (optional)
                  <textarea
                    className={fieldClass}
                    name="description"
                    defaultValue={editing?.description ?? ''}
                    maxLength={2000}
                  />
                </label>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field
                    label="Currency"
                    name="currency"
                    defaultValue={editing?.amount.currency ?? 'BDT'}
                    maxLength={3}
                    required
                  />
                  <Field
                    label="Price"
                    name="amount"
                    defaultValue={
                      editing
                        ? moneyForInput(
                            editing.amount.amount,
                            editing.amount.currency,
                          )
                        : ''
                    }
                    required
                  />
                </div>
                <label className="block text-sm font-semibold">
                  Billing period
                  <select
                    className={fieldClass}
                    name="billingPeriod"
                    defaultValue={editing?.billingPeriod ?? 'ONE_TIME'}
                  >
                    <option value="ONE_TIME">One time</option>
                    <option value="MONTHLY">Monthly</option>
                    <option value="QUARTERLY">Quarterly</option>
                    <option value="ANNUAL">Annual</option>
                  </select>
                </label>
                <fieldset className="grid gap-2">
                  <legend className="mb-2 text-sm font-semibold">
                    Eligible hosting plans
                  </legend>
                  {catalog.plans.map((plan) => (
                    <label
                      key={plan.id}
                      className="flex items-center gap-2 text-sm"
                    >
                      <input
                        type="checkbox"
                        name="hostingProductIds"
                        value={plan.id}
                        defaultChecked={editing?.hostingProductIds.includes(
                          plan.id,
                        )}
                      />
                      {plan.name}
                    </label>
                  ))}
                  {catalog.plans.length === 0 && (
                    <p className="text-sm text-slate-600">
                      Create a hosting plan before adding extras.
                    </p>
                  )}
                </fieldset>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="enabled"
                    defaultChecked={editing?.enabled ?? true}
                  />
                  Available at checkout
                </label>
                <div className="flex gap-3">
                  <Button
                    type="submit"
                    disabled={saving || !catalog.plans.length}
                  >
                    {saving ? 'Saving…' : 'Save add-on'}
                  </Button>
                  {editing && (
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => select()}
                    >
                      Cancel edit
                    </Button>
                  )}
                </div>
              </fieldset>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}
