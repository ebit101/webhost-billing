'use client';

import type {
  BusinessIdentity,
  CustomerDetail,
  CustomerSummary,
  InvoiceCreationResult,
} from '@webhost-billing/shared';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  authMutation,
  authenticatedGet,
  authenticatedPaginatedGet,
} from '../../lib/auth-api';
import {
  adminInvoiceHref,
  readAdminInvoiceQuery,
  type AdminInvoiceSelection,
} from '../../lib/admin-invoice-ledger-query';
import { Card, Field, fieldClass } from '../customers/customer-fields';
import { AdminCustomerFilterNotice } from '../customers/admin-customer-filter-notice';
import { Button } from '../ui/button';
import { LoadingState } from '../ui/feedback-state';
import { Icon } from '../ui/icon';
import { PageHeader } from '../ui/page-header';
import { invoiceError } from './invoice-ui';
import { AdminInvoiceLedger } from './admin-invoice-ledger';

interface DraftLine {
  key: string;
  description: string;
  quantity: string;
  unitAmount: string;
  discountAmount: string;
  taxAmount: string;
}

const blankLine = (): DraftLine => ({
  key: crypto.randomUUID(),
  description: '',
  quantity: '1',
  unitAmount: '0',
  discountAmount: '0',
  taxAmount: '0',
});

