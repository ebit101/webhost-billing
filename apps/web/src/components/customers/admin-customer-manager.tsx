'use client';
import { sentenceCaseLabel } from '@webhost-billing/shared';

import type { CustomerDetail, CustomerSummary } from '@webhost-billing/shared';
import Link from 'next/link';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { authMutation, authenticatedPaginatedGet } from '../../lib/auth-api';
import { Button, buttonStyles } from '../ui/button';
import { DataTable } from '../ui/data-table';
import { EmptyState, ErrorState, LoadingState } from '../ui/feedback-state';
import { Icon } from '../ui/icon';
import { RecordDialog } from '../ui/record-dialog';
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

export function AdminCustomerManager({
  readOnly = false,
}: { readOnly?: boolean } = {}) {
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
    // React clears currentTarget after dispatch, before the network request settles.
    const form = event.currentTarget;
    setSaving(true);
    setError('');
    try {
      const raw = valuesFromForm(form);
      const body = Object.fromEntries(
        Object.entries(raw).filter(([, value]) => value !== ''),
      );
      await authMutation<CustomerDetail>('/customers', 'POST', body);
      form.reset();
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
    <div className="grid min-w-0 grid-cols-1 gap-7">
      <PageHeader
        eyebrow="Administrator"
        title="Customers"
        description="Search customer records, review linked business history, and control portal access."
        actions={
          !readOnly ? (
            <Button onClick={() => setCreateOpen(true)}>
              <Icon name="plus" className="size-4" />
              Add customer
            </Button>
          ) : null
        }
      />

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
            <p className="mb-3 text-sm text-slate-600">
              {pagination.totalItems} records found · Showing{' '}
              {(pagination.page - 1) * pagination.pageSize + 1} to{' '}
              {(pagination.page - 1) * pagination.pageSize + customers.length}
            </p>
            <DataTable
              nowrap
              caption="Customers"
              rowKey={(row) => row.id}
              rows={customers}
              columns={[
                {
                  key: 'number',
                  header: 'Number',
                  render: (row) => (
                    <Link
                      className="font-semibold text-brand-700 hover:underline"
                      href={'/admin/customers/' + row.id}
                    >
                      {row.customerNumber}
                    </Link>
                  ),
                },
                {
                  key: 'first',
                  header: 'First name',
                  render: (row) => (
                    <Link
                      className="font-semibold text-brand-700 hover:underline"
                      href={'/admin/customers/' + row.id}
                      aria-label={row.firstName + ' ' + row.lastName}
                    >
                      {row.firstName}
                    </Link>
                  ),
                },
                {
                  key: 'last',
                  header: 'Last name',
                  render: (row) => row.lastName,
                },
                {
                  key: 'company',
                  header: 'Company name',
                  render: (row) => row.companyName ?? '—',
                },
                {
                  key: 'address',
                  header: 'Email address',
                  render: (row) => row.email,
                },
                {
                  key: 'created',
                  header: 'Created',
                  render: (row) =>
                    new Date(row.createdAt).toLocaleDateString('en-GB'),
                },
                {
                  key: 'status',
                  header: 'Status',
                  render: (row) => (
                    <StatusBadge
                      tone={row.status === 'ACTIVE' ? 'success' : 'danger'}
                    >
                      {sentenceCaseLabel(row.status)}
                    </StatusBadge>
                  ),
                },
                {
                  key: 'verification',
                  header: 'Verification',
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
                  header: 'Actions',
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

      {!readOnly ? (
        <RecordDialog
          open={createOpen}
          title="Create customer"
          busy={saving}
          onClose={() => setCreateOpen(false)}
        >
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
            <ProfileFields registrantReady />
            <p className="text-sm text-slate-600 sm:col-span-2">
              These fields can prefill a domain registrant contact. For
              automatic phone prefill, enter +country code.number; missing
              registrant fields are reviewed at domain checkout. Creating a
              portal customer does not create a registrar account.
            </p>
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
        </RecordDialog>
      ) : null}
    </div>
  );
}
