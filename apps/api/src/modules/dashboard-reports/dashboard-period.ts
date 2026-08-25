import { HttpStatus } from '@nestjs/common';
import type { DashboardQuery } from '@webhost-billing/shared';
import { ApplicationException } from '../../common/errors/application.exception';

export interface DashboardPeriod {
  from: string;
  to: string;
  start: Date;
  endExclusive: Date;
}

export function businessDate(value: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value;
  return `${read('year')}-${read('month')}-${read('day')}`;
}

export function addCalendarDays(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year!, month! - 1, day! + days))
    .toISOString()
    .slice(0, 10);
}

export function startOfBusinessDate(date: string, timeZone: string): Date {
  const [year, month, day] = date.split('-').map(Number);
  const target = Date.UTC(year!, month! - 1, day!);
  let candidate = target;
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const values = Object.fromEntries(
      formatter
        .formatToParts(new Date(candidate))
        .filter((part) => part.type !== 'literal')
        .map((part) => [part.type, Number(part.value)]),
    );
    const represented = Date.UTC(
      values.year!,
      values.month! - 1,
      values.day!,
      values.hour!,
      values.minute!,
      values.second!,
    );
    candidate += target - represented;
  }
  return new Date(candidate);
}

export function resolveDashboardPeriod(
  query: DashboardQuery,
  timeZone: string,
  now = new Date(),
): DashboardPeriod {
  const today = businessDate(now, timeZone);
  const from = query.from ?? `${today.slice(0, 8)}01`;
  const to = query.to ?? today;
  const days = Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
      86_400_000,
  );
  if (days < 0 || days > 365) {
    throw new ApplicationException({
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      code: 'UNPROCESSABLE_ENTITY',
      message: 'Dashboard period must be ordered and no longer than 366 days.',
    });
  }
  return {
    from,
    to,
    start: startOfBusinessDate(from, timeZone),
    endExclusive: startOfBusinessDate(addCalendarDays(to, 1), timeZone),
  };
}
