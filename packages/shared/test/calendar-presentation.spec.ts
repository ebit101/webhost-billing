import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  formatCalendarDate,
  parseCalendarDate,
  parseCalendarDateTime,
  formatUtcTimestamp,
} from '../src';

describe('day/month/year presentation', () => {
  it('retains the UTC meaning of raw timestamp labels', () => {
    assert.equal(
      formatUtcTimestamp('2026-11-02T00:05:00.000Z'),
      '02/11/2026, 00:05 UTC',
    );
    assert.equal(formatUtcTimestamp(null), '—');
  });
  it('round-trips unambiguous calendar days without timezone conversion', () => {
    for (const iso of ['2026-11-02', '2024-02-29', '2026-01-01']) {
      assert.equal(parseCalendarDate(formatCalendarDate(iso)), iso);
    }
    assert.equal(formatCalendarDate('2026-10-29T23:59:59.000Z'), '29/10/2026');
    assert.equal(parseCalendarDate('02/11/2026'), '2026-11-02');
    assert.equal(formatCalendarDate(null), '—');
  });
  it('rejects impossible, incomplete and ambiguous dates', () => {
    for (const input of [
      '29/02/2026',
      '31/04/2026',
      '2/11/2026',
      '2026-11-02',
      '11/31/2026',
      '',
    ]) {
      assert.equal(parseCalendarDate(input), null);
    }
    assert.equal(formatCalendarDate('2026-02-30'), '—');
  });
  it('parses local date/time entry without inventing an offset', () => {
    assert.equal(parseCalendarDateTime('02/11/2026 09:05'), '2026-11-02T09:05');
    for (const input of [
      '02/11/2026 24:00',
      '02/11/2026 09:60',
      '31/02/2026 09:05',
      '2026-11-02T09:05',
    ]) {
      assert.equal(parseCalendarDateTime(input), null);
    }
  });
});
