'use client';

import type { Invoice } from '@webhost-billing/shared';
import { useState, type FormEvent } from 'react';
import { authMutation } from '../../lib/auth-api';
import { Card, Field, fieldClass } from '../customers/customer-fields';
import { Button } from '../ui/button';
import { invoiceError } from './invoice-ui';

export function InvoiceDraftEditor({
  invoice,
  onSaved,
}: {
  invoice: Invoice;
  onSaved: (invoice: Invoice) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    setSaving(true);
    setError('');
    try {
      onSaved(
        await authMutation<Invoice>(`/invoices/${invoice.id}/draft`, 'PATCH', {
          currency: String(values.get('currency')).toUpperCase(),
          dueAt: new Date(
            `${String(values.get('dueAt'))}T23:59:59.000Z`,
          ).toISOString(),
          creditTotal: String(values.get('creditTotal')),
          items: invoice.items.map((item) => ({
            description: String(values.get(`description:${item.id}`)),
            quantity: Number(values.get(`quantity:${item.id}`)),
            unitAmount: String(values.get(`unitAmount:${item.id}`)),
            discountAmount: String(values.get(`discountAmount:${item.id}`)),
            taxAmount: String(values.get(`taxAmount:${item.id}`)),
            ...(item.servicePeriodStart
              ? { servicePeriodStart: item.servicePeriodStart }
              : {}),
            ...(item.servicePeriodEnd
              ? { servicePeriodEnd: item.servicePeriodEnd }
              : {}),
          })),
        }),
      );
    } catch (caught) {
      setError(invoiceError(caught));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card
      title="Edit draft"
      description="Draft lines and dates remain editable until issuance."
    >
      {error ? (
        <p
          role="alert"
          className="mb-4 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-800"
        >
          {error}
        </p>
      ) : null}
      <form onSubmit={save} className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field
            label="Currency"
            name="currency"
            defaultValue={invoice.currency}
            required
          />
          <Field
            label="Due date"
            name="dueAt"
            type="date"
            defaultValue={invoice.dueAt.slice(0, 10)}
            required
          />
          <Field
            label="Credit minor"
            name="creditTotal"
            defaultValue={invoice.creditTotal.amount}
            required
          />
        </div>
        {invoice.items.map((item, index) => (
          <div
            key={item.id}
            className="grid gap-3 rounded-xl border border-slate-200 p-4 lg:grid-cols-[2fr_repeat(4,0.7fr)]"
          >
            <DraftField
              label={`Description ${index + 1}`}
              name={`description:${item.id}`}
              value={item.description}
            />
            <DraftField
              label="Qty"
              name={`quantity:${item.id}`}
              value={String(item.quantity)}
              type="number"
            />
            <DraftField
              label="Unit minor"
              name={`unitAmount:${item.id}`}
              value={item.unitAmount.amount}
            />
            <DraftField
              label="Discount"
              name={`discountAmount:${item.id}`}
              value={item.discountAmount.amount}
            />
            <DraftField
              label="Tax"
              name={`taxAmount:${item.id}`}
              value={item.taxAmount.amount}
            />
          </div>
        ))}
        <div>
          <Button type="submit" disabled={saving}>
            {saving ? 'Saving…' : 'Save draft changes'}
          </Button>
        </div>
      </form>
    </Card>
  );
}

function DraftField({
  label,
  name,
  value,
  type = 'text',
}: {
  label: string;
  name: string;
  value: string;
  type?: string;
}) {
  return (
    <label className="text-xs font-semibold text-slate-600">
      {label}
      <input
        className={fieldClass}
        name={name}
        type={type}
        min={type === 'number' ? 1 : undefined}
        defaultValue={value}
        required
      />
    </label>
  );
}
