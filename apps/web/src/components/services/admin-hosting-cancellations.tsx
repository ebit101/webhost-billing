'use client';

import type { HostingCancellationReview } from '@webhost-billing/shared';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { authenticatedPaginatedGet, authMutation } from '../../lib/auth-api';
import { Button } from '../ui/button';
import { ConfirmationDialog } from '../ui/confirmation-dialog';
import { serviceDate, serviceError } from './service-ui';

export function AdminHostingCancellations() {
  const [rows, setRows] = useState<HostingCancellationReview[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selection, setSelection] = useState<HostingCancellationReview>();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let active = true;
    void authenticatedPaginatedGet<HostingCancellationReview>(
      `/services/cancellation-requests?page=${page}`,
    )
      .then(({ data, pagination }) => {
        if (!active) return;
        setRows(data);
        setTotalPages(pagination.totalPages);
      })
      .catch((caught: unknown) => {
        if (active) setError(serviceError(caught));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [page, revision]);

  async function approve(request: HostingCancellationReview) {
    setSaving(true);
    setError('');
    try {
      await authMutation(
        `/services/${request.serviceId}/cancellation-request/${request.id}/approve`,
        'POST',
      );
      setSelection(undefined);
      setNotice('Immediate cancellation approved. Hosting suspension queued.');
      setRevision((value) => value + 1);
    } catch (caught) {
      setError(serviceError(caught));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold">Hosting cancellation requests</h2>
        <Button
          variant="secondary"
          onClick={() => {
            setError('');
            setLoading(true);
            setRevision((value) => value + 1);
          }}
        >
          Refresh
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="text-sm text-emerald-700">
          {notice}
        </p>
      )}
      {loading ? (
        <p>Loading cancellation requests…</p>
      ) : rows.length === 0 ? (
        <p>No open hosting cancellation requests.</p>
      ) : (
        <ul className="divide-y divide-slate-200">
          {rows.map((request) => (
            <li
              key={request.id}
              className="flex flex-wrap items-center justify-between gap-3 py-3"
            >
              <div>
                <Link
                  href={`/admin/services?search=${encodeURIComponent(request.domain ?? request.productName)}`}
                  className="font-semibold text-brand-700 underline"
                >
                  {request.productName}
                  {request.domain ? ` · ${request.domain}` : ''}
                </Link>
                <p className="text-sm">
                  {request.effectiveAt
                    ? `Scheduled for ${serviceDate(request.effectiveAt)}`
                    : request.approvedAt
                      ? 'Approved · Suspension queued'
                      : 'Immediate · Pending review'}
                </p>
                {request.reason && (
                  <p className="mt-1 break-words text-sm text-slate-600">
                    {request.reason}
                  </p>
                )}
              </div>
              {request.timing === 'IMMEDIATE' && !request.approvedAt && (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setError('');
                    setSelection(request);
                  }}
                >
                  Review immediate request
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {totalPages > 1 && (
        <div className="flex gap-2">
          <Button
            variant="secondary"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
          >
            Previous page
          </Button>
          <Button
            variant="secondary"
            disabled={page >= totalPages}
            onClick={() => setPage(page + 1)}
          >
            Next page
          </Button>
        </div>
      )}
      <ConfirmationDialog
        open={Boolean(selection)}
        title="Approve immediate cancellation?"
        description={
          error ||
          'Approval queues hosting suspension. Review any open invoices before approving. Domain renewal and permanent deletion are separate actions.'
        }
        confirmLabel="Approve cancellation"
        busy={saving}
        destructive
        onClose={() => setSelection(undefined)}
        onConfirm={() => {
          if (selection) void approve(selection);
        }}
      />
    </section>
  );
}
