import type {
  CustomerDetail,
  CustomerSummary,
  Order,
  Product,
} from '@webhost-billing/shared';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdminOrderManager } from './admin-order-manager';
import {
  readAdminOrderQuery,
  parseAdminOrderPage,
} from '../../lib/admin-order-ledger-query';
const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
const customerId = '90000000-0000-4000-8000-000000000001';
const productId = '90000000-0000-4000-8000-000000000002';
const priceId = '90000000-0000-4000-8000-000000000003';
const orderId = '90000000-0000-4000-8000-000000000004';

const product: Product = {
  id: productId,
  slug: 'starter-hosting',
  name: 'Starter Hosting',
  description: 'A focused hosting plan.',
  status: 'ACTIVE',
  publicVisible: true,
  displayOrder: 1,
  hostingPackageIdentifier: 'starter_pkg',
  storageFeature: '10 GB SSD',
  websiteFeature: '1 website',
  emailFeature: '10 email accounts',
  bandwidthFeature: '100 GB',
  prices: [
    {
      id: priceId,
      billingPeriod: 'MONTHLY',
      amount: { amount: '12000', currency: 'BDT' },
      setupFee: { amount: '500', currency: 'BDT' },
      isActive: true,
      validFrom: '2026-08-24T12:00:00.000Z',
      validUntil: null,
      createdAt: '2026-08-24T12:00:00.000Z',
    },
  ],
  createdAt: '2026-08-24T12:00:00.000Z',
  updatedAt: '2026-08-24T12:00:00.000Z',
};

const order: Order = {
  id: orderId,
  orderNumber: 'ORD-20260824-00010203040506FF',
  customerId,
  customerName: 'Amina Rahman',
  customerEmail: 'amina@example.test',
  status: 'AWAITING_PAYMENT',
  subtotal: { amount: '12000', currency: 'BDT' },
  setupTotal: { amount: '500', currency: 'BDT' },
  total: { amount: '12500', currency: 'BDT' },
  notes: null,
  placedAt: '2026-08-24T12:00:00.000Z',
  completedAt: null,
  cancelledAt: null,
  items: [
    {
      id: '90000000-0000-4000-8000-000000000005',
      productId,
      productPriceId: priceId,
      productName: 'Starter Hosting',
      description: 'A focused hosting plan.',
      billingPeriod: 'MONTHLY',
      unitAmount: { amount: '12000', currency: 'BDT' },
      setupFee: { amount: '500', currency: 'BDT' },
      lineTotal: { amount: '12500', currency: 'BDT' },
      quantity: 1,
      requestedDomain: 'customer.example.test',
    },
  ],
  invoice: {
    id: '90000000-0000-4000-8000-000000000006',
    invoiceNumber: 'INV-20260824-00010203040506FF',
    status: 'UNPAID',
    total: { amount: '12500', currency: 'BDT' },
    balanceDue: { amount: '12500', currency: 'BDT' },
    dueAt: '2026-08-24T12:00:00.000Z',
  },
};

const customer: CustomerSummary = {
  id: customerId,
  customerNumber: 'CUST-0001',
  status: 'ACTIVE',
  accountStatus: 'ACTIVE',
  email: order.customerEmail,
  emailVerified: true,
  firstName: 'Amina',
  lastName: 'Rahman',
  companyName: null,
  createdAt: '2026-08-24T12:00:00.000Z',
  linkedCounts: { orders: 1, services: 0, invoices: 1, tickets: 0 },
};

const customerDetail: CustomerDetail = {
  ...customer,
  phone: null,
  addressLine1: '7 Test Avenue',
  addressLine2: null,
  city: 'Dhaka',
  region: null,
  postalCode: '1200',
  countryCode: 'BD',
  taxIdentifier: null,
  updatedAt: customer.createdAt,
  linked: {
    orders: [],
    services: [],
    invoices: [],
    payments: [],
    tickets: [],
    counts: { orders: 0, services: 0, invoices: 0, payments: 0, tickets: 0 },
  },
};

