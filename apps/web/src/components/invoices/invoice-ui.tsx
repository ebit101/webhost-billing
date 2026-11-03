import { formatCalendarDate } from '@webhost-billing/shared';
import type { DateDisplayFormat, InvoiceStatus } from '@webhost-billing/shared';
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

export function invoiceDate(
  value: string | null,
  format: DateDisplayFormat = 'day-first',
) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const day = new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).formatToParts(date);
  const part = (type: 'day' | 'month' | 'year') =>
    day.find((item) => item.type === type)?.value;
  return formatCalendarDate(
    `${part('year')}-${part('month')}-${part('day')}`,
    format,
  );
}

// Draft dates and PDF due dates use the persisted UTC calendar day. Do not
// reinterpret the end-of-day timestamp in the viewer's browser time zone.
export function invoiceDueDate(value: string, format?: DateDisplayFormat) {
  return formatCalendarDate(value, format);
}
