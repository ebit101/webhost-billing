'use client';

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
  domainInventoryQuerySchema,
  domainStates,
  sentenceCaseLabel,
  type DomainInventoryQuery,
  type DomainInventoryResponse,
} from '@webhost-billing/shared';
import {
  adminDomainHref,
  adminDomainQueryString,
  parseAdminDomainPage,
  readAdminDomainQuery,
  type AdminDomainSelection,
} from '../../lib/admin-domain-inventory-query';
import {
  clientRecordHref,
  domainRecordHref,
} from '../../lib/client-record-href';
import { Button } from '../ui/button';
import { DataTable } from '../ui/data-table';
import { fieldClass } from '../customers/customer-fields';
import { money } from './domain-fields';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
export function AdminDomainInventory({
  selection,
  revision = 0,
}: {
  selection: AdminDomainSelection;
  revision?: number;
}) {
  const focusRequestedRef = useRef(false);
  return (
    <Inventory
      key={`${adminDomainQueryString(selection.query)}:${selection.invalid}:${revision}`}
      selection={selection}
      focusRequestedRef={focusRequestedRef}
      onNavigate={() => {
        focusRequestedRef.current = true;
      }}
    />
  );
}

function Inventory({
  selection: { query, invalid },
  focusRequestedRef,
  onNavigate,
}: {
  selection: AdminDomainSelection;
  focusRequestedRef: RefObject<boolean>;
  onNavigate: () => void;
}) {
  const router = useRouter();
  const [pending, transition] = useTransition();
  const [search, setSearch] = useState(query.search ?? '');
  const [attempt, setAttempt] = useState(0);
  const [outcome, setOutcome] = useState<{
    result?: DomainInventoryResponse;
    error?: string;
  }>();
  const request = useRef<AbortController | null>(null);
  const intendedQueryRef = useRef(query);
  const heading = useRef<HTMLHeadingElement | null>(null);
  const queryString = adminDomainQueryString(query);
  const loading = pending || !outcome;
  const result = invalid || loading ? undefined : outcome?.result;
  useEffect(() => {
    if (focusRequestedRef.current) {
      heading.current?.focus();
      focusRequestedRef.current = false;
    }
  }, [focusRequestedRef, attempt]);
  function navigate(
    update: (current: DomainInventoryQuery) => DomainInventoryQuery,
  ) {
    const parsed = domainInventoryQuerySchema.safeParse(
      update(intendedQueryRef.current),
    );
    if (!parsed.success) return;
    const next = parsed.data;
    intendedQueryRef.current = next;
    onNavigate();
    request.current?.abort();
    setOutcome(undefined);
    if (adminDomainQueryString(next) === queryString)
      setAttempt((value) => value + 1);
    transition(() => router.push(adminDomainHref(next), { scroll: false }));
  }
  useEffect(() => {
    if (invalid) return;
    const controller = new AbortController();
    request.current = controller;
    let active = true;
    void fetch(`${API_URL}/domains/inventory?${queryString}`, {
      credentials: 'include',
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('Inventory request failed');
        return parseAdminDomainPage(
          await response.json(),
          readAdminDomainQuery(new URLSearchParams(queryString)).query,
        );
      })
      .then((value) => {
        if (active && !controller.signal.aborted) setOutcome({ result: value });
      })
      .catch(() => {
        if (active && !controller.signal.aborted)
          setOutcome({
            error: 'The domain inventory could not be loaded. Please retry.',
          });
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [queryString, invalid, attempt]);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    navigate((current) => ({
      ...current,
      page: 1,
      search: search.trim() || undefined,
    }));
  }
  const meta = result?.pagination;
  return (
    <section
      aria-label="Domain inventory"
      aria-busy={loading && !invalid}
      className="min-w-0 space-y-4"
    >
      <h2 ref={heading} tabIndex={-1} className="text-xl font-bold">
        Domain inventory
      </h2>
      <form
        aria-label="Domain inventory filters"
        onSubmit={submit}
        className="grid items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-5"
      >
        <label className="min-w-0 text-sm font-semibold">
          Search domains
          <input
            type="search"
            className={fieldClass}
            maxLength={200}
            value={search}
            placeholder="Domain, client name, email, company or reference"
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <label className="text-sm font-semibold">
          Domain status
          <select
            className={fieldClass}
            value={query.state ?? ''}
            onChange={(event) =>
              navigate((current) => ({
                ...current,
                page: 1,
                state: event.target.value
                  ? domainStates.find((state) => state === event.target.value)
                  : undefined,
              }))
            }
          >
            <option value="">All statuses</option>
            {domainStates.map((state) => (
              <option key={state} value={state}>
                {sentenceCaseLabel(state)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-semibold">
          Domain origin
          <select
            className={fieldClass}
            value={query.origin ?? ''}
            onChange={(event) =>
              navigate((current) => ({
                ...current,
                page: 1,
                origin:
                  event.target.value === 'EXISTING'
                    ? 'EXISTING'
                    : event.target.value === 'REGISTRATION'
                      ? 'REGISTRATION'
                      : undefined,
              }))
            }
          >
            <option value="">All origins</option>
            <option value="EXISTING">Existing domain</option>
            <option value="REGISTRATION">Registration request</option>
          </select>
        </label>
        <label className="text-sm font-semibold">
          Domains per page
          <select
            className={fieldClass}
            value={query.pageSize}
            onChange={(event) =>
              navigate((current) => ({
                ...current,
                page: 1,
                pageSize: Number(event.target.value),
              }))
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
        <div className="flex flex-wrap gap-2">
          <Button type="submit">Search</Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() =>
              navigate((current) => ({
                page: 1,
                pageSize: 20,
                customerId: current.customerId,
              }))
            }
          >
            Clear inventory filters
          </Button>
        </div>
      </form>
      <p className="text-sm text-slate-600">
        Newest request first, then domain ID. Counts cover all matching records,
        not just this page. Status and expiry are saved records; browsing does
        not contact a registrar. Records may change between reads.
      </p>
      <p className="text-sm">
        Applied search: {query.search || 'none'} · Status:{' '}
        {query.state ? sentenceCaseLabel(query.state) : 'all'} · Origin:{' '}
        {query.origin
          ? query.origin === 'EXISTING'
            ? 'Existing domain'
            : 'Registration request'
          : 'all'}
      </p>
      {query.customerId && (
        <p className="text-sm">
          Client scope:{' '}
          <Link
            className="text-brand-700 underline"
            href={clientRecordHref(query.customerId)}
          >
            {query.customerId}
          </Link>{' '}
          ·{' '}
          <Link
            className="text-brand-700 underline"
            href={adminDomainHref({ ...query, customerId: undefined, page: 1 })}
          >
            Clear customer filter
          </Link>
        </p>
      )}
      {invalid ? (
        <p role="alert">
          Invalid domain filters. No inventory request was made. Clear inventory
          filters to recover; valid client scope is retained.
        </p>
      ) : loading ? (
        <p role="status">Loading domain inventory…</p>
      ) : outcome?.error ? (
        <div role="alert">
          <p>{outcome.error}</p>
          <Button
            onClick={() => {
              onNavigate();
              request.current?.abort();
              setOutcome(undefined);
              setAttempt((value) => value + 1);
            }}
          >
            Retry domain inventory
          </Button>
        </div>
      ) : null}
      {result && meta && (
        <>
          <dl
            aria-label="Matching domain status totals"
            className="flex flex-wrap gap-x-5 gap-y-2 rounded-xl border border-slate-200 bg-white p-3 text-sm"
          >
            {domainStates.map((state) => (
              <div key={state}>
                <dt className="inline">{sentenceCaseLabel(state)}: </dt>
                <dd className="inline font-semibold">
                  {result.summary[state]}
                </dd>
              </div>
            ))}
          </dl>
          <div
            aria-label="Domain pagination"
            className="flex flex-wrap items-center justify-between gap-3 text-sm"
          >
            <p aria-live="polite" aria-atomic="true">
              {meta.totalItems} matching domains ·{' '}
              {result.data.length
                ? `${(meta.page - 1) * meta.pageSize + 1}–${(meta.page - 1) * meta.pageSize + result.data.length}`
                : '0 shown'}{' '}
              ·{' '}
              {meta.totalPages
                ? `Page ${meta.page} of ${meta.totalPages}`
                : 'No pages'}
            </p>
            <nav aria-label="Domain pages" className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                disabled={meta.page <= 1}
                onClick={() =>
                  navigate((current) => ({
                    ...current,
                    page: Math.max(1, current.page - 1),
                  }))
                }
              >
                Previous page
              </Button>
              <Button
                variant="secondary"
                disabled={
                  meta.page >= meta.totalPages ||
                  readAdminDomainQuery({
                    page: String(meta.page + 1),
                    pageSize: String(meta.pageSize),
                  }).invalid
                }
                onClick={() =>
                  navigate((current) => ({
                    ...current,
                    page: current.page + 1,
                  }))
                }
              >
                Next page
              </Button>
            </nav>
          </div>
          {result.data.length ? (
            <div className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white">
              <DataTable
                caption="Domain inventory"
                rows={result.data}
                rowKey={(row) => row.id}
                columns={[
                  {
                    key: 'domain',
                    header: 'Domain',
                    render: (row) => (
                      <Link
                        prefetch={false}
                        className="font-semibold text-brand-700 hover:underline"
                        href={domainRecordHref(row, true)}
                      >
                        {row.domainName}
                      </Link>
                    ),
                  },
                  {
                    key: 'customer',
                    header: 'Client',
                    render: (row) => (
                      <>
                        <Link
                          prefetch={false}
                          className="text-brand-700 hover:underline"
                          href={clientRecordHref(row.customerId)}
                        >
                          {row.customerName}
                        </Link>
                        <div className="text-xs">
                          {row.companyName || row.customerNumber}
                        </div>
                        <div className="text-xs">{row.customerEmail}</div>
                      </>
                    ),
                  },
                  {
                    key: 'registrar',
                    header: 'Registrar',
                    render: (row) => (
                      <>
                        {row.registrar}
                        <div className="text-xs">
                          {row.simulated ? 'Simulated' : 'Live provider record'}
                        </div>
                      </>
                    ),
                  },
                  {
                    key: 'state',
                    header: 'Status',
                    render: (row) => sentenceCaseLabel(row.state),
                  },
                  {
                    key: 'origin',
                    header: 'Origin',
                    render: (row) =>
                      row.origin === 'EXISTING'
                        ? 'Existing domain'
                        : 'Registration request',
                  },
                  {
                    key: 'invoice',
                    header: 'Invoice',
                    render: (row) =>
                      row.invoiceStatus ? (
                        <>
                          {sentenceCaseLabel(row.invoiceStatus)}
                          <div className="text-xs">
                            Balance {money(row.balanceDue!, row.currency)}
                          </div>
                        </>
                      ) : (
                        'No billing record'
                      ),
                  },
                  {
                    key: 'requested',
                    header: 'Requested',
                    render: (row) =>
                      new Date(row.requestedAt).toLocaleDateString('en-GB'),
                  },
                  {
                    key: 'expires',
                    header: 'Expiry',
                    render: (row) =>
                      row.expiresAt
                        ? new Date(row.expiresAt).toLocaleDateString('en-GB')
                        : 'Not confirmed',
                  },
                  {
                    key: 'view',
                    header: 'Actions',
                    render: (row) => (
                      <Link
                        prefetch={false}
                        className="text-brand-700 hover:underline"
                        href={domainRecordHref(row, true)}
                      >
                        View <span className="sr-only">{row.domainName}</span>
                      </Link>
                    ),
                  },
                ]}
              />
            </div>
          ) : query.page > 1 ? (
            <div>
              <p>This domain page is out of range.</p>
              <Button
                variant="secondary"
                onClick={() => navigate((current) => ({ ...current, page: 1 }))}
              >
                Return to first page
              </Button>
            </div>
          ) : (
            <p>
              {query.search || query.state || query.origin
                ? 'No matching domains. Change your search or clear inventory filters.'
                : 'No domains yet.'}
            </p>
          )}
        </>
      )}
    </section>
  );
}
