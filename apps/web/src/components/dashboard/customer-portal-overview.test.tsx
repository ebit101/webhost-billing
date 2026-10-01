import type { CustomerDetail } from '@webhost-billing/shared';
import { render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CustomerPortalOverview } from './customer-portal-overview';

const customerId = '70000000-0000-4000-8000-000000000001';

const populatedCustomer: CustomerDetail = {
  id: customerId,
  customerNumber: 'CUS-70000000',
  status: 'ACTIVE',
  accountStatus: 'ACTIVE',
  email: 'customer@example.test',
  emailVerified: true,
  firstName: 'Samira',
  lastName: 'Hossain',
  companyName: 'Samira Studio',
  phone: null,
  addressLine1: '7 Test Avenue',
  addressLine2: null,
  city: 'Dhaka',
  region: null,
  postalCode: '1200',
  countryCode: 'BD',
  taxIdentifier: null,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
  linked: {
    orders: [],
    services: [
      {
        id: '71000000-0000-4000-8000-000000000001',
        status: 'ACTIVE',
        productName: 'Starter Hosting',
        domain: 'samira.example.test',
        recurringAmount: { amount: '120000', currency: 'BDT' },
        createdAt: '2026-09-02T00:00:00.000Z',
      },
    ],
    invoices: [
      {
        id: '72000000-0000-4000-8000-000000000001',
        invoiceNumber: 'INV-001042',
        status: 'UNPAID',
        total: { amount: '120000', currency: 'BDT' },
        balanceDue: { amount: '120000', currency: 'BDT' },
        dueAt: '2026-10-12T00:00:00.000Z',
        createdAt: '2026-10-01T00:00:00.000Z',
      },
    ],
    payments: [],
    tickets: [
      {
        id: '73000000-0000-4000-8000-000000000001',
        ticketNumber: 'TKT-001005',
        subject: 'DNS setup question',
        status: 'WAITING_FOR_CUSTOMER',
        priority: 'NORMAL',
        createdAt: '2026-09-29T00:00:00.000Z',
        updatedAt: '2026-10-01T00:00:00.000Z',
      },
    ],
    counts: { orders: 4, services: 12, invoices: 18, payments: 7, tickets: 3 },
  },
};

afterEach(() => vi.unstubAllGlobals());

describe('customer portal overview', () => {
  it('renders authenticated totals and bounded recent customer records', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ success: true, data: populatedCustomer }),
      );
    vi.stubGlobal('fetch', fetchMock);

    render(<CustomerPortalOverview customerId={customerId} />);

    expect(
      await screen.findByRole('heading', { name: 'Welcome, Samira' }),
    ).toBeTruthy();
    const summary = screen.getByRole('region', { name: 'Account summary' });
    expect(within(summary).getByText('12')).toBeTruthy();
    expect(within(summary).getByText('18')).toBeTruthy();
    expect(within(summary).getByText('3')).toBeTruthy();
    expect(screen.getByText('samira.example.test')).toBeTruthy();
    expect(screen.getAllByText('BDT 1,200.00')).toHaveLength(2);
    expect(screen.getByText('INV-001042')).toBeTruthy();
    expect(screen.getByText('DNS setup question')).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(`/customers/${customerId}$`),
      expect.objectContaining({ credentials: 'include', cache: 'no-store' }),
    );
  });

  it('renders explicit empty states for services, invoices, and support', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          success: true,
          data: {
            ...populatedCustomer,
            linked: {
              orders: [],
              services: [],
              invoices: [],
              payments: [],
              tickets: [],
              counts: {
                orders: 0,
                services: 0,
                invoices: 0,
                payments: 0,
                tickets: 0,
              },
            },
          },
        }),
      ),
    );

    render(<CustomerPortalOverview customerId={customerId} />);

    expect(
      await screen.findByRole('heading', { name: 'No hosting services' }),
    ).toBeTruthy();
    expect(
      screen.getByRole('heading', { name: 'No invoices yet' }),
    ).toBeTruthy();
    expect(
      screen.getByRole('heading', { name: 'No support tickets' }),
    ).toBeTruthy();
  });

  it('renders an accessible error state when owned data cannot be loaded', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(
          {
            success: false,
            error: {
              code: 'SERVICE_UNAVAILABLE',
              message: 'The account summary is temporarily unavailable.',
            },
          },
          503,
        ),
      ),
    );

    render(<CustomerPortalOverview customerId={customerId} />);

    expect(
      await screen.findByRole('heading', {
        name: 'Portal overview unavailable',
      }),
    ).toBeTruthy();
    expect(
      screen.getByText('The account summary is temporarily unavailable.'),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
  });
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
