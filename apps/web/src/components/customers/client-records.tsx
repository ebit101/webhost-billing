'use client';
import {
  domainDetailSchema,
  serviceSchema,
  sentenceCaseLabel,
  type DomainDetail,
  type Service,
} from '@webhost-billing/shared';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  authenticatedGet,
  authenticatedPaginatedGet,
} from '../../lib/auth-api';
import { clientRecordHref } from '../../lib/client-record-href';
import { DataTable } from '../ui/data-table';
import { Button } from '../ui/button';
import { ErrorState, LoadingState } from '../ui/feedback-state';
import { Card, fieldClass } from './customer-fields';
import { DomainRecord } from '../domains/domain-record';
import { formatMinor } from '../invoices/invoice-ui';
import { serviceDate } from '../services/service-ui';

type Props = {
  customerId?: string;
  kind: 'domains' | 'services';
  recordId?: string;
  administrator?: boolean;
};
type Selected =
  | { kind: 'domains'; record: DomainDetail }
  | { kind: 'services'; record: Service };
export function ClientRecords(props: Props) {
  return (
    <Records
      key={`${props.customerId ?? 'self'}:${props.kind}:${props.recordId ?? ''}`}
      {...props}
    />
  );
}
function Records({ customerId, kind, recordId, administrator = true }: Props) {
  const router = useRouter();
  const [rows, setRows] = useState<
    Array<{
      id: string;
      label: string;
      state: string;
      registrar?: string;
      price?: string;
      expiry?: string;
    }>
  >([]);
  const [selected, setSelected] = useState<Selected>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const valid =
    (!administrator ||
      Boolean(
        customerId &&
        serviceSchema.shape.customerId.safeParse(customerId).success,
      )) &&
    (!recordId || serviceSchema.shape.id.safeParse(recordId).success);
  const href = (id?: string) =>
    administrator
      ? clientRecordHref(customerId!, kind, id)
      : `/portal/domains${id ? '/' + id : ''}`;
  useEffect(() => {
    let active = true;
    if (!valid) return;
    void (async () => {
      const scope = customerId
        ? `customerId=${encodeURIComponent(customerId)}`
        : '';
      const list =
        kind === 'domains'
          ? domainDetailSchema
              .array()
              .parse(
                await authenticatedGet(`/domains${scope ? '?' + scope : ''}`),
              )
          : serviceSchema
              .array()
              .parse(
                (
                  await authenticatedPaginatedGet<unknown>(
                    `/services?${scope}&pageSize=100`,
                  )
                ).data,
              );
      if (
        administrator &&
        list.some(
          (record) =>
            record.customerId?.toLowerCase() !== customerId!.toLowerCase(),
        )
      )
        throw new Error('Client record list does not match.');
      const record = recordId
        ? kind === 'domains'
          ? domainDetailSchema.parse(
              await authenticatedGet(
                `/domains/${recordId}${scope ? '?' + scope : ''}`,
              ),
            )
          : serviceSchema.parse(
              await authenticatedGet(`/services/${recordId}?${scope}`),
            )
        : undefined;
      if (
        record &&
        (record.id.toLowerCase() !== recordId!.toLowerCase() ||
          (administrator &&
            record.customerId?.toLowerCase() !== customerId!.toLowerCase()))
      )
        throw new Error('Selected record does not belong to this client.');
      if (active) {
        const all =
          record && !list.some((row) => row.id === record.id)
            ? [record, ...list]
            : list;
        setRows(
          all.map((row) => ({
            id: row.id,
            label:
              'domainName' in row
                ? row.domainName
                : (row.domain ?? row.productName),
            state: 'state' in row ? row.state : row.status,
            ...('domainName' in row
              ? {
                  registrar: row.registrar,
                  price: formatMinor(row.sellingAmount, row.currency),
                  expiry: serviceDate(row.expiresAt),
                }
              : {}),
          })),
        );
        if (record)
          setSelected(
            kind === 'domains'
              ? { kind, record: domainDetailSchema.parse(record) }
              : { kind, record: serviceSchema.parse(record) },
          );
      }
    })()
      .catch((caught) => {
        if (active)
          setError(
            caught instanceof Error
              ? caught.message
              : 'Client records could not be loaded.',
          );
      })
      .finally(() => {
        if (active) {
          setLoading(false);
          setBusy(false);
        }
      });
    return () => {
      active = false;
    };
  }, [customerId, kind, recordId, revision, valid, administrator]);
  async function perform(action: () => Promise<unknown>) {
    setBusy(true);
    setNotice('');
    try {
      await action();
      setRevision((value) => value + 1);
      setNotice('Request completed. Refresh to view worker reconciliation.');
    } catch (caught) {
      setNotice(
        caught instanceof Error ? caught.message : 'The request failed.',
      );
      setBusy(false);
    }
  }
  if (!valid)
    return <ErrorState description="Invalid client record selection." />;
  if (loading) return <LoadingState label="Loading client records" />;
  function refresh() {
    setError('');
    setLoading(true);
    setBusy(true);
    setRevision((value) => value + 1);
  }
  if (error)
    return (
      <ErrorState
        description={error}
        action={<Button onClick={refresh}>Retry saved records</Button>}
      />
    );
  return (
    <section
      className="grid min-w-0 gap-4"
      aria-label={
        kind === 'domains' ? 'Client domains' : 'Client hosting services'
      }
    >
      {notice ? <p role="status">{notice}</p> : null}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <label className="w-full max-w-xl text-sm font-semibold">
          {kind === 'domains' ? 'Domains' : 'Products/services'}
          <select
            className={fieldClass}
            value={recordId ?? ''}
            disabled={busy}
            onChange={(event) =>
              router.push(href(event.target.value || undefined))
            }
          >
            <option value="">View client records</option>
            {rows.map((row) => (
              <option key={row.id} value={row.id}>
                {row.label}
              </option>
            ))}
          </select>
        </label>
        <Button variant="secondary" disabled={busy} onClick={refresh}>
          Refresh saved records
        </Button>
      </div>
      <p className="text-xs text-slate-500">
        Up to 100 recent records for this client; the selected record is
        retained when older.
      </p>
      {selected?.kind === 'domains' ? (
        <DomainRecord
          domain={selected.record}
          administrator={administrator}
          busy={busy}
          perform={perform}
        />
      ) : selected?.kind === 'services' ? (
        <Card title={selected.record.domain ?? selected.record.productName}>
          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            {Object.entries({
              Product: selected.record.productName,
              Status: sentenceCaseLabel(selected.record.status),
              'Billing period': sentenceCaseLabel(
                selected.record.billingPeriod,
              ),
              'Recurring amount': formatMinor(
                selected.record.recurringAmount.amount,
                selected.record.recurringAmount.currency,
              ),
              'Next due date': serviceDate(selected.record.nextDueAt),
              Server: selected.record.server.name,
              'Hosting account':
                selected.record.controlPanelUsername ?? 'Not provisioned',
            }).map(([label, value]) => (
              <div key={label}>
                <dt className="text-slate-500">{label}</dt>
                <dd className="break-words font-semibold">{value}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-sm text-slate-600">
            Saved application information. This page does not contact the
            hosting panel.
          </p>
          <div className="mt-4 flex flex-wrap gap-4">
            <Link
              href={href()}
              className="font-semibold text-brand-700 underline"
            >
              Manage this client&apos;s services
            </Link>
            {selected.record.orderId ? (
              <Link
                href={`/admin/orders?customerId=${customerId}&orderId=${selected.record.orderId}`}
                className="font-semibold text-brand-700 underline"
              >
                View order
              </Link>
            ) : null}
          </div>
        </Card>
      ) : (
        <DataTable
          caption="Client domain records"
          rows={rows}
          rowKey={(row) => row.id}
          columns={[
            {
              key: 'name',
              header: 'Domain',
              render: (row) => (
                <Link
                  prefetch={false}
                  className="font-semibold text-brand-700 underline"
                  href={href(row.id)}
                >
                  {row.label}
                </Link>
              ),
            },
            {
              key: 'registrar',
              header: 'Registrar',
              render: (row) => row.registrar,
            },
            {
              key: 'price',
              header: 'Initial amount',
              render: (row) => row.price,
            },
            {
              key: 'expiry',
              header: 'Expiry date',
              render: (row) => row.expiry,
            },
            {
              key: 'status',
              header: 'Status',
              render: (row) => sentenceCaseLabel(row.state),
            },
          ]}
        />
      )}
    </section>
  );
}
