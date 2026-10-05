import type { Order } from '@webhost-billing/shared';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  readCustomerOrderQuery,
  type CustomerOrderQuery,
} from '../../lib/customer-order-ledger-query';
import { CustomerOrderList } from './customer-order-list';

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
const order: Order = {
  id: '89000000-0000-4000-8000-000000000001',
  orderNumber: 'ORD-CMD89-OLD',
  customerId: '89000000-0000-4000-8000-000000000002',
  customerName: 'Fictional Customer',
  customerEmail: 'historical@example.test',
  status: 'CANCELLED',
  subtotal: { amount: '24000', currency: 'BDT' },
  setupTotal: { amount: '1000', currency: 'BDT' },
  total: { amount: '25000', currency: 'BDT' },
  notes: null,
  placedAt: '2026-01-01T00:00:00Z',
  completedAt: null,
  cancelledAt: null,
  items: [0, 1].map((index) => ({
    id: `89000000-0000-4000-8001-${String(index).padStart(12, '0')}`,
    productId: '89000000-0000-4000-8000-000000000003',
    productPriceId: '89000000-0000-4000-8000-000000000004',
    productName: 'Historical Hosting',
    description: null,
    billingPeriod: 'MONTHLY',
    unitAmount: { amount: '12000', currency: 'BDT' },
    setupFee: { amount: '500', currency: 'BDT' },
    lineTotal: { amount: '12500', currency: 'BDT' },
    quantity: 1,
    requestedDomain: `item-${index}.example.test`,
  })),
  invoice: {
    id: '89000000-0000-4000-8000-000000000005',
    invoiceNumber: 'INV-CMD89-OLD',
    status: 'CANCELLED',
    total: { amount: '25000', currency: 'BDT' },
    balanceDue: { amount: '25000', currency: 'BDT' },
    dueAt: '2026-02-01T00:00:00Z',
  },
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}
function page(
  data: Order[] = [order],
  query: CustomerOrderQuery = { page: 1, pageSize: 20 },
  totalItems = data.length,
) {
  return {
    success: true,
    data,
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      totalItems,
      totalPages: Math.ceil(totalItems / query.pageSize),
    },
  };
}
function selection(query: Partial<CustomerOrderQuery> = {}) {
  return readCustomerOrderQuery(
    Object.fromEntries(
      Object.entries(query).map(([key, value]) => [key, String(value)]),
    ),
  );
}
function history(query: Partial<CustomerOrderQuery> = {}) {
  return <CustomerOrderList selection={selection(query)} />;
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { resolve, promise };
}
afterEach(() => {
  vi.unstubAllGlobals();
  push.mockReset();
});

