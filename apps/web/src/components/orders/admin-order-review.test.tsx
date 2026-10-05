import type { Order } from '@webhost-billing/shared';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdminOrderReview } from './admin-order-review';

const id = '82000000-0000-4000-8000-000000000001';
const customerId = '82000000-0000-4000-8000-000000000002';
const otherId = '82000000-0000-4000-8000-000000000003';
const invoiceId = '82000000-0000-4000-8000-000000000004';
const money = { amount: '9007199254740993', currency: 'BDT' };
const order: Order = {
  id,
  customerId,
  orderNumber: 'ORD-REVIEW-82',
  customerName: 'Fictional Customer',
  customerEmail: 'review82@example.test',
  status: 'PROCESSING',
  subtotal: { ...money, amount: '9007199254740493' },
  setupTotal: { ...money, amount: '500' },
  total: money,
  notes: '<b>Fictional note</b>',
  placedAt: '2026-10-04T02:00:00.000Z',
  completedAt: null,
  cancelledAt: null,
  items: [
    {
      id,
      productId: id,
      productPriceId: otherId,
      productName: 'Historical Starter',
      description: 'Original description',
      billingPeriod: 'MONTHLY',
      quantity: 1,
      requestedDomain: 'first.example.test',
      unitAmount: { ...money, amount: '12000' },
      setupFee: { ...money, amount: '500' },
      lineTotal: { ...money, amount: '12500' },
    },
    {
      id: otherId,
      productId: id,
      productPriceId: otherId,
      productName: 'Historical Extra',
      description: null,
      billingPeriod: 'ANNUAL',
      quantity: 1,
      requestedDomain: 'second.example.test',
      unitAmount: { ...money, amount: '9007199254728493' },
      setupFee: { ...money, amount: '0' },
      lineTotal: { ...money, amount: '9007199254728493' },
    },
  ],
  invoice: {
    id: invoiceId,
    invoiceNumber: 'INV-REVIEW-82',
    status: 'PAID',
    total: money,
    balanceDue: { ...money, amount: '0' },
    dueAt: '2026-10-05T02:00:00.000Z',
  },
};
const response = (data: unknown = order, status = 200) =>
  new Response(JSON.stringify({ success: status === 200, data }), { status });
