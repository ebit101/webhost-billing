import { describe, expect, it } from 'vitest';
import {
  checkoutEntryHref,
  checkoutIntentQuery,
  customerLandingHref,
  readCheckoutIntent,
} from './checkout-intent';

const intent = {
  productId: '10000000-0000-4000-8000-000000000080',
  priceId: '10000000-0000-4000-8000-000000000081',
};
const query = `productId=${intent.productId}&priceId=${intent.priceId}`;

describe('allowlisted checkout intent', () => {
  it('validates both server-page and proxy parameters and reconstructs fixed routes', () => {
    expect(readCheckoutIntent(intent)).toEqual(intent);
    expect(readCheckoutIntent(new URLSearchParams(query))).toEqual(intent);
    expect(checkoutIntentQuery(intent)).toBe(query);
    expect(customerLandingHref(intent)).toBe(`/portal/checkout?${query}`);
    expect(checkoutEntryHref('/login', intent)).toBe(`/login?${query}`);
    expect(checkoutEntryHref('/register', intent)).toBe(`/register?${query}`);
    expect(customerLandingHref()).toBe('/portal');
    expect(checkoutEntryHref('/login')).toBe('/login');
  });

  it.each([
    '',
    `productId=${intent.productId}`,
    `priceId=${intent.priceId}`,
    `${query}&productId=${intent.productId}`,
    `${query}&priceId=${intent.priceId}`,
    `productId=bad&priceId=${intent.priceId}`,
    `productId=%2F%2Fevil.example&priceId=${intent.priceId}`,
    `productId=%252F%252Fevil.example&priceId=${intent.priceId}`,
    `productId=${intent.productId}%23fragment&priceId=${intent.priceId}`,
    `productId=${intent.productId}%2Fpath&priceId=${intent.priceId}`,
    `productId=%20${intent.productId}&priceId=${intent.priceId}`,
  ])('drops malformed, incomplete, or duplicate query %s', (input) => {
    expect(readCheckoutIntent(new URLSearchParams(input))).toBeUndefined();
  });

  it('rejects arrays from duplicate server search parameters and validates even typed props', () => {
    expect(
      readCheckoutIntent({ ...intent, productId: [intent.productId] }),
    ).toBeUndefined();
    expect(
      customerLandingHref({ ...intent, priceId: 'https://evil.example' }),
    ).toBe('/portal');
  });

  it.each([
    'https://evil.example',
    '//evil.example',
    '/admin',
    '%2F%2Fevil.example',
    '%252F%252Fevil.example',
    'javascript:alert(1)',
  ])('never uses return target %s or financial/customer payload', (target) => {
    const untrusted = new URLSearchParams({
      ...intent,
      next: target,
      returnTo: target,
      amount: '1',
      requestedDomain: 'evil.example',
      customerId: intent.productId,
    });
    expect(readCheckoutIntent(untrusted)).toEqual(intent);
    expect(customerLandingHref(readCheckoutIntent(untrusted))).toBe(
      `/portal/checkout?${query}`,
    );
    expect(
      customerLandingHref(
        readCheckoutIntent(
          new URLSearchParams({ next: target, returnTo: target }),
        ),
      ),
    ).toBe('/portal');
  });
});
