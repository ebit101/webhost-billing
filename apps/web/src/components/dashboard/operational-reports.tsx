'use client';

import {
  operationalReportIds,
  operationalReports,
  operationalReportResponseSchema,
  operationalReportRequestSchema,
  type OperationalReportId,
  type OperationalReportResponse,
} from '@webhost-billing/shared';
import { useEffect, useState, type FormEvent } from 'react';
import { authenticatedGet, authenticatedDownload } from '../../lib/auth-api';
import { formatMinor } from '../orders/order-ui';
import { Button } from '../ui/button';
import { DataTable } from '../ui/data-table';

export function OperationalReports() {
  const [scope, setScope] = useState<{
    report: OperationalReportId;
    page: number;
    from?: string;
    to?: string;
  }>({ report: 'income', page: 1 });
  const [data, setData] = useState<OperationalReportResponse>();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const definition = operationalReports[scope.report];

  useEffect(() => {
    let active = true;
    const query = new URLSearchParams({
      page: String(scope.page),
      pageSize: '20',
      ...(scope.from && scope.to ? { from: scope.from, to: scope.to } : {}),
    });
    void authenticatedGet<unknown>(
      `/reports/operations/${scope.report}?${query}`,
    )
      .then((value) => {
        if (!active) return;
        const result = operationalReportResponseSchema.parse(value);
        if (result.report !== scope.report)
          throw new Error('The returned report does not match your selection.');
        setData(result);
        setFrom(result.period.from);
        setTo(result.period.to);
      })
      .catch((caught: unknown) => {
        if (active) setError(message(caught));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [scope, attempt]);

  function navigate(next: typeof scope) {
    setLoading(true);
    setData(undefined);
    setError('');
    setScope({ ...(data ? data.period : {}), ...next });
  }

  function apply(event: FormEvent) {
    event.preventDefault();
    if (
      !operationalReportRequestSchema.safeParse({
        from,
        to,
        page: 1,
        pageSize: 20,
      }).success ||
      from > to
    ) {
      setError('Enter valid dates with From no later than To.');
      return;
    }
    navigate({ report: scope.report, page: 1, from, to });
  }
  async function download() {
    if (!data || loading || exporting) return;
    setExporting(true);
    setError('');
    try {
      const result = await authenticatedDownload(
        `/reports/operations/${data.report}/export`,
        data.period,
      );
      const url = URL.createObjectURL(result.blob);
      try {
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = result.filename;
        anchor.click();
      } finally {
        URL.revokeObjectURL(url);
      }
    } catch (caught) {
      setError(message(caught));
    } finally {
      setExporting(false);
    }
  }
  return (
    <section
      className="grid min-w-0 gap-4"
      aria-label="Operational and financial reports"
    >
      <form
        onSubmit={apply}
        className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4"
      >
        <label className="grid gap-1 text-sm font-semibold">
          Report
          <select
            className="min-h-11 rounded-lg border border-slate-300 px-3"
            value={scope.report}
            disabled={exporting}
            onChange={(event) =>
              navigate({
                ...scope,
                report: event.target.value as OperationalReportId,
                page: 1,
              })
            }
          >
            {operationalReportIds.map((id) => (
              <option key={id} value={id}>
                {operationalReports[id].title}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm font-semibold">
          From
          <input
            type="date"
            className="min-h-11 rounded-lg border border-slate-300 px-3"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            required
            disabled={loading || exporting}
          />
        </label>
        <label className="grid gap-1 text-sm font-semibold">
          To
          <input
            type="date"
            className="min-h-11 rounded-lg border border-slate-300 px-3"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            required
            disabled={loading || exporting}
          />
        </label>
        <Button disabled={loading || exporting}>Apply period</Button>
        <Button
          type="button"
          variant="secondary"
          disabled={!data || loading || exporting}
          onClick={() => void download()}
        >
          {exporting ? 'Preparing export…' : 'Export report CSV'}
        </Button>
      </form>
      <div className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-bold">{definition.title}</h2>
        <p className="text-sm font-semibold">{definition.basis}</p>
        <p className="text-sm text-slate-600">{definition.notes}</p>
        {loading && <p role="status">Loading report…</p>}
        {error && (
          <div role="alert">
            <p>{error}</p>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setLoading(true);
                setData(undefined);
                setError('');
                setAttempt((value) => value + 1);
              }}
            >
              Try again
            </Button>
          </div>
        )}
        {data && (
          <>
            <p className="text-sm text-slate-600">
              {data.period.from} to {data.period.to} · {data.currency} ·{' '}
              {data.timeZone}. Generated{' '}
              {instant(data.generatedAt, data.timeZone)}. Totals cover all
              matching rows.
            </p>
            <DataTable
              caption={definition.title}
              columns={definition.columns.map((column, index) => ({
                key: String(index),
                header: column.label,
                align:
                  column.format === 'money' || column.format === 'count'
                    ? ('right' as const)
                    : ('left' as const),
                render: (row: OperationalReportResponse['rows'][number]) =>
                  column.format === 'money'
                    ? formatMinor(row.cells[index], data.currency)
                    : column.format === 'instant'
                      ? instant(row.cells[index], data.timeZone)
                      : row.cells[index] || '—',
              }))}
              rows={[
                ...data.rows,
                ...(data.rows.length && data.totals.some(Boolean)
                  ? [
                      {
                        id: 'all-report-totals',
                        cells: data.totals.map((value, index) =>
                          index === 0 ? 'All report rows' : value,
                        ),
                      },
                    ]
                  : []),
              ]}
              rowKey={(row) => row.id}
            />
            {!data.rows.length && <p>No matching report rows.</p>}
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <p>
                {data.pagination.totalItems} rows · Page {data.pagination.page}{' '}
                of {Math.max(1, data.pagination.totalPages)}
              </p>
              <Button
                type="button"
                variant="secondary"
                disabled={loading || exporting || scope.page <= 1}
                onClick={() => navigate({ ...scope, page: scope.page - 1 })}
              >
                Previous page
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={
                  loading ||
                  exporting ||
                  scope.page >= data.pagination.totalPages
                }
                onClick={() => navigate({ ...scope, page: scope.page + 1 })}
              >
                Next page
              </Button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
function message(value: unknown) {
  return value instanceof Error
    ? value.message
    : 'The report could not be loaded.';
}
function instant(value: string, timeZone: string) {
  if (!value) return 'Not recorded';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Unknown'
    : new Intl.DateTimeFormat('en-GB', {
        timeZone,
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(date);
}
