import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  domainRenewalConfigureRequestSchema,
  domainRenewalPreferenceRequestSchema,
  domainRenewalTermsSchema,
} from '../src/contracts/domain-renewals';

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
