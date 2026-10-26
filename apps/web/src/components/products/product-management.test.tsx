import type { Product, PublicProduct } from '@webhost-billing/shared';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdminProductManager } from './admin-product-manager';
import { PublicProductCatalog } from './public-product-catalog';

const productId = '80000000-0000-4000-8000-000000000001';
const annualPriceId = '80000000-0000-4000-8000-000000000002';
const monthlyPriceId = '80000000-0000-4000-8000-000000000003';

const product: Product = {
  groupId: null,
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
  it('creates, renames and orders groups and assigns or ungroups a product', async () => {
    const user = userEvent.setup();
    const groupId = '80000000-0000-4000-8000-000000000004';
    const group = {
      id: groupId,
      name: 'Shared hosting',
      displayOrder: 10,
      createdAt: product.createdAt,
      updatedAt: product.updatedAt,
    };
    const fetch = vi.fn(async (url: string, options?: RequestInit) => {
      const body = options?.body
        ? (JSON.parse(String(options.body)) as Record<string, unknown>)
        : {};
      if (url.endsWith('/auth/csrf'))
        return jsonResponse({
          success: true,
          data: { csrfToken: 'fictional-token' },
        });
      if (url.endsWith('/products/groups') && options?.method === 'POST')
        return jsonResponse({ success: true, data: group });
      if (url.endsWith(`/products/groups/${groupId}`))
        return jsonResponse({ success: true, data: { ...group, ...body } });
      if (url.endsWith('/products/groups'))
        return jsonResponse({ success: true, data: [] });
      if (url.endsWith(`/products/${productId}`))
        return jsonResponse({
          success: true,
          data: { ...product, ...body, updatedAt: new Date().toISOString() },
        });
      return jsonResponse({ success: true, data: [product] });
    });
    vi.stubGlobal('fetch', fetch);
    render(<AdminProductManager />);
    await screen.findByDisplayValue('business_pkg');
    expect(
      within(screen.getByRole('region', { name: 'Ungrouped' })).getByRole(
        'button',
        { name: /Business Hosting/ },
      ),
    ).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Manage groups' }));
    const create = within(
      screen.getByRole('form', { name: 'Create product group' }),
    );
    await user.type(create.getByLabelText('Group name'), 'Shared hosting');
    await user.clear(create.getByLabelText('Group order'));
    await user.type(create.getByLabelText('Group order'), '10');
    await user.click(create.getByRole('button', { name: 'Create group' }));
    await screen.findByRole('form', { name: 'Edit Shared hosting' });
    await user.selectOptions(screen.getByLabelText('Product group'), groupId);
    await user.click(screen.getByRole('button', { name: 'Save details' }));
    await screen.findByText('Product details saved.');
    expect(
      within(screen.getByRole('region', { name: 'Shared hosting' })).getByRole(
        'button',
        { name: /Business Hosting/ },
      ),
    ).toBeTruthy();
    const edit = within(
      screen.getByRole('form', { name: 'Edit Shared hosting' }),
    );
    await user.clear(edit.getByLabelText('Group name'));
    await user.type(edit.getByLabelText('Group name'), 'Hosting plans');
    await user.click(edit.getByRole('button', { name: 'Save group' }));
    await screen.findByRole('region', { name: 'Hosting plans' });
    await user.selectOptions(screen.getByLabelText('Product group'), '');
    await user.click(screen.getByRole('button', { name: 'Save details' }));
    await screen.findByText('Product details saved.');
    expect(
      within(screen.getByRole('region', { name: 'Ungrouped' })).getByRole(
        'button',
        { name: /Business Hosting/ },
      ),
    ).toBeTruthy();
    expect(
      fetch.mock.calls.some(
        ([url, options]) =>
          url.endsWith(`/products/${productId}`) &&
          String(options?.body).includes(`"groupId":"${groupId}"`),
      ),
    ).toBe(true);
  });

  it('shows a group loading failure and retries both catalogue requests', async () => {
    const user = userEvent.setup();
    let failed = true;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.endsWith('/products/groups') && failed)
          throw new Error('Groups could not be loaded.');
        return jsonResponse({
          success: true,
          data: url.endsWith('/products/groups') ? [] : [product],
        });
      }),
    );
    render(<AdminProductManager />);
    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      'Groups could not be loaded.',
    );
    failed = false;
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    await screen.findByDisplayValue('business_pkg');
  });

  it('loads the administrator catalogue with provisioning and pricing controls', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (url: string) =>
        jsonResponse({
          success: true,
          data: url.endsWith('/products/groups') ? [] : [product],
        }),
      ),
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
      `/order?productId=${productId}&priceId=${monthlyPriceId}`,
    );
    expect(screen.getByText('BDT 240.00')).toBeTruthy();
    expect(
      screen
        .getByRole('button', { name: 'Monthly' })
        .getAttribute('aria-pressed'),
    ).toBe('true');

    await user.click(screen.getByRole('button', { name: 'Quarterly' }));
    expect(screen.getByText('Not available')).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Unavailable for this period' }),
    ).toHaveProperty('disabled', true);

    await user.click(screen.getByRole('button', { name: 'Yearly' }));
    expect(screen.getByText('BDT 2,400.00')).toBeTruthy();
    expect(
      screen
        .getByRole('link', { name: 'Choose Business Hosting' })
        .getAttribute('href'),
    ).toBe(`/order?productId=${productId}&priceId=${annualPriceId}`);
    expect(
      screen.getByRole('table', { name: 'Comparison of active hosting plans' }),
    ).toBeTruthy();
  });

  it('falls back deterministically to the first period that has an active price', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          success: true,
          data: [
            {
              ...publicProduct,
              prices: [publicProduct.prices[0]],
            },
          ],
        }),
      ),
    );

    render(<PublicProductCatalog />);

    expect(
      (
        await screen.findByRole('link', { name: 'Choose Business Hosting' })
      ).getAttribute('href'),
    ).toBe(`/order?productId=${productId}&priceId=${annualPriceId}`);
    expect(
      screen
        .getByRole('button', { name: 'Yearly' })
        .getAttribute('aria-pressed'),
    ).toBe('true');
  });

  it('shows four annual shared-hosting packages and carries each package into checkout', async () => {
    const plans = [
      [
        'Starter',
        '150000',
        '1 GB NVMe SSD',
        '1 website',
        '5 email accounts',
        '100 GB monthly',
      ],
      [
        'Standard',
        '350000',
        '5 GB NVMe SSD',
        '3 websites',
        '10 email accounts',
        '300 GB monthly',
      ],
      [
        'Premium',
        '500000',
        '10 GB NVMe SSD',
        '5 websites',
        '15 email accounts',
        '500 GB monthly',
      ],
      [
        'Maximum',
        '800000',
        '20 GB NVMe SSD',
        '10 websites',
        'Unlimited email accounts',
        '1,000 GB monthly',
      ],
    ] as const;
    const catalog: PublicProduct[] = plans.map(
      ([name, amount, storage, websites, email, bandwidth], index) => {
        const id = `80000000-0000-4000-8000-${String(index + 10).padStart(12, '0')}`;
        const priceId = `80000000-0000-4000-8000-${String(index + 20).padStart(12, '0')}`;
        return {
          ...publicProduct,
          id,
          slug: `shared-${name.toLowerCase()}`,
          name,
          displayOrder: index,
          features: { storage, websites, email, bandwidth },
          prices: [
            {
              ...publicProduct.prices[0]!,
              id: priceId,
              amount: { amount, currency: 'BDT' },
            },
            ...(index === 0
              ? [
                  { ...publicProduct.prices[1]!, id: monthlyPriceId },
                  {
                    ...publicProduct.prices[0]!,
                    id: `80000000-0000-4000-8000-000000000099`,
                    amount: { amount: '9900', currency: 'USD' },
                    setupFee: { amount: '0', currency: 'USD' },
                  },
                ]
              : []),
          ],
        };
      },
    );
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ success: true, data: catalog })),
    );

    render(<PublicProductCatalog />);

    for (const plan of catalog) {
      const choose = await screen.findByRole('link', {
        name: `Choose ${plan.name}`,
      });
      expect(choose.getAttribute('href')).toBe(
        `/order?productId=${plan.id}&priceId=${plan.prices[0]!.id}`,
      );
    }
    expect(
      screen
        .getByRole('button', { name: 'Yearly' })
        .getAttribute('aria-pressed'),
    ).toBe('true');
    expect(screen.getByText('BDT 1,500.00')).toBeTruthy();
    expect(screen.getByText('BDT 8,000.00')).toBeTruthy();
    expect(screen.queryByLabelText('Currency')).toBeNull();
    expect(screen.queryByText(/USD/)).toBeNull();
  });

  it('shows an explicit unavailable state when products have no active prices', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          success: true,
          data: [{ ...publicProduct, prices: [] }],
        }),
      ),
    );

    render(<PublicProductCatalog />);

    expect(
      await screen.findByRole('heading', {
        name: 'Hosting plans are temporarily unavailable',
      }),
    ).toBeTruthy();
    expect(
      screen
        .getByRole('link', { name: 'Sign in for support' })
        .getAttribute('href'),
    ).toBe('/login');
    expect(
      screen.queryByRole('link', { name: 'Choose Business Hosting' }),
    ).toBeNull();
  });
});

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
