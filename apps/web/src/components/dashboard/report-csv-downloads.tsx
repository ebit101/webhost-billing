'use client';

import {
  formatCalendarDate,
  type DashboardResponse,
  type ReportResource,
} from '@webhost-billing/shared';
import { useState } from 'react';
import { authenticatedDownload } from '../../lib/auth-api';

const exportLabels: Record<ReportResource, string> = {
  customers: 'Customers CSV',
  invoices: 'Invoices CSV',
  payments: 'Payments CSV',
  services: 'Services CSV',
};

export function ReportCsvDownloads({
  period,
}: {
  period: DashboardResponse['period'];
}) {
  const [exporting, setExporting] = useState<ReportResource | null>(null);
  const [error, setError] = useState('');

  async function exportReport(resource: ReportResource) {
    setExporting(resource);
    setError('');
    try {
      const download = await authenticatedDownload(
        `/reports/exports/${resource}`,
        period,
      );
      const url = URL.createObjectURL(download.blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = download.filename;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'The export could not be downloaded.',
      );
    } finally {
      setExporting(null);
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="font-bold text-slate-950">CSV reports</h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">
        Invoice and payment exports cover {formatCalendarDate(period.from)} to{' '}
        {formatCalendarDate(period.to)}. Customer and service exports are
        current snapshots. Every export is audited.
      </p>
      {error ? (
        <p role="alert" className="mt-3 text-sm text-red-800">
          {error}
        </p>
      ) : null}
      <div className="mt-5 grid gap-3">
        {(Object.keys(exportLabels) as ReportResource[]).map((resource) => (
          <button
            key={resource}
            type="button"
            disabled={exporting !== null}
            onClick={() => void exportReport(resource)}
            className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3 text-left text-sm font-bold text-slate-800 hover:border-brand-300 hover:bg-brand-50 disabled:opacity-50"
          >
            {exporting === resource
              ? 'Preparing download…'
              : exportLabels[resource]}
            <span aria-hidden="true">↓</span>
          </button>
        ))}
      </div>
    </section>
  );
}
