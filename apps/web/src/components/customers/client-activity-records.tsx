'use client';

import {
  businessTimeZoneSchema,
  clientEmailLogSummarySchema,
  emailDeliveryStatusSchema,
  invoiceSchema,
  invoiceStatusSchema,
  manualPaymentSchema,
  manualPaymentStateSchema,
  orderSchema,
  orderStatusSchema,
  paginationMetaSchema,
  sentenceCaseLabel,
  ticketDetailSchema,
  ticketStatusSchema,
  ticketSummarySchema,
  type ClientEmailLogSummary,
  type PaginationMeta,
} from '@webhost-billing/shared';
import { useEffect, useState } from 'react';
import {
  authenticatedGet,
  authenticatedPaginatedGet,
} from '../../lib/auth-api';
import { AdminOrderReview } from '../orders/admin-order-review';
import { AdminPaymentReview } from '../payments/admin-payment-review';
import { InvoiceDocument } from '../invoices/invoice-document';
import { formatMinor, invoiceDueDate } from '../invoices/invoice-ui';
import { TicketConversation } from '../support/support-ui';
import { Button } from '../ui/button';
import { DataTable } from '../ui/data-table';
import { ErrorState, LoadingState } from '../ui/feedback-state';
import { RecordDialog } from '../ui/record-dialog';
import { fieldClass } from './customer-fields';

export type ClientActivityKind =
  'orders' | 'invoices' | 'payments' | 'support' | 'email-history';
const definitions = {
  orders: {
    label: 'Orders',
    path: '/orders',
    states: orderStatusSchema.options,
  },
  invoices: {
    label: 'Invoices',
    path: '/invoices',
    states: invoiceStatusSchema.options,
  },
  payments: {
    label: 'Payments',
    path: '/payments',
    states: manualPaymentStateSchema.options,
  },
  support: {
    label: 'Support',
    path: '/tickets',
    states: ticketStatusSchema.options,
  },
  'email-history': {
    label: 'Email history',
    path: '/email-notifications/customers',
    states: emailDeliveryStatusSchema.options,
  },
} as const;
type Row = {
  id: string;
  customerId: string;
  reference: string;
  description: string;
  status: string;
  amount?: string;
  balance?: string;
  date: string;
  due?: string;
  email?: ClientEmailLogSummary;
};

function normalize(kind: ClientActivityKind, value: unknown): Row {
  if (kind === 'orders') {
    const r = orderSchema.parse(value);
    return {
      id: r.id,
      customerId: r.customerId,
      reference: r.orderNumber,
      description: r.items.map((item) => item.productName).join(', '),
      status: r.status,
      amount: formatMinor(r.total.amount, r.total.currency),
      date: r.placedAt,
    };
  }
  if (kind === 'invoices') {
    const r = invoiceSchema.parse(value);
    return {
      id: r.id,
      customerId: r.customerId,
      reference: r.invoiceNumber,
      description: r.orderNumber ?? 'Manual invoice',
      status: r.status,
      amount: formatMinor(r.total.amount, r.total.currency),
      balance: formatMinor(r.balanceDue.amount, r.balanceDue.currency),
      date: r.createdAt,
      due: invoiceDueDate(r.dueAt),
    };
  }
  if (kind === 'payments') {
    const r = manualPaymentSchema.parse(value);
    return {
      id: r.id,
      customerId: r.customerId,
      reference: r.reference,
      description: `${r.invoiceNumber} · ${sentenceCaseLabel(r.kind)} · ${sentenceCaseLabel(r.method)}`,
      status: r.state,
      amount: formatMinor(r.amount.amount, r.amount.currency),
      date: r.receivedAt ?? r.createdAt,
    };
  }
  if (kind === 'support') {
    const r = ticketSummarySchema.parse(value);
    return {
      id: r.id,
      customerId: r.customer.id,
      reference: r.ticketNumber,
      description: `${r.subject} · ${sentenceCaseLabel(r.priority)} priority · ${r.messageCount} messages`,
      status: r.status,
      date: r.updatedAt,
    };
  }
  const r = clientEmailLogSummarySchema.parse(value);
  return {
    id: r.id,
    customerId: r.customerId,
    reference: r.subject,
    description: r.recipientEmail,
    status: r.status,
    date: r.queuedAt,
    email: r,
  };
}

export function ClientActivityRecords(props: {
  customerId: string;
  kind: ClientActivityKind;
}) {
  return <Records key={`${props.customerId}:${props.kind}`} {...props} />;
}

