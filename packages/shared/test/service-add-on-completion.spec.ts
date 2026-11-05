import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  adminServiceAddOnSchema,
  completeServiceAddOnCancellationSchema,
  serviceAddOnSchema,
} from '../src/contracts/services';

const request = {
  expectedEndAt: '2025-03-11T12:00:00.000Z',
  acknowledged: true,
};
test('completion requires an explicit true acknowledgement and a valid expected cutoff', () => {
  assert.equal(
    completeServiceAddOnCancellationSchema.safeParse(request).success,
    true,
  );
  for (const invalid of [
    { ...request, acknowledged: false },
    { expectedEndAt: request.expectedEndAt },
    { ...request, expectedEndAt: 'not-a-date' },
    { ...request, completedByUserId: 'forged' },
  ]) {
    assert.equal(
      completeServiceAddOnCancellationSchema.safeParse(invalid).success,
      false,
    );
  }
});
test('administrator completion evidence is separate from the customer contract', () => {
  const item = {
    id: '20800000-0000-4000-8000-000000000001',
    name: 'Fictional backup',
    recurringAmount: { amount: '30000', currency: 'BDT' },
    renewalEndsAt: request.expectedEndAt,
    availableEndAt: null,
  };
  assert.equal(serviceAddOnSchema.safeParse(item).success, true);
  assert.equal(
    adminServiceAddOnSchema.safeParse({ ...item, manualCompletion: null })
      .success,
    true,
  );
  const completed = {
    ...item,
    manualCompletion: {
      completedAt: '2026-11-05T12:00:00.000Z',
      completedByUserId: item.id,
      completedByName: 'Fictional administrator',
    },
  };
  assert.equal(adminServiceAddOnSchema.safeParse(completed).success, true);
  assert.equal(serviceAddOnSchema.safeParse(completed).success, false);
  assert.equal(
    adminServiceAddOnSchema.safeParse({ ...completed, renewalEndsAt: null })
      .success,
    false,
  );
  assert.equal(
    adminServiceAddOnSchema.safeParse({
      ...completed,
      manualCompletion: {
        ...completed.manualCompletion,
        completedAt: '2024-01-01T00:00:00.000Z',
      },
    }).success,
    false,
  );
  assert.equal(
    adminServiceAddOnSchema.safeParse({
      ...completed,
      manualCompletion: {
        ...completed.manualCompletion,
        completedByUserId: 'forged',
      },
    }).success,
    false,
  );
});
