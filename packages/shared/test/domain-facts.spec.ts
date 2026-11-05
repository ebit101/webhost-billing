import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  domainFactReviewRequestSchema,
  domainFactSyncRequestSchema,
  registrarDomainFactsSchema,
} from '../src/contracts/domain-facts';
const id = '21300000-0000-4000-8000-000000000001';
test('domain fact synchronization accepts no caller-owned price, expiry, account or eligibility claims', () => {
  const input = { submissionKey: id, confirmation: 'fictional.com' };
  assert.equal(domainFactSyncRequestSchema.safeParse(input).success, true);
  for (const extra of [
    { expiresAt: '2030-01-01T00:00:00Z' },
    { customerId: id },
    { accountId: id },
    { renewalEligibility: 'ELIGIBLE' },
    { amount: '100' },
  ])
    assert.equal(
      domainFactSyncRequestSchema.safeParse({ ...input, ...extra }).success,
      false,
    );
});
test('expiry review requires exact domain syntax, acknowledgement and a bounded nonblank reason', () => {
  const input = {
    confirmation: 'fictional.com',
    acknowledged: true,
    reason: ' Fictional correction verified. ',
  };
  assert.equal(
    domainFactReviewRequestSchema.parse(input).reason,
    'Fictional correction verified.',
  );
  for (const extra of [
    { acknowledged: false },
    { reason: ' ' },
    { reason: 'x'.repeat(1001) },
  ])
    assert.equal(
      domainFactReviewRequestSchema.safeParse({ ...input, ...extra }).success,
      false,
    );
});
test('registrar facts preserve unknown capability states without accepting unknown fields or dates', () => {
  const facts = {
    accountId: id,
    customerId: id,
    domainName: 'fictional.com',
    providerOrderId: '123',
    observedAt: '2026-11-05T12:00:00Z',
    expiresAt: '2027-11-05T12:00:00Z',
    status: 'ACTIVE',
    renewalEligibility: 'UNKNOWN',
    registrarAutoRenew: null,
    simulated: true,
  };
  assert.equal(
    registrarDomainFactsSchema.parse(facts).renewalEligibility,
    'UNKNOWN',
  );
  assert.equal(
    registrarDomainFactsSchema.safeParse({ ...facts, expiresAt: 'not-a-date' })
      .success,
    false,
  );
  assert.equal(
    registrarDomainFactsSchema.safeParse({ ...facts, secret: 'never-return' })
      .success,
    false,
  );
});