const otherId = '88000000-0000-4000-8000-000000000001';
const otherProduct: Product = {
  ...product,
  id: otherId,
  name: 'Other Fictional Plan',
  prices: [{ ...product.prices[0]!, id: otherId }],
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
function page<T>(
  rows: T[],
  query = { page: 1, pageSize: 20 },
  total = rows.length,
) {
  return {
    success: true,
    data: rows,
    pagination: {
      ...query,
      totalItems: total,
      totalPages: Math.ceil(total / query.pageSize),
    },
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
function fixture(
  handle?: (
    url: URL,
    init?: RequestInit,
  ) => Response | Promise<Response> | undefined,
) {
  const mock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const custom = handle?.(url, init);
    if (custom) return custom;
    if (url.pathname === '/orders')
      return json(
        page([order], {
          page: Number(url.searchParams.get('page') ?? 1),
          pageSize: Number(url.searchParams.get('pageSize') ?? 20),
        }),
      );
    if (url.pathname === '/customers')
      return json(page([customer], { page: 1, pageSize: 100 }));
    if (url.pathname === '/products')
      return json({ success: true, data: [product, otherProduct] });
    if (url.pathname.startsWith('/customers/'))
      return json({ success: true, data: customerDetail });
    if (url.pathname === '/settings')
      return json({ success: true, data: { timeZone: 'Asia/Dhaka' } });
    if (url.pathname === '/auth/csrf')
      return json({ success: true, data: { csrfToken: 'fictional-csrf' } });
    return json({ success: true, data: order });
  });
  vi.stubGlobal('fetch', mock);
  return mock;
}
function manager(input: Record<string, string | string[] | undefined> = {}) {
  return <AdminOrderManager selection={readAdminOrderQuery(input)} />;
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  push.mockReset();
});
describe('administrator order ledger', () => {
  it('reaches older orders beyond 100 with combined scope and authoritative counts', async () => {
    const rows = Array.from({ length: 40 }, (_, i) => ({
      ...order,
      id: '88000000-0000-4000-8000-' + String(i).padStart(12, '0'),
      orderNumber: 'ORD-OLDER-' + i,
    }));
    const mock = fixture((url) =>
      url.pathname === '/orders'
        ? json(page(rows, { page: 2, pageSize: 100 }, 140))
        : undefined,
    );
    render(
      manager({
        customerId,
        search: 'historical',
        status: 'AWAITING_PAYMENT',
        page: '2',
        pageSize: '100',
      }),
    );
    await screen.findByRole('button', { name: 'Review order ORD-OLDER-0' });
    expect(screen.getByText(/140 matching orders/).textContent).toContain(
      '101–140',
    );
    expect(screen.getByText(/140 matching orders/).textContent).toContain(
      'Page 2 of 2',
    );
    const read = mock.mock.calls.find(
      ([url]) => new URL(String(url)).pathname === '/orders',
    )!;
    expect(new URL(String(read[0])).searchParams.get('customerId')).toBe(
      customerId,
    );
    expect(new URL(String(read[0])).searchParams.get('status')).toBe(
      'AWAITING_PAYMENT',
    );
    expect(read[1]).toMatchObject({
      credentials: 'include',
      cache: 'no-store',
    });
    expect(read[1]?.signal).toBeInstanceOf(AbortSignal);
    expect(
      mock.mock.calls.some(
        ([url]) => new URL(String(url)).pathname === '/orders/' + orderId,
      ),
    ).toBe(false);
    expect(mock.mock.calls.every(([, init]) => !init?.method)).toBe(true);
  });
  it.each([
    'search',
    'status',
    'size',
    'clear',
    'customer',
    'previous',
    'next',
  ] as const)(
    'builds fixed URL navigation for %s with deliberate resets',
    async (control) => {
      const user = userEvent.setup();
      fixture((url) =>
        url.pathname === '/orders'
          ? json(page([order], { page: 3, pageSize: 1 }, 8))
          : undefined,
      );
      render(
        manager({
          customerId,
          search: 'historical',
          status: 'AWAITING_PAYMENT',
          page: '3',
          pageSize: '1',
        }),
      );
      await screen.findByRole('button', {
        name: 'Review order ' + order.orderNumber,
      });
      if (control === 'search') {
        await user.clear(screen.getByRole('searchbox'));
        await user.type(screen.getByRole('searchbox'), '  older domain  ');
        await user.click(screen.getByRole('button', { name: 'Search' }));
      }
      if (control === 'status')
        await user.selectOptions(
          screen.getByLabelText('Order status'),
          'PROCESSING',
        );
      if (control === 'size')
        await user.selectOptions(
          screen.getByLabelText('Orders per page'),
          '50',
        );
      if (control === 'clear')
        await user.click(
          screen.getByRole('button', { name: 'Clear ledger filters' }),
        );
      if (control === 'customer')
        await user.click(
          screen.getByRole('button', { name: 'Clear customer scope' }),
        );
      if (control === 'previous')
        await user.click(screen.getByRole('button', { name: 'Previous page' }));
      if (control === 'next')
        await user.click(screen.getByRole('button', { name: 'Next page' }));
      const href = String(push.mock.calls.at(-1)![0]);
      expect(href.startsWith('/admin/orders?')).toBe(true);
      const q = new URL(href, 'http://local.test').searchParams;
      expect(q.get('page')).toBe(
        control === 'previous' ? '2' : control === 'next' ? '4' : '1',
      );
      expect(q.get('customerId')).toBe(
        control === 'customer' ? null : customerId,
      );
      if (control === 'search') expect(q.get('search')).toBe('older domain');
      if (control === 'status') expect(q.get('status')).toBe('PROCESSING');
      if (control === 'size') expect(q.get('pageSize')).toBe('50');
      if (control === 'clear') {
        expect(q.get('search')).toBeNull();
        expect(q.get('status')).toBeNull();
        expect(q.get('pageSize')).toBe('20');
      }
      expect(push.mock.calls.at(-1)![1]).toEqual({ scroll: false });
    },
  );
  it('blocks invalid ledger reads, keeps invalid customer warning independent and recovers safely', async () => {
    const mock = fixture();
    const view = render(manager({ page: '0', customerId }));
    await screen.findByRole('heading', { name: 'Invalid order filters' });
    expect(
      mock.mock.calls.some(
        ([url]) => new URL(String(url)).pathname === '/orders',
      ),
    ).toBe(false);
    view.rerender(manager({ customerId: 'bad' }));
    await screen.findByRole('button', {
      name: 'Review order ' + order.orderNumber,
    });
    expect(screen.getByText(/The customer filter is invalid/)).toBeTruthy();
    expect(
      screen.getByText(/All customers \(unfiltered customer scope\)/),
    ).toBeTruthy();
  });
  it('does not clamp out-of-range and returns to first page with the same filters', async () => {
    const user = userEvent.setup();
    fixture((url) =>
      url.pathname === '/orders'
        ? json(page([], { page: 8, pageSize: 20 }, 140))
        : undefined,
    );
    render(manager({ search: 'older', page: '8' }));
    await screen.findByRole('heading', {
      name: 'This order page is out of range',
    });
    await user.click(
      screen.getByRole('button', { name: 'Return to first page' }),
    );
    expect(push).toHaveBeenCalledWith(
      '/admin/orders?page=1&pageSize=20&search=older',
      { scroll: false },
    );
  });
  it.each([
    'scope',
    'status',
    'numeric-money',
    'item-money',
    'invoice-money',
    'item',
    'metadata',
    'length',
    'duplicate',
  ] as const)(
    'rejects %s without displaying unvalidated order rows',
    async (kind) => {
      let response: unknown = page([order]);
      if (kind === 'scope')
        response = page([{ ...order, customerId: otherId }]);
      if (kind === 'status')
        response = page([{ ...order, status: 'REJECTED' }]);
      if (kind === 'numeric-money')
        response = {
          ...page([]),
          data: [{ ...order, total: { amount: 1, currency: 'BDT' } }],
        };
      if (kind === 'item-money')
        response = {
          ...page([order]),
          data: [
            {
              ...order,
              items: [
                {
                  ...order.items[0],
                  unitAmount: { amount: 1, currency: 'BDT' },
                },
              ],
            },
          ],
        };
      if (kind === 'invoice-money')
        response = {
          ...page([order]),
          data: [
            {
              ...order,
              invoice: {
                ...order.invoice,
                balanceDue: { amount: 1, currency: 'BDT' },
              },
            },
          ],
        };
      if (kind === 'item')
        response = {
          ...page([]),
          data: [
            {
              ...order,
              items: [
                { ...order.items[0], requestedDomain: 'https://unsafe.test' },
              ],
            },
          ],
        };
      if (kind === 'metadata')
        response = {
          ...page([order]),
          pagination: { page: 2, pageSize: 20, totalItems: 1, totalPages: 1 },
        };
      if (kind === 'length')
        response = page([order], { page: 1, pageSize: 20 }, 2);
      if (kind === 'duplicate') response = page([order, order]);
      fixture((url) =>
        url.pathname === '/orders' ? json(response) : undefined,
      );
      render(manager({ customerId, status: 'AWAITING_PAYMENT' }));
      await screen.findByRole('heading', {
        name: 'Order ledger could not be loaded',
      });
      expect(
        screen.queryByRole('button', {
          name: 'Review order ' + order.orderNumber,
        }),
      ).toBeNull();
      expect(() =>
        parseAdminOrderPage(
          response,
          readAdminOrderQuery({ customerId, status: 'AWAITING_PAYMENT' }).query,
        ),
      ).toThrow();
    },
  );
  it.each([403, 404, 503, 'json', 'network'] as const)(
    'sanitizes %s read failure and retries GET only',
    async (failure) => {
      const user = userEvent.setup();
      let attempts = 0;
      const mock = fixture((url) => {
        if (url.pathname !== '/orders') return;
        attempts++;
        if (attempts > 1) return json(page([order]));
        if (failure === 'network')
          return Promise.reject(new Error('private-network-value'));
        if (failure === 'json') return new Response('private-body-value');
        return json({ secret: 'private-body-value' }, failure);
      });
      render(manager());
      await screen.findByRole('heading', {
        name: 'Order ledger could not be loaded',
      });
      expect(screen.queryByText(/private-(network|body)-value/)).toBeNull();
      await user.click(
        screen.getByRole('button', { name: 'Retry order ledger' }),
      );
      await screen.findByRole('button', {
        name: 'Review order ' + order.orderNumber,
      });
      expect(attempts).toBe(2);
      expect(mock.mock.calls.every(([, init]) => !init?.method)).toBe(true);
    },
  );
  it('aborts and discards delayed query/back/unmount reads and clears selected review', async () => {
    const user = userEvent.setup();
    const slow = deferred<Response>();
    const detail = deferred<Response>();
    let calls = 0;
    const mock = fixture((url) => {
      if (url.pathname === '/orders') {
        calls++;
        return calls === 1 ? slow.promise : json(page([order]));
      }
      if (url.pathname === '/orders/' + orderId) return detail.promise;
    });
    const view = render(manager({ search: 'old' }));
    await waitFor(() => expect(calls).toBe(1));
    const old = mock.mock.calls.find(
      ([url]) => new URL(String(url)).pathname === '/orders',
    )!;
    view.rerender(manager({ search: 'new' }));
    await screen.findByRole('button', {
      name: 'Review order ' + order.orderNumber,
    });
    expect(old[1]?.signal?.aborted).toBe(true);
    await act(async () =>
      slow.resolve(json(page([{ ...order, orderNumber: 'LATE-ROW' }]))),
    );
    expect(screen.queryByText('LATE-ROW')).toBeNull();
    await user.click(
      screen.getByRole('button', { name: 'Review order ' + order.orderNumber }),
    );
    await waitFor(() =>
      expect(
        mock.mock.calls.some(
          ([url]) => new URL(String(url)).pathname === '/orders/' + orderId,
        ),
      ).toBe(true),
    );
    const detailRead = mock.mock.calls.find(
      ([url]) => new URL(String(url)).pathname === '/orders/' + orderId,
    )!;
    view.rerender(manager({ search: 'old' }));
    await waitFor(() => expect(calls).toBe(3));
    expect(detailRead[1]?.signal?.aborted).toBe(true);
    await act(async () => detail.resolve(json({ success: true, data: order })));
    expect(screen.queryByRole('region', { name: 'Order review' })).toBeNull();
    expect((screen.getByRole('searchbox') as HTMLInputElement).value).toBe(
      'old',
    );
    const last = mock.mock.calls
      .filter(([url]) => new URL(String(url)).pathname === '/orders')
      .at(-1)!;
    view.unmount();
    expect(last[1]?.signal?.aborted).toBe(true);
  });
  it('preserves independent creation fields/product/price/customer and submission key across query/customer changes and a failed submit', async () => {
    const user = userEvent.setup();
    let posted = 0;
    const mock = fixture((url, init) => {
      if (url.pathname === '/orders/admin' && init?.method === 'POST') {
        posted++;
        return json({}, 503);
      }
      if (url.pathname === '/orders') return json(page([]));
    });
    const view = render(manager({ customerId }));
    await screen.findByRole('button', { name: 'Create order and invoice' });
    await user.selectOptions(
      screen.getByLabelText('Customer', { exact: true }),
      customerId,
    );
    await user.selectOptions(
      screen.getByLabelText('Product', { exact: true }),
      otherProduct.id,
    );
    await user.selectOptions(
      screen.getByLabelText('Price', { exact: true }),
      otherId,
    );
    await user.type(
      screen.getByLabelText('Requested domain'),
      'unfinished.example.test',
    );
    await user.type(screen.getByLabelText('Internal note'), 'Unfinished note');
    await user.click(
      screen.getByRole('button', { name: 'Create order and invoice' }),
    );
    await waitFor(() =>
      expect(
        (
          screen.getByRole('button', {
            name: 'Create order and invoice',
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(false),
    );
    expect(posted).toBe(1);
    view.rerender(
      manager({ customerId: otherId, search: 'older', status: 'PAID' }),
    );
    await screen.findByRole('heading', { name: 'No matching orders' });
    expect(
      (screen.getByLabelText('Customer', { exact: true }) as HTMLSelectElement)
        .value,
    ).toBe(customerId);
    expect(
      (screen.getByLabelText('Product', { exact: true }) as HTMLSelectElement)
        .value,
    ).toBe(otherProduct.id);
    expect(
      (screen.getByLabelText('Price', { exact: true }) as HTMLSelectElement)
        .value,
    ).toBe(otherId);
    expect(
      (screen.getByLabelText('Requested domain') as HTMLInputElement).value,
    ).toBe('unfinished.example.test');
    expect(
      (screen.getByLabelText('Internal note') as HTMLInputElement).value,
    ).toBe('Unfinished note');
    await user.click(
      screen.getByRole('button', { name: 'Create order and invoice' }),
    );
    await waitFor(() => expect(posted).toBe(2));
    const writes = mock.mock.calls.filter(
      ([, init]) => init?.method === 'POST',
    );
    const body = JSON.parse(String(writes[0]![1]?.body));
    expect(JSON.parse(String(writes[1]![1]?.body))).toEqual(body);
    expect(body).toEqual({
      customerId,
      productId: otherProduct.id,
      priceId: otherId,
      requestedDomain: 'unfinished.example.test',
      notes: 'Unfinished note',
      submissionKey: expect.stringMatching(/^[0-9a-f-]{36}$/),
    });
    expect(writes[0]![1]?.headers).toEqual({
      'Content-Type': 'application/json',
      'X-CSRF-Token': 'fictional-csrf',
    });
    expect(
      mock.mock.calls.filter(
        ([url]) => new URL(String(url)).pathname === '/products',
      ),
    ).toHaveLength(1);
  });
  it('reconciles latest query after successful creation without injecting rows or retrying a write on read failure', async () => {
    const user = userEvent.setup();
    const post = deferred<Response>();
    let started = false;
    const mock = fixture((url, init) => {
      if (init?.method === 'POST' && url.pathname === '/orders/admin') {
        started = true;
        return post.promise;
      }
      if (url.pathname === '/orders')
        return started ? json({}, 503) : json(page([order]));
    });
    const view = render(manager({ search: 'old' }));
    await screen.findByRole('button', {
      name: 'Review order ' + order.orderNumber,
    });
    await user.selectOptions(
      screen.getByLabelText('Customer', { exact: true }),
      customerId,
    );
    await user.selectOptions(
      screen.getByLabelText('Price', { exact: true }),
      priceId,
    );
    await user.type(
      screen.getByLabelText('Requested domain'),
      'new.example.test',
    );
    await user.click(
      screen.getByRole('button', { name: 'Create order and invoice' }),
    );
    view.rerender(manager({ search: 'new', status: 'PAID' }));
    await act(async () =>
      post.resolve(
        json({
          success: true,
          data: {
            order: { ...order, id: otherId, orderNumber: 'OUT-OF-SCOPE' },
            duplicate: false,
          },
        }),
      ),
    );
    await screen.findByText(/OUT-OF-SCOPE created with unpaid invoice/);
    await screen.findByRole('heading', {
      name: 'Order ledger could not be loaded',
    });
    expect(
      screen.queryByRole('button', { name: 'Review order OUT-OF-SCOPE' }),
    ).toBeNull();
    const last = mock.mock.calls
      .filter(
        ([url, init]) =>
          new URL(String(url)).pathname === '/orders' && !init?.method,
      )
      .at(-1)!;
    expect(new URL(String(last[0])).searchParams.get('search')).toBe('new');
    expect(new URL(String(last[0])).searchParams.get('status')).toBe('PAID');
    await user.click(
      screen.getByRole('button', { name: 'Retry order ledger' }),
    );
    await screen.findByRole('heading', {
      name: 'Order ledger could not be loaded',
    });
    expect(
      mock.mock.calls.filter(([, init]) => init?.method === 'POST'),
    ).toHaveLength(1);
  });
  it('retains a clicked status target across pending query changes and never resurrects review', async () => {
    const user = userEvent.setup();
    const patch = deferred<Response>();
    const detail = deferred<Response>();
    let started = false;
    const mock = fixture((url, init) => {
      if (init?.method === 'PATCH') {
        started = true;
        return patch.promise;
      }
      if (url.pathname === '/orders/' + orderId) return detail.promise;
      if (url.pathname === '/orders') return json(page(started ? [] : [order]));
    });
    const view = render(manager({ status: 'AWAITING_PAYMENT' }));
    await user.click(
      await screen.findByRole('button', {
        name: 'Review order ' + order.orderNumber,
      }),
    );
    await waitFor(() =>
      expect(
        mock.mock.calls.some(
          ([url]) => new URL(String(url)).pathname === '/orders/' + orderId,
        ),
      ).toBe(true),
    );
    const read = mock.mock.calls.find(
      ([url]) => new URL(String(url)).pathname === '/orders/' + orderId,
    )!;
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(read[1]?.signal?.aborted).toBe(true);
    view.rerender(manager({ search: 'latest', status: 'PAID' }));
    await act(async () => detail.resolve(json({ success: true, data: order })));
    await act(async () =>
      patch.resolve(
        json({ success: true, data: { ...order, status: 'CANCELLED' } }),
      ),
    );
    await screen.findByText(order.orderNumber + ' moved to cancelled.');
    await screen.findByRole('heading', { name: 'No matching orders' });
    expect(screen.queryByRole('region', { name: 'Order review' })).toBeNull();
    const writes = mock.mock.calls.filter(
      ([, init]) => init?.method === 'PATCH',
    );
    expect(writes).toHaveLength(1);
    expect(new URL(String(writes[0]![0])).pathname).toBe(
      '/orders/' + orderId + '/status',
    );
    expect(JSON.parse(String(writes[0]![1]?.body))).toEqual({
      status: 'CANCELLED',
    });
    expect(writes[0]![1]?.headers).toEqual({
      'Content-Type': 'application/json',
      'X-CSRF-Token': 'fictional-csrf',
    });
    const last = mock.mock.calls
      .filter(([url]) => new URL(String(url)).pathname === '/orders')
      .at(-1)!;
    expect(new URL(String(last[0])).searchParams.get('search')).toBe('latest');
  });
  it('shows honestly empty customer history', async () => {
    fixture((url) => (url.pathname === '/orders' ? json(page([])) : undefined));
    render(manager({ customerId }));
    await screen.findByRole('heading', { name: 'No orders for this customer' });
  });
});
