import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import LoginPage from './login/page';
import RegisterPage from './register/page';
import CheckoutPage from './(portal)/portal/checkout/page';
import type { SelectionQuery } from '../lib/checkout-intent';

const guard = vi.hoisted(() => vi.fn());
const identity = vi.hoisted(() => vi.fn());
const redirect = vi.hoisted(() =>
  vi.fn((path: string): never => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  }),
);
vi.mock('next/navigation', () => ({ redirect }));
vi.mock('../lib/server-auth', () => ({
  requireWorkspaceRole: guard,
  getAuthenticatedIdentity: identity,
}));
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
  beforeEach(() => {
    vi.clearAllMocks();
    identity.mockResolvedValue(null);
  });

  it.each([
    ['ADMIN', '/admin'],
    ['CUSTOMER', '/portal'],
  ] as const)(
    'redirects an authenticated %s to its workspace without rendering sign-in',
    async (role, destination) => {
      identity.mockResolvedValue({ role });
      await expect(
        LoginPage({
          searchParams: Promise.resolve({
            ...selection,
            next: '//evil.example',
          }),
        }),
      ).rejects.toThrow(`NEXT_REDIRECT:${destination}`);
      expect(identity).toHaveBeenCalledOnce();
      expect(redirect).toHaveBeenCalledExactlyOnceWith(destination);
      expect(screen.queryByTestId('props')).toBeNull();
    },
  );

  it('retains the sign-in form when there is no authenticated session', async () => {
    render(await LoginPage({ searchParams: Promise.resolve({}) }));
    expect(identity).toHaveBeenCalledOnce();
    expect(redirect).not.toHaveBeenCalled();
    expect(JSON.parse(screen.getByTestId('props').textContent ?? '')).toEqual({
      audience: 'customer',
    });
  });

  it('fails closed when the session cannot be verified', async () => {
    identity.mockRejectedValueOnce(new Error('Authentication unavailable'));
    await expect(
      LoginPage({ searchParams: Promise.resolve({}) }),
    ).rejects.toThrow('Authentication unavailable');
    expect(redirect).not.toHaveBeenCalled();
    expect(screen.queryByTestId('props')).toBeNull();
  });

  it('preserves validated domain intent for an anonymous sign-in', async () => {
    render(
      await LoginPage({
        searchParams: Promise.resolve({
          domainOfferId: '50000000-0000-4000-8000-000000000001',
          domainName: 'Fictional.COM',
          next: '//evil.example',
          sellingAmount: '0',
        }),
      }),
    );
    expect(JSON.parse(screen.getByTestId('props').textContent ?? '')).toEqual({
      audience: 'customer',
      domainIntent: {
        domainOfferId: '50000000-0000-4000-8000-000000000001',
        domainName: 'fictional.com',
      },
    });
    expect(redirect).not.toHaveBeenCalled();
  });

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