export function AdminInvoiceManager({
  selection = readAdminInvoiceQuery({}),
  canManageIdentity = true,
}: {
  selection?: AdminInvoiceSelection;
  canManageIdentity?: boolean;
} = {}) {
  const customerFilter = selection.customerFilter;
  const [ledgerRevision, setLedgerRevision] = useState(0);
  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [customerContext, setCustomerContext] = useState<CustomerDetail>();
  const [identity, setIdentity] = useState<BusinessIdentity>({
    name: 'Webhost Billing',
  });
  const [lines, setLines] = useState<DraftLine[]>([blankLine()]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const submissionKey = useRef('');
  const filteredCustomerId = customerFilter.customerId;
  const filteredCustomer =
    customerContext?.id === filteredCustomerId ? customerContext : undefined;

  useEffect(() => {
    let active = true;
    void Promise.all([
      authenticatedPaginatedGet<CustomerSummary>('/customers?pageSize=100'),
      authenticatedGet<BusinessIdentity>(
        '/invoices/settings/business-identity',
      ),
    ])
      .then(([customerResult, businessIdentity]) => {
        if (!active) return;
        setCustomers(customerResult.data);
        setIdentity(businessIdentity);
      })
      .catch((caught: unknown) => {
        if (active) setError(invoiceError(caught));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    if (filteredCustomerId)
      void authenticatedGet<CustomerDetail>(`/customers/${filteredCustomerId}`)
        .then((customer) => {
          if (active && customer.id === filteredCustomerId)
            setCustomerContext(customer);
        })
        .catch(() => {
          /* The ledger still labels the validated customer ID, never all customers. */
        });
    return () => {
      active = false;
    };
  }, [filteredCustomerId]);

  async function createInvoice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    if (!submissionKey.current) submissionKey.current = crypto.randomUUID();
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const result = await authMutation<InvoiceCreationResult>(
        '/invoices',
        'POST',
        {
          customerId: String(values.get('customerId')),
          currency: String(values.get('currency')).toUpperCase(),
          dueAt: dateInputToIso(String(values.get('dueAt'))),
          creditTotal: String(values.get('creditTotal') || '0'),
          submissionKey: submissionKey.current,
          items: lines.map((line) => ({
            description: line.description,
            quantity: Number(line.quantity),
            unitAmount: line.unitAmount,
            discountAmount: line.discountAmount,
            taxAmount: line.taxAmount,
          })),
        },
      );
      submissionKey.current = '';
      setLines([blankLine()]);
      form.reset();
      setNotice(`${result.invoice.invoiceNumber} saved as a draft.`);
      // Write succeeded. Any subsequent ledger failure is read-only and retries
      // only the current selection; never repeat creation or prepend a draft.
      setLedgerRevision((revision) => revision + 1);
    } catch (caught) {
      setError(invoiceError(caught));
    } finally {
      setSaving(false);
    }
  }

  async function saveIdentity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const body = Object.fromEntries(
      [...values.entries()].filter(([, value]) => String(value).trim()),
    );
    setSaving(true);
    setError('');
    try {
      const updated = await authMutation<BusinessIdentity>(
        '/invoices/settings/business-identity',
        'PATCH',
        body,
      );
      setIdentity(updated);
      setNotice(
        'Business identity saved for future invoices. Existing snapshots were not changed.',
      );
    } catch (caught) {
      setError(invoiceError(caught));
    } finally {
      setSaving(false);
    }
  }

  function updateLine(key: string, field: keyof DraftLine, value: string) {
    setLines((current) =>
      current.map((line) =>
        line.key === key ? { ...line, [field]: value } : line,
      ),
    );
  }

  if (loading) return <LoadingState label="Loading invoices" />;
  return (
    <div className="grid gap-7">
      <PageHeader
        eyebrow="Administrator"
        title="Invoices"
        description="Create editable drafts, issue immutable billing documents, and manage balances without rewriting financial history."
      />
      <AdminCustomerFilterNotice
        customer={filteredCustomer}
        invalid={customerFilter.invalid}
        clearHref={adminInvoiceHref({
          ...selection.query,
          customerId: undefined,
          page: 1,
        })}
        resourceLabel="invoices"
      />
      {error ? <Message error>{error}</Message> : null}
      {notice ? <Message>{notice}</Message> : null}

      <div className="grid gap-6 xl:grid-cols-[1.4fr_0.8fr]">
        <Card
          title="Create invoice draft"
          description="Enter integer minor-unit values. The API calculates every line and invoice total."
        >
          <form onSubmit={createInvoice} className="grid gap-5">
            <div className="grid gap-4 md:grid-cols-4">
              <label className="text-sm font-semibold text-slate-700 md:col-span-2">
                Customer
                <select name="customerId" className={fieldClass} required>
                  <option value="">Select customer</option>
                  {customers
                    .filter((customer) => customer.status === 'ACTIVE')
                    .map((customer) => (
                      <option key={customer.id} value={customer.id}>
                        {customer.firstName} {customer.lastName} —{' '}
                        {customer.email}
                      </option>
                    ))}
                </select>
              </label>
              <Field
                label="Currency"
                name="currency"
                defaultValue="BDT"
                required
              />
              <Field
                label="Due date"
                name="dueAt"
                type="date"
                defaultValue={tomorrowDate()}
                required
              />
            </div>
            <div className="grid gap-3">
              {lines.map((line, index) => (
                <div
                  key={line.key}
                  className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 lg:grid-cols-[2fr_repeat(4,0.7fr)_auto]"
                >
                  <LineField
                    label={`Description ${index + 1}`}
                    value={line.description}
                    onChange={(value) =>
                      updateLine(line.key, 'description', value)
                    }
                  />
                  <LineField
                    label="Qty"
                    value={line.quantity}
                    type="number"
                    onChange={(value) =>
                      updateLine(line.key, 'quantity', value)
                    }
                  />
                  <LineField
                    label="Unit minor"
                    value={line.unitAmount}
                    onChange={(value) =>
                      updateLine(line.key, 'unitAmount', value)
                    }
                  />
                  <LineField
                    label="Discount"
                    value={line.discountAmount}
                    onChange={(value) =>
                      updateLine(line.key, 'discountAmount', value)
                    }
                  />
                  <LineField
                    label="Tax"
                    value={line.taxAmount}
                    onChange={(value) =>
                      updateLine(line.key, 'taxAmount', value)
                    }
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={lines.length === 1}
                    onClick={() =>
                      setLines((current) =>
                        current.filter((item) => item.key !== line.key),
                      )
                    }
                  >
                    Remove
                  </Button>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap items-end justify-between gap-4">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setLines((current) => [...current, blankLine()])}
              >
                <Icon name="plus" className="size-4" /> Add line
              </Button>
              <div className="flex items-end gap-3">
                <Field
                  label="Credit minor units"
                  name="creditTotal"
                  defaultValue="0"
                  required
                />
                <Button type="submit" disabled={saving}>
                  {saving ? 'Saving…' : 'Save draft'}
                </Button>
              </div>
            </div>
          </form>
        </Card>

        {canManageIdentity ? (
          <Card
            title="Business identity"
            description="New invoices snapshot this identity. Issued invoices never change."
          >
            <form onSubmit={saveIdentity} className="grid gap-4">
              <Field
                label="Business name"
                name="name"
                defaultValue={identity.name}
                required
              />
              <Field
                label="Address"
                name="addressLine1"
                defaultValue={identity.addressLine1 ?? ''}
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="City"
                  name="city"
                  defaultValue={identity.city ?? ''}
                />
                <Field
                  label="Country"
                  name="countryCode"
                  defaultValue={identity.countryCode ?? ''}
                />
                <Field
                  label="Email"
                  name="email"
                  type="email"
                  defaultValue={identity.email ?? ''}
                />
                <Field
                  label="Tax ID"
                  name="taxIdentifier"
                  defaultValue={identity.taxIdentifier ?? ''}
                />
              </div>
              <Button type="submit" variant="secondary" disabled={saving}>
                Save business identity
              </Button>
            </form>
          </Card>
        ) : (
          <Card
            title="Business identity"
            description="Only a full administrator can change this identity."
          >
            <p>{identity.name}</p>
          </Card>
        )}
      </div>

      <AdminInvoiceLedger selection={selection} revision={ledgerRevision} />
    </div>
  );
}

function LineField({
  label,
  value,
  type = 'text',
  onChange,
}: {
  label: string;
  value: string;
  type?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="text-xs font-semibold text-slate-600">
      {label}
      <input
        className={fieldClass}
        value={value}
        type={type}
        min={type === 'number' ? 1 : undefined}
        required
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function Message({ error, children }: { error?: boolean; children: string }) {
  return (
    <p
      role={error ? 'alert' : 'status'}
      className={`rounded-xl p-4 text-sm font-semibold ${error ? 'bg-red-50 text-red-800' : 'bg-emerald-50 text-emerald-800'}`}
    >
      {children}
    </p>
  );
}

function tomorrowDate() {
  const date = new Date(Date.now() + 86_400_000);
  return date.toISOString().slice(0, 10);
}

function dateInputToIso(value: string) {
  return new Date(`${value}T23:59:59.000Z`).toISOString();
}
