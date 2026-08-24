'use client';

import type { CustomerDetail } from '@webhost-billing/shared';
import Link from 'next/link';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { authMutation, authenticatedGet } from '../../lib/auth-api';
import { Button, buttonStyles } from '../ui/button';
import { ConfirmationDialog } from '../ui/confirmation-dialog';
import { ErrorState, LoadingState } from '../ui/feedback-state';
import { PageHeader } from '../ui/page-header';
import { StatusBadge } from '../ui/status-badge';
import {
  Card,
  Field,
  ProfileFields,
  nullableProfileValues,
} from './customer-fields';

export function AdminCustomerDetail({ customerId }: { customerId: string }) {
  const [customer, setCustomer] = useState<CustomerDetail>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [confirmAccess, setConfirmAccess] = useState(false);

  const load = useCallback(async () => {
    await Promise.resolve();
    setLoading(true);
    setError('');
    try {
      setCustomer(
        await authenticatedGet<CustomerDetail>(`/customers/${customerId}`),
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Customer could not be loaded.',
      );
    } finally {
      setLoading(false);
    }
  }, [customerId]);

  useEffect(() => {
    let active = true;
    void authenticatedGet<CustomerDetail>(`/customers/${customerId}`)
      .then((result) => {
        if (active) setCustomer(result);
      })
      .catch((caught: unknown) => {
        if (!active) return;
        setError(
          caught instanceof Error
            ? caught.message
            : 'Customer could not be loaded.',
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [customerId]);

  async function updateProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await mutate(
      `/customers/${customerId}/profile`,
      nullableProfileValues(event.currentTarget),
      'Profile saved.',
    );
  }

  async function updateBilling(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = new FormData(event.currentTarget).get('taxIdentifier');
    await mutate(
      `/customers/${customerId}/billing`,
      { taxIdentifier: value === '' ? null : value },
      'Billing information saved.',
    );
  }

  async function mutate(
    path: string,
    body: Record<string, unknown>,
    message: string,
  ) {
    setSaving(true);
    setError('');
    setNotice('');
    try {
      setCustomer(await authMutation<CustomerDetail>(path, 'PATCH', body));
      setNotice(message);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'The change could not be saved.',
      );
    } finally {
      setSaving(false);
    }
  }

  async function changeAccess() {
    if (!customer) return;
    await mutate(
      `/customers/${customerId}/access`,
      { active: customer.status !== 'ACTIVE' },
      customer.status === 'ACTIVE'
        ? 'Customer access deactivated.'
        : 'Customer access activated.',
    );
    setConfirmAccess(false);
  }

  if (loading) return <LoadingState label="Loading customer details" />;
  if (!customer)
    return (
      <ErrorState
        description={error || 'Customer was not found.'}
        action={<Button onClick={() => void load()}>Try again</Button>}
      />
    );

  const active = customer.status === 'ACTIVE';
  return (
    <div className="grid gap-7">
      <PageHeader
        eyebrow={customer.customerNumber}
        title={`${customer.firstName} ${customer.lastName}`}
        description={`${customer.email}${customer.companyName ? ` · ${customer.companyName}` : ''}`}
        actions={
          <>
            <Link className={buttonStyles('secondary')} href="/admin/customers">
              Back to customers
            </Link>
            <Button
              variant={active ? 'danger' : 'primary'}
              onClick={() => setConfirmAccess(true)}
            >
              {active ? 'Deactivate access' : 'Activate access'}
            </Button>
          </>
        }
      />
      <div className="flex flex-wrap gap-2">
        <StatusBadge tone={active ? 'success' : 'danger'}>
          {customer.status}
        </StatusBadge>
        <StatusBadge tone={customer.emailVerified ? 'success' : 'warning'}>
          {customer.emailVerified ? 'Email verified' : 'Verification pending'}
        </StatusBadge>
        <StatusBadge
          tone={customer.accountStatus === 'ACTIVE' ? 'success' : 'neutral'}
        >
          Account {customer.accountStatus}
        </StatusBadge>
      </div>
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

      <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <Card
          title="Profile and contact"
          description="Administrator changes are recorded without storing sensitive field values in the activity log."
        >
          <form
            key={customer.updatedAt}
            className="grid gap-4 sm:grid-cols-2"
            onSubmit={updateProfile}
          >
            <ProfileFields customer={customer} />
            <div className="flex justify-end sm:col-span-2">
              <Button type="submit" disabled={saving}>
                {saving ? 'Saving…' : 'Save profile'}
              </Button>
            </div>
          </form>
        </Card>
        <div className="grid content-start gap-6">
          <Card title="Billing identity">
            <form
              key={`billing-${customer.updatedAt}`}
              onSubmit={updateBilling}
            >
              <Field
                label="Tax identifier"
                name="taxIdentifier"
                defaultValue={customer.taxIdentifier ?? ''}
              />
              <Button className="mt-4 w-full" type="submit" disabled={saving}>
                Save billing information
              </Button>
            </form>
          </Card>
          <Card title="Record details">
            <dl className="grid gap-3 text-sm">
              <Detail label="Customer since" value={date(customer.createdAt)} />
              <Detail label="Last updated" value={date(customer.updatedAt)} />
              <Detail label="Country" value={customer.countryCode} />
            </dl>
          </Card>
        </div>
      </div>

      <section className="grid gap-4">
        <h2 className="text-xl font-bold text-slate-950">
          Linked business records
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {Object.entries(customer.linked.counts).map(([label, count]) => (
            <div
              key={label}
              className="rounded-2xl border border-slate-200 bg-white p-5"
            >
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                {label}
              </p>
              <p className="mt-2 text-3xl font-bold text-slate-950">{count}</p>
            </div>
          ))}
        </div>
        <div className="grid gap-6 xl:grid-cols-2">
          <LinkedList
            title="Recent orders"
            empty="No orders"
            rows={customer.linked.orders.map((item) => ({
              id: item.id,
              primary: item.status,
              secondary: `${minor(item.total)} · ${date(item.createdAt)}`,
            }))}
          />
          <LinkedList
            title="Recent services"
            empty="No services"
            rows={customer.linked.services.map((item) => ({
              id: item.id,
              primary: item.productName,
              secondary: `${item.status}${item.domain ? ` · ${item.domain}` : ''}`,
            }))}
          />
          <LinkedList
            title="Recent invoices"
            empty="No invoices"
            rows={customer.linked.invoices.map((item) => ({
              id: item.id,
              primary: `${item.invoiceNumber} · ${item.status}`,
              secondary: `${minor(item.total)} · due ${date(item.dueAt)}`,
            }))}
          />
          <LinkedList
            title="Recent payments"
            empty="No payments"
            rows={customer.linked.payments.map((item) => ({
              id: item.id,
              primary: `${item.kind} · ${item.status}`,
              secondary: `${minor(item.amount)} · ${item.invoiceNumber} · ${item.provider}`,
            }))}
          />
          <LinkedList
            title="Recent tickets"
            empty="No tickets"
            rows={customer.linked.tickets.map((item) => ({
              id: item.id,
              primary: `${item.ticketNumber} · ${item.subject}`,
              secondary: `${item.status} · ${item.priority}`,
            }))}
          />
        </div>
      </section>
      <ConfirmationDialog
        open={confirmAccess}
        destructive={active}
        title={
          active ? 'Deactivate customer access?' : 'Activate customer access?'
        }
        description={
          active
            ? 'This revokes all active sessions immediately. Historical customer and billing records remain unchanged.'
            : customer.emailVerified
              ? 'The customer will be able to sign in again.'
              : 'The account will remain pending until the customer verifies the email address.'
        }
        confirmLabel={active ? 'Deactivate access' : 'Activate access'}
        busy={saving}
        onClose={() => setConfirmAccess(false)}
        onConfirm={() => void changeAccess()}
      />
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-slate-100 pb-3">
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-semibold text-slate-900">{value}</dd>
    </div>
  );
}
function LinkedList({
  title,
  empty,
  rows,
}: {
  title: string;
  empty: string;
  rows: { id: string; primary: string; secondary: string }[];
}) {
  return (
    <Card title={title}>
      {rows.length ? (
        <ul className="divide-y divide-slate-100">
          {rows.map((row) => (
            <li className="py-3 first:pt-0 last:pb-0" key={row.id}>
              <p className="text-sm font-bold text-slate-900">{row.primary}</p>
              <p className="mt-1 text-xs text-slate-500">{row.secondary}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-slate-500">{empty}</p>
      )}
    </Card>
  );
}
function date(value: string) {
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(
    new Date(value),
  );
}
function minor(value: { amount: string; currency: string }) {
  return `${value.amount} ${value.currency} minor units`;
}
