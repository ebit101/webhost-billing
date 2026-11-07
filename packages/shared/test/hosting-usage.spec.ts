import assert from 'node:assert/strict';
import test from 'node:test';
import {
  hostingUsageMetricSchema,
  serviceUsageSchema,
} from '../src/contracts/hosting-usage';

test('finite zero, explicit unlimited, missing metrics and large integer counters stay distinct', () => {
  assert.ok(
    hostingUsageMetricSchema.safeParse({
      usedBytes: '9007199254740993',
      limitBytes: '0',
      limitKind: 'LIMITED',
    }).success,
  );
  assert.ok(
    hostingUsageMetricSchema.safeParse({
      usedBytes: null,
      limitBytes: null,
      limitKind: 'UNKNOWN',
    }).success,
  );
  assert.ok(
    hostingUsageMetricSchema.safeParse({
      usedBytes: '0',
      limitBytes: null,
      limitKind: 'UNLIMITED',
    }).success,
  );
  assert.ok(
    !hostingUsageMetricSchema.safeParse({
      usedBytes: '1',
      limitBytes: '0',
      limitKind: 'UNLIMITED',
    }).success,
  );
  assert.ok(
    !hostingUsageMetricSchema.safeParse({
      usedBytes: -1,
      limitBytes: null,
      limitKind: 'UNKNOWN',
    }).success,
  );
});
test('an unavailable usage result cannot claim saved sample values or credentials', () => {
  const base = {
    serviceId: '22200000-0000-4000-8000-000000000001',
    status: 'UNAVAILABLE',
    sampledAt: null,
    freshUntil: null,
    disk: null,
    bandwidth: null,
    bandwidthPeriod: '2026-11',
    retryAfterSeconds: 60,
    simulated: false,
  };
  assert.ok(serviceUsageSchema.safeParse(base).success);
  assert.ok(
    !serviceUsageSchema.safeParse({ ...base, credential: 'fictional-only' })
      .success,
  );
  assert.ok(
    !serviceUsageSchema.safeParse({ ...base, status: 'AVAILABLE' }).success,
  );
  assert.ok(
    !serviceUsageSchema.safeParse({ ...base, bandwidthPeriod: '2026-13' })
      .success,
  );
});
