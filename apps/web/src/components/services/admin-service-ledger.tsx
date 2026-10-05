'use client';
import { sentenceCaseLabel } from '@webhost-billing/shared';

import {
  serviceStatusSchema,
  type Service,
  type ServiceListQuery,
  type PaginatedApiSuccessResponse,
} from '@webhost-billing/shared';
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
  adminServiceHref,
  adminServiceQueryString,
  parseAdminServicePage,
  readAdminServiceQuery,
  type AdminServiceSelection,
} from '../../lib/admin-service-ledger-query';
import { fieldClass } from '../customers/customer-fields';
import { Button } from '../ui/button';
import { DataTable, type DataColumn } from '../ui/data-table';
import { EmptyState, ErrorState } from '../ui/feedback-state';
import { serviceError } from './service-ui';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
class InventoryReadError extends Error {}
// Only inventory reads are keyed. Operational forms and selected-review ownership stay mounted.
export function AdminServiceLedger({
  selection,
  revision,
  columns,
  onNavigate,
}: {
  selection: AdminServiceSelection;
  revision: number;
  columns: DataColumn<Service>[];
  onNavigate: () => void;
}) {
  const focusRequestedRef = useRef(false);
  return (
    <Ledger
      key={`${adminServiceQueryString(selection.query)}:${selection.invalid}:${selection.customerFilter.invalid}:${revision}`}
      selection={selection}
      columns={columns}
      onNavigate={() => {
        focusRequestedRef.current = true;
        onNavigate();
      }}
      focusRequestedRef={focusRequestedRef}
    />
  );
}

function Ledger({
  selection: { query, invalid },
  columns,
  onNavigate,
  focusRequestedRef,
}: {
  selection: AdminServiceSelection;
  columns: DataColumn<Service>[];
  onNavigate: () => void;
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
  const queryString = adminServiceQueryString(query);
  const loading = pending || !outcome;
  const result = loading || invalid ? undefined : outcome?.result;
  const meta = result?.pagination;
  const rows = result?.data ?? [];
  const nextAllowed = !readAdminServiceQuery({
    page: String(query.page + 1),
    pageSize: String(query.pageSize),
  }).invalid;

  function navigate(next: ServiceListQuery) {
    onNavigate();
    request.current?.abort();
    setOutcome(undefined);
    if (adminServiceQueryString(next) === queryString)
      setAttempt((value) => value + 1);
    startTransition(() =>
      router.push(adminServiceHref(next), { scroll: false }),
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
    void fetch(`${API_URL}/services?${queryString}`, {
      credentials: 'include',
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok)
          throw new InventoryReadError(
            'The service inventory could not be loaded. Please retry.',
          );
        let body: unknown;
        try {
          body = await response.json();
        } catch {
          throw new InventoryReadError(
            'The service inventory returned an invalid response. Please retry.',
          );
        }
        const parsed = (() => {
          try {
            return parseAdminServicePage(
              body,
              readAdminServiceQuery(new URLSearchParams(queryString)).query,
            );
          } catch (error: unknown) {
            throw new InventoryReadError(serviceError(error));
          }
        })();
        if (active && !controller.signal.aborted)
          setOutcome({ result: parsed });
      })
      .catch((caught: unknown) => {
        if (active && !controller.signal.aborted)
          setOutcome({
            error:
              caught instanceof InventoryReadError
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
    <section
      aria-label="Hosting service inventory"
      className="grid min-w-0 gap-4"
    >
      <div>
        <h2
          ref={heading}
          tabIndex={-1}
          className="text-lg font-bold text-slate-950"
        >
          Service inventory
        </h2>
        <p className="break-words text-sm text-slate-600">
          {query.customerId
            ? `Customer scope: ${query.customerId}`
            : 'All customers (unfiltered customer scope).'}{' '}
          Current customer profiles and historical product names are shown.
          Matching counts are records, not balances or remote provisioning
          evidence.
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
        aria-label="Service filters"
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
            placeholder="Domain, historical product, customer email or account ID"
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
          onClick={() =>
            navigate({ page: 1, pageSize: 20, customerId: query.customerId })
          }
        >
          Clear inventory filters
        </Button>
      </form>
      <p className="text-sm text-slate-600">
        Search matches domain, historical product name, current customer email
        or external account ID. Newest creation first, then service ID; records
        may change between reads.
      </p>
      <p className="text-sm text-slate-600">
        Applied search: {query.search || 'none'} · Applied status:{' '}
        {sentenceCaseLabel(query.status ?? '') || 'all'}
        {invalid ? ' (invalid URL filters; no inventory request made)' : ''}
      </p>
      {invalid ? (
        <ErrorState
          title="Invalid service filters"
          description="These URL filters cannot be applied. Clear inventory filters to recover; valid customer context is retained."
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
                onNavigate();
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
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {rows.length ? (
            <DataTable
              caption="Hosting service inventory"
              columns={columns}
              rows={rows}
              rowKey={(service) => service.id}
            />
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
              description="Change your search or clear inventory filters. Customer context is retained."
            />
          ) : (
            <EmptyState
              title={
                query.customerId
                  ? 'No services for this customer'
                  : 'No services yet'
              }
              description={
                query.customerId
                  ? 'No service records exist in this customer scope.'
                  : 'Create the first service from an eligible paid order.'
              }
            />
          )}
        </div>
      ) : null}
    </section>
  );
}
