import type { Service, ServiceSetupOptions } from '@webhost-billing/shared';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdminServiceManager } from './admin-service-manager';
import { CustomerServiceDetail } from './customer-service-detail';
import { CustomerServiceList } from './customer-service-list';

const serviceId = '30000000-0000-4000-8000-000000000001';
const orderItemId = '30000000-0000-4000-8000-000000000002';
const serverId = '30000000-0000-4000-8000-000000000003';

const service: Service = {
  id: serviceId,
  customerId: '30000000-0000-4000-8000-000000000004',
  customerName: 'Service Customer',
  customerEmail: 'service-customer@example.test',
  orderId: '30000000-0000-4000-8000-000000000005',
  orderNumber: 'CMD14-ORDER',
  orderItemId,
  productId: '30000000-0000-4000-8000-000000000006',
  productPriceId: '30000000-0000-4000-8000-000000000007',
  productName: 'Starter Hosting',
  productDescription: 'Fictional hosting service.',
  server: {
    id: serverId,
    name: 'Development Server',
    hostname: 'server.example.test',
    status: 'ACTIVE',
    adapterKey: 'fake-panel',
  },
  status: 'PENDING',
  domain: 'customer-site.example.test',
  controlPanelUsername: null,
  externalAccountId: null,
  billingPeriod: 'MONTHLY',
  recurringAmount: { amount: '12000', currency: 'BDT' },
  startedAt: '2026-08-25T10:00:00.000Z',
  nextDueAt: '2026-09-25T10:00:00.000Z',
  activatedAt: null,
  suspendedAt: null,
  suspensionReason: null,
  provisioningFailureReason: null,
  cancelledAt: null,
  cancellationReason: null,
  terminatedAt: null,
  terminationReason: null,
  createdAt: '2026-08-25T10:00:00.000Z',
  updatedAt: '2026-08-25T10:00:00.000Z',
};

const options: ServiceSetupOptions = {
  servers: [service.server],
  orderItems: [
    {
      orderItemId: '30000000-0000-4000-8000-000000000008',
      orderId: '30000000-0000-4000-8000-000000000009',
      orderNumber: 'CMD14-ELIGIBLE',
      customerId: service.customerId,
      customerName: service.customerName,
      productName: service.productName,
      domain: 'new-service.example.test',
      billingPeriod: 'MONTHLY',
      recurringAmount: service.recurringAmount,
    },
  ],
};

describe('service management interfaces', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows paid-order fulfilment and advances a pending service manually', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(
      (request: RequestInfo | URL, init?: RequestInit) => {
        const url = String(request);
        if (url.includes('/services/setup-options')) {
          return Promise.resolve(success(options));
        }
        if (url.includes('/auth/csrf')) {
          return Promise.resolve(success({ csrfToken: 'x'.repeat(32) }));
        }
        if (init?.method === 'PATCH') {
          return Promise.resolve(
            success({ ...service, status: 'PROVISIONING' }),
          );
        }
        return Promise.resolve(paginated([service]));
      },
    );
    vi.stubGlobal('fetch', fetchMock);
    render(<AdminServiceManager />);
    expect(
      await screen.findByRole('heading', { name: 'Hosting services' }),
    ).toBeTruthy();
    expect(screen.getByText('Create service from paid order')).toBeTruthy();
    await user.click(
      screen.getByRole('button', { name: 'Begin provisioning' }),
    );
    expect(
      await screen.findByText(
        'customer-site.example.test moved to provisioning.',
      ),
    ).toBeTruthy();
    const mutation = fetchMock.mock.calls.find(
      ([, init]) => (init as RequestInit | undefined)?.method === 'PATCH',
    );
    expect(String(mutation?.[0])).toContain(`/services/${serviceId}/status`);
    expect(JSON.parse(String((mutation?.[1] as RequestInit).body))).toEqual({
      status: 'PROVISIONING',
    });
  });

  it('lists only the customer service cards with renewal and account data', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(paginated([service])));
    render(<CustomerServiceList />);
    expect(
      await screen.findByRole('heading', { name: 'My services' }),
    ).toBeTruthy();
    expect(screen.getByText('customer-site.example.test')).toBeTruthy();
    expect(screen.getByText('Pending setup')).toBeTruthy();
    expect(
      screen
        .getByRole('link', { name: /customer-site\.example\.test/i })
        .getAttribute('href'),
    ).toBe(`/portal/services/${serviceId}`);
  });

  it('renders a protected customer service detail view', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(success(service)));
    render(<CustomerServiceDetail serviceId={serviceId} />);
    expect(
      await screen.findByRole('heading', {
        name: 'customer-site.example.test',
      }),
    ).toBeTruthy();
    expect(screen.getByText('server.example.test')).toBeTruthy();
    expect(screen.getByText('Order CMD14-ORDER')).toBeTruthy();
  });
});

function success(data: unknown) {
  return new Response(JSON.stringify({ success: true, data }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function paginated(data: unknown[]) {
  return new Response(
    JSON.stringify({
      success: true,
      data,
      pagination: {
        page: 1,
        pageSize: 100,
        totalItems: data.length,
        totalPages: data.length ? 1 : 0,
      },
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}
