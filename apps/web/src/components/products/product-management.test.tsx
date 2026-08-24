import type { Product, PublicProduct } from '@webhost-billing/shared';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdminProductManager } from './admin-product-manager';
import { PublicProductCatalog } from './public-product-catalog';

const productId = '80000000-0000-4000-8000-000000000001';
const annualPriceId = '80000000-0000-4000-8000-000000000002';
const monthlyPriceId = '80000000-0000-4000-8000-000000000003';

const product: Product = {
  id: productId,
  slug: 'business-hosting',
  name: 'Business Hosting',
  description: 'Hosting for a growing business.',
  status: 'ACTIVE',
  publicVisible: true,
  displayOrder: 20,
  hostingPackageIdentifier: 'business_pkg',
  storageFeature: '30 GB SSD',
  websiteFeature: '5 websites',
  emailFeature: '50 email accounts',
  bandwidthFeature: 'Unlimited',
  prices: [
    {
      id: annualPriceId,
      billingPeriod: 'ANNUAL',
      amount: { amount: '240000', currency: 'BDT' },
      setupFee: { amount: '0', currency: 'BDT' },
      isActive: true,
      validFrom: '2026-08-24T12:00:00.000Z',
      validUntil: null,
      createdAt: '2026-08-24T12:00:00.000Z',
    },
  ],
  createdAt: '2026-08-24T12:00:00.000Z',
  updatedAt: '2026-08-24T12:00:00.000Z',
};

const publicProduct: PublicProduct = {
  id: productId,
  slug: product.slug,
  name: product.name,
  description: product.description,
  displayOrder: product.displayOrder,
  features: {
    storage: product.storageFeature,
    websites: product.websiteFeature,
    email: product.emailFeature,
    bandwidth: product.bandwidthFeature,
  },
  prices: [
    {
      id: annualPriceId,
      billingPeriod: 'ANNUAL',
      amount: { amount: '240000', currency: 'BDT' },
      setupFee: { amount: '0', currency: 'BDT' },
      validFrom: '2026-08-24T12:00:00.000Z',
      validUntil: null,
      createdAt: '2026-08-24T12:00:00.000Z',
    },
    {
      id: monthlyPriceId,
      billingPeriod: 'MONTHLY',
      amount: { amount: '24000', currency: 'BDT' },
      setupFee: { amount: '0', currency: 'BDT' },
      validFrom: '2026-08-24T12:00:00.000Z',
      validUntil: null,
      createdAt: '2026-08-24T12:00:00.000Z',
    },
  ],
};

afterEach(() => vi.unstubAllGlobals());

describe('product and pricing interfaces', () => {
  it('loads the administrator catalogue with provisioning and pricing controls', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(jsonResponse({ success: true, data: [product] })),
    );
    render(<AdminProductManager />);
    expect(await screen.findByDisplayValue('business_pkg')).toBeTruthy();
    expect(screen.getByDisplayValue('30 GB SSD')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Move to draft' })).toBeTruthy();
    expect(screen.getByText('Yearly · BDT 240000 minor units')).toBeTruthy();
  });

  it('compares periods and carries the selected product and price to checkout', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse({ success: true, data: [publicProduct] }),
        ),
    );
    render(<PublicProductCatalog />);
    const choose = await screen.findByRole('link', {
      name: 'Choose Business Hosting',
    });
    expect(choose.getAttribute('href')).toBe(
      `/register?productId=${productId}&priceId=${annualPriceId}`,
    );
    expect(screen.getByText('BDT 2,400.00')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Monthly' }));
    expect(screen.getByText('BDT 240.00')).toBeTruthy();
    expect(
      screen
        .getByRole('link', { name: 'Choose Business Hosting' })
        .getAttribute('href'),
    ).toBe(`/register?productId=${productId}&priceId=${monthlyPriceId}`);
    expect(
      screen.getByRole('table', { name: 'Comparison of active hosting plans' }),
    ).toBeTruthy();
  });
});

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
