import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import LoginPage from './login/page';
import RegisterPage from './register/page';
import CheckoutPage from './(portal)/portal/checkout/page';
import type { SelectionQuery } from '../lib/checkout-intent';

const guard = vi.hoisted(() => vi.fn());
vi.mock('../lib/server-auth', () => ({ requireWorkspaceRole: guard }));
vi.mock('../components/auth/login-form', () => ({
  LoginForm: (props: unknown) => (
    <div data-testid="props">{JSON.stringify(props)}</div>
  ),
}));
vi.mock('../components/auth/register-form', () => ({
  RegisterForm: (props: unknown) => (
    <div data-testid="props">{JSON.stringify(props)}</div>
  ),
}));
vi.mock('../components/orders/customer-checkout', () => ({
  CustomerCheckout: (props: unknown) => (
    <div data-testid="props">{JSON.stringify(props)}</div>
  ),
}));
const selection = {
  productId: '10000000-0000-4000-8000-000000000080',
  priceId: '10000000-0000-4000-8000-000000000081',
};

describe('account-entry server pages', () => {
  it.each([LoginPage, RegisterPage])(
    'extracts only the validated pair for the account form',
    async (Page) => {
      render(
        await Page({
          searchParams: Promise.resolve({
            ...selection,
            next: '//evil.example',
            amount: '1',
          }),
        }),
      );
      expect(
        JSON.parse(screen.getByTestId('props').textContent ?? ''),
      ).toMatchObject({ checkoutIntent: selection });
      expect(screen.getByTestId('props').textContent).not.toContain('evil');
    },
  );
  it.each([
    {},
    { productId: selection.productId },
    { ...selection, priceId: [selection.priceId, selection.priceId] },
  ] satisfies SelectionQuery[])(
    'discards incomplete or duplicate account-entry selection',
    async (query) => {
      render(await LoginPage({ searchParams: Promise.resolve(query) }));
      expect(
        JSON.parse(screen.getByTestId('props').textContent ?? ''),
      ).not.toHaveProperty('checkoutIntent');
    },
  );
  it('checks the checkout role at page render and passes no raw URL payload', async () => {
    render(
      await CheckoutPage({
        searchParams: Promise.resolve({ ...selection, returnTo: '/admin' }),
      }),
    );
    expect(guard).toHaveBeenCalledWith('CUSTOMER');
    expect(JSON.parse(screen.getByTestId('props').textContent ?? '')).toEqual({
      initialProductId: selection.productId,
      initialPriceId: selection.priceId,
    });
  });
});
