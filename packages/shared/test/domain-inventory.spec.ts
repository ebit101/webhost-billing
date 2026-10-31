import assert from 'node:assert/strict';
import { test } from 'node:test';
import { domainInventoryQuerySchema } from '../src/contracts/domain-inventory';
test('domain inventory query stays bounded and rejects ambiguous or unsupported scope', () => {
  assert.deepEqual(domainInventoryQuerySchema.parse({}), {
    page: 1,
    pageSize: 20,
  });
  assert.equal(
    domainInventoryQuerySchema.parse({ page: '6', pageSize: '100' }).page,
    6,
  );
  for (const input of [
    { page: '1e2' },
    { page: '01' },
    { page: ['1'] },
    { pageSize: 101 },
    { page: 2147483647, pageSize: 100 },
    { page: Number.MAX_SAFE_INTEGER },
    { customerId: 'invalid' },
    { customerId: ['16000000-0000-4000-8000-000000000001'] },
    { origin: 'TRANSFER' },
    { state: 'ACTIVE' },
    { search: 'a'.repeat(201) },
    { providerAction: 'register' },
  ])
    assert.equal(domainInventoryQuerySchema.safeParse(input).success, false);
});
