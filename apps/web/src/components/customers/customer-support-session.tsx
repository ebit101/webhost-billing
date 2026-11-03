'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { authMutation } from '../../lib/auth-api';
import { Button } from '../ui/button';
import { useClientReady } from '../auth/form-controls';
import { RecordDialog } from '../ui/record-dialog';

export function StartCustomerSupportSession({
  customerId,
}: {
  customerId: string;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function start(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const reason = String(
      new FormData(event.currentTarget).get('reason') ?? '',
    ).trim();
    if (!reason) {
      setError('Enter a support reason.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await authMutation(
        `/auth/customer-support-sessions/${customerId}`,
        'POST',
        { reason },
      );
      window.location.assign('/portal');
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Could not start the support session.',
      );
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className="ml-3 font-semibold text-brand-700 underline"
        onClick={() => setOpen(true)}
      >
        Sign in as customer
      </button>
      <RecordDialog
        open={open}
        title="Sign in as customer"
        busy={busy}
        onClose={() => {
          setOpen(false);
          setError('');
        }}
      >
        <form onSubmit={start} className="grid gap-4">
          <p>
            Open the customer portal in read-only mode for up to 15 minutes.
            Your support reason is recorded in the audit log.
          </p>
          <label className="grid gap-1 font-semibold">
            Support reason
            <textarea
              name="reason"
              required
              maxLength={500}
              rows={3}
              data-record-autofocus
              className="rounded-lg border border-slate-300 p-2 font-normal"
            />
          </label>
          {error && (
            <p role="alert" className="text-red-700">
              {error}
            </p>
          )}
          <Button type="submit" disabled={busy}>
            Start read-only session
          </Button>
        </form>
      </RecordDialog>
    </>
  );
}

export function CustomerSupportSessionBanner({
  expiresAt,
  customerName,
}: {
  expiresAt?: string;
  customerName?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const ready = useClientReady();
  useEffect(() => {
    if (!expiresAt) return;
    const timer = window.setTimeout(
      () => window.location.replace('/support-session'),
      Math.max(0, Date.parse(expiresAt) - Date.now()),
    );
    return () => window.clearTimeout(timer);
  }, [expiresAt]);

  async function end() {
    setBusy(true);
    setError('');
    try {
      const { customerId } = await authMutation<{ customerId: string | null }>(
        '/auth/customer-support-session/end',
        'POST',
      );
      window.location.replace(
        customerId
          ? `/admin/customers/${encodeURIComponent(customerId)}`
          : '/admin',
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Could not end the support session.',
      );
      setBusy(false);
    }
  }

  return (
    <aside
      aria-label="Customer support session"
      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"
    >
      <div>
        <p className="font-semibold">
          {expiresAt
            ? 'Read-only support session'
            : 'Support session is no longer active'}
        </p>
        <p>
          {expiresAt
            ? `Viewing ${customerName ?? 'the customer'}’s portal. Account changes are disabled.`
            : 'End the session to return to the administrator workspace.'}
        </p>
        {error && (
          <p role="alert" className="text-red-700">
            {error}
          </p>
        )}
      </div>
      <Button
        variant="secondary"
        disabled={!ready || busy}
        onClick={() => void end()}
      >
        End session
      </Button>
    </aside>
  );
}
