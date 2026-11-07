import assert from 'node:assert/strict';
import test from 'node:test';
import {
  invoiceProductAttributionSchema,
  snapshotInvoiceProduct,
  snapshotDomainRenewalProduct,
} from '../src/contracts/invoice-product-attribution';
import { invoiceItemInputSchema } from '../src/contracts/invoices';
import {
  domainRenewalConfigureRequestSchema,
  domainRenewalPreferenceRequestSchema,
  domainRenewalTermsSchema,
} from '../src/contracts/domain-renewals';
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

test('domain renewal attribution uses confirmed catalogue revision evidence without inventing a hosting price ID', () => {
  const snapshot = snapshotDomainRenewalProduct({
    productId: reference.productId,
    catalogueId: reference.productPriceId,
    catalogueRevision: 2,
    name: 'Confirmed .com renewal',
  });
  assert.deepEqual(invoiceProductAttributionSchema.parse(snapshot), snapshot);
  const terms = {
    schemaVersion: 1,
    years: 1,
    currency: 'BDT',
    amount: '170000',
    catalogueRevision: 2,
    bindingHash: 'a'.repeat(64),
  };
  assert.equal(domainRenewalTermsSchema.safeParse(terms).success, true);
  assert.equal(
    domainRenewalTermsSchema.safeParse({
      ...terms,
      productAttribution: snapshot,
    }).success,
    true,
  );
  for (const patch of [
    { version: 1 },
    { source: 'HOSTING_RENEWAL' },
    { kind: 'HOSTING' },
    { catalogueId: 'invalid' },
    { catalogueRevision: 0 },
    { catalogueRevision: 1.5 },
    { catalogueRevision: 2147483648 },
    { productPriceId: reference.productPriceId },
  ]) {
    assert.equal(
      invoiceProductAttributionSchema.safeParse({ ...snapshot, ...patch })
        .success,
      false,
    );
  }
  const input = {
    confirmation: 'fictional.com',
    expectedRevision: 0,
    enabled: true,
  };
  assert.equal(
    domainRenewalPreferenceRequestSchema.safeParse({
      ...input,
      productAttribution: snapshot,
    }).success,
    false,
  );
  assert.equal(
    domainRenewalConfigureRequestSchema.safeParse({
      ...input,
      years: 1,
      sellingAmount: '170000',
      catalogueRevision: 2,
      ordinaryRenewalConfirmed: true,
      reason: 'Fictional review',
      productAttribution: snapshot,
    }).success,
    false,
  );
});
