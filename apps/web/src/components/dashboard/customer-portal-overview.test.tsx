import type { CustomerPortalSummary } from '@webhost-billing/shared';
import { render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CustomerPortalOverview } from './customer-portal-overview';

const customerId = '70000000-0000-4000-8000-000000000001';
const invoiceId = '72000000-0000-4000-8000-000000000001';
const paidInvoiceId = '72000000-0000-4000-8000-000000000002';
const serviceId = '71000000-0000-4000-8000-000000000001';

const baseSummary: CustomerPortalSummary = {
  customer: {
    id: customerId,
    customerNumber: 'CUS-70000000',
    status: 'ACTIVE',
    firstName: 'Samira',
  },
  counts: { services: 1, invoices: 12, tickets: 3 },
  billing: {
    outstandingBalance: { amount: '9007199254740993', currency: 'BDT' },
    outstandingInvoiceCount: 11,
    overdueInvoiceCount: 2,
    nextInvoice: {
      id: invoiceId,
      invoiceNumber: 'INV-OVERDUE',
      status: 'OVERDUE',
      balanceDue: { amount: '120000', currency: 'BDT' },
      dueAt: '2026-09-12T00:00:00.000Z',
    },
  },
  service: {
    nextDue: {
      id: serviceId,
      status: 'SUSPENDED',
      productName: 'Starter Hosting',
      domain: 'samira.example.test',
      recurringAmount: { amount: '120000', currency: 'BDT' },
      nextDueAt: '2026-10-12T00:00:00.000Z',
    },
  },
  support: {
    waitingForCustomerCount: 1,
    waitingForStaffCount: 1,
    nextWaitingForCustomer: {
      id: '73000000-0000-4000-8000-000000000001',
      ticketNumber: 'TKT-001005',
      subject: 'DNS setup question',
      status: 'WAITING_FOR_CUSTOMER',
      priority: 'NORMAL',
      updatedAt: '2026-10-01T00:00:00.000Z',
    },
    nextWaitingForStaff: {
      id: '73000000-0000-4000-8000-000000000002',
      ticketNumber: 'TKT-001006',
      subject: 'Migration review',
      status: 'WAITING_FOR_STAFF',
      priority: 'NORMAL',
      updatedAt: '2026-10-01T00:00:00.000Z',
    },
  },
  recent: {
    services: [],
    invoices: [
      {
        id: paidInvoiceId,
        invoiceNumber: 'INV-PAID-NEWEST',
        status: 'PAID',
        balanceDue: { amount: '0', currency: 'BDT' },
        dueAt: '2026-10-20T00:00:00.000Z',
      },
    ],
    tickets: [],
  },
};

afterEach(() => vi.unstubAllGlobals());

describe('customer portal overview', () => {
  it('prioritizes server-derived billing, suspended service, and customer-reply actions', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ success: true, data: baseSummary }));
    vi.stubGlobal('fetch', fetchMock);

    render(<CustomerPortalOverview customerId={customerId} />);

    expect(await screen.findByText('Overdue payment')).toBeTruthy();
    expect(screen.getByText('BDT 90,071,992,547,409.93')).toBeTruthy();
    expect(screen.getByText('Service needs attention')).toBeTruthy();
    expect(screen.getByText('Your reply is needed')).toBeTruthy();
    expect(
      screen.getByRole('link', { name: /Review invoice/ }).getAttribute('href'),
    ).toBe(`/portal/invoices/${invoiceId}`);
    expect(
      screen.getByRole('link', { name: /Review service/ }).getAttribute('href'),
    ).toBe(`/portal/services/${serviceId}`);
    expect(screen.getAllByRole('link', { name: /Open support/ })).toHaveLength(
      2,
    );
    expect(screen.getByText('INV-PAID-NEWEST')).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(`/customers/${customerId}/portal-summary$`),
      expect.objectContaining({ credentials: 'include', cache: 'no-store' }),
    );
  });

  it('keeps paid zero-balance history secondary on a healthy account', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          success: true,
          data: {
            ...baseSummary,
            billing: {
              outstandingBalance: { amount: '0', currency: 'BDT' },
              outstandingInvoiceCount: 0,
              overdueInvoiceCount: 0,
              nextInvoice: null,
            },
            service: {
              nextDue: { ...baseSummary.service.nextDue!, status: 'ACTIVE' },
            },
            support: {
              waitingForCustomerCount: 0,
              waitingForStaffCount: 1,
              nextWaitingForCustomer: null,
              nextWaitingForStaff: baseSummary.support.nextWaitingForStaff,
            },
          } satisfies CustomerPortalSummary,
        }),
      ),
    );

    render(<CustomerPortalOverview customerId={customerId} />);

    expect(await screen.findByText("You're all caught up")).toBeTruthy();
    expect(screen.queryByText('Payment due')).toBeNull();
    expect(screen.queryByText('Overdue payment')).toBeNull();
    expect(screen.getByText('Next service renewal')).toBeTruthy();
    expect(screen.getByText('Support is reviewing')).toBeTruthy();
    expect(screen.getByText('INV-PAID-NEWEST')).toBeTruthy();
  });

  it('renders an explicit first-use empty state', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          success: true,
          data: {
            ...baseSummary,
            counts: { services: 0, invoices: 0, tickets: 0 },
            billing: {
              outstandingBalance: { amount: '0', currency: 'BDT' },
              outstandingInvoiceCount: 0,
              overdueInvoiceCount: 0,
              nextInvoice: null,
            },
            service: { nextDue: null },
            support: {
              waitingForCustomerCount: 0,
              waitingForStaffCount: 0,
              nextWaitingForCustomer: null,
              nextWaitingForStaff: null,
            },
            recent: { services: [], invoices: [], tickets: [] },
          } satisfies CustomerPortalSummary,
        }),
      ),
    );

    render(<CustomerPortalOverview customerId={customerId} />);

    expect(await screen.findByText('Your account is ready')).toBeTruthy();
    expect(screen.getByText('No recent activity')).toBeTruthy();
    expect(
      screen
        .getByRole('link', { name: 'Browse hosting plans' })
        .getAttribute('href'),
    ).toBe('/hosting');
    const accountSummary = screen.getByRole('region', {
      name: 'Account summary',
    });
    expect(within(accountSummary).getAllByText('0')).toHaveLength(3);
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
