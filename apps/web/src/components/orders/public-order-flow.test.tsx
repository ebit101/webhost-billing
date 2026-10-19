import type { PublicProduct } from '@webhost-billing/shared';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readOrderDraft, saveOrderDraft } from '../../lib/order-draft';
import { OrderConfigure } from './order-configure';
import { OrderReview } from './order-review';

const navigation = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => navigation }));

const selection = {
  productId: '10000000-0000-4000-8000-000000000080',
  priceId: '10000000-0000-4000-8000-000000000081',
};
const annualPriceId = '10000000-0000-4000-8000-000000000082';
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
      setupFee: { amount: '0', currency: 'BDT' },
      validFrom: '2026-10-18T00:00:00.000Z',
      validUntil: null,
      createdAt: '2026-10-18T00:00:00.000Z',
    },
    {
      id: annualPriceId,
      billingPeriod: 'ANNUAL',
      amount: { amount: '1200000', currency: 'BDT' },
      setupFee: { amount: '0', currency: 'BDT' },
      validFrom: '2026-10-18T00:00:00.000Z',
      validUntil: null,
      createdAt: '2026-10-18T00:00:00.000Z',
    },
  ],
};

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  navigation.push.mockClear();
});

function mockCatalog() {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(JSON.stringify({ success: true, data: [product] }), {
          status: 200,
        }),
    ),
  );
}

describe('public hosting order steps', () => {
  it('changes the billing period while preserving the selected domain', async () => {
    mockCatalog();
    saveOrderDraft({
      ...selection,
      domainChoice: 'EXISTING',
      requestedDomain: 'surjo.bd',
    });
    render(<OrderConfigure selection={selection} />);
    expect(
      await screen.findByRole('heading', { name: 'Configure your hosting' }),
    ).toBeTruthy();
    expect(screen.getByText('surjo.bd')).toBeTruthy();
    await userEvent
      .setup()
      .selectOptions(screen.getByLabelText('Billing period'), annualPriceId);
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Continue to review' }));
    expect(navigation.push).toHaveBeenCalledWith(
      `/order/review?productId=${selection.productId}&priceId=${annualPriceId}`,
    );
    expect(
      readOrderDraft({
        productId: selection.productId,
        priceId: annualPriceId,
      }),
    ).toMatchObject({
      requestedDomain: 'surjo.bd',
      domainChoice: 'EXISTING',
    });
  });

  it('reviews the configured cart before account checkout', async () => {
    mockCatalog();
    saveOrderDraft({
      ...selection,
      domainChoice: 'EXISTING',
      requestedDomain: 'surjo.bd',
    });
    render(<OrderReview selection={selection} />);
    expect(
      await screen.findByRole('heading', { name: 'Review your cart' }),
    ).toBeTruthy();
    expect(screen.getByText('surjo.bd')).toBeTruthy();
    expect(
      screen
        .getByRole('link', { name: 'Continue to checkout' })
        .getAttribute('href'),
    ).toBe(
      `/checkout?productId=${selection.productId}&priceId=${selection.priceId}`,
    );
    expect(screen.queryByLabelText('Email address')).toBeNull();
  });

  it('requires a saved domain selection before configuration', async () => {
    mockCatalog();
    render(<OrderConfigure selection={selection} />);
    expect(
      await screen.findByText('Your selection is unavailable or has expired.'),
    ).toBeTruthy();
    expect(
      screen.queryByRole('button', { name: 'Continue to review' }),
    ).toBeNull();
  });
});
