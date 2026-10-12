import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  bdtPriceToMinor,
  createRegistrarConnectionSchema,
  domainTldRequestSchema,
  domainTldBulkSchema,
  domainSelectionSnapshotSchema,
} from '../src/contracts/domain-administration';

test('BDT entry uses exact integer arithmetic and distinguishes blank from zero', () => {
  assert.equal(bdtPriceToMinor('1500.01'), '150001');
  assert.equal(bdtPriceToMinor('0001.2'), '120');
  assert.equal(bdtPriceToMinor('9999999999999.99'), '999999999999999');
  assert.equal(bdtPriceToMinor(' '), null);
  for (const value of [
    '0',
    '0.00',
    '-1',
    '1e3',
    '1.001',
    '1,000',
    'Infinity',
    '10000000000000',
  ])
    assert.throws(() => bdtPriceToMinor(value));
});
test('connection configuration contains no price, DNS, endpoint or policy authority', () => {
  const request = {
    name: 'Fictional primary',
    module: 'logicboxes',
    resellerId: '12345',
    apiKey: 'fake'.repeat(8),
    confirmation: 'Save registrar connection',
  };
  assert.equal(
    createRegistrarConnectionSchema.safeParse(request).success,
    true,
  );
  for (const field of [
    'sellingAmount',
    'nameservers',
    'agreementUrl',
    'endpoint',
    'enabled',
    'isDefault',
  ])
    assert.equal(
      createRegistrarConnectionSchema.safeParse({
        ...request,
        [field]: 'unexpected',
      }).success,
      false,
    );
});
test('unimplemented TLDs stay disabled and absence never becomes a free sale', () => {
  const request = {
    tld: 'com',
    registrationAmount: '100001',
    renewalAmount: null,
    enabled: true,
    featured: false,
    displayOrder: 0,
    preferredRegistrarId: null,
    revision: 0,
  };
  assert.equal(domainTldRequestSchema.safeParse(request).success, true);
  assert.equal(
    domainTldRequestSchema.safeParse({ ...request, tld: 'org' }).success,
    false,
  );
  assert.equal(
    domainTldRequestSchema.safeParse({ ...request, registrationAmount: null })
      .success,
    false,
  );
  assert.equal(
    domainTldRequestSchema.safeParse({ ...request, registrationAmount: '0' })
      .success,
    false,
  );
  assert.equal(
    domainTldRequestSchema.safeParse({
      ...request,
      tld: 'com.bd',
      enabled: false,
    }).success,
    true,
  );
});
test('bulk review is bounded and requires a selected operation', () => {
  const entries = [{ id: '80000000-0000-4000-8000-000000000118', revision: 1 }];
  assert.equal(
    domainTldBulkSchema.safeParse({
      entries,
      confirmation: 'Apply TLD changes',
    }).success,
    false,
  );
  assert.equal(
    domainTldBulkSchema.safeParse({
      entries,
      enabled: false,
      confirmation: 'Apply TLD changes',
    }).success,
    true,
  );
  assert.equal(
    domainTldBulkSchema.safeParse({
      entries: Array(101).fill(entries[0]),
      enabled: false,
      confirmation: 'Apply TLD changes',
    }).success,
    false,
  );
});
test('consent snapshots require reviewed policies and unique account identities', () => {
  const id = '80000000-0000-4000-8000-000000000118';
  const snapshot = {
    schemaVersion: 1,
    catalogueId: id,
    catalogueRevision: 1,
    priceId: id,
    policies: {
      revision: id,
      agreementUrl: 'https://fictional-host.com/domains',
      customerTermsUrl: 'https://fictional-host.com/terms',
      customerPrivacyUrl: 'https://fictional-host.com/privacy',
    },
    eligibleRegistrars: [{ id, name: 'Fictional primary' }],
  };
  assert.equal(domainSelectionSnapshotSchema.safeParse(snapshot).success, true);
  assert.equal(
    domainSelectionSnapshotSchema.safeParse({
      ...snapshot,
      eligibleRegistrars: [],
    }).success,
    false,
  );
  assert.equal(
    domainSelectionSnapshotSchema.safeParse({
      ...snapshot,
      eligibleRegistrars: [
        ...snapshot.eligibleRegistrars,
        ...snapshot.eligibleRegistrars,
      ],
    }).success,
    false,
  );
});
