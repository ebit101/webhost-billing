import type { Invoice, ManualPayment } from '@webhost-billing/shared';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdminPaymentManager } from './admin-payment-manager';
import { CustomerManualPayment } from './customer-manual-payment';
import { CustomerGatewayPayment } from './customer-gateway-payment';

const invoiceId = '10000000-0000-4000-8000-000000000111';
const paymentId = '10000000-0000-4000-8000-000000000112';
const customerId = '10000000-0000-4000-8000-000000000113';

const invoice: Invoice = {
  id: invoiceId,
  invoiceNumber: 'INV-20260825-CMD110000000001',
  customerId,
  orderId: null,
  orderNumber: null,
  status: 'UNPAID',
  currency: 'BDT',
  subtotal: { amount: '12000', currency: 'BDT' },
  discountTotal: { amount: '0', currency: 'BDT' },
  taxTotal: { amount: '0', currency: 'BDT' },
  total: { amount: '12000', currency: 'BDT' },
  creditTotal: { amount: '0', currency: 'BDT' },
  amountPaid: { amount: '0', currency: 'BDT' },
  balanceDue: { amount: '12000', currency: 'BDT' },
  customerName: 'Manual Payer',
  customerEmail: 'manual@example.test',
  customerAddress: {
    line1: '11 Payment Road',
    line2: null,
    city: 'Dhaka',
    region: null,
    postalCode: null,
    countryCode: 'BD',
  },
  businessIdentity: { name: 'Fictional Hosting Ltd' },
  taxIdentity: null,
  issuedAt: '2026-08-25T10:00:00.000Z',
  dueAt: '2026-09-01T10:00:00.000Z',
  paidAt: null,
  cancelledAt: null,
  createdAt: '2026-08-25T10:00:00.000Z',
  updatedAt: '2026-08-25T10:00:00.000Z',
  items: [
    {
      id: '10000000-0000-4000-8000-000000000114',
      description: 'Hosting payment test',
      quantity: 1,
      unitAmount: { amount: '12000', currency: 'BDT' },
      discountAmount: { amount: '0', currency: 'BDT' },
      taxAmount: { amount: '0', currency: 'BDT' },
      lineTotal: { amount: '12000', currency: 'BDT' },
      servicePeriodStart: null,
      servicePeriodEnd: null,
    },
  ],
};

const pendingPayment: ManualPayment = {
  id: paymentId,
  invoiceId,
  invoiceNumber: invoice.invoiceNumber,
  customerId,
  customerName: invoice.customerName,
  originalPaymentId: null,
  kind: 'CHARGE',
  state: 'PENDING',
  method: 'BANK_TRANSFER',
  reference: 'CUSTOMER-REFERENCE-UI',
  proof: { payerName: 'Manual Payer', note: 'Safe text proof' },
  amount: { amount: '12000', currency: 'BDT' },
  adjustedAmount: { amount: '0', currency: 'BDT' },
  refundableAmount: { amount: '0', currency: 'BDT' },
  submittedByRole: 'CUSTOMER',
  failureReason: null,
  receivedAt: '2026-08-25T10:00:00.000Z',
  reviewedAt: null,
  verifiedAt: null,
  createdAt: '2026-08-25T10:00:00.000Z',
  updatedAt: '2026-08-25T10:00:00.000Z',
};

describe('manual payment interfaces', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('loads the administrator ledger, review controls, and settlement policy', async () => {
    const fetchMock = vi.fn((request: RequestInfo | URL) => {
      const url = String(request);
      if (url.includes('/payment-gateways/failures')) {
        return Promise.resolve(jsonResponse({ success: true, data: [] }));
      }
      if (url.includes('/payments/settings')) {
        return Promise.resolve(
          jsonResponse({
            success: true,
            data: { partialPaymentsEnabled: false },
          }),
        );
      }
      if (url.includes('/invoices?')) {
        return Promise.resolve(paginatedResponse([invoice]));
      }
      return Promise.resolve(paginatedResponse([pendingPayment]));
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<AdminPaymentManager />);
    expect(
      await screen.findByRole('heading', { name: 'Payments' }),
    ).toBeTruthy();
    expect(screen.getByText('Gateway attention queue')).toBeTruthy();
    expect(screen.getByText('CUSTOMER-REFERENCE-UI')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Verify' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Reject' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Enable' })).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Record verified payment' }),
    ).toBeTruthy();
  });

  it('submits structured customer proof without a file field', async () => {
    const user = userEvent.setup();
    const createdPayment = { ...pendingPayment, reference: 'NEW-UI-REFERENCE' };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(paginatedResponse([]))
      .mockResolvedValueOnce(
        jsonResponse({
          success: true,
          data: {
            partialPaymentsEnabled: false,
            instructions: 'Use the fictional bank account.',
          },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ success: true, data: { csrfToken: 'x'.repeat(32) } }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          success: true,
          data: { payment: createdPayment, duplicate: false },
        }),
      );
    vi.stubGlobal('fetch', fetchMock);
    render(<CustomerManualPayment invoice={invoice} />);
    expect(
      await screen.findByRole('heading', {
        name: 'Submit a bank or mobile-payment reference',
      }),
    ).toBeTruthy();
    expect(screen.queryByLabelText(/file/i)).toBeNull();
    await user.type(
      screen.getByRole('textbox', { name: 'Transaction/reference ID' }),
      'NEW-UI-REFERENCE',
    );
    await user.type(
      screen.getByRole('textbox', { name: 'Payer name (optional)' }),
      'Manual Payer',
    );
    fireEvent.submit(
      screen
        .getByRole('button', { name: 'Submit payment reference' })
        .closest('form')!,
    );
    expect(
      await screen.findByText(
        'Payment reference submitted for administrator verification.',
      ),
    ).toBeTruthy();
    expect(screen.getByText('Use the fictional bank account.')).toBeTruthy();
    const mutation = fetchMock.mock.calls[3];
    expect(mutation?.[0]).toContain('/payments/manual/customer');
    const options = mutation?.[1] as RequestInit;
    const body = JSON.parse(String(options.body)) as Record<string, unknown>;
    expect(body).not.toHaveProperty('file');
    expect(body).toMatchObject({
      invoiceId,
      amount: '12000',
      proof: {
        method: 'BANK_TRANSFER',
        reference: 'NEW-UI-REFERENCE',
        payerName: 'Manual Payer',
      },
    });
    await waitFor(() =>
      expect(screen.getByText('NEW-UI-REFERENCE')).toBeTruthy(),
    );
  });

  it('shows enabled sandbox gateways as distinct checkout choices', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          success: true,
          data: [
            { key: 'bkash', displayName: 'bKash', mode: 'SANDBOX' },
            {
              key: 'sslcommerz',
              displayName: 'SSLCOMMERZ',
              mode: 'SANDBOX',
            },
          ],
        }),
      ),
    );
    render(<CustomerGatewayPayment invoice={invoice} />);
    expect(
      await screen.findByRole('button', { name: 'Pay with bKash' }),
    ).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Pay with SSLCOMMERZ' }),
    ).toBeTruthy();
    expect(screen.getByText(/return to this page does not/i)).toBeTruthy();
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
