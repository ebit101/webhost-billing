import {
  formatCalendarDate,
  type DashboardResponse,
} from '@webhost-billing/shared';
import { formatMinor } from '../orders/order-ui';

export function RevenueReportChart({
  dashboard,
}: {
  dashboard: DashboardResponse;
}) {
  const { revenueSeries, timeZone, currency, period } = dashboard;
  const amounts = revenueSeries.map((point) => BigInt(point.amount));
  const hasNegative = amounts.some((value) => value < 0n);
  const maximum = amounts.reduce((max, value) => {
    const magnitude = value < 0n ? -value : value;
    return magnitude > max ? magnitude : max;
  }, 1n);

  return (
    <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="font-bold text-slate-950">Daily collected revenue</h2>
      <p className="mt-1 text-xs text-slate-500">
        Verified charges less refunds and reversals by {timeZone} business date.
      </p>
      <div
        className="relative mt-6 flex h-52 gap-1 overflow-x-auto"
        aria-label="Daily collected revenue chart"
      >
        {revenueSeries.map((point, index) => {
          const value = amounts[index];
          const magnitude = value < 0n ? -value : value;
          const height = Number((magnitude * 1000n) / maximum) / 10;
          const label = `${formatCalendarDate(point.date)}: ${formatMinor(point.amount, currency)}`;
          return (
            <div
              key={point.date}
              className="flex min-w-3 flex-1 flex-col"
              title={label}
            >
              <span className="sr-only">{label}</span>
              <div className="flex flex-1 items-end border-b border-slate-300">
                {value > 0n ? (
                  <div
                    className="w-full rounded-t bg-brand-600"
                    style={{ height: `${height}%` }}
                  />
                ) : null}
              </div>
              {hasNegative ? (
                <div className="flex-1">
                  {value < 0n ? (
                    <div
                      className="w-full rounded-b bg-red-500"
                      style={{ height: `${height}%` }}
                    />
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex justify-between text-xs text-slate-600">
        <span>{formatCalendarDate(period.from)}</span>
        <span>{formatCalendarDate(period.to)}</span>
      </div>
    </section>
  );
}