afterEach(() => vi.unstubAllGlobals());
function mockRead(detail: () => Promise<Response> = async () => response()) {
  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      void init;
      return String(input).endsWith('/settings')
        ? response({ timeZone: 'America/New_York' })
        : detail();
    },
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('read-only administrator order review', () => {
  it('renders validated historical items, lossless amounts, independent states and fixed links', async () => {
    const fetchMock = mockRead();
    render(
      <AdminOrderReview
        orderId={id}
        customerId={customerId}
        onClose={vi.fn()}
      />,
    );
    expect(
      screen.getByRole('status', { name: 'Loading order review' }),
    ).toBeTruthy();
    expect(document.activeElement?.textContent).toBe('Order review');
    await screen.findByText(order.orderNumber);
    expect(
      screen.getByRole('link', { name: 'View customer' }).getAttribute('href'),
    ).toBe(`/admin/customers/${customerId}`);
    expect(
      screen.getByRole('link', { name: 'View invoice' }).getAttribute('href'),
    ).toBe(`/admin/invoices/${invoiceId}`);
    expect(screen.getByText('Processing')).toBeTruthy();
    expect(screen.getByText('Paid')).toBeTruthy();
    expect(
      screen.getByText(/Payment is not proof of hosting provisioning/),
    ).toBeTruthy();
    expect(screen.getByText('3 Oct 2026, 22:00')).toBeTruthy();
    expect(screen.getByText('4 Oct 2026, 22:00')).toBeTruthy();
    expect(
      screen.getByText(/Fictional Customer · review82@example.test/),
    ).toBeTruthy();
    expect(screen.getByText('INV-REVIEW-82')).toBeTruthy();
    expect(screen.getByText('BDT 90,071,992,547,404.93')).toBeTruthy();
    expect(screen.getAllByText('BDT 90,071,992,547,409.93')).toHaveLength(2);
    const firstItem = within(
      screen.getByRole('article', { name: 'Order item 1' }),
    );
    for (const value of [
      'Historical Starter',
      'Original description',
      'Monthly',
      '1',
      'BDT 120.00',
      'BDT 5.00',
      'BDT 125.00',
    ])
      expect(firstItem.getByText(value)).toBeTruthy();
    const secondItem = within(
      screen.getByRole('article', { name: 'Order item 2' }),
    );
    for (const value of ['Historical Extra', 'Annual', '1', 'BDT 0.00'])
      expect(secondItem.getByText(value)).toBeTruthy();
    expect(
      within(screen.getByRole('article', { name: 'Order item 1' })).getByText(
        'first.example.test',
      ),
    ).toBeTruthy();
    expect(
      within(
        screen.getByRole('article', { name: 'Order item 2' }),
      ).getAllByText('BDT 90,071,992,547,284.93'),
    ).toHaveLength(2);
    expect(
      screen.getByText('<b>Fictional note</b>').querySelector('b'),
    ).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.map(([input]) => String(input))).toEqual([
      expect.stringMatching(`/orders/${id}$`),
      expect.stringMatching('/settings$'),
    ]);
    expect(
      fetchMock.mock.calls.every(
        ([, init]) => !init?.method && init?.credentials === 'include',
      ),
    ).toBe(true);
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
  });
  it('omits absent notes and does not invent current service state for a completed order', async () => {
    mockRead(async () =>
      response({ ...order, notes: null, status: 'COMPLETED' }),
    );
    render(<AdminOrderReview orderId={id} onClose={vi.fn()} />);
    await screen.findByText(order.orderNumber);
    expect(screen.queryByText('Internal order notes')).toBeNull();
    expect(screen.queryByText('Active')).toBeNull();
    expect(screen.queryByRole('link', { name: /service/i })).toBeNull();
  });
  it.each([403, 404])(
    'shows unavailable for HTTP %s without exposing response text',
    async (status) => {
      const mock = mockRead(async () =>
        response('private-provider-secret', status),
      );
      render(<AdminOrderReview orderId={id} onClose={vi.fn()} />);
      await screen.findByRole('heading', { name: 'Order review unavailable' });
      expect(screen.queryByText('private-provider-secret')).toBeNull();
      expect(screen.queryByRole('link')).toBeNull();
      expect(mock).toHaveBeenCalledTimes(1);
    },
  );
  it.each([
    { ...order, id: otherId },
    { ...order, customerId: otherId },
  ])('rejects mismatched order or current customer context', async (detail) => {
    mockRead(async () => response(detail));
    render(
      <AdminOrderReview
        orderId={id}
        customerId={customerId}
        onClose={vi.fn()}
      />,
    );
    await screen.findByRole('heading', { name: 'Order review unavailable' });
    expect(screen.queryByText(detail.orderNumber)).toBeNull();
    expect(screen.queryByRole('link')).toBeNull();
  });
  it.each(['//evil.example', 'not-a-uuid'])(
    'does not dispatch malformed selected identity %s',
    async (invalid) => {
      const mock = mockRead();
      render(<AdminOrderReview orderId={invalid} onClose={vi.fn()} />);
      await screen.findByRole('heading', { name: 'Order review unavailable' });
      expect(mock).not.toHaveBeenCalled();
    },
  );
  it.each([
    'invalid identifier',
    'numeric money',
    'bad timezone',
    'malformed JSON',
  ])('fails closed for %s', async (scenario) => {
    const mock = mockRead(async () =>
      scenario === 'malformed JSON'
        ? new Response('not-json')
        : response(
            scenario === 'numeric money'
              ? { ...order, total: { ...money, amount: 123 } }
              : {
                  ...order,
                  invoice: { ...order.invoice, id: '//evil.example' },
                },
          ),
    );
    if (scenario === 'bad timezone')
      mock.mockImplementation(async (input) =>
        String(input).endsWith('/settings')
          ? response({ timeZone: 'Invalid/Zone' })
          : response(),
      );
    render(<AdminOrderReview orderId={id} onClose={vi.fn()} />);
    await screen.findByRole('heading', {
      name: 'Order review could not be loaded',
    });
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.queryByText(order.orderNumber)).toBeNull();
  });
  it('retries only reads after failure and closes by keyboard', async () => {
    let fail = true;
    const mock = mockRead(async () =>
      fail ? response('secret', 503) : response(),
    );
    const close = vi.fn();
    render(<AdminOrderReview orderId={id} onClose={close} />);
    await screen.findByRole('heading', {
      name: 'Order review could not be loaded',
    });
    fail = false;
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Retry order review' }));
    await screen.findByText(order.orderNumber);
    expect(mock).toHaveBeenCalledTimes(3);
    screen.getByRole('button', { name: 'Close order review' }).focus();
    await userEvent.setup().keyboard('{Enter}');
    expect(close).toHaveBeenCalledTimes(1);
    expect(mock.mock.calls.every(([, init]) => !init?.method)).toBe(true);
  });
  it('discards delayed results when selecting another order and on unmount', async () => {
    let finish!: (value: Response) => void;
    const mock = mockRead(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const view = render(<AdminOrderReview orderId={id} onClose={vi.fn()} />);
    await waitFor(() => expect(mock).toHaveBeenCalledTimes(1));
    mock.mockImplementation(async (input) =>
      String(input).endsWith('/settings')
        ? response({ timeZone: 'Asia/Dhaka' })
        : response({ ...order, id: otherId, orderNumber: 'ORD-CURRENT' }),
    );
    view.rerender(<AdminOrderReview orderId={otherId} onClose={vi.fn()} />);
    await screen.findByText('ORD-CURRENT');
    await act(async () => finish(response()));
    expect(screen.queryByText(order.orderNumber)).toBeNull();
    expect(mock).toHaveBeenCalledTimes(3);
    mock.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    view.rerender(<AdminOrderReview orderId={id} onClose={vi.fn()} />);
    await waitFor(() => expect(mock).toHaveBeenCalledTimes(4));
    view.unmount();
    await act(async () => finish(response()));
    expect(mock).toHaveBeenCalledTimes(4);
  });
});
