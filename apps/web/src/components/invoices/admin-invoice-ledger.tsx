'use client';

import {
  invoiceStatusSchema,
  type Invoice,
  type InvoiceListQuery,
  type PaginatedApiSuccessResponse,
} from '@webhost-billing/shared';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition, type FormEvent } from 'react';
import {
  adminInvoiceHref,
  adminInvoiceQueryString,
  parseAdminInvoicePage,
  readAdminInvoiceQuery,
  type AdminInvoiceSelection,
} from '../../lib/admin-invoice-ledger-query';
import { fieldClass } from '../customers/customer-fields';
import { Button } from '../ui/button';
import { DataTable, type DataColumn } from '../ui/data-table';
import { EmptyState, ErrorState, LoadingState } from '../ui/feedback-state';
import { StatusBadge } from '../ui/status-badge';
import {
  formatMinor,
  invoiceDate,
  invoiceError,
  invoiceTone,
} from './invoice-ui';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
const columns: DataColumn<Invoice>[] = [
  {
    key: 'number',
    header: 'Invoice',
    render: (invoice) => (
      <div>
        <Link
          prefetch={false}
          href={`/admin/invoices/${invoice.id}`}
          className="font-bold text-brand-700 hover:underline"
        >
          {invoice.invoiceNumber}
        </Link>
        <p className="mt-1 text-xs text-slate-500">
          {invoice.orderNumber ?? 'Administrator invoice'}
        </p>
      </div>
    ),
  },
  {
    key: 'customer',
    header: 'Historical customer',
    render: (invoice) => (
      <div>
        <p className="font-semibold text-slate-900">{invoice.customerName}</p>
        <p className="text-xs text-slate-500">{invoice.customerEmail}</p>
      </div>
    ),
  },
  {
    key: 'status',
    header: 'Status',
    render: (invoice) => (
      <StatusBadge tone={invoiceTone(invoice.status)}>
        {invoice.status.replaceAll('_', ' ')}
      </StatusBadge>
    ),
  },
  {
    key: 'due',
    header: 'Due',
    render: (invoice) => invoiceDate(invoice.dueAt),
  },
  {
    key: 'total',
    header: 'Total',
    align: 'right',
    render: (invoice) =>
      formatMinor(invoice.total.amount, invoice.total.currency),
  },
  {
    key: 'balance',
    header: 'Balance',
    align: 'right',
    render: (invoice) => (
      <span className="font-bold text-slate-950">
        {formatMinor(invoice.balanceDue.amount, invoice.balanceDue.currency)}
      </span>
    ),
  },
];

// Only this read-only subtree is keyed. Financial forms stay mounted above it.
export function AdminInvoiceLedger({
  selection,
  revision,
}: {
  selection: AdminInvoiceSelection;
  revision: number;
}) {
  return (
    <Ledger
      key={`${adminInvoiceQueryString(selection.query)}:${selection.invalid}:${selection.customerFilter.invalid}:${revision}`}
      selection={selection}
    />
  );
}

