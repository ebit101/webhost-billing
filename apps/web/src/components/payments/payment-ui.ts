import type { ManualPaymentState } from '@webhost-billing/shared';
import type { StatusTone } from '../ui/status-badge';

export function paymentTone(state: ManualPaymentState): StatusTone {
  if (state === 'VERIFIED') return 'success';
  if (state === 'PENDING') return 'warning';
  if (state === 'REJECTED' || state === 'REVERSED') return 'danger';
  return 'info';
}

export function paymentDate(value: string | null) {
  return value
    ? new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(
        new Date(value),
      )
    : '—';
}

export function paymentError(error: unknown) {
  return error instanceof Error
    ? error.message
    : 'The payment request could not be completed.';
}
