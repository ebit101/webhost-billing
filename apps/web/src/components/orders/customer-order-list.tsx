'use client';
import {
  orderStatusSchema,
  type Order,
  type PaginatedApiSuccessResponse,
} from '@webhost-billing/shared';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  useEffect,
  useRef,
  useState,
  useTransition,
  type FormEvent,
  type RefObject,
} from 'react';
import {
  customerOrderHref,
  customerOrderQueryString,
  readCustomerOrderQuery,
  parseCustomerOrderPage,
  type CustomerOrderQuery,
  type CustomerOrderSelection,
} from '../../lib/customer-order-ledger-query';
import { fieldClass } from '../customers/customer-fields';
import { Button, buttonStyles } from '../ui/button';
import { DataTable, type DataColumn } from '../ui/data-table';
import { EmptyState, ErrorState } from '../ui/feedback-state';
import { Icon } from '../ui/icon';
import { PageHeader } from '../ui/page-header';
import { StatusBadge } from '../ui/status-badge';
import { errorMessage, formatMinor, orderTone } from './order-ui';
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
class LedgerReadError extends Error {}
const columns: DataColumn<Order>[] = [
  {
    key: 'number',
    header: 'Order',
    render: (order) => (
      <div>
        <p className="font-bold text-slate-950">{order.orderNumber}</p>
        <p className="text-xs text-slate-500">
          {new Date(order.placedAt).toLocaleDateString()}
        </p>
      </div>
    ),
  },
  {
    key: 'plan',
    header: 'Hosting',
    render: (order) => (
      <div>
        <p>{order.items[0]?.productName}</p>
        <p className="text-xs text-slate-500">
          {order.items[0]?.requestedDomain}
        </p>
        {order.items.length > 1 ? (
          <p className="text-xs text-slate-500">
            First item shown · {order.items.length - 1} additional items
          </p>
        ) : null}
      </div>
    ),
  },
  {
    key: 'invoice',
    header: 'Invoice',
    render: (order) => (
      <div>
        <p>{order.invoice.invoiceNumber}</p>
        <p className="text-xs text-slate-500">
          {order.invoice.status.replaceAll('_', ' ')}
        </p>
      </div>
    ),
  },
  {
    key: 'status',
    header: 'Order status',
    render: (order) => (
      <StatusBadge tone={orderTone(order.status)}>
        {order.status.replaceAll('_', ' ')}
      </StatusBadge>
    ),
  },
  {
    key: 'total',
    header: 'Total',
    align: 'right',
    render: (order) => (
      <span className="font-bold text-slate-950">
        {formatMinor(order.total.amount, order.total.currency)}
      </span>
    ),
  },
];
export function CustomerOrderList({
  selection = readCustomerOrderQuery({}),
}: {
  selection?: CustomerOrderSelection;
}) {
  const focusRequestedRef = useRef(false);
  return (
    <div className="grid gap-7">
      <PageHeader
        eyebrow="Customer portal"
        title="My orders"
        description="Follow order and invoice facts independently; service state is not supplied by this history."
        actions={
          <Link href="/portal/checkout" className={buttonStyles()}>
            <Icon name="plus" className="size-4" />
            New order
          </Link>
        }
      />
      <Ledger
        key={`${customerOrderQueryString(selection.query)}:${selection.invalid}`}
        selection={selection}
        focusRequestedRef={focusRequestedRef}
      />
    </div>
  );
}
function Ledger({
  selection: { query, invalid },
  focusRequestedRef,
}: {
  selection: CustomerOrderSelection;
  focusRequestedRef: RefObject<boolean>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [search, setSearch] = useState(query.search ?? '');
  const [attempt, setAttempt] = useState(0);
  const request = useRef<AbortController | null>(null);
  const heading = useRef<HTMLHeadingElement | null>(null);
  useEffect(() => {
    if (focusRequestedRef.current) {
      heading.current?.focus();
      focusRequestedRef.current = false;
    }
  }, [focusRequestedRef, attempt]);
  const [outcome, setOutcome] = useState<{
    result?: PaginatedApiSuccessResponse<Order>;
    error?: string;
  }>();
  const queryString = customerOrderQueryString(query);
  const loading = pending || !outcome;
  const result = loading || invalid ? undefined : outcome?.result;
  const meta = result?.pagination;
  const rows = result?.data ?? [];
  const nextAllowed = !readCustomerOrderQuery({
    page: String(query.page + 1),
    pageSize: String(query.pageSize),
  }).invalid;

  function navigate(next: CustomerOrderQuery) {
    focusRequestedRef.current = true;
    request.current?.abort();
    setOutcome(undefined);
    if (customerOrderQueryString(next) === queryString)
      setAttempt((value) => value + 1);
    startTransition(() =>
      router.push(customerOrderHref(next), { scroll: false }),
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
    request.current = controller;
    void fetch(`${API_URL}/orders/my?${queryString}`, {
      credentials: 'include',
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok)
          throw new LedgerReadError(
            'The order history could not be loaded. Please retry.',
          );
        let body: unknown;
        try {
          body = await response.json();
        } catch {
          throw new LedgerReadError(
            'The order history returned an invalid response. Please retry.',
          );
        }
        const parsed = (() => {
          try {
            return parseCustomerOrderPage(
              body,
              readCustomerOrderQuery(new URLSearchParams(queryString)).query,
            );
          } catch (error: unknown) {
            throw new LedgerReadError(errorMessage(error));
          }
        })();
        if (active && !controller.signal.aborted)
          setOutcome({ result: parsed });
      })
      .catch((caught: unknown) => {
        if (active && !controller.signal.aborted)
          setOutcome({
            error:
              caught instanceof LedgerReadError
                ? caught.message
                : 'The order history could not be loaded. Please retry.',
          });
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [queryString, invalid, attempt]);

  return (
    <section aria-label="Your order history" className="grid min-w-0 gap-4">
      <div>
        <h2
          ref={heading}
          tabIndex={-1}
          className="text-lg font-bold text-slate-950"
        >
          Order history
        </h2>
        <p className="text-sm text-slate-600">
          Your matching order records, not account balances or settled cash.
          Order and invoice status do not establish current service or
          provisioning state.
        </p>
      </div>
      <form
        aria-label="Customer order filters"
        onSubmit={submitSearch}
        className="grid items-end gap-3 rounded-2xl border border-slate-200 bg-white p-5 sm:grid-cols-2 lg:grid-cols-[1fr_auto_auto_auto_auto]"
      >
        <label className="min-w-0 text-sm font-semibold">
          Search orders
          <input
            className={fieldClass}
            type="search"
            maxLength={200}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Order number, historical email or item domain"
          />
        </label>
        <label className="text-sm font-semibold">
          Order status
          <select
            className={fieldClass}
            value={query.status ?? ''}
            onChange={(event) =>
              navigate({
                ...query,
                status: orderStatusSchema.safeParse(event.target.value).success
                  ? orderStatusSchema.parse(event.target.value)
                  : undefined,
                page: 1,
              })
            }
          >
            <option value="">All statuses</option>
            {orderStatusSchema.options.map((status) => (
              <option key={status} value={status}>
                {status.replaceAll('_', ' ')}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-semibold">
          Orders per page
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
          onClick={() => navigate({ page: 1, pageSize: 20 })}
        >
          Clear order filters
        </Button>
      </form>
      <p className="text-sm text-slate-600">
        Search matches order number, historical customer email or any item
        requested domain. Newest creation first, then order ID (not placed
        date); records may change between reads.
      </p>
      <p className="text-sm text-slate-600">
        Applied search: {query.search || 'none'} · Applied status:{' '}
        {query.status?.replaceAll('_', ' ') || 'all'}
        {invalid ? ' (invalid URL filters; no ledger request made)' : ''}
      </p>
      {invalid ? (
        <ErrorState
          title="Invalid order filters"
          description="These URL filters cannot be applied. Clear order filters to recover; only supported filters will be applied."
        />
      ) : loading ? (
        <p
          aria-live="polite"
          className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600"
        >
          Loading order history…
        </p>
      ) : outcome?.error ? (
        <ErrorState
          title="Order history could not be loaded"
          description={outcome.error}
          action={
            <Button
              onClick={() => {
                focusRequestedRef.current = true;
                request.current?.abort();
                setOutcome(undefined);
                setAttempt((value) => value + 1);
              }}
            >
              Retry order history
            </Button>
          }
        />
      ) : null}
      {meta ? (
        <div
          aria-label="Order pagination"
          className="flex flex-wrap items-center justify-between gap-3 text-sm"
        >
          <p aria-live="polite" aria-atomic="true">
            {meta.totalItems} matching orders ·{' '}
            {rows.length
              ? `${(meta.page - 1) * meta.pageSize + 1}–${(meta.page - 1) * meta.pageSize + rows.length}`
              : '0 shown'}{' '}
            ·{' '}
            {meta.totalPages
              ? `Page ${meta.page} of ${meta.totalPages}`
              : 'No pages'}
          </p>
          <nav aria-label="Order pages" className="flex flex-wrap gap-2">
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
              caption="Your hosting orders"
              columns={columns}
              rows={rows}
              rowKey={(order) => order.id}
            />
          ) : meta && query.page > 1 ? (
            <EmptyState
              title="This order page is out of range"
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
              title="No matching orders"
              description="Change your search or clear order filters."
            />
          ) : (
            <EmptyState
              title="No orders yet"
              description="Choose an active hosting plan to place your first order."
              action={
                <Link href="/hosting" className={buttonStyles()}>
                  Browse hosting plans
                </Link>
              }
            />
          )}
        </div>
      ) : null}
    </section>
  );
}
