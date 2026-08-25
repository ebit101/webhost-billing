import type {
  HostingPanelOperation,
  Service,
  ServiceSetupOptions,
} from '@webhost-billing/shared';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdminServiceManager } from './admin-service-manager';
import { AdminHostingOperationManager } from './admin-hosting-operation-manager';
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

const activeService: Service = {
  ...service,
  status: 'ACTIVE',
  externalAccountId: 'fake-whm-account-one',
  controlPanelUsername: 'customer1',
  activatedAt: '2026-08-25T10:05:00.000Z',
};

const operation: HostingPanelOperation = {
  id: '30000000-0000-4000-8000-000000000010',
  serviceId,
  server: service.server,
  requestedByUserId: '30000000-0000-4000-8000-000000000011',
  retryOfOperationId: null,
  type: 'CREATE_ACCOUNT',
  status: 'SUCCEEDED',
  adapterKey: 'fake-panel',
  attemptNumber: 1,
  retryable: false,
  errorKind: null,
  errorCode: null,
  errorMessage: null,
  account: {
    externalAccountId: 'fake-whm-account-one',
    username: 'customer1',
    domain: 'customer-site.example.test',
    packageIdentifier: 'starter_package',
    state: 'ACTIVE',
  },
  startedAt: '2026-08-25T10:04:00.000Z',
  completedAt: '2026-08-25T10:05:00.000Z',
  createdAt: '2026-08-25T10:04:00.000Z',
};

describe('service management interfaces', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows paid-order fulfilment and provisions through the panel adapter', async () => {
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
        if (init?.method === 'POST') {
          return Promise.resolve(
            success({ operation, duplicate: false, loginUrl: null }),
          );
        }
        if (url.includes(`/services/${serviceId}`)) {
          return Promise.resolve(success(activeService));
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
    await user.click(screen.getByRole('button', { name: 'Provision account' }));
    expect(
      await screen.findByText(
        'create account completed for customer-site.example.test.',
      ),
    ).toBeTruthy();
    const mutation = fetchMock.mock.calls.find(
      ([, init]) => (init as RequestInit | undefined)?.method === 'POST',
    );
    expect(String(mutation?.[0])).toContain(
      `/hosting-panel/services/${serviceId}/operations`,
    );
    expect(JSON.parse(String((mutation?.[1] as RequestInit).body)).type).toBe(
      'CREATE_ACCOUNT',
    );
  });

  it('shows connection, account tools, and durable operation history', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((request: RequestInfo | URL) => {
        const url = String(request);
        if (url.includes('/hosting-panel/operations')) {
          return Promise.resolve(paginated([operation]));
        }
        if (url.includes('/services/setup-options')) {
          return Promise.resolve(success(options));
        }
        return Promise.resolve(paginated([activeService]));
      }),
    );
    render(<AdminHostingOperationManager />);
    expect(
      await screen.findByRole('heading', { name: 'Hosting-panel connections' }),
    ).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Account tools' })).toBeTruthy();
    expect(screen.getByText('CREATE ACCOUNT')).toBeTruthy();
    expect(
      screen.getByRole('button', { name: /Test Development Server/i }),
    ).toBeTruthy();
  });

  it('submits a cPanel API token once and clears it after encrypted storage', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(
      (request: RequestInfo | URL, init?: RequestInit) => {
        const url = String(request);
        if (url.includes('/auth/csrf')) {
          return Promise.resolve(success({ csrfToken: 'x'.repeat(32) }));
        }
        if (init?.method === 'POST') {
          return Promise.resolve(
            success({
              server: { ...service.server, adapterKey: 'cpanel-whm' },
              port: 2087,
              useTls: true,
              apiUsername: 'reseller',
              credentialConfigured: true,
              credentialKeyVersion: 'cpanel-token-v1',
            }),
          );
        }
        if (url.includes('/hosting-panel/operations')) {
          return Promise.resolve(paginated([operation]));
        }
        if (url.includes('/services/setup-options')) {
          return Promise.resolve(success(options));
        }
        return Promise.resolve(paginated([activeService]));
      },
    );
    vi.stubGlobal('fetch', fetchMock);
    render(<AdminHostingOperationManager />);
    await user.type(
      await screen.findByRole('textbox', { name: 'WHM username' }),
      'reseller',
    );
    const tokenInput = screen.getByLabelText('New API token');
    await user.type(tokenInput, 'FictionalTokenValue1234567890');
    await user.click(
      screen.getByRole('button', { name: 'Encrypt and save cPanel' }),
    );

    expect(
      await screen.findByText(/configuration encrypted and saved/i),
    ).toBeTruthy();
    expect((tokenInput as HTMLInputElement).value).toBe('');
    const mutation = fetchMock.mock.calls.find(
      ([request, init]) =>
        String(request).includes('/cpanel-configuration') &&
        (init as RequestInit | undefined)?.method === 'POST',
    );
    expect(JSON.parse(String((mutation?.[1] as RequestInit).body))).toEqual({
      hostname: 'server.example.test',
      port: 2087,
      apiUsername: 'reseller',
      apiToken: 'FictionalTokenValue1234567890',
      confirmation: 'CONFIGURE_CPANEL',
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

  it('generates a customer-owned temporary panel login link', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn((request: RequestInfo | URL, init?: RequestInit) => {
        const url = String(request);
        if (url.includes('/auth/csrf')) {
          return Promise.resolve(success({ csrfToken: 'x'.repeat(32) }));
        }
        if (init?.method === 'POST') {
          return Promise.resolve(
            success({
              operation: { ...operation, type: 'GENERATE_LOGIN_URL' },
              duplicate: false,
              loginUrl: 'https://server.example.test/fake-login/session',
            }),
          );
        }
        return Promise.resolve(success(activeService));
      }),
    );
    render(<CustomerServiceDetail serviceId={serviceId} />);
    await user.click(
      await screen.findByRole('button', {
        name: 'Generate secure panel login',
      }),
    );
    expect(
      (
        await screen.findByRole('link', { name: /Open control panel/i })
      ).getAttribute('href'),
    ).toBe('https://server.example.test/fake-login/session');
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
