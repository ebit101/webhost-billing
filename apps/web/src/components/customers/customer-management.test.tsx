import {
  DEFAULT_BUSINESS_SETTINGS,
  type CustomerDetail,
  type CustomerSummary,
} from '@webhost-billing/shared';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdminCustomerManager } from './admin-customer-manager';
import { AdminCustomerDetail } from './admin-customer-detail';
import { CustomerProfile } from './customer-profile';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
}));

const summary: CustomerSummary = {
  id: '70000000-0000-4000-8000-000000000001',
  customerNumber: 'CUS-70000000',
  status: 'ACTIVE',
  accountStatus: 'ACTIVE',
  email: 'customer@example.test',
  emailVerified: true,
  firstName: 'Amina',
  lastName: 'Rahman',
  companyName: 'Amina Studio',
  createdAt: '2026-08-24T12:00:00.000Z',
  linkedCounts: { orders: 1, services: 2, invoices: 3, tickets: 0 },
};

const detail: CustomerDetail = {
  ...summary,
  phone: '+8801700000000',
  addressLine1: '7 Test Avenue',
  addressLine2: null,
  city: 'Dhaka',
  region: null,
  postalCode: '1200',
  countryCode: 'BD',
  taxIdentifier: null,
  updatedAt: '2026-08-24T12:00:00.000Z',
  linked: {
    orders: [],
    services: [],
    invoices: [],
    payments: [],
    tickets: [],
    counts: { orders: 1, services: 2, invoices: 3, payments: 1, tickets: 0 },
  },
};

const populatedDetail: CustomerDetail = {
  ...detail,
  createdAt: '2026-01-01T20:30:00.000Z',
  updatedAt: '2026-01-01T20:30:00.000Z',
  linked: {
    counts: { orders: 1, services: 1, invoices: 1, payments: 1, tickets: 1 },
    orders: [
      {
        id: '71000000-0000-4000-8000-000000000001',
        status: 'PAID',
        total: { amount: '120000', currency: 'BDT' },
        createdAt: '2026-01-01T20:30:00.000Z',
      },
    ],
    services: [
      {
        id: '71000000-0000-4000-8000-000000000002',
        status: 'ACTIVE',
        productName: 'Starter Hosting',
        domain: 'customer.example.test',
        recurringAmount: { amount: '120000', currency: 'BDT' },
        createdAt: '2026-01-01T20:30:00.000Z',
      },
    ],
    invoices: [
      {
        id: '71000000-0000-4000-8000-000000000003',
        invoiceNumber: 'INV-001003',
        status: 'UNPAID',
        total: { amount: '120000', currency: 'BDT' },
        balanceDue: { amount: '120000', currency: 'BDT' },
        dueAt: '2026-01-01T20:30:00.000Z',
        createdAt: '2026-01-01T20:30:00.000Z',
      },
    ],
    payments: [
      {
        id: '71000000-0000-4000-8000-000000000004',
        invoiceId: '71000000-0000-4000-8000-000000000003',
        invoiceNumber: 'INV-001003',
        kind: 'CHARGE',
        status: 'SUCCEEDED',
        provider: 'manual',
        amount: { amount: '120000', currency: 'BDT' },
        createdAt: '2026-01-01T20:30:00.000Z',
      },
    ],
    tickets: [
      {
        id: '71000000-0000-4000-8000-000000000005',
        ticketNumber: 'TKT-001005',
        subject: 'Account question',
        status: 'OPEN',
        priority: 'NORMAL',
        createdAt: '2026-01-01T20:30:00.000Z',
        updatedAt: '2026-01-01T20:30:00.000Z',
      },
    ],
  },
};

afterEach(() => vi.unstubAllGlobals());

