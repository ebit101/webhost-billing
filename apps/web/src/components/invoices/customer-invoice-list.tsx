'use client';

import {
  invoiceSchema,
  invoiceStatusSchema,
  paginatedApiSuccessResponseSchema,
  type Invoice,
  type PaginatedApiSuccessResponse,
} from '@webhost-billing/shared';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  useEffect,
  useMemo,
  useState,
  useTransition,
  type FormEvent,
} from 'react';
import { authenticatedPaginatedGet } from '../../lib/auth-api';
import {
  invoiceLedgerHref,
  invoiceLedgerQueryString,
  readInvoiceLedgerQuery,
  type InvoiceLedgerSelection,
} from '../../lib/invoice-ledger-query';
import { fieldClass } from '../customers/customer-fields';
import { Button, buttonStyles } from '../ui/button';
import { DataTable, type DataColumn } from '../ui/data-table';
import { EmptyState, ErrorState, LoadingState } from '../ui/feedback-state';
import { PageHeader } from '../ui/page-header';
import { StatusBadge } from '../ui/status-badge';
import {
  formatMinor,
  invoiceDate,
  invoiceError,
  invoiceTone,
} from './invoice-ui';

const responseSchema = paginatedApiSuccessResponseSchema(invoiceSchema);

export function CustomerInvoiceList({
  selection = readInvoiceLedgerQuery({}),
}: {
  selection?: InvoiceLedgerSelection;
}) {
  return (
    <Ledger
      key={`${invoiceLedgerQueryString(selection.query)}:${selection.invalid}`}
      selection={selection}
    />
  );
}

