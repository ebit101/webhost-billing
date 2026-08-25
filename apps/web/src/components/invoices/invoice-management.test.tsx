import type {
  BusinessIdentity,
  CustomerSummary,
  Invoice,
} from '@webhost-billing/shared';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdminInvoiceManager } from './admin-invoice-manager';
import { CustomerInvoiceList } from './customer-invoice-list';
import { InvoiceDetail } from './invoice-detail';

const customerId = 'a0000000-0000-4000-8000-000000000001';
const invoiceId = 'a0000000-0000-4000-8000-000000000002';

const identity: BusinessIdentity = {
  name: 'Fictional Hosting Ltd',
  addressLine1: '100 Example Avenue',
  city: 'Dhaka',
  countryCode: 'BD',
  email: 'billing@example.test',
  taxIdentifier: 'BUSINESS-TAX-10',
};

const customer: CustomerSummary = {
  id: customerId,
  customerNumber: 'CUST-0010',
  status: 'ACTIVE',
  accountStatus: 'ACTIVE',
  email: 'customer@example.test',
  emailVerified: true,
  firstName: 'Invoice',
  lastName: 'Customer',
  companyName: 'Customer Ltd',
  createdAt: '2026-08-25T08:00:00.000Z',
  linkedCounts: { orders: 1, services: 0, invoices: 1, tickets: 0 },
};

const invoice: Invoice = {
  id: invoiceId,
  invoiceNumber: 'INV-20260825-00010203040506FF',
  customerId,
  orderId: null,
  orderNumber: null,
  status: 'UNPAID',
  currency: 'BDT',
  subtotal: { amount: '25000', currency: 'BDT' },
  discountTotal: { amount: '1000', currency: 'BDT' },
  taxTotal: { amount: '3600', currency: 'BDT' },
  total: { amount: '27600', currency: 'BDT' },
  creditTotal: { amount: '2000', currency: 'BDT' },
  amountPaid: { amount: '0', currency: 'BDT' },
  balanceDue: { amount: '25600', currency: 'BDT' },
  customerName: 'Customer Ltd',
  customerEmail: customer.email,
  customerAddress: {
    line1: '10 Billing Road',
    line2: null,
    city: 'Dhaka',
    region: null,
    postalCode: null,
    countryCode: 'BD',
  },
  businessIdentity: identity,
  taxIdentity: { taxIdentifier: 'CUSTOMER-TAX-10' },
  issuedAt: '2026-08-25T08:00:00.000Z',
  dueAt: '2026-09-01T08:00:00.000Z',
  paidAt: null,
  cancelledAt: null,
  createdAt: '2026-08-25T07:00:00.000Z',
  updatedAt: '2026-08-25T08:00:00.000Z',
  items: [
    {
      id: 'a0000000-0000-4000-8000-000000000003',
      description: 'Managed hosting — September 2026',
      quantity: 2,
      unitAmount: { amount: '10000', currency: 'BDT' },
      discountAmount: { amount: '1000', currency: 'BDT' },
      taxAmount: { amount: '2850', currency: 'BDT' },
      lineTotal: { amount: '21850', currency: 'BDT' },
      servicePeriodStart: '2026-09-01T00:00:00.000Z',
      servicePeriodEnd: '2026-10-01T00:00:00.000Z',
    },
    {
      id: 'a0000000-0000-4000-8000-000000000004',
      description: 'Migration assistance',
      quantity: 1,
      unitAmount: { amount: '5000', currency: 'BDT' },
      discountAmount: { amount: '0', currency: 'BDT' },
      taxAmount: { amount: '750', currency: 'BDT' },
      lineTotal: { amount: '5750', currency: 'BDT' },
      servicePeriodStart: null,
      servicePeriodEnd: null,
    },
  ],
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('invoice interfaces', () => {
  it('lists customer invoices with status, due date, and balance links', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(paginatedResponse([invoice])),
    );
    render(<CustomerInvoiceList />);
    const link = await screen.findByRole('link', {
      name: invoice.invoiceNumber,
    });
    expect(link.getAttribute('href')).toBe(`/portal/invoices/${invoice.id}`);
    expect(screen.getByText('BDT 256.00')).toBeTruthy();
    expect(screen.getByText('UNPAID')).toBeTruthy();
  });

  it('renders historical snapshots and a working printable view', async () => {
    const user = userEvent.setup();
    const print = vi.fn();
    vi.stubGlobal('print', print);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ success: true, data: invoice })),
    );
    render(<InvoiceDetail invoiceId={invoiceId} mode="print" />);
    expect(await screen.findByText(invoice.invoiceNumber)).toBeTruthy();
    expect(screen.getByText('Fictional Hosting Ltd')).toBeTruthy();
    expect(screen.getByText('Customer Ltd')).toBeTruthy();
    expect(screen.getByText('Managed hosting — September 2026')).toBeTruthy();
    expect(screen.getByText('BDT 276.00')).toBeTruthy();
    expect(screen.getByText('BDT 256.00')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Print invoice' }));
    expect(print).toHaveBeenCalledOnce();
  });

  it('downloads the server-generated PDF from an authorized invoice detail', async () => {
    const user = userEvent.setup();
    const createObjectURL = vi.fn(() => 'blob:invoice-pdf');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal(
      'URL',
      Object.assign(URL, { createObjectURL, revokeObjectURL }),
    );
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(
      () => undefined,
    );
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith(`/invoices/${invoiceId}/pdf`)) {
        return Promise.resolve(
          new Response(new Blob(['%PDF-1.7']), {
            headers: {
              'Content-Type': 'application/pdf',
              'Content-Disposition':
                'attachment; filename="invoice-INV-001024.pdf"',
            },
          }),
        );
      }
      return Promise.resolve(jsonResponse({ success: true, data: invoice }));
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<InvoiceDetail invoiceId={invoiceId} mode="admin" />);
    await user.click(
      await screen.findByRole('button', { name: 'Download PDF' }),
    );

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(`/invoices/${invoiceId}/pdf`),
      expect.objectContaining({ credentials: 'include' }),
    );
    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:invoice-pdf');
  });

  it('loads administrator draft creation and business identity controls', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/invoices?pageSize=')) {
          return paginatedResponse([invoice]);
        }
        if (url.includes('/customers?pageSize=')) {
          return paginatedResponse([customer]);
        }
        if (url.endsWith('/invoices/settings/business-identity')) {
          return jsonResponse({ success: true, data: identity });
        }
        throw new Error(`Unexpected request: ${url}`);
      }),
    );
    render(<AdminInvoiceManager />);
    expect(
      await screen.findByRole('button', { name: 'Save draft' }),
    ).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Save business identity' }),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add line' })).toBeTruthy();
    expect(screen.getByText(invoice.invoiceNumber)).toBeTruthy();
    expect(screen.getByDisplayValue('Fictional Hosting Ltd')).toBeTruthy();
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