describe('customer order history', () => {
  it('reads an older page beyond 100 with combined filters, authoritative counts and original display/routes', async () => {
    const query: CustomerOrderQuery = {
      page: 6,
      pageSize: 20,
      search: 'old',
      status: 'CANCELLED',
    };
    const rows = Array.from({ length: 20 }, (_, index) => ({
      ...order,
      id: `89000000-0000-4000-8002-${String(index).padStart(12, '0')}`,
      orderNumber: `ORD-OLDER-${index}`,
    }));
    const mock = vi.fn<
      (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
    >(async () => json(page(rows, query, 140)));
    vi.stubGlobal('fetch', mock);
    render(history(query));
    await screen.findByText('ORD-OLDER-19');
    expect(screen.getByText(/140 matching orders/).textContent).toContain(
      '101–120',
    );
    expect(screen.getByText(/140 matching orders/).textContent).toContain(
      'Page 6 of 7',
    );
    const request = new URL(String(mock.mock.calls[0]?.[0]));
    expect(request.pathname).toBe('/orders/my');
    expect(Object.fromEntries(request.searchParams)).toEqual({
      page: '6',
      pageSize: '20',
      search: 'old',
      status: 'CANCELLED',
    });
    expect(mock.mock.calls[0]?.[1]).toMatchObject({
      credentials: 'include',
      cache: 'no-store',
      signal: expect.any(AbortSignal),
    });
    expect(
      screen.getAllByText('First item shown · 1 additional items'),
    ).toHaveLength(20);
    expect(screen.getAllByText('BDT 250.00')).toHaveLength(20);
    expect(screen.getAllByText(order.invoice.invoiceNumber)).toHaveLength(20);
    expect(
      screen.getByRole('link', { name: 'New order' }).getAttribute('href'),
    ).toBe('/portal/checkout');
    expect(screen.getAllByRole('link')).toHaveLength(1);
    expect(screen.getByText(/do not establish current service/)).toBeDefined();
  });
  it.each(['search', 'status', 'size', 'next', 'previous', 'clear'] as const)(
    'applies %s navigation with only fixed local filters',
    async (action) => {
      const user = userEvent.setup();
      const query: CustomerOrderQuery = {
        page: 6,
        pageSize: 20,
        search: 'old',
        status: 'CANCELLED',
      };
      const rows = Array.from({ length: 20 }, (_, index) => ({
        ...order,
        id: `89000000-0000-4000-8002-${String(index).padStart(12, '0')}`,
      }));
      vi.stubGlobal(
        'fetch',
        vi.fn<
          (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
        >(async () => json(page(rows, query, 140))),
      );
      render(history(query));
      await screen.findByText(/140 matching orders/);
      let next: CustomerOrderQuery = { ...query };
      if (action === 'search') {
        await user.clear(screen.getByRole('searchbox'));
        await user.type(screen.getByRole('searchbox'), 'new');
        await user.click(screen.getByRole('button', { name: 'Search' }));
        next = { ...query, search: 'new', page: 1 };
      }
      if (action === 'status') {
        await user.selectOptions(screen.getByLabelText('Order status'), 'PAID');
        next = { ...query, status: 'PAID', page: 1 };
      }
      if (action === 'size') {
        await user.selectOptions(
          screen.getByLabelText('Orders per page'),
          '100',
        );
        next = { ...query, pageSize: 100, page: 1 };
      }
      if (action === 'next') {
        await user.click(screen.getByRole('button', { name: 'Next page' }));
        next = { ...query, page: 7 };
      }
      if (action === 'previous') {
        await user.click(screen.getByRole('button', { name: 'Previous page' }));
        next = { ...query, page: 5 };
      }
      if (action === 'clear') {
        await user.click(
          screen.getByRole('button', { name: 'Clear order filters' }),
        );
        next = { page: 1, pageSize: 20 };
      }
      const href = push.mock.calls[0]?.[0] as string;
      expect(href.startsWith('/portal/orders?')).toBe(true);
      expect(
        readCustomerOrderQuery(new URLSearchParams(href.split('?')[1])).query,
      ).toEqual(next);
      expect(push.mock.calls[0]?.[1]).toEqual({ scroll: false });
      expect(screen.queryByText(/140 matching orders/)).toBeNull();
    },
  );
  it('blocks invalid filters and clears to safe defaults without forwarding identity', async () => {
    const user = userEvent.setup();
    const mock =
      vi.fn<
        (_input: RequestInfo | URL, _init?: RequestInit) => Promise<Response>
      >();
    vi.stubGlobal('fetch', mock);
    const view = render(
      <CustomerOrderList
        selection={readCustomerOrderQuery({
          page: ['1', '2'],
          customerId: 'other',
        })}
      />,
    );
    await screen.findByRole('heading', { name: 'Invalid order filters' });
    expect(mock).not.toHaveBeenCalled();
    await user.click(
      screen.getByRole('button', { name: 'Clear order filters' }),
    );
    expect(push).toHaveBeenCalledWith('/portal/orders?page=1&pageSize=20', {
      scroll: false,
    });
    mock.mockResolvedValue(json(page()));
    view.rerender(
      <CustomerOrderList
        selection={readCustomerOrderQuery({
          customerId: 'other',
          next: 'https://example.test',
        })}
      />,
    );
    await screen.findByText(order.orderNumber);
    expect(
      new URL(String(mock.mock.calls[0]?.[0])).searchParams.has('customerId'),
    ).toBe(false);
  });
  it('preserves an out-of-range page without clamping and recovers with its filters', async () => {
    const user = userEvent.setup();
    const query: CustomerOrderQuery = {
      page: 99,
      pageSize: 20,
      search: 'old',
      status: 'CANCELLED',
    };
    vi.stubGlobal(
      'fetch',
      vi.fn<
        (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
      >(async () => json(page([], query, 140))),
    );
    render(history(query));
    await screen.findByRole('heading', {
      name: 'This order page is out of range',
    });
    expect(screen.getByText(/140 matching orders/).textContent).toContain(
      'Page 99 of 7',
    );
    expect(
      (screen.getByRole('button', { name: 'Next page' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    await user.click(
      screen.getByRole('button', { name: 'Return to first page' }),
    );
    expect(
      readCustomerOrderQuery(
        new URLSearchParams((push.mock.calls[0]?.[0] as string).split('?')[1]),
      ).query,
    ).toEqual({ ...query, page: 1 });
  });
  it.each(['empty', 'filtered'] as const)(
    'shows distinct %s history',
    async (kind) => {
      const query = kind === 'filtered' ? { search: 'missing' } : {};
      vi.stubGlobal(
        'fetch',
        vi.fn<
          (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
        >(async () => json(page([], selection(query).query))),
      );
      render(history(query));
      await screen.findByRole('heading', {
        name: kind === 'empty' ? 'No orders yet' : 'No matching orders',
      });
      if (kind === 'empty')
        expect(
          screen
            .getByRole('link', { name: 'Browse hosting plans' })
            .getAttribute('href'),
        ).toBe('/hosting');
    },
  );
  it.each([
    'numeric money',
    'item money',
    'invoice money',
    'unsafe domain',
    'bad status',
    'duplicate',
    'missing row',
    'bad metadata',
  ] as const)('rejects %s without displaying untrusted rows', async (kind) => {
    let body: unknown = page();
    if (kind === 'numeric money')
      body = page([
        { ...order, total: { ...order.total, amount: 7 as unknown as string } },
      ]);
    if (kind === 'item money')
      body = page([
        {
          ...order,
          items: [
            {
              ...order.items[0]!,
              lineTotal: { amount: '1.1', currency: 'BDT' },
            },
          ],
        },
      ]);
    if (kind === 'invoice money')
      body = page([
        {
          ...order,
          invoice: {
            ...order.invoice,
            balanceDue: { amount: '01', currency: 'BDT' },
          },
        },
      ]);
    if (kind === 'unsafe domain')
      body = page([
        {
          ...order,
          items: [
            { ...order.items[0]!, requestedDomain: 'javascript:alert(1)' },
          ],
        },
      ]);
    if (kind === 'bad status')
      body = page([{ ...order, status: 'PAID' }], {
        page: 1,
        pageSize: 20,
        status: 'CANCELLED',
      });
    if (kind === 'duplicate') body = page([order, order]);
    if (kind === 'missing row') body = page([], undefined, 1);
    if (kind === 'bad metadata')
      body = {
        ...page(),
        pagination: { page: 2, pageSize: 20, totalItems: 1, totalPages: 1 },
      };
    vi.stubGlobal(
      'fetch',
      vi.fn<
        (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
      >(async () => json(body)),
    );
    render(history(kind === 'bad status' ? { status: 'CANCELLED' } : {}));
    await screen.findByRole('heading', {
      name: 'Order history could not be loaded',
    });
    expect(screen.queryByText(order.orderNumber)).toBeNull();
    expect(screen.queryByText(/matching orders ·/)).toBeNull();
  });
  it.each([403, 404, 503, 'json', 'network'] as const)(
    'sanitizes %s failures and retries only GET',
    async (failure) => {
      const user = userEvent.setup();
      let calls = 0;
      const mock = vi.fn<
        (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
      >(async () => {
        calls++;
        if (calls > 1) return json(page());
        if (failure === 'network') throw new Error('SECRET raw endpoint');
        if (failure === 'json') return new Response('SECRET raw response');
        return json({ message: 'SECRET raw response' }, failure);
      });
      vi.stubGlobal('fetch', mock);
      render(history());
      await screen.findByRole('heading', {
        name: 'Order history could not be loaded',
      });
      expect(screen.queryByText(/SECRET/)).toBeNull();
      await user.click(
        screen.getByRole('button', { name: 'Retry order history' }),
      );
      await screen.findByText(order.orderNumber);
      expect(mock).toHaveBeenCalledTimes(2);
      expect(
        mock.mock.calls.every(
          (call) => !(call[1] as RequestInit | undefined)?.method,
        ),
      ).toBe(true);
      expect(screen.getByRole('heading', { name: 'Order history' })).toBe(
        document.activeElement,
      );
    },
  );
  it('discards a delayed retry when a newer query has already succeeded', async () => {
    const user = userEvent.setup();
    const retry = deferred<Response>();
    let calls = 0;
    const mock = vi.fn<
      (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
    >(async () => {
      calls++;
      if (calls === 1) return json({}, 503);
      if (calls === 2) return retry.promise;
      return json(page([{ ...order, orderNumber: 'CURRENT ORDER' }]));
    });
    vi.stubGlobal('fetch', mock);
    const view = render(history({ search: 'old' }));
    await user.click(
      await screen.findByRole('button', { name: 'Retry order history' }),
    );
    await waitFor(() => expect(calls).toBe(2));
    const retrySignal = mock.mock.calls[1]?.[1]?.signal;
    view.rerender(history({ search: 'new' }));
    await screen.findByText('CURRENT ORDER');
    expect(retrySignal?.aborted).toBe(true);
    await act(async () =>
      retry.resolve(json(page([{ ...order, orderNumber: 'STALE RETRY' }]))),
    );
    expect(screen.queryByText('STALE RETRY')).toBeNull();
    expect(screen.getByText('CURRENT ORDER')).toBeDefined();
    expect(mock.mock.calls.every(([, init]) => !init?.method)).toBe(true);
  });

  it('aborts/discards query, back/forward and unmount reads while restoring committed controls', async () => {
    const slow = deferred<Response>();
    let calls = 0;
    const mock = vi.fn<
      (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
    >(async () => {
      calls++;
      return calls === 1 ? slow.promise : json(page());
    });
    vi.stubGlobal('fetch', mock);
    const view = render(history({ search: 'old' }));
    await waitFor(() => expect(calls).toBe(1));
    const oldSignal = (mock.mock.calls[0]?.[1] as RequestInit).signal;
    view.rerender(history({ search: 'new' }));
    await screen.findByText(order.orderNumber);
    expect(oldSignal?.aborted).toBe(true);
    await act(async () =>
      slow.resolve(json(page([{ ...order, orderNumber: 'STALE ROW' }]))),
    );
    expect(screen.queryByText('STALE ROW')).toBeNull();
    view.rerender(history({ search: 'old' }));
    await waitFor(() => expect(calls).toBe(3));
    expect((screen.getByRole('searchbox') as HTMLInputElement).value).toBe(
      'old',
    );
    const lastSignal = (mock.mock.calls.at(-1)?.[1] as RequestInit).signal;
    view.unmount();
    expect(lastSignal?.aborted).toBe(true);
  });
});
