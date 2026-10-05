'use client';
import { sentenceCaseLabel } from '@webhost-billing/shared';

import type { CustomerDetail, SettingsOverview } from '@webhost-billing/shared';
import Link from 'next/link';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { authMutation, authenticatedGet } from '../../lib/auth-api';
import { adminCustomerFilterHref } from '../../lib/admin-customer-filter';
import { formatMinor } from '../invoices/invoice-ui';
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
  const [timeZone, setTimeZone] = useState('Asia/Dhaka');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [confirmAccess, setConfirmAccess] = useState(false);

  const load = useCallback(async () => {
    await Promise.resolve();
    setLoading(true);
    setError('');
    try {
      const [customerResult, settings] = await Promise.all([
        authenticatedGet<CustomerDetail>(`/customers/${customerId}`),
        authenticatedGet<SettingsOverview>('/settings'),
      ]);
      setCustomer(customerResult);
      setTimeZone(settings.timeZone);
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
    void Promise.all([
      authenticatedGet<CustomerDetail>(`/customers/${customerId}`),
      authenticatedGet<SettingsOverview>('/settings'),
    ])
      .then(([customerResult, settings]) => {
        if (!active) return;
        setCustomer(customerResult);
        setTimeZone(settings.timeZone);
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
  const linkedCounts = [
    {
      label: 'Orders',
      count: customer.linked.counts.orders,
      href: adminCustomerFilterHref('/admin/orders', customer.id),
    },
    {
      label: 'Services',
      count: customer.linked.counts.services,
      href: adminCustomerFilterHref('/admin/services', customer.id),
    },
    {
      label: 'Invoices',
      count: customer.linked.counts.invoices,
      href: adminCustomerFilterHref('/admin/invoices', customer.id),
    },
    {
      label: 'Payments',
      count: customer.linked.counts.payments,
      href: adminCustomerFilterHref('/admin/payments', customer.id),
    },
    {
      label: 'Tickets',
      count: customer.linked.counts.tickets,
      href: adminCustomerFilterHref('/admin/support', customer.id),
    },
  ];
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
          {sentenceCaseLabel(customer.status)}
        </StatusBadge>
        <StatusBadge tone={customer.emailVerified ? 'success' : 'warning'}>
          {customer.emailVerified ? 'Email verified' : 'Verification pending'}
        </StatusBadge>
        <StatusBadge
          tone={customer.accountStatus === 'ACTIVE' ? 'success' : 'neutral'}
        >
          Account {sentenceCaseLabel(customer.accountStatus)}
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

      <section aria-labelledby="operational-context" className="grid gap-4">
        <div>
          <h2
            id="operational-context"
            className="text-xl font-bold text-slate-950"
          >
            Operational context
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Identity, linked totals, and the latest bounded business records for
            this customer.
          </p>
        </div>
        <div className="grid gap-6 xl:grid-cols-[0.75fr_1.25fr]">
          <Card title="Account identity">
            <dl className="grid gap-3 text-sm">
              <Detail label="Email" value={customer.email} />
              <Detail
                label="Company"
                value={customer.companyName ?? 'Individual account'}
              />
              <Detail label="Country" value={customer.countryCode} />
              <Detail
                label="Customer since"
                value={businessDate(customer.createdAt, timeZone)}
              />
              <Detail
                label="Last updated"
                value={businessDate(customer.updatedAt, timeZone)}
              />
            </dl>
          </Card>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-5">
            {linkedCounts.map((record) => (
              <Link
                key={record.label}
                href={record.href}
                className="rounded-2xl border border-slate-200 bg-white p-5 transition hover:border-brand-300 hover:shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600"
              >
                <p className="text-xs font-bold tracking-wider text-slate-500">
                  {record.label}
                </p>
                <p className="mt-2 text-3xl font-bold text-slate-950">
                  {record.count}
                </p>
              </Link>
            ))}
          </div>
        </div>
        <div className="grid gap-6 xl:grid-cols-2">
          <LinkedList
            title="Recent orders"
            empty="No orders"
            rows={customer.linked.orders.map((item) => ({
              id: item.id,
              primary: sentenceCaseLabel(item.status),
              secondary: `${formatMinor(item.total.amount, item.total.currency)} · ${businessDate(item.createdAt, timeZone)}`,
              href: adminCustomerFilterHref('/admin/orders', customer.id),
            }))}
          />
          <LinkedList
            title="Recent services"
            empty="No services"
            rows={customer.linked.services.map((item) => ({
              id: item.id,
              primary: item.productName,
              secondary: `${sentenceCaseLabel(item.status)}${item.domain ? ` · ${item.domain}` : ''} · ${formatMinor(item.recurringAmount.amount, item.recurringAmount.currency)} · ${businessDate(item.createdAt, timeZone)}`,
              href: adminCustomerFilterHref('/admin/services', customer.id),
            }))}
          />
          <LinkedList
            title="Recent invoices"
            empty="No invoices"
            rows={customer.linked.invoices.map((item) => ({
              id: item.id,
              primary: `${item.invoiceNumber} · ${sentenceCaseLabel(item.status)}`,
              secondary: `${formatMinor(item.total.amount, item.total.currency)} · due ${businessDate(item.dueAt, timeZone)}`,
              href: `/admin/invoices/${item.id}`,
            }))}
          />
          <LinkedList
            title="Recent payments"
            empty="No payments"
            rows={customer.linked.payments.map((item) => ({
              id: item.id,
              primary: `${sentenceCaseLabel(item.kind)} · ${sentenceCaseLabel(item.status)}`,
              secondary: `${formatMinor(item.amount.amount, item.amount.currency)} · ${item.invoiceNumber} · ${item.provider} · ${businessDate(item.createdAt, timeZone)}`,
              href: adminCustomerFilterHref('/admin/payments', customer.id),
            }))}
          />
          <LinkedList
            title="Recent tickets"
            empty="No tickets"
            rows={customer.linked.tickets.map((item) => ({
              id: item.id,
              primary: `${item.ticketNumber} · ${item.subject}`,
              secondary: `${sentenceCaseLabel(item.status)} · ${sentenceCaseLabel(item.priority)} · ${businessDate(item.updatedAt, timeZone)}`,
              href: adminCustomerFilterHref('/admin/support', customer.id),
            }))}
          />
        </div>
      </section>

      <section aria-labelledby="customer-administration" className="grid gap-4">
        <div>
          <h2
            id="customer-administration"
            className="text-xl font-bold text-slate-950"
          >
            Customer administration
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Optional profile and billing changes are kept below the operational
            record context.
          </p>
        </div>
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
  rows: { id: string; primary: string; secondary: string; href: string }[];
}) {
  return (
    <Card title={title}>
      {rows.length ? (
        <ul className="divide-y divide-slate-100">
          {rows.map((row) => (
            <li className="py-3 first:pt-0 last:pb-0" key={row.id}>
              <Link
                className="text-sm font-bold text-brand-700 hover:underline"
                href={row.href}
              >
                {row.primary}
              </Link>
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

function businessDate(value: string, timeZone: string) {
  return new Intl.DateTimeFormat('en-BD', {
    dateStyle: 'medium',
    timeZone,
  }).format(new Date(value));
}
