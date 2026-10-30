import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import {
  adminDomainOrderSnapshotSchema,
  createAdminOrderRequestSchema,
  createCustomerOrderRequestSchema,
} from '../src/contracts/orders';

const hosting = {
  customerId: randomUUID(),
  productId: randomUUID(),
  priceId: randomUUID(),
  requestedDomain: 'fictional-combined.com',
  submissionKey: randomUUID(),
};
test('admin domain intent requires a matching explicit dispatch choice and server-owned prices', () => {
  const existing = {
    mode: 'EXISTING',
    domainId: randomUUID(),
    priceId: randomUUID(),
    sendToRegistrar: false,
  };
  const registration = {
    mode: 'REGISTRATION',
    quoteId: randomUUID(),
    sendToRegistrar: true,
  };
  assert(createAdminOrderRequestSchema.safeParse(hosting).success);
  for (const selection of [existing, registration]) {
    assert(
      createAdminOrderRequestSchema.safeParse({
        ...hosting,
        domainOrder: selection,
      }).success,
    );
    const { sendToRegistrar: _flag, ...withoutFlag } = selection;
    for (const invalid of [
      withoutFlag,
      { ...selection, sendToRegistrar: !selection.sendToRegistrar },
      { ...selection, amount: '1' },
      { ...selection, enabled: true },
    ])
      assert(
        !createAdminOrderRequestSchema.safeParse({
          ...hosting,
          domainOrder: invalid,
        }).success,
      );
  }
  const { customerId: _customer, ...customerInput } = hosting;
  assert(
    !createCustomerOrderRequestSchema.safeParse({
      ...customerInput,
      domainOrder: existing,
    }).success,
  );
  assert(
    !createCustomerOrderRequestSchema.safeParse({
      ...customerInput,
      sendToRegistrar: true,
    }).success,
  );
});
test('immutable snapshots distinguish existing billing from registration requests', () => {
  const domainRecordId = randomUUID();
  assert(
    adminDomainOrderSnapshotSchema.safeParse({
      adminDomainAction: 'EXISTING',
      domainRecordId,
      sendToRegistrar: false,
    }).success,
  );
  assert(
    adminDomainOrderSnapshotSchema.safeParse({
      adminDomainAction: 'REGISTRATION',
      domainRecordId,
      sendToRegistrar: true,
    }).success,
  );
  for (const invalid of [
    { adminDomainAction: 'EXISTING', domainRecordId, sendToRegistrar: true },
    {
      adminDomainAction: 'REGISTRATION',
      domainRecordId,
      sendToRegistrar: false,
    },
    { adminDomainAction: 'EXISTING', sendToRegistrar: false },
  ])
    assert(!adminDomainOrderSnapshotSchema.safeParse(invalid).success);
});
