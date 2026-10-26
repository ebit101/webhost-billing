'use client';
import { sentenceCaseLabel } from '@webhost-billing/shared';
import {
  serviceStatusSchema,
  type Service,
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
  customerServiceHref,
  customerServiceQueryString,
  readCustomerServiceQuery,
  parseCustomerServicePage,
  type CustomerServiceQuery,
  type CustomerServiceSelection,
} from '../../lib/customer-service-ledger-query';
import { fieldClass } from '../customers/customer-fields';
import { Button } from '../ui/button';
import { EmptyState, ErrorState } from '../ui/feedback-state';
import { DataTable } from '../ui/data-table';
import { PageHeader } from '../ui/page-header';
import { StatusBadge } from '../ui/status-badge';
import { formatMinor } from '../invoices/invoice-ui';
import { serviceDate, serviceError, serviceTone } from './service-ui';
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
class LedgerReadError extends Error {}
export function CustomerServiceList({
  selection = readCustomerServiceQuery({}),
}: {
  selection?: CustomerServiceSelection;
}) {
  const focusRequestedRef = useRef(false);
  return (
    <div className="grid gap-7">
      <PageHeader
        eyebrow="Customer portal"
        title="My services"
        description="Review hosting account records, application state, server and next billing date. Stored facts do not verify live remote hosting."
      />
      <Ledger
        key={`${customerServiceQueryString(selection.query)}:${selection.invalid}`}
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
  selection: CustomerServiceSelection;
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
    result?: PaginatedApiSuccessResponse<Service>;
    error?: string;
  }>();
  const queryString = customerServiceQueryString(query);
  const loading = pending || !outcome;
  const result = loading || invalid ? undefined : outcome?.result;
  const meta = result?.pagination;
  const rows = result?.data ?? [];
  const nextAllowed = !readCustomerServiceQuery({
    page: String(query.page + 1),
    pageSize: String(query.pageSize),
  }).invalid;

  function navigate(next: CustomerServiceQuery) {
    focusRequestedRef.current = true;
    request.current?.abort();
    setOutcome(undefined);
    if (customerServiceQueryString(next) === queryString)
      setAttempt((value) => value + 1);
    startTransition(() =>
      router.push(customerServiceHref(next), { scroll: false }),
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
    void fetch(`${API_URL}/services/my?${queryString}`, {
      credentials: 'include',
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok)
          throw new LedgerReadError(
            'The service inventory could not be loaded. Please retry.',
          );
        let body: unknown;
        try {
          body = await response.json();
        } catch {
          throw new LedgerReadError(
            'The service inventory returned an invalid response. Please retry.',
          );
        }
        const parsed = (() => {
          try {
            return parseCustomerServicePage(
              body,
              readCustomerServiceQuery(new URLSearchParams(queryString)).query,
            );
          } catch (error: unknown) {
            throw new LedgerReadError(serviceError(error));
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
                : 'The service inventory could not be loaded. Please retry.',
          });
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [queryString, invalid, attempt]);

  return (
    <section aria-label="Your service inventory" className="grid min-w-0 gap-4">
      <div>
        <h2
          ref={heading}
          tabIndex={-1}
          className="text-lg font-bold text-slate-950"
        >
          Service inventory
        </h2>
        <p className="text-sm text-slate-600">
          Your matching service records, not active-hosting totals, balances or
          settled cash. Stored application state does not verify live remote
          hosting.
        </p>
      </div>
      <form
        aria-label="Customer service filters"
        onSubmit={submitSearch}
        className="grid items-end gap-3 rounded-2xl border border-slate-200 bg-white p-5 sm:grid-cols-2 lg:grid-cols-[1fr_auto_auto_auto_auto]"
      >
        <label className="min-w-0 text-sm font-semibold">
          Search services
          <input
            className={fieldClass}
            type="search"
            maxLength={200}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Domain, historical product, current email or external account ID"
          />
        </label>
        <label className="text-sm font-semibold">
          Service status
          <select
            className={fieldClass}
            value={query.status ?? ''}
            onChange={(event) =>
              navigate({
                ...query,
                status: serviceStatusSchema.safeParse(event.target.value)
                  .success
                  ? serviceStatusSchema.parse(event.target.value)
                  : undefined,
                page: 1,
              })
            }
          >
            <option value="">All statuses</option>
            {serviceStatusSchema.options.map((status) => (
              <option key={status} value={status}>
                {sentenceCaseLabel(status)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-semibold">
          Services per page
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
          Clear service filters
        </Button>
      </form>
      <p className="text-sm text-slate-600">
        Search matches domain, historical product name, current customer email
        or external account ID. Newest creation first, then service ID (not
        start or next-due date); records may change between reads.
      </p>
      <p className="text-sm text-slate-600">
        Applied search: {query.search || 'none'} · Applied status:{' '}
        {sentenceCaseLabel(query.status ?? '') || 'all'}
        {invalid ? ' (invalid URL filters; no ledger request made)' : ''}
      </p>
      {invalid ? (
        <ErrorState
          title="Invalid service filters"
          description="These URL filters cannot be applied. Clear service filters to recover; only supported filters will be applied."
        />
      ) : loading ? (
        <p
          aria-live="polite"
          className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600"
        >
          Loading service inventory…
        </p>
      ) : outcome?.error ? (
        <ErrorState
          title="Service inventory could not be loaded"
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
              Retry service inventory
            </Button>
          }
        />
      ) : null}
      {meta ? (
        <div
          aria-label="Service pagination"
          className="flex flex-wrap items-center justify-between gap-3 text-sm"
        >
          <p aria-live="polite" aria-atomic="true">
            {meta.totalItems} matching services ·{' '}
            {rows.length
              ? `${(meta.page - 1) * meta.pageSize + 1}–${(meta.page - 1) * meta.pageSize + rows.length}`
              : '0 shown'}{' '}
            ·{' '}
            {meta.totalPages
              ? `Page ${meta.page} of ${meta.totalPages}`
              : 'No pages'}
          </p>
          <nav aria-label="Service pages" className="flex flex-wrap gap-2">
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
        <div className="min-w-0">
          {rows.length ? (
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <DataTable
                caption="Your hosting services"
                rows={rows}
                rowKey={(service) => service.id}
                columns={[
                  {
                    key: 'domain',
                    header: 'Domain',
                    render: (service) => (
                      <Link
                        href={'/portal/services/' + service.id}
                        aria-label={
                          (service.domain ?? 'Domain unavailable') +
                          ' · View service details'
                        }
                        className="font-semibold text-brand-700 hover:underline"
                      >
                        {service.domain ?? 'Domain unavailable'}
                      </Link>
                    ),
                  },
                  {
                    key: 'product',
                    header: 'Product',
                    render: (service) => service.productName,
                  },
                  {
                    key: 'status',
                    header: 'Status',
                    render: (service) => (
                      <StatusBadge tone={serviceTone(service.status)}>
                        {sentenceCaseLabel(service.status)}
                      </StatusBadge>
                    ),
                  },
                  {
                    key: 'due',
                    header: 'Next due',
                    render: (service) => serviceDate(service.nextDueAt),
                  },
                  {
                    key: 'amount',
                    header: 'Recurring',
                    render: (service) =>
                      formatMinor(
                        service.recurringAmount.amount,
                        service.recurringAmount.currency,
                      ),
                  },
                  {
                    key: 'server',
                    header: 'Server',
                    render: (service) => service.server.hostname,
                  },
                  {
                    key: 'username',
                    header: 'Username',
                    render: (service) =>
                      service.controlPanelUsername ?? 'Pending setup',
                  },
                ]}
              />
            </div>
          ) : meta && query.page > 1 ? (
            <EmptyState
              title="This service page is out of range"
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
              title="No matching services"
              description="Change your search or clear service filters."
            />
          ) : (
            <EmptyState
              title="No hosting services"
              description="A paid order remains separate until the administrator creates its hosting service."
            />
          )}
        </div>
      ) : null}
    </section>
  );
}
