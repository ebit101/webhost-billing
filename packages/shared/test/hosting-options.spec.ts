import assert from 'node:assert/strict';
import test from 'node:test';
import { hostingAddOnInputSchema } from '../src/contracts/products';
import { createCustomerOrderRequestSchema } from '../src/contracts/orders';
import {
  distinctHostingOptionGroups,
  hostingConfigurationChoiceSchema,
  hostingOptionName,
  readHostingConfiguration,
} from '../src/contracts/hosting-options';

const choice = {
  version: 1 as const,
  groupKey: 'storage-tier',
  groupName: 'Storage tier',
  choiceName: '20 GiB',
  fulfillment: 'MANUAL' as const,
  fulfillmentNote: 'Applied manually after hosting setup.',
};
test('configuration choices are bounded, named, explicitly manual and reject unsupported mappings', () => {
  assert.deepEqual(hostingConfigurationChoiceSchema.parse(choice), choice);
  for (const change of [
    { groupKey: '../storage' },
    { groupKey: 'Storage' },
    { groupName: '' },
    { choiceName: 'x'.repeat(61) },
    { fulfillment: 'CPANEL_QUOTA' },
    { fulfillmentNote: '' },
    { quota: 20 },
  ])
    assert.equal(
      hostingConfigurationChoiceSchema.safeParse({ ...choice, ...change })
        .success,
      false,
    );
  assert.equal(hostingOptionName(choice), 'Storage tier: 20 GiB');
});
test('selection groups allow one value per group while preserving ordinary add-ons', () => {
  assert.equal(
    distinctHostingOptionGroups([
      choice,
      null,
      { ...choice, groupKey: 'mailboxes' },
    ]),
    true,
  );
  assert.equal(
    distinctHostingOptionGroups([choice, { ...choice, choiceName: '40 GiB' }]),
    false,
  );
});
test('legacy metadata remains ordinary; malformed explicit configurations fail closed', () => {
  for (const legacy of [
    undefined,
    null,
    {},
    { unrelated: 'preserved' },
    { hostingOption: null },
  ])
    assert.equal(readHostingConfiguration(legacy), null);
  assert.deepEqual(
    readHostingConfiguration({ unrelated: true, hostingOption: choice }),
    choice,
  );
  assert.throws(() =>
    readHostingConfiguration({
      hostingOption: { ...choice, fulfillment: 'AUTO' },
    }),
  );
});
test('admin options use existing exact prices and customer checkout accepts IDs, never client configuration or money', () => {
  const id = '22300000-0000-4000-8000-000000000001';
  const admin = {
    name: 'Storage choice',
    description: null,
    currency: 'BDT',
    amount: '9007199254740993',
    billingPeriod: 'MONTHLY',
    hostingProductIds: [id],
    enabled: true,
    configuration: choice,
  };
  assert.equal(hostingAddOnInputSchema.parse(admin).amount, admin.amount);
  const order = {
    productId: id,
    priceId: id,
    requestedDomain: 'option.example.test',
    submissionKey: id,
    addOnPriceIds: [id],
  };
  assert.ok(createCustomerOrderRequestSchema.safeParse(order).success);
  assert.equal(
    createCustomerOrderRequestSchema.safeParse({
      ...order,
      configuration: choice,
      amount: '1',
    }).success,
    false,
  );
  assert.equal(
    createCustomerOrderRequestSchema.safeParse({
      ...order,
      addOnPriceIds: [id, id],
    }).success,
    false,
  );
});
