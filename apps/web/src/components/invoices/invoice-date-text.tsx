'use client';

import { usePublicPreferences } from '../../lib/public-preferences';
import { invoiceDate, invoiceDueDate } from './invoice-ui';

export function InvoiceDateText({
  value,
  audience,
  calendar = false,
}: {
  value: string | null;
  audience: 'admin' | 'client';
  calendar?: boolean;
}) {
  const preferences = usePublicPreferences();
  const format =
    audience === 'admin'
      ? preferences.adminDateFormat
      : preferences.clientDateFormat;
  return calendar && value
    ? invoiceDueDate(value, format)
    : invoiceDate(value, format);
}
