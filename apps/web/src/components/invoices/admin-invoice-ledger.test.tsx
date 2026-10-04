import { type Invoice, type InvoiceListQuery } from '@webhost-billing/shared';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readAdminInvoiceQuery } from '../../lib/admin-invoice-ledger-query';
import { AdminInvoiceLedger } from './admin-invoice-ledger';
import { AdminInvoiceManager } from './admin-invoice-manager';

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
const customerId = '85000000-0000-4000-8000-000000000001';
const otherId = '85000000-0000-4000-8000-000000000002';
const invoice: Invoice = {
  id: '85000000-0000-4000-8000-000000000003',
  invoiceNumber: 'INV-FICTIONAL-85',
  customerId,
  orderId: null,
  orderNumber: null,
  status: 'UNPAID',
  currency: 'BDT',
  subtotal: money(),
  discountTotal: money('0'),
  taxTotal: money('0'),
  total: money(),
  creditTotal: money('0'),
  amountPaid: money('0'),
  balanceDue: money(),
  customerName: '<b>Historical Customer</b>',
  customerEmail: 'fictional@example.test',
  customerAddress: {
    line1: '85 Fictional Road',
    line2: null,
    city: 'Dhaka',
    region: null,
    postalCode: null,
    countryCode: 'BD',
  },
  businessIdentity: { name: 'Fictional Hosting' },
  taxIdentity: null,
  issuedAt: '2026-09-01T00:00:00.000Z',
  dueAt: '2026-10-01T00:00:00.000Z',
  paidAt: null,
  cancelledAt: null,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
  items: [
    {
      id: '85000000-0000-4000-8000-000000000004',
      description: 'Hosting',
      quantity: 1,
      unitAmount: money(),
      discountAmount: money('0'),
      taxAmount: money('0'),
      lineTotal: money(),
      servicePeriodStart: null,
      servicePeriodEnd: null,
    },
  ],
};
function money(amount = '9007199254740993') {
  return { amount, currency: 'BDT' };
}
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
function page(
  rows: Invoice[] = [invoice],
  total = rows.length,
  query: Pick<InvoiceListQuery, 'page' | 'pageSize'> = {
    page: 1,
    pageSize: 20,
  },
) {
  return {
    success: true,
    data: rows,
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      totalItems: total,
      totalPages: Math.ceil(total / query.pageSize),
    },
  };
}
function ledger(input: Record<string, string | string[] | undefined> = {}) {
  return (
    <AdminInvoiceLedger selection={readAdminInvoiceQuery(input)} revision={0} />
  );
}
function defer<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  push.mockReset();
});

