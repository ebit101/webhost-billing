import assert from 'node:assert/strict';
import test from 'node:test';
import {
  invoiceProductAttributionSchema,
  snapshotInvoiceProduct,
} from '../src/contracts/invoice-product-attribution';
import { invoiceItemInputSchema } from '../src/contracts/invoices';
const reference = {
  productId: '22600000-0000-4000-8000-000000000001',
  productPriceId: '22600000-0000-4000-8000-000000000002',
  name: 'Purchased starter',
  kind: 'HOSTING' as const,
  source: 'HOSTING_RENEWAL' as const,
};
test('captures only the trusted product reference without money or mutable catalogue fields', () => {
  assert.deepEqual(snapshotInvoiceProduct(reference), {
    version: 1,
    ...reference,
  });
  assert.deepEqual(
    snapshotInvoiceProduct({ ...reference, source: 'HOSTING_PLAN_CHANGE' }),
    { version: 1, ...reference, source: 'HOSTING_PLAN_CHANGE' },
  );
  assert.equal(
    snapshotInvoiceProduct({
      ...reference,
      kind: 'ADD_ON',
      source: 'ADD_ON_RENEWAL',
    }).kind,
    'ADD_ON',
  );
});
test('rejects missing, malformed, oversized and mismatched product attribution', () => {
  for (const override of [
    { version: 2 },
    { productId: 'forged' },
    { productPriceId: null },
    { name: '' },
    { name: 'x'.repeat(161) },
    { kind: 'DOMAIN' },
    { source: 'CURRENT_CATALOGUE' },
    { source: 'ADD_ON_RENEWAL' },
    { amount: '1' },
  ])
    assert.equal(
      invoiceProductAttributionSchema.safeParse({
        version: 1,
        ...reference,
        ...override,
      }).success,
      false,
    );
});

test('customer and manual invoice input cannot supply internal product attribution', () => {
  assert.equal(
    invoiceItemInputSchema.safeParse({
      description: 'Fictional line',
      unitAmount: '100',
      productAttributionSnapshot: { version: 1, ...reference },
    }).success,
    false,
  );
});
