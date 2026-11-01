import {
  addCalendarDays,
  businessDate,
  resolveDashboardPeriod,
  startOfBusinessDate,
} from './dashboard-period';

describe('dashboard business periods', () => {
  it('defaults to seven inclusive business dates across a month boundary', () => {
    const period = resolveDashboardPeriod(
      {},
      'Asia/Dhaka',
      new Date('2026-11-01T19:00:00Z'),
    );
    expect(period.from).toBe('2026-10-27');
    expect(period.to).toBe('2026-11-02');
    expect(period.start.toISOString()).toBe('2026-10-26T18:00:00.000Z');
    expect(period.endExclusive.toISOString()).toBe('2026-11-02T18:00:00.000Z');
  });
  it('anchors an omitted start to the supplied end date, including leap days', () => {
    expect(resolveDashboardPeriod({ to: '2024-03-01' }, 'UTC').from).toBe(
      '2024-02-24',
    );
    expect(
      resolveDashboardPeriod({}, 'UTC', new Date('2026-01-02T00:00Z')).from,
    ).toBe('2025-12-27');
  });
  it('creates inclusive UTC boundaries for the configured business timezone', () => {
    const period = resolveDashboardPeriod(
      { from: '2026-08-01', to: '2026-08-31' },
      'Asia/Dhaka',
    );
    expect(period.start.toISOString()).toBe('2026-07-31T18:00:00.000Z');
    expect(period.endExclusive.toISOString()).toBe('2026-08-31T18:00:00.000Z');
    expect(businessDate(period.start, 'Asia/Dhaka')).toBe('2026-08-01');
  });

  it('handles daylight-saving boundaries without assuming a fixed offset', () => {
    expect(
      startOfBusinessDate('2026-03-08', 'America/New_York').toISOString(),
    ).toBe('2026-03-08T05:00:00.000Z');
    expect(
      startOfBusinessDate('2026-03-09', 'America/New_York').toISOString(),
    ).toBe('2026-03-09T04:00:00.000Z');
    expect(addCalendarDays('2026-02-28', 1)).toBe('2026-03-01');
  });

  it('rejects reversed and overlong periods', () => {
    expect(() =>
      resolveDashboardPeriod({ from: '2026-08-31', to: '2026-08-01' }, 'UTC'),
    ).toThrow('ordered');
    expect(() =>
      resolveDashboardPeriod({ from: '2025-01-01', to: '2026-01-02' }, 'UTC'),
    ).toThrow('366 days');
  });
});
