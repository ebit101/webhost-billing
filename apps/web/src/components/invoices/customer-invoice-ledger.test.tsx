import type { Invoice } from '@webhost-billing/shared';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CustomerInvoiceList } from './customer-invoice-list';
import { readInvoiceLedgerQuery } from '../../lib/invoice-ledger-query';

const navigation = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => navigation }));
beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.unstubAllGlobals());
const money = { amount: '12300', currency: 'BDT' };
const invoice: Invoice = {
  id: '81000000-0000-4000-8000-000000000001',
  invoiceNumber: 'INV-HISTORY-0105',
  customerId: '81000000-0000-4000-8000-000000000002',
  orderId: null,
  orderNumber: null,
  status: 'UNPAID',
  currency: 'BDT',
  subtotal: money,
  discountTotal: { ...money, amount: '0' },
  taxTotal: { ...money, amount: '0' },
  total: money,
  creditTotal: { ...money, amount: '0' },
  amountPaid: { ...money, amount: '0' },
  balanceDue: money,
  customerName: 'Fictional Customer',
  customerEmail: 'history@example.test',
  customerAddress: {
    line1: '81 Test Road',
    line2: null,
    city: 'Dhaka',
    region: null,
    postalCode: null,
    countryCode: 'BD',
  },
  businessIdentity: { name: 'Fictional Hosting' },
  taxIdentity: null,
  issuedAt: '2026-10-01T00:00:00.000Z',
  dueAt: '2026-10-10T00:00:00.000Z',
  paidAt: null,
  cancelledAt: null,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
  items: [
    {
      id: '81000000-0000-4000-8000-000000000003',
      description: 'Hosting history',
      quantity: 1,
      unitAmount: money,
      discountAmount: { ...money, amount: '0' },
      taxAmount: { ...money, amount: '0' },
      lineTotal: money,
      servicePeriodStart: null,
      servicePeriodEnd: null,
    },
  ],
};
function response(
  data: Invoice[] = [invoice],
  page = 1,
  totalItems = 105,
  pageSize = 20,
) {
  return new Response(
    JSON.stringify({
      success: true,
      data,
      pagination: {
        page,
        pageSize,
        totalItems,
        totalPages: Math.ceil(totalItems / pageSize),
      },
    }),
  );
}
function selection(query: Record<string, string | string[]> = {}) {
  return readInvoiceLedgerQuery(query);
}

