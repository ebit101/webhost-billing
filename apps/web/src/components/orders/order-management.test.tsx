import type {
  CustomerSummary,
  Order,
  Product,
  PublicProduct,
} from '@webhost-billing/shared';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdminOrderManager } from './admin-order-manager';
import { CustomerCheckout } from './customer-checkout';

const customerId = '90000000-0000-4000-8000-000000000001';
const productId = '90000000-0000-4000-8000-000000000002';
const priceId = '90000000-0000-4000-8000-000000000003';
const orderId = '90000000-0000-4000-8000-000000000004';

const product: Product = {
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

afterEach(() => vi.unstubAllGlobals());

describe('order interfaces', () => {
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

  it('loads administrator order creation and state controls', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/orders?')) return paginatedResponse([order]);
        if (url.includes('/customers?')) return paginatedResponse([customer]);
        if (url.endsWith('/products')) {
          return jsonResponse({ success: true, data: [product] });
        }
        throw new Error(`Unexpected request: ${url}`);
      }),
    );
    render(<AdminOrderManager />);
    expect(
      await screen.findByRole('button', {
        name: 'Create order and invoice',
      }),
    ).toBeTruthy();
    expect(screen.getByText(order.orderNumber)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Reject' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeTruthy();
  });
});

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function paginatedResponse(data: unknown[]) {
  return jsonResponse({
    success: true,
    data,
    pagination: {
      page: 1,
      pageSize: 100,
      totalItems: data.length,
      totalPages: data.length ? 1 : 0,
    },
  });
}
