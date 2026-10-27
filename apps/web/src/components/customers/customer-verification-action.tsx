'use client';

import type { CustomerDetail } from '@webhost-billing/shared';
import { useEffect, useRef, useState } from 'react';
import { authMutation } from '../../lib/auth-api';
import { Button } from '../ui/button';
import { ConfirmationDialog } from '../ui/confirmation-dialog';

export function CustomerVerificationAction({
  customer,
  disabled,
  onFeedback,
}: {
  customer: CustomerDetail;
  disabled: boolean;
  onFeedback: (message: string, failed: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(false);
  const requestId = useRef<string | null>(null);

  useEffect(() => {
    if (!cooldown) return;
    const timer = window.setTimeout(() => setCooldown(false), 60_000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  async function resend() {
    if (busy || disabled || cooldown) return;
    setBusy(true);
    onFeedback('', false);
    try {
      requestId.current ??= crypto.randomUUID();
      await authMutation(
        `/customers/${customer.id}/resend-verification`,
        'POST',
        {
          requestId: requestId.current,
        },
      );
      requestId.current = null;
      setCooldown(true);
      onFeedback(
        'Verification email queued. The customer must use the emailed link to verify their account. Wait one minute before resending.',
        false,
      );
    } catch (error) {
      // Keep the key when the outcome is unknown so retrying cannot queue twice.
      onFeedback(
        error instanceof Error
          ? error.message
          : 'Verification email could not be queued.',
        true,
      );
    } finally {
      setBusy(false);
      setOpen(false);
    }
  }

  if (
    customer.emailVerified ||
    customer.status !== 'ACTIVE' ||
    customer.accountStatus !== 'PENDING_VERIFICATION'
  )
    return null;

  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        disabled={disabled || busy || cooldown}
        onClick={() => setOpen(true)}
      >
        Resend verification email
      </Button>
      <ConfirmationDialog
        open={open}
        title="Resend verification email?"
        description={`Queue a verification link for ${customer.email}. This does not verify or activate the account.`}
        confirmLabel="Queue verification email"
        busy={busy}
        onConfirm={() => void resend()}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