describe('URL-bound customer invoice history', () => {
  it('loads one page, renders matching metadata and keeps safe amounts and detail links', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      void input;
      return response();
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<CustomerInvoiceList />);
    expect(screen.getByLabelText('Search invoices')).toBeTruthy();
    expect(
      screen.getByRole('status', { name: 'Loading your invoices' }),
    ).toBeTruthy();
    const link = await screen.findByRole('link', {
      name: invoice.invoiceNumber,
    });
    expect(link.getAttribute('href')).toBe(`/portal/invoices/${invoice.id}`);
    expect(screen.getByText(/105 matching invoices/)).toBeTruthy();
    expect(
      (
        screen.getByRole('button', {
          name: 'Previous page',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(screen.getAllByText('BDT 123.00').length).toBe(2);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      '/invoices/my?page=1&pageSize=20',
    );
  });
  it('preserves committed filters for paging and resets page on search, status or size changes', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => response([invoice], 6)),
    );
    render(
      <CustomerInvoiceList
        selection={selection({
          page: '6',
          search: 'Hosting',
          status: 'UNPAID',
        })}
      />,
    );
    await screen.findByRole('link', { name: invoice.invoiceNumber });
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Previous page' }));
    expect(navigation.push).toHaveBeenLastCalledWith(
      '/portal/invoices?page=5&pageSize=20&search=Hosting&status=UNPAID',
      { scroll: false },
    );
    await user.clear(screen.getByLabelText('Search invoices'));
    await user.type(screen.getByLabelText('Search invoices'), '  invoice  ');
    await user.click(screen.getByRole('button', { name: /^Search$/ }));
    expect(navigation.push).toHaveBeenLastCalledWith(
      '/portal/invoices?page=1&pageSize=20&search=invoice&status=UNPAID',
      { scroll: false },
    );
    await user.selectOptions(screen.getByLabelText('Invoice status'), 'PAID');
    expect(navigation.push).toHaveBeenLastCalledWith(
      '/portal/invoices?page=1&pageSize=20&search=Hosting&status=PAID',
      { scroll: false },
    );
    await user.selectOptions(screen.getByLabelText('Invoices per page'), '50');
    expect(navigation.push).toHaveBeenLastCalledWith(
      '/portal/invoices?page=1&pageSize=50&search=Hosting&status=UNPAID',
      { scroll: false },
    );
    expect(
      screen.getByRole('link', { name: 'Clear filters' }).getAttribute('href'),
    ).toBe('/portal/invoices');
  });
  it('restores URL-derived controls and requests on query/back-forward changes without stale rows', async () => {
    let finishOld!: (value: Response) => void;
    const fetchMock = vi.fn((input: RequestInfo | URL) =>
      String(input).includes('page=1&')
        ? new Promise<Response>((resolve) => {
            finishOld = resolve;
          })
        : Promise.resolve(
            response([{ ...invoice, invoiceNumber: 'INV-NEW-PAGE' }], 6),
          ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const view = render(
      <CustomerInvoiceList selection={selection({ search: 'old' })} />,
    );
    view.rerender(
      <CustomerInvoiceList
        selection={selection({ page: '6', search: 'new' })}
      />,
    );
    await screen.findByRole('link', { name: 'INV-NEW-PAGE' });
    await act(async () => finishOld(response()));
    expect(
      screen.queryByRole('link', { name: invoice.invoiceNumber }),
    ).toBeNull();
    expect(
      (screen.getByLabelText('Search invoices') as HTMLInputElement).value,
    ).toBe('new');
    fetchMock.mockImplementation(async () => response());
    view.rerender(
      <CustomerInvoiceList selection={selection({ search: 'old' })} />,
    );
    expect(screen.queryByRole('link', { name: 'INV-NEW-PAGE' })).toBeNull();
    await screen.findByRole('link', { name: invoice.invoiceNumber });
    expect(
      (screen.getByLabelText('Search invoices') as HTMLInputElement).value,
    ).toBe('old');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
  it.each([
    [{}, 1, 0, 'No invoices yet'],
    [{ search: 'missing' }, 1, 0, 'No matching invoices'],
    [{ page: '8', status: 'PAID' }, 8, 105, 'This invoice page is empty'],
  ] as const)(
    'distinguishes empty/filter/out-of-range states %s',
    async (query, page, count, title) => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => response([], page, count)),
      );
      render(<CustomerInvoiceList selection={selection(query)} />);
      await screen.findByRole('heading', { name: title });
      expect(screen.getByLabelText('Search invoices')).toBeTruthy();
      if (page > 1)
        expect(
          screen
            .getByRole('link', { name: 'Return to first page' })
            .getAttribute('href'),
        ).toBe('/portal/invoices?page=1&pageSize=20&status=PAID');
    },
  );
  it('shows invalid-filter recovery and never forwards identity or return payloads', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      void input;
      return response();
    });
    vi.stubGlobal('fetch', fetchMock);
    render(
      <CustomerInvoiceList
        selection={selection({
          page: ['1', '6'],
          customerId: 'foreign',
          next: '//evil.example',
        })}
      />,
    );
    expect(screen.getByRole('alert').textContent).toContain('Safe defaults');
    await screen.findByRole('link', { name: invoice.invoiceNumber });
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      '/invoices/my?page=1&pageSize=20',
    );
    expect(String(fetchMock.mock.calls[0]?.[0])).not.toContain('customerId');
  });
  it('keeps controls usable after failure, retries one read, and never shows failed data as fresh', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: false,
            error: { code: 'ERROR', message: 'Fictional unavailable history' },
          }),
          { status: 503 },
        ),
      )
      .mockResolvedValueOnce(response());
    vi.stubGlobal('fetch', fetchMock);
    render(<CustomerInvoiceList />);
    await screen.findByText('Fictional unavailable history');
    expect(screen.queryByText(/matching invoices/)).toBeNull();
    expect(screen.getByLabelText('Invoice status')).toBeTruthy();
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Retry invoice history' }));
    await screen.findByRole('link', { name: invoice.invoiceNumber });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(
      fetchMock.mock.calls.every(([, init]) => !(init as RequestInit).method),
    ).toBe(true);
  });
  it('fails closed for malformed response metadata instead of inventing counts', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => response([invoice], 2)),
    );
    render(<CustomerInvoiceList />);
    await screen.findByText(/inconsistent pagination/);
    expect(
      screen.queryByRole('link', { name: invoice.invoiceNumber }),
    ).toBeNull();
    expect(screen.queryByText(/matching invoices/)).toBeNull();
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Retry invoice history' }),
      ).toBeTruthy(),
    );
  });
});
