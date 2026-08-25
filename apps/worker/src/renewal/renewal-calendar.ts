import type { HostingBillingPeriod } from '@webhost-billing/shared';

const periodMonths: Record<HostingBillingPeriod, number> = {
  MONTHLY: 1,
  QUARTERLY: 3,
  ANNUAL: 12,
};

export function addBillingPeriod(
  value: Date,
  billingPeriod: HostingBillingPeriod,
): Date {
  const targetMonth = value.getUTCMonth() + periodMonths[billingPeriod];
  const targetYear = value.getUTCFullYear() + Math.floor(targetMonth / 12);
  const normalizedMonth = ((targetMonth % 12) + 12) % 12;
  const lastDay = new Date(
    Date.UTC(targetYear, normalizedMonth + 1, 0),
  ).getUTCDate();
  return new Date(
    Date.UTC(
      targetYear,
      normalizedMonth,
      Math.min(value.getUTCDate(), lastDay),
      value.getUTCHours(),
      value.getUTCMinutes(),
      value.getUTCSeconds(),
      value.getUTCMilliseconds(),
    ),
  );
}

export function businessDate(value: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((candidate) => candidate.type === type)?.value;
  const year = part('year');
  const month = part('month');
  const day = part('day');
  if (!year || !month || !day) throw new Error('Business date unavailable');
  return `${year}-${month}-${day}`;
}

export function addBusinessDays(date: string, days: number): string {
  const parsed = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(date);
  if (!parsed) throw new Error('Business date invalid');
  const [, year, month, day] = parsed;
  const value = new Date(
    Date.UTC(Number(year), Number(month) - 1, Number(day) + days),
  );
  return value.toISOString().slice(0, 10);
}

export function isOnOrAfter(left: string, right: string): boolean {
  return left >= right;
}
