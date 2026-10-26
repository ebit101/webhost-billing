import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createProductRequestSchema,
  productGroupInputSchema,
  updateProductRequestSchema,
} from '../src/contracts/products';

test('group names and order are bounded and strict', () => {
  assert.deepEqual(
    productGroupInputSchema.parse({
      name: ' Shared hosting ',
      displayOrder: 10,
    }),
    { name: 'Shared hosting', displayOrder: 10 },
  );
  for (const input of [
    { name: ' ', displayOrder: 0 },
    { name: 'x'.repeat(161), displayOrder: 0 },
    { name: 'Shared hosting', displayOrder: -1 },
    { name: 'Shared hosting', displayOrder: 1.5 },
    { name: 'Shared hosting', displayOrder: 10001 },
    { name: 'Shared hosting', displayOrder: 0, publicVisible: false },
  ])
    assert.equal(productGroupInputSchema.safeParse(input).success, false);
});

test('group assignment uses an exact UUID or explicit null; older create requests remain valid', () => {
  assert.equal(
    createProductRequestSchema.safeParse({ name: 'Starter', slug: 'starter' })
      .success,
    true,
  );
  assert.equal(
    updateProductRequestSchema.safeParse({ groupId: 'Shared hosting' }).success,
    false,
  );
  assert.equal(
    updateProductRequestSchema.safeParse({ groupId: null }).success,
    true,
  );
  assert.equal(
    updateProductRequestSchema.safeParse({
      groupId: '80000000-0000-4000-8000-000000000001',
    }).success,
    true,
  );
});
