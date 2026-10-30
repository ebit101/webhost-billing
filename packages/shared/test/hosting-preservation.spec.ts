import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createAdminOrderRequestSchema,
  createCustomerOrderRequestSchema,
  readHostingProvisioningMode,
} from '../src/contracts/orders';
const input = {
  customerId: '10000000-0000-4000-8000-000000000001',
  productId: '10000000-0000-4000-8000-000000000002',
  priceId: '10000000-0000-4000-8000-000000000003',
  submissionKey: '10000000-0000-4000-8000-000000000004',
  requestedDomain: 'fictional.example.test',
};
test('preservation is an explicit administrator choice; clients cannot forge provider policy', () => {
  assert.equal(
    createAdminOrderRequestSchema.parse({
      ...input,
      hostingProvisioningMode: 'PRESERVE_EXISTING',
    }).hostingProvisioningMode,
    'PRESERVE_EXISTING',
  );
  const { customerId: _id, ...customer } = input;
  void _id;
  assert.equal(
    createCustomerOrderRequestSchema.safeParse({
      ...customer,
      hostingProvisioningMode: 'PRESERVE_EXISTING',
    }).success,
    false,
  );
  assert.equal(
    createAdminOrderRequestSchema.safeParse({
      ...input,
      hostingProvisioningMode: 'remote',
    }).success,
    false,
  );
});
test('legacy snapshots retain standard behavior, but present invalid modes never downgrade', () => {
  assert.equal(readHostingProvisioningMode(null), 'STANDARD');
  assert.equal(
    readHostingProvisioningMode({ packageName: 'legacy' }),
    'STANDARD',
  );
  assert.equal(
    readHostingProvisioningMode({
      hostingProvisioningMode: 'PRESERVE_EXISTING',
    }),
    'PRESERVE_EXISTING',
  );
  for (const value of [null, 'remote', true, 42])
    assert.throws(() =>
      readHostingProvisioningMode({ hostingProvisioningMode: value }),
    );
});
