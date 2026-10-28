import { describe, expect, it } from 'vitest';
import { invoiceDueDate } from './invoice-ui';

describe('invoice due calendar dates', () => {
  it.each([
    ['2026-10-29T23:59:59.000Z', '2026-10-29'],
    ['2026-01-01T00:00:00.000Z', '2026-01-01'],
    ['2028-02-29T23:59:59.000Z', '2028-02-29'],
    ['2026-03-08T23:59:59.000Z', '2026-03-08'],
  ])('preserves %s as the editor and PDF day', (timestamp, day) => {
    expect(invoiceDueDate(timestamp)).toBe(day);
  });
});
