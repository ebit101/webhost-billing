import type { PublicProduct } from '@webhost-billing/shared';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readOrderDraft } from '../../lib/order-draft';
import { PublicOrderBuilder } from './public-order-builder';

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
      billingPeriod: 'ANNUAL',
      amount: { amount: '150000', currency: 'BDT' },
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
});

describe('public hosting order step', () => {
  it('lets a guest choose a domain before account entry and keeps the selection', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ success: true, data: [product] }), {
          status: 200,
        }),
      ),
    );
    const user = userEvent.setup();
    render(<PublicOrderBuilder selection={selection} />);
    expect(await screen.findByText('BDT 1,500.00')).toBeTruthy();
    expect(
      screen.queryByRole('link', { name: 'Continue to checkout' }),
    ).toBeNull();
    await user.click(
      screen.getByRole('radio', { name: /Use an existing domain/i }),
    );
    await user.type(
      screen.getByRole('textbox', { name: 'Domain name' }),
      'example.com',
    );
    await user.click(screen.getByRole('button', { name: 'Review selection' }));
    expect(readOrderDraft(selection)).toMatchObject({
      domainChoice: 'EXISTING',
      requestedDomain: 'example.com',
    });
    expect(
      screen
        .getByRole('link', { name: 'Continue to checkout' })
        .getAttribute('href'),
    ).toBe(
      `/portal/checkout?productId=${selection.productId}&priceId=${selection.priceId}`,
    );
  });

  it('does not offer checkout for an unavailable product', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ success: true, data: [] }), {
          status: 200,
        }),
      ),
    );
    render(<PublicOrderBuilder selection={selection} />);
    expect(
      await screen.findByText(
        'This hosting plan or billing period is unavailable.',
      ),
    ).toBeTruthy();
    expect(
      screen.queryByRole('link', { name: 'Continue to checkout' }),
    ).toBeNull();
  });
});
