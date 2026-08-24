'use client';

import type { CustomerDetail, CustomerSummary } from '@webhost-billing/shared';
import Link from 'next/link';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { authMutation, authenticatedPaginatedGet } from '../../lib/auth-api';
import { Button, buttonStyles } from '../ui/button';
import { DataTable } from '../ui/data-table';
import { EmptyState, ErrorState, LoadingState } from '../ui/feedback-state';
import { Icon } from '../ui/icon';
import { PageHeader } from '../ui/page-header';
import { StatusBadge } from '../ui/status-badge';
import {
  Card,
  Field,
  ProfileFields,
  valuesFromForm,
  fieldClass,
} from './customer-fields';

type Pagination = {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
};

export function AdminCustomerManager() {
  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    pageSize: 20,
    totalItems: 0,
    totalPages: 0,
  });
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    await Promise.resolve();
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: '20',
      });
      if (search.trim()) params.set('search', search.trim());
      if (status) params.set('status', status);
      const result = await authenticatedPaginatedGet<CustomerSummary>(
        `/customers?${params}`,
      );
      setCustomers(result.data);
      setPagination(result.pagination);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Customers could not be loaded.',
      );
    } finally {
      setLoading(false);
    }
  }, [page, search, status]);

  useEffect(() => {
    let active = true;
    const params = new URLSearchParams({
      page: String(page),
      pageSize: '20',
    });
    if (search.trim()) params.set('search', search.trim());
    if (status) params.set('status', status);
    void authenticatedPaginatedGet<CustomerSummary>(`/customers?${params}`)
      .then((result) => {
        if (!active) return;
        setCustomers(result.data);
        setPagination(result.pagination);
      })
      .catch((caught: unknown) => {
        if (!active) return;
        setError(
          caught instanceof Error
            ? caught.message
            : 'Customers could not be loaded.',
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [page, search, status]);

  async function createCustomer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const raw = valuesFromForm(event.currentTarget);
      const body = Object.fromEntries(
        Object.entries(raw).filter(([, value]) => value !== ''),
      );
      await authMutation<CustomerDetail>('/customers', 'POST', body);
      event.currentTarget.reset();
      setCreateOpen(false);
      setPage(1);
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Customer could not be created.',
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-7">
      <PageHeader
        eyebrow="Administrator"
        title="Customers"
        description="Search customer records, review linked business history, and control portal access."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Icon name="plus" className="size-4" />
            Add customer
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Metric label="Matching customers" value={pagination.totalItems} />
        <Metric
          label="Active on this page"
          value={customers.filter((item) => item.status === 'ACTIVE').length}
        />
        <Metric
          label="Awaiting verification"
          value={customers.filter((item) => !item.emailVerified).length}
        />
      </div>

      <Card title="Customer directory">
        <form
          className="mb-5 flex flex-col gap-3 sm:flex-row"
          onSubmit={(event) => {
            event.preventDefault();
            setPage(1);
            void load();
          }}
        >
          <label className="relative flex-1">
            <span className="sr-only">Search customers</span>
            <Icon
              name="search"
              className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400"
            />
            <input
              className={`${fieldClass} mt-0 pl-10`}
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Name, email, company, or customer number"
            />
          </label>
          <label>
            <span className="sr-only">Filter customer status</span>
            <select
              className={`${fieldClass} mt-0 sm:w-48`}
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
              }}
            >
              <option value="">All statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
              <option value="SUSPENDED">Suspended</option>
            </select>
          </label>
          <Button type="submit" variant="secondary">
            Search
          </Button>
        </form>
        {error ? (
          <ErrorState
            description={error}
            action={<Button onClick={() => void load()}>Try again</Button>}
          />
        ) : loading ? (
          <LoadingState label="Loading customers" />
        ) : customers.length === 0 ? (
          <EmptyState
            title="No customers found"
            description="Adjust the filters or create the first customer record."
          />
        ) : (
          <>
            <DataTable
              caption="Customers"
              rowKey={(row) => row.id}
              rows={customers}
              columns={[
                {
                  key: 'customer',
                  header: 'Customer',
                  render: (row) => (
                    <div>
                      <Link
                        className="font-bold text-slate-950 hover:text-brand-700"
                        href={`/admin/customers/${row.id}`}
                      >
                        {row.firstName} {row.lastName}
                      </Link>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {row.email} · {row.customerNumber}
                      </p>
                    </div>
                  ),
                },
                {
                  key: 'status',
                  header: 'Status',
                  render: (row) => (
                    <StatusBadge
                      tone={row.status === 'ACTIVE' ? 'success' : 'danger'}
                    >
                      {row.status}
                    </StatusBadge>
                  ),
                },
                {
                  key: 'verification',
                  header: 'Email',
                  render: (row) => (
                    <StatusBadge
                      tone={row.emailVerified ? 'success' : 'warning'}
                    >
                      {row.emailVerified ? 'Verified' : 'Pending'}
                    </StatusBadge>
                  ),
                },
                {
                  key: 'services',
                  header: 'Services',
                  align: 'right',
                  render: (row) => row.linkedCounts.services,
                },
                {
                  key: 'view',
                  header: '',
                  align: 'right',
                  render: (row) => (
                    <Link
                      className={buttonStyles('secondary', 'sm')}
                      href={`/admin/customers/${row.id}`}
                    >
                      View
                    </Link>
                  ),
                },
              ]}
            />
            <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4 text-sm text-slate-600">
              <span>
                Page {pagination.page} of {Math.max(1, pagination.totalPages)}
              </span>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={page <= 1}
                  onClick={() => setPage((value) => value - 1)}
                >
                  Previous
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={page >= pagination.totalPages}
                  onClick={() => setPage((value) => value + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          </>
        )}
      </Card>

      {createOpen ? (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/60 p-4 backdrop-blur-sm">
          <div className="mx-auto my-8 max-w-3xl rounded-3xl bg-white p-6 shadow-2xl sm:p-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-slate-950">
                  Create customer
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  The customer receives a pending-verification account and must
                  verify the email before signing in.
                </p>
              </div>
              <Button
                variant="ghost"
                onClick={() => setCreateOpen(false)}
                aria-label="Close create customer form"
              >
                <Icon name="close" className="size-5" />
              </Button>
            </div>
            <form
              className="mt-7 grid gap-4 sm:grid-cols-2"
              onSubmit={createCustomer}
            >
              <div className="sm:col-span-2">
                <Field
                  label="Email"
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                />
              </div>
              <div className="sm:col-span-2">
                <Field
                  label="Initial password"
                  name="password"
                  type="password"
                  required
                  autoComplete="new-password"
                />
              </div>
              <ProfileFields />
              <div className="sm:col-span-2">
                <Field
                  label="Tax identifier (administrator only)"
                  name="taxIdentifier"
                />
              </div>
              {error ? (
                <p
                  role="alert"
                  className="sm:col-span-2 text-sm font-semibold text-red-700"
                >
                  {error}
                </p>
              ) : null}
              <div className="flex justify-end gap-3 sm:col-span-2">
                <Button
                  type="button"
                  variant="secondary"
                  disabled={saving}
                  onClick={() => setCreateOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving ? 'Creating…' : 'Create customer'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-semibold text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-bold tracking-tight text-slate-950">
        {value}
      </p>
    </div>
  );
}