describe('administrator invoice ledger', () => {
  it('uses cookie-based read only, historical escaped names, lossless money and fixed non-prefetched links', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(page()));
    vi.stubGlobal('fetch', fetchMock);
    const { container } = render(ledger());
    const link = await screen.findByRole('link', {
      name: invoice.invoiceNumber,
    });
    expect(link.getAttribute('href')).toBe(`/admin/invoices/${invoice.id}`);
    expect(screen.getAllByText('BDT 90,071,992,547,409.93')).toHaveLength(2);
    expect(screen.getByText(invoice.customerName)).toBeTruthy();
    expect(container.querySelector('b')).toBeNull();
    expect(
      screen.getByText(/All customers \(unfiltered customer scope\)/),
    ).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/invoices?page=1&pageSize=20'),
      expect.objectContaining({
        credentials: 'include',
        cache: 'no-store',
        signal: expect.any(AbortSignal),
      }),
    );
  });
  it('reaches older than 100 records with authoritative counts', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          json(page([invoice], 105, { page: 105, pageSize: 1 })),
        ),
    );
    render(ledger({ page: '105', pageSize: '1' }));
    expect(
      await screen.findByText(
        '105 matching invoices · 105–105 · Page 105 of 105',
      ),
    ).toBeTruthy();
    expect(
      screen
        .getByRole('button', { name: 'Next page' })
        .hasAttribute('disabled'),
    ).toBe(true);
  });
  it('keeps draft search separate, encodes submission, and preserves context on every control', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(json(page([invoice], 3, { page: 2, pageSize: 1 }))),
    );
    render(
      ledger({
        customerId,
        status: 'UNPAID',
        search: 'Hosting',
        page: '2',
        pageSize: '1',
      }),
    );
    await screen.findByRole('link', { name: invoice.invoiceNumber });
    await user.clear(screen.getByLabelText('Search invoices'));
    await user.type(
      screen.getByLabelText('Search invoices'),
      'invoice & status=PAID',
    );
    expect(screen.getByText(/Applied search: Hosting/)).toBeTruthy();
    expect(push).not.toHaveBeenCalled();
    await user.keyboard('{Enter}');
    expect(
      new URLSearchParams(push.mock.calls.at(-1)?.[0].split('?')[1]),
    ).toEqual(
      new URLSearchParams({
        page: '1',
        pageSize: '1',
        search: 'invoice & status=PAID',
        status: 'UNPAID',
        customerId,
      }),
    );
    await user.selectOptions(screen.getByLabelText('Invoice status'), 'PAID');
    expect(push.mock.calls.at(-1)?.[0]).toContain(
      'page=1&pageSize=1&search=Hosting&status=PAID',
    );
    await user.selectOptions(screen.getByLabelText('Invoices per page'), '50');
    expect(push.mock.calls.at(-1)?.[0]).toContain('page=1&pageSize=50');
    await user.click(screen.getByRole('button', { name: 'Next page' }));
    expect(push.mock.calls.at(-1)?.[0]).toContain('page=3&pageSize=1');
    await user.click(screen.getByRole('button', { name: 'Previous page' }));
    expect(push.mock.calls.at(-1)?.[0]).toContain('page=1&pageSize=1');
    await user.click(
      screen.getByRole('button', { name: 'Clear ledger filters' }),
    );
    expect(push).toHaveBeenLastCalledWith(
      `/admin/invoices?page=1&pageSize=20&customerId=${customerId}`,
      { scroll: false },
    );
    await user.click(
      screen.getByRole('button', { name: 'Clear customer scope' }),
    );
    expect(push).toHaveBeenLastCalledWith(
      '/admin/invoices?page=1&pageSize=1&search=Hosting&status=UNPAID',
      { scroll: false },
    );
  });
  it.each([{ page: ['1', '2'] }, { status: 'UNKNOWN' }])(
    'does not read or present normal rows for invalid URL input %j',
    async (input) => {
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);
      render(ledger({ ...input, customerId }));
      expect(screen.getByText('Invalid invoice filters')).toBeTruthy();
      expect(fetchMock).not.toHaveBeenCalled();
      expect(screen.queryByText(invoice.invoiceNumber)).toBeNull();
    },
  );
  it.each([
    [{}, 'No invoices yet'],
    [{ customerId }, 'No invoices for this customer'],
    [{ search: 'missing' }, 'No matching invoices'],
    [{ page: '6' }, 'This invoice page is out of range'],
  ] as const)('distinguishes empty states %j', async (input, title) => {
    const query = readAdminInvoiceQuery(input).query;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(page([], 0, query))));
    render(ledger(input));
    expect(await screen.findByText(title)).toBeTruthy();
  });
  it('recovers out-of-range page without losing filters', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(json(page([], 2, { page: 6, pageSize: 20 }))),
    );
    render(
      ledger({ page: '6', customerId, status: 'UNPAID', search: 'Hosting' }),
    );
    await user.click(
      await screen.findByRole('button', { name: 'Return to first page' }),
    );
    expect(push).toHaveBeenLastCalledWith(
      `/admin/invoices?page=1&pageSize=20&search=Hosting&status=UNPAID&customerId=${customerId}`,
      { scroll: false },
    );
  });
  it.each([
    { ...page(), success: false },
    page([{ ...invoice, id: 'bad' }]),
    { ...page(), pagination: { ...page().pagination, page: 2 } },
    { ...page(), pagination: { ...page().pagination, pageSize: 100 } },
    { ...page(), pagination: { ...page().pagination, totalPages: 2 } },
    page([], 1),
    page([invoice, invoice]),
    page([{ ...invoice, customerId: otherId }]),
    page([{ ...invoice, status: 'PAID' }]),
  ])('rejects malformed or mismatched result %j', async (body) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(body)));
    render(ledger({ customerId, status: 'UNPAID' }));
    expect(
      await screen.findByText('Invoice ledger could not be loaded'),
    ).toBeTruthy();
    expect(
      screen.queryByRole('link', { name: invoice.invoiceNumber }),
    ).toBeNull();
  });
  it('retries only failed reads', async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('Read failed'))
      .mockResolvedValue(json(page()));
    vi.stubGlobal('fetch', fetchMock);
    render(ledger());
    await user.click(
      await screen.findByRole('button', { name: 'Retry invoice ledger' }),
    );
    await screen.findByRole('link', { name: invoice.invoiceNumber });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.every(([, options]) => !options.method)).toBe(
      true,
    );
  });
  it('rejects malformed JSON without displaying raw response contents', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response('unexpected-private-response', { status: 200 }),
        ),
    );
    render(ledger());
    await screen.findByText('Invoice ledger could not be loaded');
    expect(
      screen.getByText(
        'The invoice ledger returned an invalid response. Please retry.',
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/unexpected-private-response/)).toBeNull();
  });
  it('aborts and discards stale responses across query/back/forward/unmount', async () => {
    const delayed = defer<Response>();
    const fetchMock = vi
      .fn()
      .mockReturnValueOnce(delayed.promise)
      .mockImplementation(async () =>
        json(page([{ ...invoice, invoiceNumber: 'INV-CURRENT' }])),
      );
    vi.stubGlobal('fetch', fetchMock);
    const view = render(ledger({ search: 'old' }));
    const signal = fetchMock.mock.calls[0][1].signal as AbortSignal;
    view.rerender(ledger({ search: 'current' }));
    expect(signal.aborted).toBe(true);
    await screen.findByRole('link', { name: 'INV-CURRENT' });
    await act(async () => delayed.resolve(json(page())));
    expect(
      screen.queryByRole('link', { name: invoice.invoiceNumber }),
    ).toBeNull();
    view.rerender(ledger({ search: 'old' }));
    expect(screen.getByLabelText('Search invoices').getAttribute('value')).toBe(
      'old',
    );
    await screen.findByRole('link', { name: 'INV-CURRENT' });
    view.rerender(ledger({ search: 'current' }));
    await screen.findByRole('link', { name: 'INV-CURRENT' });
    view.unmount();
    expect(
      (fetchMock.mock.calls.at(-1)?.[1].signal as AbortSignal).aborted,
    ).toBe(true);
  });
  it('does not infer a malformed customer and explicitly labels unfiltered scope', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(page())));
    render(ledger({ customerId: 'bad' }));
    await screen.findByRole('link', { name: invoice.invoiceNumber });
    expect(
      screen.getByText(/All customers \(unfiltered customer scope\)/),
    ).toBeTruthy();
  });
});