function Ledger({
  selection: { query, invalid },
}: {
  selection: InvoiceLedgerSelection;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [search, setSearch] = useState(query.search ?? '');
  const [attempt, setAttempt] = useState(0);
  const [outcome, setOutcome] = useState<{
    result?: PaginatedApiSuccessResponse<Invoice>;
    error?: string;
  }>();
  const queryString = invoiceLedgerQueryString(query);
  const loading = pending || !outcome;
  const result = loading ? undefined : outcome?.result;
  const invoices = result?.data ?? [];
  const metadata = result?.pagination;
  const canRequestNextPage =
    metadata &&
    !readInvoiceLedgerQuery({
      page: String(metadata.page + 1),
      pageSize: String(query.pageSize),
    }).invalid;

  function navigate(next: typeof query) {
    startTransition(() =>
      router.push(invoiceLedgerHref(next), { scroll: false }),
    );
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    navigate({ ...query, search: search.trim() || undefined, page: 1 });
  }

  useEffect(() => {
    let active = true;
    void authenticatedPaginatedGet<Invoice>(`/invoices/my?${queryString}`)
      .then((response) => {
        const validated = responseSchema.safeParse(response);
        if (!validated.success)
          throw new Error(
            'Invoice history returned an invalid response. Please retry.',
          );
        const { data, pagination } = validated.data;
        const requested = readInvoiceLedgerQuery(
          new URLSearchParams(queryString),
        ).query;
        if (
          pagination.page !== requested.page ||
          pagination.pageSize !== requested.pageSize ||
          pagination.totalPages !==
            Math.ceil(pagination.totalItems / pagination.pageSize) ||
          data.length > pagination.pageSize ||
          data.length > pagination.totalItems ||
          (pagination.page > pagination.totalPages && data.length > 0)
        ) {
          throw new Error(
            'Invoice history returned inconsistent pagination. Please retry.',
          );
        }
        if (active) setOutcome({ result: validated.data });
      })
      .catch((caught: unknown) => {
        if (active) setOutcome({ error: invoiceError(caught) });
      });
    return () => {
      active = false;
    };
  }, [queryString, attempt]);

  const columns = useMemo<DataColumn<Invoice>[]>(
    () => [
      {
        key: 'number',
        header: 'Invoice',
        render: (invoice) => (
          <Link
            className="font-bold text-brand-700 hover:underline"
            href={`/portal/invoices/${invoice.id}`}
          >
            {invoice.invoiceNumber}
          </Link>
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
        key: 'issued',
        header: 'Issued',
        render: (invoice) => invoiceDate(invoice.issuedAt),
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
            {formatMinor(
              invoice.balanceDue.amount,
              invoice.balanceDue.currency,
            )}
          </span>
        ),
      },
    ],
    [],
  );

  return (
    <div className="grid gap-7">
      <PageHeader
        eyebrow="Customer portal"
        title="Invoices"
        description="Review issued billing documents, due dates, credits, payments, and current balances."
      />
      {invalid ? (
        <p
          role="alert"
          className="rounded-xl bg-amber-50 p-4 text-sm text-amber-950"
        >
          The invoice filters are invalid and were not applied. Safe defaults
          are shown. Clear filters to recover.
        </p>
      ) : null}
      <form
        onSubmit={submitSearch}
        aria-label="Invoice filters"
        className="grid items-end gap-3 rounded-2xl border border-slate-200 bg-white p-5 sm:grid-cols-2 lg:grid-cols-[1fr_auto_auto_auto_auto]"
      >
        <label className="text-sm font-semibold">
          Search invoices
          <input
            type="search"
            value={search}
            maxLength={200}
            onChange={(event) => setSearch(event.target.value)}
            className={fieldClass}
            placeholder="Invoice number or description"
          />
        </label>
        <label className="text-sm font-semibold">
          Invoice status
          <select
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
            className={fieldClass}
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
            value={query.pageSize}
            onChange={(event) =>
              navigate({
                ...query,
                pageSize: Number(event.target.value),
                page: 1,
              })
            }
            className={fieldClass}
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
        <Link href="/portal/invoices" className={buttonStyles('secondary')}>
          Clear filters
        </Link>
      </form>
      {loading ? (
        <LoadingState label="Loading your invoices" />
      ) : outcome?.error ? (
        <ErrorState
          title="Invoice history could not be loaded"
          description={outcome.error}
          action={
            <Button
              onClick={() => {
                setOutcome(undefined);
                setAttempt((value) => value + 1);
              }}
            >
              Retry invoice history
            </Button>
          }
        />
      ) : null}
      {metadata ? (
        <div
          className="flex flex-wrap items-center justify-between gap-3 text-sm"
          aria-label="Invoice pagination"
        >
          <p role="status">
            {metadata.totalItems} matching invoices ·{' '}
            {invoices.length
              ? `${(metadata.page - 1) * metadata.pageSize + 1}–${(metadata.page - 1) * metadata.pageSize + invoices.length}`
              : '0 shown'}{' '}
            ·{' '}
            {metadata.totalPages
              ? `Page ${metadata.page} of ${metadata.totalPages}`
              : 'No pages'}
          </p>
          <nav aria-label="Invoice pages" className="flex gap-2">
            {metadata.page > 1 ? (
              <Button
                onClick={() => navigate({ ...query, page: metadata.page - 1 })}
                variant="secondary"
              >
                Previous page
              </Button>
            ) : (
              <Button disabled variant="secondary">
                Previous page
              </Button>
            )}
            {metadata.page < metadata.totalPages && canRequestNextPage ? (
              <Button
                onClick={() => navigate({ ...query, page: metadata.page + 1 })}
                variant="secondary"
              >
                Next page
              </Button>
            ) : (
              <Button disabled variant="secondary">
                Next page
              </Button>
            )}
          </nav>
        </div>
      ) : null}
      {result ? (
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {invoices.length ? (
            <DataTable
              caption="Your invoices"
              columns={columns}
              rows={invoices}
              rowKey={(invoice) => invoice.id}
            />
          ) : metadata && (metadata.page > 1 || metadata.totalItems > 0) ? (
            <EmptyState
              title="This invoice page is empty"
              description="The requested page is outside the current results or history has changed. Return to the first page with the same filters."
              action={
                <Link
                  href={invoiceLedgerHref({ ...query, page: 1 })}
                  className={buttonStyles('secondary')}
                >
                  Return to first page
                </Link>
              }
            />
          ) : query.search || query.status ? (
            <EmptyState
              title="No matching invoices"
              description="No invoices match these filters. Change your search or clear filters."
              action={
                <Link
                  href="/portal/invoices"
                  className={buttonStyles('secondary')}
                >
                  Show all invoices
                </Link>
              }
            />
          ) : (
            <EmptyState
              title="No invoices yet"
              description="Issued order and renewal invoices will appear here."
              action={
                <Link href="/hosting" className={buttonStyles()}>
                  Browse hosting plans
                </Link>
              }
            />
          )}
        </section>
      ) : null}
    </div>
  );
}
