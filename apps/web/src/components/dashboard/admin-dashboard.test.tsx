import type { DashboardResponse } from '@webhost-billing/shared';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdminDashboard } from './admin-dashboard';

const dashboard: DashboardResponse = {
  generatedAt: '2026-08-25T12:00:00.000Z',
  timeZone: 'Asia/Dhaka',
  currency: 'BDT',
  period: { from: '2026-08-01', to: '2026-08-25' },
  metrics: {
    collectedRevenue: { amount: '84200', currency: 'BDT' },
    outstandingBalance: { amount: '12600', currency: 'BDT' },
    overdueBalance: { amount: '5000', currency: 'BDT' },
    activeServices: 128,
    suspendedServices: 2,
    pendingOrders: 4,
    openTickets: 3,
    failedAutomationJobs: 1,
  },
  revenueSeries: [
    { date: '2026-08-24', amount: '2400' },
    { date: '2026-08-25', amount: '1200' },
  ],
  recentActivity: [
    {
      id: '10000000-0000-4000-8000-000000000001',
      action: 'PAYMENT_VERIFIED_BY_ADMIN',
      label: 'Payment Verified By Admin',
      entityType: 'PAYMENT',
      entityId: '10000000-0000-4000-8000-000000000002',
      actor: 'Development Admin',
      createdAt: '2026-08-25T11:30:00.000Z',
    },
  ],
};

describe('administrator dashboard', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('loads live metrics, applies the period, and downloads an audited report route', async () => {
    const user = userEvent.setup();
    const createObjectURL = vi.fn(() => 'blob:csv');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal(
      'URL',
      Object.assign(URL, { createObjectURL, revokeObjectURL }),
    );
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(
      () => undefined,
    );
    const fetchMock = vi.fn(
      (request: RequestInfo | URL, init?: RequestInit) => {
        const url = String(request);
        if (url.includes('/auth/csrf'))
          return Promise.resolve(success({ csrfToken: 'x'.repeat(32) }));
        if (url.includes('/reports/exports/customers')) {
          return Promise.resolve(
            new Response('Customer number\r\n', {
              headers: {
                'Content-Type': 'text/csv',
                'Content-Disposition': 'attachment; filename="customers.csv"',
              },
            }),
          );
        }
        return Promise.resolve(success(dashboard));
      },
    );
    vi.stubGlobal('fetch', fetchMock);

    render(<AdminDashboard />);
    expect(await screen.findByText('BDT 842.00')).toBeTruthy();
    expect(screen.getByText('128')).toBeTruthy();
    expect(screen.getByText('Payment Verified By Admin')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Apply period' }));
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(([url]) =>
          String(url).includes('/dashboard?from=2026-08-01&to=2026-08-25'),
        ),
      ).toBe(true),
    );

    await user.click(screen.getByRole('button', { name: /Customers CSV/ }));
    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([url]) =>
        String(url).includes('/reports/exports/customers'),
      );
      expect(call?.[1]?.method).toBe('POST');
      expect(call?.[1]?.body).toContain('2026-08-01');
      expect(createObjectURL).toHaveBeenCalled();
    });
  });
});

function success(data: unknown) {
  return new Response(JSON.stringify({ success: true, data }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
