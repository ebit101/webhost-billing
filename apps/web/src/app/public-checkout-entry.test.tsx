import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import Page from './(store)/checkout/page';

const identity = vi.hoisted(() => vi.fn());
vi.mock('../lib/server-auth', () => ({ getAuthenticatedIdentity: identity }));
vi.mock('../components/orders/checkout-preview', () => ({
  CheckoutPreview: (props: unknown) => (
    <div data-testid="preview">{JSON.stringify(props)}</div>
  ),
}));
vi.mock('../components/orders/customer-checkout', () => ({
  CustomerCheckout: (props: unknown) => (
    <div data-testid="customer">{JSON.stringify(props)}</div>
  ),
}));
const selection = {
  productId: '10000000-0000-4000-8000-000000000080',
  priceId: '10000000-0000-4000-8000-000000000081',
};

describe('public checkout entry', () => {
  it.each([
    [null, 'guest', 'preview'],
    [{ role: 'ADMIN' }, 'admin', 'preview'],
    [{ role: 'CUSTOMER' }, 'customer', 'customer'],
  ] as const)(
    'shows the right checkout for %s',
    async (account, audience, target) => {
      identity.mockResolvedValue(account);
      render(
        await Page({
          searchParams: Promise.resolve({ ...selection, next: '/admin' }),
        }),
      );
      const props = JSON.parse(screen.getByTestId(target).textContent ?? '');
      if (target === 'customer') {
        expect(props).toEqual({
          initialProductId: selection.productId,
          initialPriceId: selection.priceId,
        });
      } else {
        expect(props).toEqual({ selection, audience });
      }
      expect(screen.queryByText('/admin')).toBeNull();
    },
  );
});
