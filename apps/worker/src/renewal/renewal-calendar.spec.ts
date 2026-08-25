import {
  addBillingPeriod,
  addBusinessDays,
  businessDate,
} from './renewal-calendar';

describe('renewal calendar', () => {
  it('clamps month-end renewals without drifting their UTC time', () => {
    expect(
      addBillingPeriod(
        new Date('2027-01-31T18:30:45.123Z'),
        'MONTHLY',
      ).toISOString(),
    ).toBe('2027-02-28T18:30:45.123Z');
    expect(
      addBillingPeriod(
        new Date('2028-01-31T18:30:45.123Z'),
        'MONTHLY',
      ).toISOString(),
    ).toBe('2028-02-29T18:30:45.123Z');
  });

  it('handles a leap-day annual renewal deterministically', () => {
    expect(
      addBillingPeriod(
        new Date('2028-02-29T00:00:00.000Z'),
        'ANNUAL',
      ).toISOString(),
    ).toBe('2029-02-28T00:00:00.000Z');
  });

  it('uses the configured business timezone at a UTC date boundary', () => {
    const instant = new Date('2028-05-01T18:30:00.000Z');
    expect(businessDate(instant, 'UTC')).toBe('2028-05-01');
    expect(businessDate(instant, 'Asia/Dhaka')).toBe('2028-05-02');
  });

  it('supports delayed calendar-day catch-up across month and leap boundaries', () => {
    expect(addBusinessDays('2028-02-27', 3)).toBe('2028-03-01');
    expect(addBusinessDays('2028-03-01', -3)).toBe('2028-02-27');
  });
});
