import type { CustomerDetail, CustomerSummary } from '@webhost-billing/shared';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdminCustomerManager } from './admin-customer-manager';
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
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
