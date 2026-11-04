import type { Prisma } from '@webhost-billing/database';
import {
  invoiceAgingBuckets,
  type InvoiceAgingFilter,
} from '@webhost-billing/shared';
import { addCalendarDays } from '../dashboard-reports/dashboard-period';

export function invoiceAgingWhere({
  agingBucket,
  agingAsOf,
  agingCurrency,
}: InvoiceAgingFilter): Prisma.InvoiceWhereInput {
  const bucket = invoiceAgingBuckets.find(({ id }) => id === agingBucket);
  if (!bucket) throw new Error('Invalid invoice aging bucket.');
  const midnight = (days: number) =>
    new Date(`${addCalendarDays(agingAsOf, days)}T00:00:00.000Z`);
  // The ledger displays the persisted UTC calendar day for invoice due dates.
  return {
    status: 'OVERDUE',
    currency: agingCurrency,
    balanceDue: { gt: 0n },
    dueAt: {
      lt: midnight(1 - bucket.minimumDays),
      ...(bucket.maximumDays !== null
        ? { gte: midnight(-bucket.maximumDays) }
        : {}),
    },
  };
}
