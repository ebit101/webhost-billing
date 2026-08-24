import type { InvoiceStatus } from '@webhost-billing/shared';
import { formatMinor } from '../orders/order-ui';

export { formatMinor };

export function invoiceTone(status: InvoiceStatus) {
  if (status === 'PAID') return 'success' as const;
  if (status === 'UNPAID' || status === 'DRAFT') return 'warning' as const;
  if (status === 'PARTIALLY_REFUNDED') return 'info' as const;
  return 'danger' as const;
}

export function invoiceError(error: unknown) {
  return error instanceof Error
    ? error.message
    : 'The invoice request could not be completed.';
}

export function invoiceDate(value: string | null) {
  return value ? new Date(value).toLocaleDateString() : '—';
}
