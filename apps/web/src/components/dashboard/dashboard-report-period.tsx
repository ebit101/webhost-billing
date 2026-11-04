'use client';

import {
  formatCalendarDate,
  parseCalendarDate,
  type DashboardResponse,
} from '@webhost-billing/shared';
import { useEffect, useState, type FormEvent } from 'react';
import { authenticatedGet } from '../../lib/auth-api';

export function useDashboardReport() {
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  async function load(path = '/dashboard') {
    setLoading(true);
    setError('');
    try {
      const result = await authenticatedGet<DashboardResponse>(path);
      setDashboard(result);
      setFrom(formatCalendarDate(result.period.from));
      setTo(formatCalendarDate(result.period.to));
    } catch (requestError) {
      setError(message(requestError));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    void authenticatedGet<DashboardResponse>('/dashboard')
      .then((result) => {
        if (!active) return;
        setDashboard(result);
        setFrom(formatCalendarDate(result.period.from));
        setTo(formatCalendarDate(result.period.to));
      })
      .catch((requestError: unknown) => {
        if (active) setError(message(requestError));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function applyPeriod(event: FormEvent) {
    event.preventDefault();
    const fromDate = parseCalendarDate(from);
    const toDate = parseCalendarDate(to);
    if (!fromDate || !toDate || fromDate > toDate) {
      setError('Enter valid dates as dd/mm/yyyy, with From no later than To.');
      return;
    }
    await load(
      `/dashboard?${new URLSearchParams({ from: fromDate, to: toDate })}`,
    );
  }

  return {
    dashboard,
    from,
    to,
    error,
    loading,
    load,
    applyPeriod,
    setFrom,
    setTo,
  };
}

export function ReportPeriodForm({
  from,
  to,
  loading,
  applyPeriod,
  setFrom,
  setTo,
}: ReturnType<typeof useDashboardReport>) {
  return (
    <form
      onSubmit={(event) => void applyPeriod(event)}
      className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
    >
      <DateField label="From" value={from} onChange={setFrom} />
      <DateField label="To" value={to} onChange={setTo} />
      <button
        disabled={loading}
        className="rounded-xl bg-slate-950 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50"
      >
        {loading ? 'Refreshing…' : 'Apply period'}
      </button>
      <p className="ml-auto text-xs text-slate-500">
        Inclusive business dates · maximum 366 days
      </p>
    </form>
  );
}

function DateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-1 text-xs font-bold tracking-wide text-slate-500">
      {label}
      <input
        required
        type="text"
        placeholder="dd/mm/yyyy"
        pattern="[0-9]{2}/[0-9]{2}/[0-9]{4}"
        title="Use dd/mm/yyyy"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium normal-case tracking-normal text-slate-900"
      />
    </label>
  );
}

function message(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'The report could not be loaded.';
}
