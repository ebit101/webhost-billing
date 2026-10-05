import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { sentenceCaseLabel } from '../src';

describe('sentence-case presentation labels', () => {
  it('formats human state/category labels without altering their source values', () => {
    const values = [
      'AWAITING_PAYMENT',
      'PARTIALLY_REFUNDED',
      'WAITING FOR STAFF',
      'FAILED',
      'HIGH',
    ];
    assert.deepEqual(values.map(sentenceCaseLabel), [
      'Awaiting payment',
      'Partially refunded',
      'Waiting for staff',
      'Failed',
      'High',
    ]);
    assert.equal(values[0], 'AWAITING_PAYMENT');
  });
  it('preserves existing sentence case and mixed-case provider/owner names', () => {
    for (const value of [
      'Paid',
      'Speed Host',
      'bKash',
      'cPanel',
      '',
      'Waiting for payment',
    ]) {
      assert.equal(sentenceCaseLabel(value), value);
    }
  });
});