function Ledger({
  selection: { query, invalid },
}: {
  selection: AdminInvoiceSelection;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [search, setSearch] = useState(query.search ?? '');
  const [attempt, setAttempt] = useState(0);
  const [outcome, setOutcome] = useState<{
    result?: PaginatedApiSuccessResponse<Invoice>;
    error?: string;
  }>();
  const queryString = adminInvoiceQueryString(query);
  const loading = pending || !outcome;
  const result = loading || invalid ? undefined : outcome?.result;
  const meta = result?.pagination;
  const rows = result?.data ?? [];
  const nextAllowed = !readAdminInvoiceQuery({
    page: String(query.page + 1),
    pageSize: String(query.pageSize),
  }).invalid;

  function navigate(next: InvoiceListQuery) {
    startTransition(() =>
      router.push(adminInvoiceHref(next), { scroll: false }),
    );
  }
  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    navigate({ ...query, search: search.trim() || undefined, page: 1 });
  }
  useEffect(() => {
    if (invalid) return;
    let active = true;
    const controller = new AbortController();
    void fetch(`${API_URL}/invoices?${queryString}`, {
      credentials: 'include',
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok)
          throw new Error(
            'The invoice ledger could not be loaded. Please retry.',
          );
        let body: unknown;
        try {
          body = await response.json();
        } catch {
          throw new Error(
            'The invoice ledger returned an invalid response. Please retry.',
          );
        }
        const parsed = parseAdminInvoicePage(
          body,
          readAdminInvoiceQuery(new URLSearchParams(queryString)).query,
        );
        if (active) setOutcome({ result: parsed });
      })
      .catch((caught: unknown) => {
        if (active) setOutcome({ error: invoiceError(caught) });
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [queryString, invalid, attempt]);

  return (
    <section
      aria-label="Administrator invoice ledger"
      className="grid min-w-0 gap-4"
    >
      <div>
        <h2 className="text-lg font-bold text-slate-950">Invoice ledger</h2>
        <p className="break-words text-sm text-slate-600">
          {query.customerId
            ? `Customer scope: ${query.customerId}`
            : 'All customers (unfiltered customer scope).'}{' '}
          Historical invoice identities are shown. Matching counts are not
          outstanding balances.
        </p>
        {query.customerId ? (
          <Button
            type="button"
            variant="ghost"
            onClick={() =>
              navigate({ ...query, customerId: undefined, page: 1 })
            }
          >
            Clear customer scope
          </Button>
        ) : null}
      </div>
      <form
        aria-label="Invoice filters"
        onSubmit={submitSearch}
        className="grid items-end gap-3 rounded-2xl border border-slate-200 bg-white p-5 sm:grid-cols-2 lg:grid-cols-[1fr_auto_auto_auto_auto]"
      >
        <label className="min-w-0 text-sm font-semibold">
          Search invoices
          <input
            className={fieldClass}
            type="search"
            maxLength={200}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Number, historical customer or description"
          />
        </label>
        <label className="text-sm font-semibold">
          Invoice status
          <select
            className={fieldClass}
            value={query.status ?? ''}
            onChange={(event) =>
              navigate({
                ...query,
                status: invoiceStatusSchema.safeParse(event.target.value)
                  .success
                  ? invoiceStatusSchema.parse(event.target.value)
                  : undefined,
                page: 1,
              })
            }
          >
            <option value="">All statuses</option>
            {invoiceStatusSchema.options.map((status) => (
              <option key={status} value={status}>
                {status.replaceAll('_', ' ')}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-semibold">
          Invoices per page
          <select
            className={fieldClass}
            value={query.pageSize}
            onChange={(event) =>
              navigate({
                ...query,
                pageSize: Number(event.target.value),
                page: 1,
              })
            }
          >
            {[...new Set([20, 50, 100, query.pageSize])]
              .sort((a, b) => a - b)
              .map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
          </select>
        </label>
        <Button type="submit">Search</Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() =>
            navigate({ page: 1, pageSize: 20, customerId: query.customerId })
          }
        >
          Clear ledger filters
        </Button>
      </form>
      <p className="text-sm text-slate-600">
        Applied search: {query.search || 'none'} · Applied status:{' '}
        {query.status?.replaceAll('_', ' ') || 'all'}
        {invalid ? ' (invalid URL filters; no ledger request made)' : ''}
      </p>
      {invalid ? (
        <ErrorState
          title="Invalid invoice filters"
          description="These URL filters cannot be applied. Clear ledger filters to recover; valid customer context is retained."
        />
      ) : loading ? (
        <LoadingState label="Loading invoice ledger" />
      ) : outcome?.error ? (
        <ErrorState
          title="Invoice ledger could not be loaded"
          description={outcome.error}
          action={
            <Button
              onClick={() => {
                setOutcome(undefined);
                setAttempt((value) => value + 1);
              }}
            >
              Retry invoice ledger
            </Button>
          }
        />
      ) : null}
      {meta ? (
        <div
          aria-label="Invoice pagination"
          className="flex flex-wrap items-center justify-between gap-3 text-sm"
        >
          <p role="status">
            {meta.totalItems} matching invoices ·{' '}
            {rows.length
              ? `${(meta.page - 1) * meta.pageSize + 1}–${(meta.page - 1) * meta.pageSize + rows.length}`
              : '0 shown'}{' '}
            ·{' '}
            {meta.totalPages
              ? `Page ${meta.page} of ${meta.totalPages}`
              : 'No pages'}
          </p>
          <nav aria-label="Invoice pages" className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              disabled={meta.page <= 1}
              onClick={() => navigate({ ...query, page: meta.page - 1 })}
            >
              Previous page
            </Button>
            <Button
              variant="secondary"
              disabled={meta.page >= meta.totalPages || !nextAllowed}
              onClick={() => navigate({ ...query, page: meta.page + 1 })}
            >
              Next page
            </Button>
          </nav>
        </div>
      ) : null}
      {result ? (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {rows.length ? (
            <DataTable
              caption="Administrator invoice ledger"
              columns={columns}
              rows={rows}
              rowKey={(invoice) => invoice.id}
            />
          ) : meta && query.page > 1 ? (
            <EmptyState
              title="This invoice page is out of range"
              description="Return to page one with the same filters to view the current results."
              action={
                <Button
                  variant="secondary"
                  onClick={() => navigate({ ...query, page: 1 })}
                >
                  Return to first page
                </Button>
              }
            />
          ) : query.search || query.status ? (
            <EmptyState
              title="No matching invoices"
              description="Change your search or clear ledger filters. Customer context is retained."
            />
          ) : (
            <EmptyState
              title={
                query.customerId
                  ? 'No invoices for this customer'
                  : 'No invoices yet'
              }
              description={
                query.customerId
                  ? 'No invoice records exist in this customer scope.'
                  : 'Create the first administrator invoice draft.'
              }
            />
          )}
        </div>
      ) : null}
    </section>
  );
}
