import { render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { readAdminInvoiceQuery } from '../../lib/admin-invoice-ledger-query';
import { AdminReports } from './admin-reports';

afterEach(() => vi.unstubAllGlobals());

it('shows current invoice aging and carries the report scope to the invoice ledger', async () => {
  const fetchMock = vi.fn().mockResolvedValue(
    Response.json({
      success: true,
      data: {
        asOf: '2026-11-04',
        currency: 'BDT',
        buckets: [
          { id: '1-30', count: 2, balance: '120050' },
          { id: '31-60', count: 0, balance: '0' },
          { id: '61-90', count: 0, balance: '0' },
          { id: '91-plus', count: 1, balance: '30000' },
        ],
      },
    }),
  );
  vi.stubGlobal('fetch', fetchMock);
  render(<AdminReports tab="billing" />);

  const tabs = within(
    screen.getByRole('navigation', { name: 'Report sections' }),
  );
  expect(
    tabs.getByRole('link', { name: 'Billing', current: 'page' }),
  ).toBeTruthy();
  expect(tabs.getByRole('link', { name: 'Exports' }).getAttribute('href')).toBe(
    '/admin/reports?tab=exports',
  );
  expect(
    await screen.findByText(/As of 04\/11\/2026 · BDT 1,500.50 overdue/),
  ).toBeTruthy();
  const firstBucket = screen.getByRole('link', {
    name: 'View invoices overdue by 1–30 days',
  });
  const url = new URL(
    firstBucket.getAttribute('href') ?? '',
    'http://localhost',
  );
  expect(url.pathname).toBe('/admin/invoices');
  expect(readAdminInvoiceQuery(url.searchParams)).toMatchObject({
    invalid: false,
    query: {
      status: 'OVERDUE',
      agingBucket: '1-30',
      agingAsOf: '2026-11-04',
      agingCurrency: 'BDT',
    },
  });
  url.searchParams.delete('agingCurrency');
  expect(readAdminInvoiceQuery(url.searchParams).invalid).toBe(true);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock).toHaveBeenCalledWith(
    expect.stringContaining('/reports/invoice-aging'),
    expect.objectContaining({ credentials: 'include' }),
  );
});
