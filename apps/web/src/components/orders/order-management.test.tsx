import type {
  CustomerDetail,
  CustomerSummary,
  Order,
  Product,
  PublicProduct,
} from '@webhost-billing/shared';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdminOrderManager } from './admin-order-manager';
import { CustomerCheckout } from './customer-checkout';
import { saveOrderDraft } from '../../lib/order-draft';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

const customerId = '90000000-0000-4000-8000-000000000001';
const productId = '90000000-0000-4000-8000-000000000002';
const priceId = '90000000-0000-4000-8000-000000000003';
const orderId = '90000000-0000-4000-8000-000000000004';

const product: Product = {
  groupId: null,
  id: productId,
  slug: 'starter-hosting',
  name: 'Starter Hosting',
  description: 'A focused hosting plan.',
  status: 'ACTIVE',
  publicVisible: true,
  displayOrder: 1,
  hostingPackageIdentifier: 'starter_pkg',
  storageFeature: '10 GB SSD',
  websiteFeature: '1 website',
  emailFeature: '10 email accounts',
  bandwidthFeature: '100 GB',
  prices: [
    {
      id: priceId,
      billingPeriod: 'MONTHLY',
      amount: { amount: '12000', currency: 'BDT' },
      setupFee: { amount: '500', currency: 'BDT' },
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
  id: product.id,
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
  prices: product.prices.map((price) => ({
    id: price.id,
    billingPeriod: price.billingPeriod,
    amount: price.amount,
    setupFee: price.setupFee,
    validFrom: price.validFrom,
    validUntil: price.validUntil,
    createdAt: price.createdAt,
  })),
};

const order: Order = {
  id: orderId,
  orderNumber: 'ORD-20260824-00010203040506FF',
  customerId,
  customerName: 'Amina Rahman',
  customerEmail: 'amina@example.test',
  status: 'AWAITING_PAYMENT',
  subtotal: { amount: '12000', currency: 'BDT' },
  setupTotal: { amount: '500', currency: 'BDT' },
  total: { amount: '12500', currency: 'BDT' },
  notes: null,
  placedAt: '2026-08-24T12:00:00.000Z',
  completedAt: null,
  cancelledAt: null,
  items: [
    {
      id: '90000000-0000-4000-8000-000000000005',
      productId,
      productPriceId: priceId,
      productName: 'Starter Hosting',
      description: 'A focused hosting plan.',
      billingPeriod: 'MONTHLY',
      unitAmount: { amount: '12000', currency: 'BDT' },
      setupFee: { amount: '500', currency: 'BDT' },
      lineTotal: { amount: '12500', currency: 'BDT' },
      quantity: 1,
      requestedDomain: 'customer.example.test',
    },
  ],
  invoice: {
    id: '90000000-0000-4000-8000-000000000006',
    invoiceNumber: 'INV-20260824-00010203040506FF',
    status: 'UNPAID',
    total: { amount: '12500', currency: 'BDT' },
    balanceDue: { amount: '12500', currency: 'BDT' },
    dueAt: '2026-08-24T12:00:00.000Z',
  },
};

const customer: CustomerSummary = {
  id: customerId,
  customerNumber: 'CUST-0001',
  status: 'ACTIVE',
  accountStatus: 'ACTIVE',
  email: order.customerEmail,
  emailVerified: true,
  firstName: 'Amina',
  lastName: 'Rahman',
  companyName: null,
  createdAt: '2026-08-24T12:00:00.000Z',
  linkedCounts: { orders: 1, services: 0, invoices: 1, tickets: 0 },
};

const customerDetail: CustomerDetail = {
  id: customer.id,
  customerNumber: customer.customerNumber,
  status: customer.status,
  accountStatus: customer.accountStatus,
  email: customer.email,
  emailVerified: customer.emailVerified,
  firstName: customer.firstName,
  lastName: customer.lastName,
  companyName: customer.companyName,
  createdAt: customer.createdAt,
  phone: null,
  addressLine1: '7 Test Avenue',
  addressLine2: null,
  city: 'Dhaka',
  region: null,
  postalCode: '1200',
  countryCode: 'BD',
  taxIdentifier: null,
  updatedAt: customer.createdAt,
  linked: {
    orders: [],
    services: [],
    invoices: [],
    payments: [],
    tickets: [],
    counts: { orders: 0, services: 0, invoices: 0, payments: 0, tickets: 0 },
  },
};

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('order interfaces', () => {
  it('restores the guest domain choice after account sign in', async () => {
    saveOrderDraft({
      productId,
      priceId,
      domainChoice: 'EXISTING',
      requestedDomain: 'example.com',
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ success: true, data: [publicProduct] })),
    );
    render(
      <CustomerCheckout
        initialProductId={productId}
        initialPriceId={priceId}
      />,
    );
    expect(
      (
        (await screen.findByRole('textbox', {
          name: 'Domain',
        })) as HTMLInputElement
      ).value,
    ).toBe('example.com');
    expect(
      (
        screen.getByRole('radio', {
          name: /Use an existing domain/i,
        }) as HTMLInputElement
      ).checked,
    ).toBe(true);
  });
  it.each([
    'retired product',
    'retired price',
    'mismatched price',
    'empty catalogue',
  ])(
    'never substitutes a plan for a carried %s and requires deliberate replacement',
    async (scenario) => {
      const mock = vi.fn(async () =>
        jsonResponse({
          success: true,
          data:
            scenario === 'empty catalogue'
              ? []
              : scenario === 'mismatched price'
                ? [
                    publicProduct,
                    {
                      ...publicProduct,
                      id: customerId,
                      name: 'Other Hosting',
                      prices: [{ ...publicProduct.prices[0]!, id: orderId }],
                    },
                  ]
                : [publicProduct],
        }),
      );
      vi.stubGlobal('fetch', mock);
      render(
        <CustomerCheckout
          initialProductId={
            scenario === 'retired product' ? orderId : productId
          }
          initialPriceId={
            scenario === 'retired price' || scenario === 'mismatched price'
              ? orderId
              : priceId
          }
        />,
      );
      await screen.findByText(
        'Your selected hosting plan or billing period is no longer available.',
      );
      expect(
        (screen.getByLabelText('Product') as HTMLSelectElement).value,
      ).toBe('');
      expect(
        (screen.getByLabelText('Billing period') as HTMLSelectElement).value,
      ).toBe('');
      expect(
        (
          screen.getByRole('button', {
            name: 'Place order',
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(true);
      expect(mock).toHaveBeenCalledTimes(1);
      expect(
        screen
          .getByRole('link', { name: 'Choose another hosting plan' })
          .getAttribute('href'),
      ).toBe('/hosting');
      if (scenario !== 'empty catalogue') {
        await userEvent
          .setup()
          .selectOptions(screen.getByLabelText('Product'), productId);
        expect(
          screen.queryByText(
            'Your selected hosting plan or billing period is no longer available.',
          ),
        ).toBeNull();
        expect(
          (screen.getByLabelText('Billing period') as HTMLSelectElement).value,
        ).toBe(priceId);
        expect(mock).toHaveBeenCalledTimes(1);
      }
    },
  );

  it('retains an exact non-first catalogue selection without placing an order', async () => {
    const nextPriceId = '90000000-0000-4000-8000-000000000080';
    const nextProductId = '90000000-0000-4000-8000-000000000081';
    const second = {
      ...publicProduct,
      id: nextProductId,
      name: 'Selected Plan',
      prices: [{ ...publicProduct.prices[0]!, id: nextPriceId }],
    };
    const mock = vi.fn(async () =>
      jsonResponse({ success: true, data: [publicProduct, second] }),
    );
    vi.stubGlobal('fetch', mock);
    render(
      <CustomerCheckout
        initialProductId={nextProductId}
        initialPriceId={nextPriceId}
      />,
    );
    await waitFor(() =>
      expect(
        (screen.getByLabelText('Product') as HTMLSelectElement).value,
      ).toBe(nextProductId),
    );
    expect(
      (screen.getByLabelText('Billing period') as HTMLSelectElement).value,
    ).toBe(nextPriceId);
    expect(mock).toHaveBeenCalledTimes(1);
  });

  it('keeps no-intent checkout usable with a currently available plan', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ success: true, data: [publicProduct] })),
    );
    render(<CustomerCheckout />);
    await waitFor(() =>
      expect(
        (screen.getByLabelText('Product') as HTMLSelectElement).value,
      ).toBe(productId),
    );
    expect(
      (screen.getByLabelText('Billing period') as HTMLSelectElement).value,
    ).toBe(priceId);
    expect(screen.queryByRole('alert')).toBeNull();
  });
  it('submits only product, price, domain, and an idempotency key at checkout', async () => {
    const user = userEvent.setup();
    let submittedBody: Record<string, unknown> | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith('/products/public')) {
          return jsonResponse({ success: true, data: [publicProduct] });
        }
        if (url.endsWith('/auth/csrf')) {
          return jsonResponse({
            success: true,
            data: { csrfToken: 'a'.repeat(32) },
          });
        }
        if (url.endsWith('/orders/checkout')) {
          submittedBody = JSON.parse(String(init?.body)) as Record<
            string,
            unknown
          >;
          return jsonResponse({
            success: true,
            data: { order, duplicate: false },
          });
        }
        throw new Error(`Unexpected request: ${url}`);
      }),
    );
    render(
      <CustomerCheckout
        initialProductId={productId}
        initialPriceId={priceId}
      />,
    );
    await user.type(
      await screen.findByLabelText('Domain'),
      'customer.example.test',
    );
    await user.click(screen.getByRole('button', { name: 'Place order' }));
    expect(await screen.findByText(order.orderNumber)).toBeTruthy();
    expect(submittedBody).toMatchObject({
      productId,
      priceId,
      requestedDomain: 'customer.example.test',
    });
    expect(submittedBody?.submissionKey).toMatch(/^[0-9a-f-]{36}$/);
    expect(submittedBody).not.toHaveProperty('total');
    expect(submittedBody).not.toHaveProperty('amount');
  });

  it('quotes a simulated new domain and adds it to the hosting order on one invoice', async () => {
    const user = userEvent.setup();
    saveOrderDraft({
      productId,
      priceId,
      domainChoice: 'REGISTER',
      requestedDomain: 'newsite.com',
    });
    const domainQuoteId = '90000000-0000-4000-8000-000000000091';
    const offerId = '90000000-0000-4000-8000-000000000092';
    const bodies: Record<string, unknown>[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith('/products/public'))
          return jsonResponse({ success: true, data: [publicProduct] });
        if (url.endsWith('/domains/offers'))
          return jsonResponse({
            success: true,
            data: [
              {
                id: offerId,
                tld: 'com',
                years: 1,
                sellingAmount: '150000',
                currency: 'BDT',
                nameservers: ['ns1.example.test', 'ns2.example.test'],
                simulated: true,
                costAmount: '1000',
                costCurrency: 'USD',
              },
            ],
          });
        if (url.endsWith('/auth/me'))
          return jsonResponse({
            success: true,
            data: {
              userId: '90000000-0000-4000-8000-000000000099',
              email: customer.email,
              role: 'CUSTOMER',
              customerId,
            },
          });
        if (url.endsWith(`/customers/${customerId}`))
          return jsonResponse({ success: true, data: customerDetail });
        if (url.endsWith('/auth/csrf'))
          return jsonResponse({
            success: true,
            data: { csrfToken: 'a'.repeat(32) },
          });
        if (url.endsWith('/domains/quotes')) {
          bodies.push(
            JSON.parse(String(init?.body)) as Record<string, unknown>,
          );
          return jsonResponse({
            success: true,
            data: {
              id: domainQuoteId,
              domainName: 'newsite.com',
              sellingAmount: '150000',
              currency: 'BDT',
              costAmount: '1000',
              costCurrency: 'USD',
              simulated: true,
              expiresAt: new Date(Date.now() + 300000).toISOString(),
            },
          });
        }
        if (url.endsWith('/orders/checkout')) {
          bodies.push(
            JSON.parse(String(init?.body)) as Record<string, unknown>,
          );
          return jsonResponse({
            success: true,
            data: {
              order: {
                ...order,
                items: [
                  {
                    ...order.items[0],
                    id: '90000000-0000-4000-8000-000000000093',
                    kind: 'DOMAIN',
                    productName: 'Simulated domain registration',
                    requestedDomain: 'newsite.com',
                  },
                  {
                    ...order.items[0],
                    kind: 'HOSTING',
                    requestedDomain: 'newsite.com',
                  },
                ],
              },
              duplicate: false,
            },
          });
        }
        throw new Error(`Unexpected request: ${url}`);
      }),
    );
    render(
      <CustomerCheckout
        initialProductId={productId}
        initialPriceId={priceId}
      />,
    );
    await screen.findByLabelText('Product');
    await screen.findByRole('button', { name: 'Check domain and get quote' });
    expect(screen.getByLabelText('Domain name')).toHaveProperty(
      'value',
      'newsite',
    );
    await waitFor(() =>
      expect(screen.getByLabelText('Registrant name')).toHaveProperty(
        'value',
        'Amina Rahman',
      ),
    );
    await user.type(screen.getByLabelText('Company'), 'Example Studio');
    await user.type(screen.getByLabelText('Region'), 'Dhaka');
    await user.type(screen.getByLabelText('Phone country code'), '880');
    await user.type(screen.getByLabelText('Phone number'), '1712345678');
    await user.click(screen.getByRole('checkbox'));
    await user.click(
      screen.getByRole('button', { name: 'Check domain and get quote' }),
    );
    expect(
      await screen.findByText(/newsite.com is available in the simulation/),
    ).toBeTruthy();
    expect(bodies[0]).toMatchObject({
      offerId,
      domainName: 'newsite.com',
      agreement: 'fictional-registration-v1',
      consent: true,
    });
    await user.click(
      screen.getByRole('button', { name: 'Place hosting and domain order' }),
    );
    expect(await screen.findByText(order.orderNumber)).toBeTruthy();
    expect(screen.getByText('Starter Hosting')).toBeTruthy();
    expect(screen.getByText('newsite.com')).toBeTruthy();
    expect(bodies[1]).toMatchObject({
      productId,
      priceId,
      requestedDomain: 'newsite.com',
      domainQuoteId,
    });
    expect(bodies[1]).not.toHaveProperty('total');
  });

  it('submits one combined order with an explicitly unchecked registration choice and a catalogue price', async () => {
    let submitted: Record<string, unknown> | undefined;
    const domainId = '14900000-0000-4000-8000-000000000010';
    const domainPriceId = '14900000-0000-4000-8000-000000000011';
    const mock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/orders?')) return paginatedResponse([]);
      if (url.includes('/customers?')) return paginatedResponse([customer]);
      if (url.endsWith('/products'))
        return jsonResponse({ success: true, data: [product] });
      if (url.includes('/orders/admin/domain-options?'))
        return jsonResponse({
          success: true,
          data: {
            customerId,
            prices: [
              {
                tld: 'com',
                priceId: domainPriceId,
                name: '.com domain',
                amount: { amount: '189000', currency: 'BDT' },
              },
            ],
            domains: [
              {
                id: domainId,
                domainName: 'fictional-combined.com',
                ownershipVerifiedAt: '2026-10-30T00:00:00.000Z',
                expiresAt: '2030-01-01T00:00:00.000Z',
              },
            ],
          },
        });
      if (url.endsWith('/auth/csrf'))
        return jsonResponse({ success: true, data: { csrfToken: 'csrf' } });
      if (url.endsWith('/orders/admin')) {
        submitted = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return jsonResponse({
          success: true,
          data: { order, duplicate: false },
        });
      }
      throw new Error('Unexpected request');
    });
    vi.stubGlobal('fetch', mock);
    render(<AdminOrderManager />);
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', {
        name: 'Create hosting/domain order',
      }),
    );
    const dialog = await screen.findByRole('dialog', {
      name: 'Create hosting/domain order',
    });
    await user.selectOptions(
      within(dialog).getByLabelText('Customer'),
      customerId,
    );
    await user.selectOptions(within(dialog).getByLabelText('Price'), priceId);
    await user.click(
      within(dialog).getByRole('checkbox', {
        name: 'Include domain billing in this order',
      }),
    );
    expect(
      within(dialog).getByRole('button', { name: 'Create order and invoice' }),
    ).toHaveProperty('disabled', true);
    expect(
      within(dialog).getByRole('checkbox', {
        name: 'Send registration to registrar',
      }),
    ).toHaveProperty('checked', false);
    await within(dialog).findByRole('option', {
      name: 'fictional-combined.com',
    });
    await user.selectOptions(
      within(dialog).getByLabelText('Verified existing domain'),
      domainId,
    );
    await user.selectOptions(
      within(dialog).getByLabelText('Annual domain price'),
      domainPriceId,
    );
    expect(
      (within(dialog).getByLabelText('Requested domain') as HTMLInputElement)
        .value,
    ).toBe('fictional-combined.com');
    await within(dialog).findByText(/Order total:.*2,015\.00/);
    expect(
      within(dialog).getByText('Setup fee (once):').nextElementSibling
        ?.textContent,
    ).toBe('BDT 5.00');
    expect(
      within(dialog).getByText('Hosting charge:').nextElementSibling
        ?.textContent,
    ).toBe('BDT 120.00');
    await user.click(
      within(dialog).getByRole('button', { name: 'Create order and invoice' }),
    );
    await waitFor(() =>
      expect(submitted?.domainOrder).toEqual({
        mode: 'EXISTING',
        domainId,
        priceId: domainPriceId,
        sendToRegistrar: false,
      }),
    );
    expect(submitted).not.toHaveProperty('amount');
    expect(
      mock.mock.calls.some(([url]) =>
        /\/domains\/(admin\/quotes|existing-links)/.test(String(url)),
      ),
    ).toBe(false);
  });
  it('submits the administrator preservation choice without changing prices', async () => {
    let submitted: Record<string, unknown> | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes('/orders?')) return paginatedResponse([]);
        if (url.includes('/customers?')) return paginatedResponse([customer]);
        if (url.endsWith('/products'))
          return jsonResponse({ success: true, data: [product] });
        if (url.endsWith('/auth/csrf'))
          return jsonResponse({ success: true, data: { csrfToken: 'csrf' } });
        if (url.endsWith('/orders/admin')) {
          submitted = JSON.parse(String(init?.body)) as Record<string, unknown>;
          return jsonResponse({
            success: true,
            data: { order, duplicate: false },
          });
        }
        throw new Error('Unexpected request');
      }),
    );
    render(<AdminOrderManager />);
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', {
        name: 'Create hosting/domain order',
      }),
    );
    const dialog = await screen.findByRole('dialog', {
      name: 'Create hosting/domain order',
    });
    await user.selectOptions(
      within(dialog).getByLabelText('Customer'),
      customerId,
    );
    await user.selectOptions(within(dialog).getByLabelText('Price'), priceId);
    await user.type(
      within(dialog).getByLabelText('Requested domain'),
      'preserved.example.test',
    );
    await user.click(
      within(dialog).getByRole('checkbox', {
        name: /Keep existing website and email/,
      }),
    );
    await user.click(
      within(dialog).getByRole('button', { name: 'Create order and invoice' }),
    );
    await waitFor(() =>
      expect(submitted?.hostingProvisioningMode).toBe('PRESERVE_EXISTING'),
    );
    expect(submitted).not.toHaveProperty('amount');
    expect(submitted).not.toHaveProperty('mxcheck');
  });

  it('loads administrator order creation and state controls', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/orders?')) return paginatedResponse([order], 20);
        if (url.includes('/customers?')) return paginatedResponse([customer]);
        if (url.endsWith('/products')) {
          return jsonResponse({ success: true, data: [product] });
        }
        throw new Error(`Unexpected request: ${url}`);
      }),
    );
    render(<AdminOrderManager />);
    await userEvent.setup().click(
      await screen.findByRole('button', {
        name: 'Create hosting/domain order',
      }),
    );
    expect(
      await screen.findByRole('button', {
        name: 'Create order and invoice',
      }),
    ).toBeTruthy();
    expect(await screen.findByText(order.orderNumber)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Reject' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeTruthy();
  });

  it('prefills an administrator hosting order from the public selection', async () => {
    saveOrderDraft({
      productId,
      priceId,
      domainChoice: 'EXISTING',
      requestedDomain: 'surjo.bd',
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/orders?')) return paginatedResponse([], 20);
        if (url.includes('/customers?')) return paginatedResponse([customer]);
        if (url.endsWith('/products'))
          return jsonResponse({ success: true, data: [product] });
        throw new Error(`Unexpected request: ${url}`);
      }),
    );
    render(<AdminOrderManager checkoutIntent={{ productId, priceId }} />);
    await screen.findByRole('dialog', { name: 'Create hosting/domain order' });
    await screen.findByText('Hosting selection carried forward');
    expect((screen.getByLabelText('Product') as HTMLSelectElement).value).toBe(
      productId,
    );
    expect((screen.getByLabelText('Price') as HTMLSelectElement).value).toBe(
      priceId,
    );
    expect(
      (screen.getByLabelText('Requested domain') as HTMLInputElement).value,
    ).toBe('surjo.bd');
    expect(
      screen.getByRole('button', { name: 'Create order and invoice' }),
    ).not.toHaveProperty('disabled', true);
  });

  it('prevents a new-domain draft from becoming a hosting-only administrator order', async () => {
    saveOrderDraft({
      productId,
      priceId,
      domainChoice: 'REGISTER',
      requestedDomain: 'newsite.com',
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/orders?')) return paginatedResponse([], 20);
        if (url.includes('/customers?')) return paginatedResponse([customer]);
        if (url.endsWith('/products'))
          return jsonResponse({ success: true, data: [product] });
        throw new Error(`Unexpected request: ${url}`);
      }),
    );
    render(<AdminOrderManager checkoutIntent={{ productId, priceId }} />);
    const dialog = await screen.findByRole('dialog', {
      name: 'Create hosting/domain order',
    });
    expect(
      await within(dialog).findByText(
        /This selection requests domain registration/,
      ),
    ).toBeTruthy();
    expect(
      within(dialog).getByRole('button', { name: 'Create order and invoice' }),
    ).toHaveProperty('disabled', true);
  });

  it('applies, explains, and clears URL-bound customer context', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/orders?')) return paginatedResponse([], 20);
      if (url.includes('/customers?pageSize=')) {
        return paginatedResponse([customer]);
      }
      if (url.endsWith(`/customers/${customerId}`)) {
        return jsonResponse({ success: true, data: customerDetail });
      }
      if (url.endsWith('/products')) {
        return jsonResponse({ success: true, data: [product] });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <AdminOrderManager customerFilter={{ customerId, invalid: false }} />,
    );

    const filterNotice = await screen.findByLabelText('Customer filter');
    expect(filterNotice.textContent).toContain(
      'Showing orders for Amina Rahman · CUST-0001',
    );
    expect(await screen.findByText('No orders for this customer')).toBeTruthy();
    expect(
      screen
        .getByRole('link', { name: 'Clear customer filter' })
        .getAttribute('href'),
    ).toBe('/admin/orders?page=1&pageSize=20');
    expect(
      fetchMock.mock.calls.some(([request]) =>
        String(request).endsWith(
          `/orders?page=1&pageSize=20&customerId=${customerId}`,
        ),
      ),
    ).toBe(true);
  });

  it('ignores malformed customer context and offers a safe clear action', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/orders?')) return paginatedResponse([], 20);
      if (url.includes('/customers?')) return paginatedResponse([customer]);
      if (url.endsWith('/products')) {
        return jsonResponse({ success: true, data: [product] });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<AdminOrderManager customerFilter={{ invalid: true }} />);

    expect(
      await screen.findByText(
        'The customer filter is invalid and was not applied. No customer context was inferred.',
      ),
    ).toBeTruthy();
    expect(
      screen
        .getByRole('link', { name: 'Clear invalid filter' })
        .getAttribute('href'),
    ).toBe('/admin/orders?page=1&pageSize=20');
    expect(
      fetchMock.mock.calls.some(([request]) =>
        String(request).includes('customerId='),
      ),
    ).toBe(false);
  });

  it('lets an administrator approve a paid order for fulfilment', async () => {
    const user = userEvent.setup();
    const paidOrder: Order = {
      ...order,
      status: 'PAID',
      invoice: {
        ...order.invoice,
        status: 'PAID',
        balanceDue: { amount: '0', currency: 'BDT' },
      },
    };
    let approved = false;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes('/orders?')) return paginatedResponse([paidOrder], 20);
        if (url.includes('/customers?')) return paginatedResponse([customer]);
        if (url.endsWith('/products')) {
          return jsonResponse({ success: true, data: [product] });
        }
        if (url.endsWith(`/orders/${orderId}`))
          return jsonResponse({ success: true, data: paidOrder });
        if (url.endsWith('/settings'))
          return jsonResponse({
            success: true,
            data: { timeZone: 'Asia/Dhaka' },
          });
        if (url.endsWith('/auth/csrf')) {
          return jsonResponse({
            success: true,
            data: { csrfToken: 'a'.repeat(32) },
          });
        }
        if (url.endsWith(`/orders/${orderId}/status`)) {
          approved = JSON.parse(String(init?.body)).status === 'PROCESSING';
          return jsonResponse({
            success: true,
            data: { ...paidOrder, status: 'PROCESSING' },
          });
        }
        throw new Error(`Unexpected request: ${url}`);
      }),
    );

    render(<AdminOrderManager />);
    await user.click(
      await screen.findByRole('button', {
        name: `Review order ${order.orderNumber}`,
      }),
    );
    const review = await screen.findByRole('region', { name: 'Order review' });
    await within(review).findByText(paidOrder.orderNumber);
    expect(
      within(review).queryByRole('button', { name: 'Approve' }),
    ).toBeNull();
    expect(approved).toBe(false);
    await user.click(await screen.findByRole('button', { name: 'Approve' }));

    expect(approved).toBe(true);
    expect(await screen.findByText(/moved to processing/i)).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Order review' })).toBeNull();
  });

  it('opens review only deliberately, re-reads on selection and restores focus on close', async () => {
    const reads: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        expect(init?.method).toBeUndefined();
        const url = String(input);
        reads.push(url);
        if (url.includes('/orders?')) return paginatedResponse([order], 20);
        if (url.includes('/customers?')) return paginatedResponse([customer]);
        if (url.endsWith('/products'))
          return jsonResponse({ success: true, data: [product] });
        if (url.endsWith(`/orders/${orderId}`))
          return jsonResponse({ success: true, data: order });
        if (url.endsWith('/settings'))
          return jsonResponse({
            success: true,
            data: { timeZone: 'Asia/Dhaka' },
          });
        throw new Error('Unexpected read');
      }),
    );
    render(<AdminOrderManager />);
    const trigger = await screen.findByRole('button', {
      name: `Review order ${order.orderNumber}`,
    });
    expect(reads.some((url) => url.endsWith(`/orders/${orderId}`))).toBe(false);
    trigger.focus();
    await userEvent.setup().keyboard('{Enter}');
    await within(
      screen.getByRole('region', { name: 'Order review' }),
    ).findByText(order.orderNumber);
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Close order review' }));
    expect(document.activeElement).toBe(trigger);
    expect(screen.queryByRole('region', { name: 'Order review' })).toBeNull();
    await userEvent.setup().click(trigger);
    await within(
      screen.getByRole('region', { name: 'Order review' }),
    ).findByText(order.orderNumber);
    expect(
      reads.filter((url) => url.endsWith(`/orders/${orderId}`)),
    ).toHaveLength(2);
  });

  it('clears selected context and discards a delayed read after the customer filter changes', async () => {
    let finish!: (value: Response) => void;
    const detail = new Promise<Response>((resolve) => {
      finish = resolve;
    });
    const mock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/orders?')) return paginatedResponse([order], 20);
      if (url.includes('/customers?')) return paginatedResponse([customer]);
      if (url.endsWith('/products'))
        return jsonResponse({ success: true, data: [product] });
      if (url.endsWith(`/customers/${customerId}`))
        return jsonResponse({ success: true, data: customerDetail });
      if (url.endsWith(`/orders/${orderId}`)) return detail;
      throw new Error('Unexpected read');
    });
    vi.stubGlobal('fetch', mock);
    const view = render(<AdminOrderManager />);
    await userEvent.setup().click(
      await screen.findByRole('button', {
        name: `Review order ${order.orderNumber}`,
      }),
    );
    view.rerender(
      <AdminOrderManager customerFilter={{ customerId, invalid: false }} />,
    );
    await screen.findByLabelText('Customer filter');
    await act(async () => finish(jsonResponse({ success: true, data: order })));
    expect(screen.queryByRole('region', { name: 'Order review' })).toBeNull();
    expect(
      mock.mock.calls.some(([input]) => String(input).endsWith('/settings')),
    ).toBe(false);
  });

  it.each([
    ['Reject', 'REJECTED'],
    ['Cancel', 'CANCELLED'],
  ] as const)(
    'retains the deliberate %s request and invalidates affected review',
    async (action, status) => {
      let body: unknown;
      vi.stubGlobal(
        'fetch',
        vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
          const url = String(input);
          if (url.includes('/orders?')) return paginatedResponse([order], 20);
          if (url.includes('/customers?')) return paginatedResponse([customer]);
          if (url.endsWith('/products'))
            return jsonResponse({ success: true, data: [product] });
          if (url.endsWith(`/orders/${orderId}`))
            return jsonResponse({ success: true, data: order });
          if (url.endsWith('/settings'))
            return jsonResponse({
              success: true,
              data: { timeZone: 'Asia/Dhaka' },
            });
          if (url.endsWith('/auth/csrf'))
            return jsonResponse({
              success: true,
              data: { csrfToken: 'a'.repeat(32) },
            });
          if (url.endsWith(`/orders/${orderId}/status`)) {
            expect(init?.method).toBe('PATCH');
            body = JSON.parse(String(init?.body)) as unknown;
            return jsonResponse({ success: true, data: { ...order, status } });
          }
          throw new Error('Unexpected request');
        }),
      );
      render(<AdminOrderManager />);
      await userEvent.setup().click(
        await screen.findByRole('button', {
          name: `Review order ${order.orderNumber}`,
        }),
      );
      await within(
        screen.getByRole('region', { name: 'Order review' }),
      ).findByText(order.orderNumber);
      expect(body).toBeUndefined();
      await userEvent
        .setup()
        .click(screen.getByRole('button', { name: new RegExp(`^${action}$`) }));
      await screen.findByText(new RegExp(`moved to ${status.toLowerCase()}`));
      expect(body).toEqual({ status });
      expect(screen.queryByRole('region', { name: 'Order review' })).toBeNull();
    },
  );

  it('preserves administrator creation payload and invalidates an open review after success', async () => {
    let body: Record<string, unknown> | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes('/orders?')) return paginatedResponse([order], 20);
        if (url.includes('/customers?')) return paginatedResponse([customer]);
        if (url.endsWith('/products'))
          return jsonResponse({ success: true, data: [product] });
        if (url.endsWith(`/orders/${orderId}`))
          return jsonResponse({ success: true, data: order });
        if (url.endsWith('/settings'))
          return jsonResponse({
            success: true,
            data: { timeZone: 'Asia/Dhaka' },
          });
        if (url.endsWith('/auth/csrf'))
          return jsonResponse({
            success: true,
            data: { csrfToken: 'a'.repeat(32) },
          });
        if (url.endsWith('/orders/admin')) {
          expect(init?.method).toBe('POST');
          body = JSON.parse(String(init?.body)) as Record<string, unknown>;
          return jsonResponse({
            success: true,
            data: { order, duplicate: false },
          });
        }
        throw new Error('Unexpected request');
      }),
    );
    const user = userEvent.setup();
    render(<AdminOrderManager />);
    await user.click(
      await screen.findByRole('button', {
        name: 'Create hosting/domain order',
      }),
    );
    await user.click(
      await screen.findByRole('button', {
        name: `Review order ${order.orderNumber}`,
      }),
    );
    await within(
      screen.getByRole('region', { name: 'Order review' }),
    ).findByText(order.orderNumber);
    await user.selectOptions(screen.getByLabelText('Customer'), customerId);
    await user.selectOptions(screen.getByLabelText('Price'), priceId);
    await user.type(
      screen.getByLabelText('Requested domain'),
      'new.example.test',
    );
    expect(body).toBeUndefined();
    await user.click(
      screen.getByRole('button', { name: 'Create order and invoice' }),
    );
    await screen.findAllByText(/created with unpaid invoice/);
    expect(body).toEqual({
      hostingProvisioningMode: 'STANDARD',
      customerId,
      productId,
      priceId,
      requestedDomain: 'new.example.test',
      submissionKey: expect.any(String),
    });
    expect(screen.queryByRole('region', { name: 'Order review' })).toBeNull();
  });
});

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function paginatedResponse(data: unknown[], pageSize = 100) {
  return jsonResponse({
    success: true,
    data,
    pagination: {
      page: 1,
      pageSize,
      totalItems: data.length,
      totalPages: data.length ? 1 : 0,
    },
  });
}