describe('customer management interfaces', () => {
  it('renders administrator search results with status and detail navigation', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          success: true,
          data: [summary],
          pagination: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 },
        }),
      ),
    );
    render(<AdminCustomerManager />);
    expect(
      (await screen.findByRole('link', { name: 'Amina Rahman' })).getAttribute(
        'href',
      ),
    ).toBe(`/admin/customers/${summary.id}`);
    expect(
      screen.getByText('customer@example.test · CUS-70000000'),
    ).toBeTruthy();
    expect(screen.getByText('Verified')).toBeTruthy();
  });

  it('loads the signed-in customer profile and exposes permitted profile fields', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          success: true,
          data: {
            userId: '70000000-0000-4000-8000-000000000002',
            email: summary.email,
            role: 'CUSTOMER',
            customerId: summary.id,
          },
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ success: true, data: detail }));
    vi.stubGlobal('fetch', fetchMock);
    render(<CustomerProfile />);
    expect(
      await screen.findByRole('heading', { name: 'Profile & security' }),
    ).toBeTruthy();
    expect(
      (screen.getByLabelText('First name') as HTMLInputElement).value,
    ).toBe('Amina');
    expect(
      (screen.getByLabelText('Country code') as HTMLInputElement).value,
    ).toBe('BD');
    expect(
      screen.getByRole('button', { name: 'Change password' }),
    ).toBeTruthy();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });

  it('puts safe operational context before edit forms and links to protected workspaces', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith(`/customers/${summary.id}`)) {
          return jsonResponse({ success: true, data: populatedDetail });
        }
        if (url.endsWith('/settings')) {
          return jsonResponse({
            success: true,
            data: {
              ...DEFAULT_BUSINESS_SETTINGS,
              timeZone: 'Asia/Dhaka',
              credentialStatuses: [],
            },
          });
        }
        throw new Error(`Unexpected request: ${url}`);
      }),
    );

    render(<AdminCustomerDetail customerId={summary.id} />);

    const operational = await screen.findByRole('heading', {
      name: 'Operational context',
    });
    const administration = screen.getByRole('heading', {
      name: 'Customer administration',
    });
    expect(
      operational.compareDocumentPosition(administration) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.getAllByText(/BDT 1,200\.00/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/minor units/i)).toBeNull();
    const businessDate = new Intl.DateTimeFormat('en-BD', {
      dateStyle: 'medium',
      timeZone: 'Asia/Dhaka',
    }).format(new Date('2026-01-01T20:30:00.000Z'));
    expect(
      screen.getAllByText(new RegExp(businessDate)).length,
    ).toBeGreaterThan(0);
    expect(
      screen
        .getByRole('link', { name: 'INV-001003 · Unpaid' })
        .getAttribute('href'),
    ).toBe('/admin/invoices/71000000-0000-4000-8000-000000000003');
    expect(
      screen.getByRole('link', { name: 'Paid' }).getAttribute('href'),
    ).toBe(`/admin/orders?customerId=${summary.id}`);
    expect(
      screen.getByRole('link', { name: /Orders\s+1/ }).getAttribute('href'),
    ).toBe(`/admin/orders?customerId=${summary.id}`);
  });

  it('shows bounded empty records and a recoverable load failure', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('Customer context unavailable'))
      .mockRejectedValueOnce(new Error('Customer context unavailable'))
      .mockResolvedValueOnce(jsonResponse({ success: true, data: detail }))
      .mockResolvedValueOnce(
        jsonResponse({
          success: true,
          data: {
            ...DEFAULT_BUSINESS_SETTINGS,
            credentialStatuses: [],
          },
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    render(<AdminCustomerDetail customerId={summary.id} />);
    expect(
      await screen.findByText('Customer context unavailable'),
    ).toBeTruthy();
    screen.getByRole('button', { name: 'Try again' }).click();
    expect(await screen.findByText('No orders')).toBeTruthy();
    expect(screen.getByText('No services')).toBeTruthy();
    expect(screen.getByText('No invoices')).toBeTruthy();
    expect(screen.getByText('No payments')).toBeTruthy();
    expect(screen.getByText('No tickets')).toBeTruthy();
  });
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
