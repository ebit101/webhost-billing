import type { PublicProduct } from '@webhost-billing/shared';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { saveOrderDraft } from '../../lib/order-draft';
import { CheckoutPreview } from './checkout-preview';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

const selection = {
  productId: '10000000-0000-4000-8000-000000000080',
  priceId: '10000000-0000-4000-8000-000000000081',
};
const product: PublicProduct = {
  id: selection.productId,
  slug: 'starter',
  name: 'Starter Hosting',
  description: 'Fictional package',
  displayOrder: 1,
  features: { storage: '1 GB', websites: '1', email: '5', bandwidth: '25 GB' },
  prices: [
    {
      id: selection.priceId,
      billingPeriod: 'MONTHLY',
      amount: { amount: '120000', currency: 'BDT' },
      setupFee: { amount: '5000', currency: 'BDT' },
      validFrom: '2026-10-18T00:00:00.000Z',
      validUntil: null,
      createdAt: '2026-10-18T00:00:00.000Z',
    },
  ],
};

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('public checkout review', () => {
  it('shows a guest the selected order before account access', async () => {
    saveOrderDraft({
      ...selection,
      domainChoice: 'EXISTING',
      requestedDomain: 'surjo.bd',
    });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: [product] }), {
        status: 200,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    render(<CheckoutPreview selection={selection} audience="guest" />);
    expect(
      await screen.findByRole('heading', { name: 'Order details' }),
    ).toBeTruthy();
    expect(screen.getByText('surjo.bd')).toBeTruthy();
    expect(screen.getByText('BDT 1,200.00')).toBeTruthy();
    expect(screen.getByText('BDT 1,250.00')).toBeTruthy();
    expect(
      screen
        .getByRole('button', { name: 'New customer' })
        .getAttribute('aria-pressed'),
    ).toBe('true');
    expect(screen.getByLabelText('Email address')).toBeTruthy();
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Existing customer' }));
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeTruthy();
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Create an account' }));
    expect(screen.getByLabelText('First name')).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('takes an administrator to the selected customer-order form', async () => {
    saveOrderDraft({
      ...selection,
      domainChoice: 'EXISTING',
      requestedDomain: 'surjo.bd',
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ success: true, data: [product] }), {
            status: 200,
          }),
      ),
    );
    render(<CheckoutPreview selection={selection} audience="admin" />);
    expect(
      await screen.findByRole('link', {
        name: 'Continue to administrator order',
      }),
    ).toHaveProperty(
      'href',
      expect.stringContaining(
        `/admin/orders?checkoutProductId=${selection.productId}`,
      ),
    );
    expect(screen.queryByRole('button', { name: 'New customer' })).toBeNull();
  });

  it('does not invent a registration price or proceed with an expired selection', async () => {
    saveOrderDraft({
      ...selection,
      domainChoice: 'REGISTER',
      requestedDomain: 'newsite.com',
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ success: true, data: [product] }), {
            status: 200,
          }),
      ),
    );
    const view = render(
      <CheckoutPreview selection={selection} audience="guest" />,
    );
    expect(
      await screen.findByText(/Domain availability, registration price/),
    ).toBeTruthy();
    expect(screen.getByText('newsite.com')).toBeTruthy();
    view.unmount();
    localStorage.clear();
    render(<CheckoutPreview selection={selection} audience="guest" />);
    expect(
      await screen.findByText('Your selection is unavailable or has expired.'),
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'New customer' })).toBeNull();
  });
});
