import type { HostingBillingPeriod } from '@webhost-billing/shared';

const periodMonths: Record<HostingBillingPeriod, number> = {
  MONTHLY: 1,
  QUARTERLY: 3,
  ANNUAL: 12,
};

export function nextServiceDueAt(
  startedAt: Date,
  billingPeriod: HostingBillingPeriod,
): Date {
  const months = periodMonths[billingPeriod];
  const targetMonth = startedAt.getUTCMonth() + months;
  const targetYear = startedAt.getUTCFullYear() + Math.floor(targetMonth / 12);
  const normalizedMonth = targetMonth % 12;
  const lastDay = new Date(
    Date.UTC(targetYear, normalizedMonth + 1, 0),
  ).getUTCDate();
  return new Date(
    Date.UTC(
      targetYear,
      normalizedMonth,
      Math.min(startedAt.getUTCDate(), lastDay),
      startedAt.getUTCHours(),
      startedAt.getUTCMinutes(),
      startedAt.getUTCSeconds(),
      startedAt.getUTCMilliseconds(),
    ),
  );
}
