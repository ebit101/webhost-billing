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
    window.sessionStorage.clear();
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
      await screen.findByRole('heading', { name: 'Transactions' }),
    ).toBeTruthy();
    expect(screen.getByText('Gateway attention queue')).toBeTruthy();
    expect(screen.getByText('CUSTOMER-REFERENCE-UI')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Verify' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Reject' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Enable' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Disable' })).toBeNull();
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Settlement policy' }));
    expect(
      screen
        .getByRole('link', { name: 'Review billing policy in settings' })
        .getAttribute('href'),
    ).toBe('/admin/settings#billing-policy');
    expect(screen.getByText('Disabled', { exact: true })).toBeTruthy();
    expect(
      fetchMock.mock.calls.every(
        ([url]) => !String(url).includes('/auth/csrf'),
      ),
    ).toBe(true);
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Record payment' }));
    expect(
      screen.getByRole('button', { name: 'Record verified payment' }),
    ).toBeTruthy();
  });

  it('prefills a decimal customer amount and submits proof in exact minor units', async () => {
    const user = userEvent.setup();
    const createdPayment = { ...pendingPayment, reference: 'NEW-UI-REFERENCE' };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(paginatedResponse([]))
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
    const amount = screen.getByRole('textbox', { name: 'Amount (BDT)' });
    expect(amount).toHaveProperty('value', '120.00');
    await user.clear(amount);
    await user.type(amount, '119.95');
    await user.type(
      screen.getByRole('textbox', { name: 'Transaction/reference ID' }),
      'NEW-UI-REFERENCE',
    );
    await user.type(
      screen.getByRole('textbox', { name: 'Payer name (optional)' }),
      'Manual Payer',
    );
    await user.click(
      screen.getByRole('button', { name: 'Submit payment reference' }),
    );
    expect(
      await screen.findByText(
        'Payment reference submitted for administrator verification.',
      ),
    ).toBeTruthy();
    expect(
      screen.queryByRole('heading', { name: 'Payment instructions' }),
    ).toBeNull();
    const mutation = fetchMock.mock.calls[2];
    expect(mutation?.[0]).toContain('/payments/manual/customer');
    const options = mutation?.[1] as RequestInit;
    const body = JSON.parse(String(options.body)) as Record<string, unknown>;
    expect(body).not.toHaveProperty('file');
    expect(body).toMatchObject({
      invoiceId,
      amount: '11995',
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

  it('shows normal invoice balances and prefills the selected invoice amount', async () => {
    const user = userEvent.setup();
    const otherInvoice = {
      ...invoice,
      id: '10000000-0000-4000-8000-000000000115',
      invoiceNumber: 'INV-FICTIONAL-2',
      balanceDue: { amount: '309000', currency: 'BDT' },
    };
    const fetch = paymentWorkspace([invoice, otherInvoice]);
    render(<AdminPaymentManager />);
    await user.click(
      await screen.findByRole('button', { name: 'Record payment' }),
    );
    expect(
      screen.getByRole('option', {
        name: `${invoice.invoiceNumber} — Manual Payer — balance BDT 120.00`,
      }),
    ).toBeTruthy();
    expect(
      screen.getByRole('option', {
        name: 'INV-FICTIONAL-2 — Manual Payer — balance BDT 3,090.00',
      }),
    ).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Record verified payment' }),
    ).toHaveProperty('disabled', true);
    await user.selectOptions(
      screen.getByLabelText('Payable invoice'),
      invoiceId,
    );
    expect(screen.getByLabelText('Amount (BDT)')).toHaveProperty(
      'value',
      '120.00',
    );
    await user.clear(screen.getByLabelText('Amount (BDT)'));
    await user.type(screen.getByLabelText('Amount (BDT)'), '50');
    await user.selectOptions(
      screen.getByLabelText('Payable invoice'),
      otherInvoice.id,
    );
    expect(screen.getByLabelText('Amount (BDT)')).toHaveProperty(
      'value',
      '3090.00',
    );
    await user.selectOptions(screen.getByLabelText('Payable invoice'), '');
    expect(screen.getByLabelText('Amount')).toHaveProperty('value', '');
    expect(screen.getByLabelText('Amount')).toHaveProperty('disabled', true);
    expect(
      fetch.mock.calls.some(([, options]) => options?.method === 'POST'),
    ).toBe(false);
  });

  it('records a normal decimal amount using the existing exact minor-unit API', async () => {
    const user = userEvent.setup();
    const current = {
      ...invoice,
      balanceDue: { amount: '309025', currency: 'BDT' },
    };
    const fetch = paymentWorkspace([current]);
    render(<AdminPaymentManager />);
    await user.click(
      await screen.findByRole('button', { name: 'Record payment' }),
    );
    await user.selectOptions(
      screen.getByLabelText('Payable invoice'),
      invoiceId,
    );
    expect(screen.getByLabelText('Amount (BDT)')).toHaveProperty(
      'value',
      '3090.25',
    );
    await user.type(
      screen.getByLabelText('Reference'),
      'FICTIONAL-BANK-REFERENCE',
    );
    await user.click(
      screen.getByRole('button', { name: 'Record verified payment' }),
    );
    await screen.findAllByText(
      'Verified manual payment recorded and invoice recalculated.',
    );
    const write = fetch.mock.calls.find(
      ([url, options]) =>
        url.endsWith('/payments/manual/admin') && options?.method === 'POST',
    );
    expect(JSON.parse(String(write?.[1]?.body))).toMatchObject({
      invoiceId,
      amount: '309025',
      proof: { method: 'BANK_TRANSFER', reference: 'FICTIONAL-BANK-REFERENCE' },
    });
    expect(screen.getByLabelText('Payable invoice')).toHaveProperty(
      'value',
      '',
    );
    expect(screen.getByLabelText('Amount')).toHaveProperty('value', '');
  });

  it.each(['0', '-1', '3090.001', '1e3', '3,090', '92233720368547758.08'])(
    'rejects invalid payment amount %s before any mutation',
    async (amount) => {
      const user = userEvent.setup();
      const fetch = paymentWorkspace();
      render(<AdminPaymentManager />);
      await user.click(
        await screen.findByRole('button', { name: 'Record payment' }),
      );
      await user.selectOptions(
        screen.getByLabelText('Payable invoice'),
        invoiceId,
      );
      fireEvent.change(screen.getByLabelText('Amount (BDT)'), {
        target: { value: amount },
      });
      await user.type(
        screen.getByLabelText('Reference'),
        'FICTIONAL-BANK-REFERENCE',
      );
      await user.click(
        screen.getByRole('button', { name: 'Record verified payment' }),
      );
      await screen.findByRole('alert');
      expect(screen.getByLabelText('Amount (BDT)')).toHaveProperty(
        'value',
        amount,
      );
      expect(
        fetch.mock.calls.some(([, options]) => options?.method === 'POST'),
      ).toBe(false);
    },
  );

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
  it('retains the same checkout key after a lost response and a remount, until a deliberate new attempt', async () => {
    const user = userEvent.setup();
    const fetch = vi.fn(async (url: string, options?: RequestInit) => {
      void options;
      if (url.endsWith('/auth/csrf'))
        return jsonResponse({
          success: true,
          data: { csrfToken: 'x'.repeat(32) },
        });
      if (url.endsWith('/payment-gateways'))
        return jsonResponse({
          success: true,
          data: [
            { key: 'sslcommerz', displayName: 'SSLCOMMERZ', mode: 'SANDBOX' },
          ],
        });
      return jsonResponse({
        success: false,
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: 'Reconcile the saved attempt before retrying.',
        },
      });
    });
    vi.stubGlobal('fetch', fetch);
    const first = render(<CustomerGatewayPayment invoice={invoice} />);
    await user.click(
      await screen.findByRole('button', { name: 'Pay with SSLCOMMERZ' }),
    );
    await screen.findByRole('alert');
    first.unmount();
    render(<CustomerGatewayPayment invoice={invoice} />);
    await user.click(
      await screen.findByRole('button', { name: 'Pay with SSLCOMMERZ' }),
    );
    await screen.findByRole('alert');
    const sessionCalls = () =>
      fetch.mock.calls.filter(([url]) => url.endsWith('/sessions'));
    const body = (index: number) =>
      JSON.parse(String(sessionCalls()[index]![1]?.body)) as {
        submissionKey: string;
      };
    expect(body(0).submissionKey).toMatch(/^[a-f0-9-]{36}$/);
    expect(body(1).submissionKey).toBe(body(0).submissionKey);
    await user.click(
      screen.getByRole('button', { name: 'Start another payment attempt' }),
    );
    await user.click(
      screen.getByRole('button', { name: 'Pay with SSLCOMMERZ' }),
    );
    await screen.findByRole('alert');
    expect(body(2).submissionKey).not.toBe(body(0).submissionKey);
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

function paymentWorkspace(invoices: Invoice[] = [invoice]) {
  const fetch = vi.fn(async (url: string, options?: RequestInit) => {
    if (url.endsWith('/auth/csrf'))
      return jsonResponse({
        success: true,
        data: { csrfToken: 'fictional-token' },
      });
    if (options?.method === 'POST') {
      const body = JSON.parse(String(options.body)) as { amount: string };
      return jsonResponse({
        success: true,
        data: {
          payment: {
            ...pendingPayment,
            state: 'VERIFIED',
            amount: { amount: body.amount, currency: 'BDT' },
          },
          duplicate: false,
        },
      });
    }
    if (url.includes('/payments/settings'))
      return jsonResponse({
        success: true,
        data: { partialPaymentsEnabled: false },
      });
    if (url.includes('/payment-gateways/failures'))
      return jsonResponse({ success: true, data: [] });
    if (url.includes('/invoices?')) return paginatedResponse(invoices);
    if (url.endsWith(`/invoices/${invoiceId}`))
      return jsonResponse({
        success: true,
        data: {
          ...invoice,
          status: 'PAID',
          balanceDue: { amount: '0', currency: 'BDT' },
        },
      });
    return paginatedResponse([]);
  });
  vi.stubGlobal('fetch', fetch);
  return fetch;
}