function Records({
  customerId,
  kind,
}: {
  customerId: string;
  kind: ClientActivityKind;
}) {
  const definition = definitions[kind];
  const valid = orderSchema.shape.customerId.safeParse(customerId).success;
  const [search, setSearch] = useState('');
  const [draftSearch, setDraftSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{ rows: Row[]; meta: PaginationMeta }>();
  const [selected, setSelected] = useState<Row>();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [timeZone, setTimeZone] = useState('UTC');
  useEffect(() => {
    let active = true;
    if (!valid) return;
    void (async () => {
      const query = new URLSearchParams({ page: String(page), pageSize: '20' });
      if (kind !== 'email-history') query.set('customerId', customerId);
      if (search) query.set('search', search);
      if (status) query.set(kind === 'payments' ? 'state' : 'status', status);
      const path =
        kind === 'email-history'
          ? `${definition.path}/${customerId}`
          : definition.path;
      const [response, settings] = await Promise.all([
        authenticatedPaginatedGet<unknown>(`${path}?${query}`),
        authenticatedGet<{ timeZone: unknown }>('/settings/presentation'),
      ]);
      const meta = paginationMetaSchema.parse(response.pagination);
      const rows = response.data.map((row) => normalize(kind, row));
      if (
        meta.page !== page ||
        meta.pageSize !== 20 ||
        meta.totalPages !== Math.ceil(meta.totalItems / 20) ||
        rows.length > 20 ||
        rows.length > meta.totalItems ||
        rows.some(
          (row) => row.customerId.toLowerCase() !== customerId.toLowerCase(),
        )
      )
        throw new Error(
          'Client record response does not match this selection.',
        );
      const zone = businessTimeZoneSchema.parse(settings.timeZone);
      if (active) {
        setResult({ rows, meta });
        setTimeZone(zone);
      }
    })()
      .catch(() => {
        if (active)
          setError('Client records could not be loaded. Retry to continue.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [
    customerId,
    kind,
    definition.path,
    search,
    status,
    page,
    revision,
    valid,
  ]);
  function change(next: () => void) {
    setLoading(true);
    setError('');
    setResult(undefined);
    setSelected(undefined);
    next();
  }
  if (!valid) return <ErrorState description="Invalid client selection." />;
  const date = (value: string) =>
    new Intl.DateTimeFormat('en-GB', { dateStyle: 'short', timeZone }).format(
      new Date(value),
    );
  return (
    <section className="grid min-w-0 gap-4" aria-label={definition.label}>
      <h2 className="text-xl font-bold">{definition.label}</h2>
      <form
        className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3"
        onSubmit={(event) => {
          event.preventDefault();
          change(() => {
            setSearch(draftSearch.trim());
            setPage(1);
            setRevision((value) => value + 1);
          });
        }}
      >
        <label className="min-w-[12rem] max-w-full basis-full flex-1 text-sm font-semibold sm:basis-0">
          Search
          <input
            className={fieldClass}
            value={draftSearch}
            maxLength={200}
            onChange={(event) => setDraftSearch(event.target.value)}
          />
        </label>
        <label className="min-w-0 flex-1 text-sm font-semibold sm:flex-none">
          Status
          <select
            className={fieldClass}
            value={status}
            onChange={(event) =>
              change(() => {
                setStatus(event.target.value);
                setPage(1);
              })
            }
          >
            <option value="">Any status</option>
            {definition.states.map((state) => (
              <option key={state} value={state}>
                {sentenceCaseLabel(state)}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit">Search</Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() =>
            change(() => {
              setDraftSearch('');
              setSearch('');
              setStatus('');
              setPage(1);
              setRevision((value) => value + 1);
            })
          }
        >
          Clear
        </Button>
      </form>
      {kind === 'email-history' && (
        <p className="text-sm text-slate-600">
          Delivery history linked to this client account. Older unlinked emails
          are excluded. Sent means accepted by the mail provider, not confirmed
          inbox delivery. Message bodies and verification links are hidden.
        </p>
      )}
      {loading ? (
        <LoadingState label="Loading client records" />
      ) : error ? (
        <>
          <ErrorState description={error} />
          <Button
            onClick={() => change(() => setRevision((value) => value + 1))}
          >
            Retry
          </Button>
        </>
      ) : (
        result && (
          <>
            <p role="status" className="text-sm text-slate-600">
              {result.meta.totalItems}{' '}
              {result.meta.totalItems === 1 ? 'record' : 'records'} found ·
              Showing {result.rows.length ? (page - 1) * 20 + 1 : 0}–
              {result.rows.length ? (page - 1) * 20 + result.rows.length : 0} ·
              Page {page} of {Math.max(1, result.meta.totalPages)}
            </p>
            <DataTable
              caption={`Client ${definition.label.toLowerCase()}`}
              rows={result.rows}
              rowKey={(row) => row.id}
              columns={[
                {
                  key: 'reference',
                  header: kind === 'email-history' ? 'Subject' : 'Reference',
                  render: (row) => (
                    <button
                      type="button"
                      className="text-left font-semibold text-brand-700 underline decoration-transparent hover:decoration-current"
                      onClick={() => setSelected(row)}
                    >
                      {row.reference}
                    </button>
                  ),
                },
                {
                  key: 'description',
                  header: kind === 'email-history' ? 'Recipient' : 'Details',
                  render: (row) => row.description,
                },
                {
                  key: 'status',
                  header: 'Status',
                  render: (row) => sentenceCaseLabel(row.status),
                },
                ...(kind === 'orders' ||
                kind === 'invoices' ||
                kind === 'payments'
                  ? [
                      {
                        key: 'amount',
                        header: 'Amount',
                        render: (row: Row) => row.amount,
                      },
                    ]
                  : []),
                ...(kind === 'invoices'
                  ? [
                      {
                        key: 'balance',
                        header: 'Balance due',
                        render: (row: Row) => row.balance,
                      },
                      {
                        key: 'due',
                        header: 'Due date',
                        render: (row: Row) => row.due,
                      },
                    ]
                  : []),
                {
                  key: 'date',
                  header:
                    kind === 'email-history'
                      ? 'Queued'
                      : kind === 'support'
                        ? 'Updated'
                        : kind === 'payments'
                          ? 'Received'
                          : 'Created',
                  render: (row) => date(row.date),
                },
              ]}
            />
            {!result.rows.length && (
              <p className="p-4 text-sm text-slate-600">
                No matching records for this client.
              </p>
            )}
            <div className="flex flex-wrap gap-3">
              <Button
                variant="secondary"
                disabled={page <= 1}
                onClick={() => change(() => setPage((value) => value - 1))}
              >
                Previous
              </Button>
              <Button
                variant="secondary"
                disabled={page >= result.meta.totalPages}
                onClick={() => change(() => setPage((value) => value + 1))}
              >
                Next
              </Button>
            </div>
          </>
        )
      )}
      <RecordDialog
        open={Boolean(selected)}
        title={`${definition.label} record`}
        onClose={() => setSelected(undefined)}
      >
        {selected &&
          (kind === 'orders' ? (
            <AdminOrderReview
              orderId={selected.id}
              customerId={customerId}
              onClose={() => setSelected(undefined)}
            />
          ) : kind === 'payments' ? (
            <AdminPaymentReview
              paymentId={selected.id}
              customerId={customerId}
              onClose={() => setSelected(undefined)}
            />
          ) : (
            <RecordDetail
              key={selected.id}
              row={selected}
              kind={kind}
              customerId={customerId}
              timeZone={timeZone}
            />
          ))}
      </RecordDialog>
    </section>
  );
}

function RecordDetail({
  row,
  kind,
  customerId,
  timeZone,
}: {
  row: Row;
  kind: 'invoices' | 'support' | 'email-history';
  customerId: string;
  timeZone: string;
}) {
  const [detail, setDetail] = useState<
    | ReturnType<typeof invoiceSchema.parse>
    | ReturnType<typeof ticketDetailSchema.parse>
  >();
  const [error, setError] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    if (kind === 'email-history') return;
    void authenticatedGet(
      `${kind === 'support' ? '/tickets' : '/invoices'}/${row.id}?customerId=${customerId}`,
    )
      .then((value) => {
        const parsed =
          kind === 'support'
            ? ticketDetailSchema.parse(value)
            : invoiceSchema.parse(value);
        const owner =
          'customerId' in parsed ? parsed.customerId : parsed.customer.id;
        if (
          parsed.id !== row.id ||
          owner.toLowerCase() !== customerId.toLowerCase()
        )
          throw new Error('Invalid client record');
        if (active) setDetail(parsed);
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, [row.id, kind, customerId, revision]);
  if (kind === 'email-history' && row.email)
    return (
      <div className="grid min-w-0 gap-4 break-words text-sm">
        <h3 className="font-bold">{row.email.subject}</h3>
        <p>
          {row.email.recipientEmail} · {sentenceCaseLabel(row.email.status)}
        </p>
        <p>
          Template: {row.email.templateKey} · Provider:{' '}
          {row.email.provider ?? 'Not assigned'} · Attempts:{' '}
          {row.email.attemptCount}
        </p>
        <DataTable
          caption="Email delivery attempts"
          rows={row.email.attempts}
          rowKey={(attempt) => attempt.id}
          columns={[
            {
              key: 'number',
              header: 'Attempt',
              render: (attempt) => attempt.attemptNumber,
            },
            {
              key: 'state',
              header: 'Status',
              render: (attempt) => sentenceCaseLabel(attempt.status),
            },
            {
              key: 'failure',
              header: 'Failure code',
              render: (attempt) => attempt.failureCode ?? '—',
            },
            {
              key: 'date',
              header: 'Started',
              render: (attempt) =>
                new Intl.DateTimeFormat('en-GB', {
                  dateStyle: 'short',
                  timeStyle: 'short',
                  timeZone,
                }).format(new Date(attempt.startedAt)),
            },
          ]}
        />
        {!row.email.attempts.length && <p>No delivery attempts recorded.</p>}
      </div>
    );
  if (error)
    return (
      <>
        <ErrorState description="The selected client record could not be loaded." />
        <Button
          onClick={() => {
            setError(false);
            setRevision((value) => value + 1);
          }}
        >
          Retry
        </Button>
      </>
    );
  if (!detail) return <LoadingState label="Loading record details" />;
  return 'invoiceNumber' in detail ? (
    <InvoiceDocument invoice={detail} />
  ) : (
    <TicketConversation
      ticket={detail}
      saving={false}
      readOnly
      onReply={(event) => event.preventDefault()}
    />
  );
}
