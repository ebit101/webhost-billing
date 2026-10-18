import { beforeEach, describe, expect, it } from 'vitest';
import { clearOrderDraft, readOrderDraft, saveOrderDraft } from './order-draft';

const selection = {
  productId: '10000000-0000-4000-8000-000000000080',
  priceId: '10000000-0000-4000-8000-000000000081',
};

beforeEach(clearOrderDraft);

describe('public order draft', () => {
  it('keeps the domain selection for only the selected plan and period', () => {
    expect(
      saveOrderDraft({
        ...selection,
        domainChoice: 'EXISTING',
        requestedDomain: 'Example.COM',
      }),
    ).toBe(true);
    expect(readOrderDraft(selection)).toEqual({
      ...selection,
      domainChoice: 'EXISTING',
      requestedDomain: 'example.com',
    });
    expect(
      readOrderDraft({
        ...selection,
        priceId: '10000000-0000-4000-8000-000000000082',
      }),
    ).toBeUndefined();
    clearOrderDraft();
    expect(readOrderDraft(selection)).toBeUndefined();
  });

  it('rejects invalid domains and expired or modified drafts', () => {
    expect(
      saveOrderDraft({
        ...selection,
        domainChoice: 'REGISTER',
        requestedDomain: 'https://example.com',
      }),
    ).toBe(false);
    expect(
      saveOrderDraft({
        ...selection,
        domainChoice: 'REGISTER',
        requestedDomain: 'example.test',
      }),
    ).toBe(false);
    expect(
      saveOrderDraft({
        ...selection,
        domainChoice: 'REGISTER',
        requestedDomain: 'example.com',
      }),
    ).toBe(true);
    const stored = JSON.parse(
      localStorage.getItem('webhost-order-draft') ?? '{}',
    ) as Record<string, unknown>;
    localStorage.setItem(
      'webhost-order-draft',
      JSON.stringify({ ...stored, expiresAt: 0 }),
    );
    expect(readOrderDraft(selection)).toBeUndefined();
    expect(localStorage.getItem('webhost-order-draft')).toBeNull();
  });
});