describe('invoice forms remain independent of browsing', () => {
  function fixture(
    handler?: (
      url: string,
      options?: RequestInit,
    ) => Response | Promise<Response> | undefined,
  ) {
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, options?: RequestInit) => {
        const url = new URL(String(input));
        const custom = handler?.(url.pathname + url.search, options);
        if (custom) return custom;
        if (url.pathname === '/auth/csrf')
          return json({ success: true, data: { csrfToken: 'fictional-csrf' } });
        if (url.pathname === '/invoices/settings/business-identity')
          return json({ success: true, data: { name: 'Fictional Hosting' } });
        if (url.pathname === '/customers')
          return json({
            success: true,
            data: [
              {
                id: customerId,
                status: 'ACTIVE',
                firstName: 'Fictional',
                lastName: 'Customer',
                email: invoice.customerEmail,
              },
            ],
            pagination: {},
          });
        if (url.pathname.startsWith('/customers/'))
          return json({
            success: true,
            data: {
              id: customerId,
              firstName: 'Fictional',
              lastName: 'Customer',
              customerNumber: 'CUS-85',
            },
          });
        return json(page());
      },
    );
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }
  it('preserves unsaved draft and identity fields and lines during query changes', async () => {
    const user = userEvent.setup();
    fixture();
    const view = render(<AdminInvoiceManager />);
    await screen.findByRole('button', { name: 'Save draft' });
    await user.type(screen.getByLabelText('Description 1'), 'Unsaved hosting');
    await user.clear(screen.getByLabelText('Business name'));
    await user.type(screen.getByLabelText('Business name'), 'Unsaved business');
    await user.selectOptions(screen.getByLabelText('Customer'), customerId);
    await user.click(screen.getByRole('button', { name: /Add line/ }));
    await user.type(screen.getByLabelText('Description 2'), 'Second line');
    view.rerender(
      <AdminInvoiceManager
        selection={readAdminInvoiceQuery({ search: 'Hosting', customerId })}
      />,
    );
    await screen.findByRole('link', { name: invoice.invoiceNumber });
    expect(screen.getByDisplayValue('Unsaved hosting')).toBeTruthy();
    expect(screen.getByDisplayValue('Second line')).toBeTruthy();
    expect(screen.getByDisplayValue('Unsaved business')).toBeTruthy();
    expect((screen.getByLabelText('Customer') as HTMLSelectElement).value).toBe(
      customerId,
    );
    const clear = await screen.findByRole('link', {
      name: 'Clear customer filter',
    });
    expect(clear.getAttribute('href')).toBe(
      '/admin/invoices?page=1&pageSize=20&search=Hosting',
    );
  });
  it('retains draft body/key on write retry then refreshes the latest selection without injecting a draft; read retry never duplicates write', async () => {
    const user = userEvent.setup();
    const saved = defer<Response>();
    let writes = 0;
    let failRead = false;
    const fetchMock = fixture((url, options) => {
      if (url === '/invoices' && options?.method === 'POST') {
        writes++;
        return writes === 1
          ? json({ success: false, error: { message: 'Write failed' } }, 503)
          : saved.promise;
      }
      if (url.startsWith('/invoices?') && failRead) return json({}, 503);
      if (url.includes('status=PAID')) return json(page([], 0));
    });
    const view = render(<AdminInvoiceManager />);
    await screen.findByRole('button', { name: 'Save draft' });
    await user.selectOptions(screen.getByLabelText('Customer'), customerId);
    await user.type(screen.getByLabelText('Description 1'), 'Hosting');
    await user.clear(screen.getByLabelText('Unit minor'));
    await user.type(screen.getByLabelText('Unit minor'), '9007199254740993');
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    await screen.findByText('Write failed');
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    view.rerender(
      <AdminInvoiceManager
        selection={readAdminInvoiceQuery({ status: 'PAID' })}
      />,
    );
    await screen.findByText('No matching invoices');
    failRead = true;
    await act(async () =>
      saved.resolve(
        json({
          success: true,
          data: { invoice: { ...invoice, status: 'DRAFT' }, duplicate: false },
        }),
      ),
    );
    await screen.findByText(`${invoice.invoiceNumber} saved as a draft.`);
    await screen.findByText('Invoice ledger could not be loaded');
    const mutations = fetchMock.mock.calls.filter(
      ([, options]) => options?.method === 'POST',
    );
    const body = JSON.parse(String(mutations[0][1]?.body));
    expect(JSON.parse(String(mutations[1][1]?.body))).toEqual(body);
    expect(body).toEqual({
      customerId,
      currency: 'BDT',
      dueAt: expect.stringMatching(/T23:59:59\.000Z$/),
      creditTotal: '0',
      submissionKey: expect.stringMatching(/^[0-9a-f-]{36}$/),
      items: [
        {
          description: 'Hosting',
          quantity: 1,
          unitAmount: '9007199254740993',
          discountAmount: '0',
          taxAmount: '0',
        },
      ],
    });
    expect(mutations[0][1]?.headers).toEqual({
      'X-CSRF-Token': 'fictional-csrf',
      'Content-Type': 'application/json',
    });
    expect(
      screen.queryByRole('link', { name: invoice.invoiceNumber }),
    ).toBeNull();
    failRead = false;
    await user.click(
      screen.getByRole('button', { name: 'Retry invoice ledger' }),
    );
    await screen.findByText('No matching invoices');
    expect(writes).toBe(2);
    expect(fetchMock.mock.calls.at(-1)?.[0]).toContain('status=PAID');
  });
  it('preserves identity mutation body, omission and CSRF without ledger writes', async () => {
    const user = userEvent.setup();
    const fetchMock = fixture();
    render(<AdminInvoiceManager />);
    await screen.findByRole('button', { name: 'Save business identity' });
    await user.type(screen.getByLabelText('Address'), '85 Fictional Road');
    await user.click(
      screen.getByRole('button', { name: 'Save business identity' }),
    );
    await screen.findByText(/Business identity saved for future invoices/);
    const mutation = fetchMock.mock.calls.find(
      ([, options]) => options?.method === 'PATCH',
    );
    expect(JSON.parse(String(mutation?.[1]?.body))).toEqual({
      name: 'Fictional Hosting',
      addressLine1: '85 Fictional Road',
    });
    expect(mutation?.[1]?.headers).toEqual({
      'X-CSRF-Token': 'fictional-csrf',
      'Content-Type': 'application/json',
    });
    expect(
      within(
        screen.getByRole('region', { name: 'Administrator invoice ledger' }),
      ).queryByRole('button', { name: 'Save draft' }),
    ).toBeNull();
    await waitFor(() =>
      expect(
        screen
          .getByRole('button', { name: 'Save draft' })
          .hasAttribute('disabled'),
      ).toBe(false),
    );
  });
});
