import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import {
  domainDetailSchema,
  existingDomainLinkRequestSchema,
} from '../src/contracts/domains';

test('existing-domain requests require explicit client/account, exact canonical confirmation and a replay key', () => {
  const input = {
    customerId: randomUUID(),
    registrarAccountId: randomUUID(),
    domainName: 'existing-example.com',
    confirmation: 'existing-example.com',
    submissionKey: randomUUID(),
  };
  assert(existingDomainLinkRequestSchema.safeParse(input).success);
  for (const changes of [
    { confirmation: 'other.com' },
    { domainName: 'other.net', confirmation: 'other.net' },
    { domainName: 'https://existing-example.com' },
    { customerId: 'bad' },
    { submissionKey: '' },
    { remoteCustomerId: '123' },
    { costCeiling: '100' },
    { enabled: true },
  ])
    assert(
      !existingDomainLinkRequestSchema.safeParse({ ...input, ...changes })
        .success,
    );
});
test('existing-domain documents require verified ownership and explicitly absent registration billing', () => {
  const id = randomUUID();
  const linked = {
    id,
    domainName: 'existing-example.com',
    origin: 'EXISTING',
    ownershipVerifiedAt: '2026-10-29T06:00:00.000Z',
    state: 'REGISTERED',
    verification: 'Verified',
    expiresAt: '2030-01-01T00:00:00.000Z',
    simulated: false,
    autoRenew: false,
    registrar: 'Fictional registrar',
    registrationYears: null,
    requestedAt: '2026-10-29T06:00:00.000Z',
    sellingAmount: null,
    financialAttention: false,
    invoiceId: null,
    invoiceStatus: null,
    orderId: null,
    balanceDue: null,
    currency: 'BDT',
    nameservers: ['ns1.fictional-host.com', 'ns2.fictional-host.com'],
    agreement: 'existing-domain-link-v1',
  };
  assert(domainDetailSchema.safeParse(linked).success);
  for (const changes of [
    { ownershipVerifiedAt: undefined },
    { invoiceId: id },
    { invoiceStatus: 'PAID' },
    { orderId: id },
    { sellingAmount: '0' },
    { registrationYears: 1 },
    { simulated: true },
    { origin: 'REGISTRATION' },
    { origin: undefined },
    { agreement: 'resellbiz-registration-v1' },
    { state: 'AWAITING_APPROVAL' },
    { nameservers: ['ns1.example.test', 'ns2.example.test'] },
  ])
    assert(!domainDetailSchema.safeParse({ ...linked, ...changes }).success);
});
