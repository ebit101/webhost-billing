import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  domainRenewalConfigureRequestSchema,
  domainRenewalPreferenceRequestSchema,
  domainRenewalTermsSchema,
} from '../src/contracts/domain-renewals';
import {
  domainRenewalExecutionRequestSchema,
  domainRenewalReconcileRequestSchema,
} from '../src/contracts/domain-renewals';
import { routeOutboxEvent } from '../src/contracts/background-jobs';
import { randomUUID } from 'node:crypto';

test('paid renewal approval fixes one year and native currency and rejects unapproved or supplied provider outcomes', () => {
  const input = {
    submissionKey: randomUUID(),
    invoiceId: randomUUID(),
    confirmation: 'fictional.com',
    years: 1,
    approved: true,
    reason: 'Reviewed fictional renewal',
    costCeiling: '1000',
    costCurrency: 'USD',
  };
  assert.equal(
    domainRenewalExecutionRequestSchema.safeParse(input).success,
    true,
  );
  for (const patch of [
    { approved: false },
    { years: 2 },
    { costCurrency: 'BDT' },
    { costCeiling: '10.00' },
    { costCeiling: '0' },
    { reason: ' ' },
    { targetExpiry: '2029-01-01T00:00:00Z' },
    { status: 'SUCCEEDED' },
  ])
    assert.equal(
      domainRenewalExecutionRequestSchema.safeParse({ ...input, ...patch })
        .success,
      false,
    );
  assert.equal(
    domainRenewalReconcileRequestSchema.safeParse({
      submissionKey: randomUUID(),
      confirmation: 'fictional.com',
      reason: 'Read-only recovery',
      costCeiling: '1000',
    }).success,
    false,
  );
});
test('renewal dispatch and reconciliation share the registrar queue with distinct job names', () => {
  assert.deepEqual(routeOutboxEvent('DOMAIN_RENEWAL_REQUESTED'), {
    queueName: 'domain-registration',
    jobName: 'renew-paid-domain-once',
  });
  assert.deepEqual(routeOutboxEvent('DOMAIN_RENEWAL_RECONCILE'), {
    queueName: 'domain-registration',
    jobName: 'reconcile-paid-domain-renewal',
  });
});

test('customer preference accepts no supplied prices, provider flags, years or identity claims', () => {
  const input = {
    confirmation: 'fictional.com',
    expectedRevision: 0,
    enabled: false,
  };
  assert.equal(
    domainRenewalPreferenceRequestSchema.safeParse(input).success,
    true,
  );
  for (const extra of [
    { sellingAmount: '1' },
    { customerId: 'foreign' },
    { years: 2 },
    { registrarAutoRenew: false },
  ])
    assert.equal(
      domainRenewalPreferenceRequestSchema.safeParse({ ...input, ...extra })
        .success,
      false,
    );
});
test('ordinary renewal terms require explicit acknowledgement, one year, exact positive minor units and an audit reason', () => {
  const input = {
    confirmation: 'fictional.com',
    expectedRevision: 1,
    enabled: true,
    years: 1,
    sellingAmount: '170000',
    catalogueRevision: 1,
    ordinaryRenewalConfirmed: true,
    reason: 'Fictional reviewed renewal',
  };
  assert.equal(
    domainRenewalConfigureRequestSchema.safeParse(input).success,
    true,
  );
  for (const patch of [
    { years: 2 },
    { sellingAmount: '1700.00' },
    { sellingAmount: '0' },
    { ordinaryRenewalConfirmed: false },
    { reason: '  ' },
    { catalogueRevision: 0 },
  ])
    assert.equal(
      domainRenewalConfigureRequestSchema.safeParse({ ...input, ...patch })
        .success,
      false,
    );
  assert.equal(
    domainRenewalTermsSchema.safeParse({
      schemaVersion: 1,
      years: 1,
      currency: 'USD',
      amount: '1000',
      catalogueRevision: 1,
      bindingHash: 'a'.repeat(64),
    }).success,
    false,
  );
});
