import type { Service } from '@webhost-billing/shared';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  readCustomerServiceQuery,
  type CustomerServiceQuery,
} from '../../lib/customer-service-ledger-query';
import { CustomerServiceList } from './customer-service-list';

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
const service: Service = {
  id: '90000000-0000-4000-8000-000000000001',
  customerId: '90000000-0000-4000-8000-000000000002',
  customerName: 'Fictional Customer',
  customerEmail: 'current@example.test',
  orderId: null,
  orderNumber: null,
  orderItemId: null,
  productId: '90000000-0000-4000-8000-000000000003',
  productPriceId: '90000000-0000-4000-8000-000000000004',
  productName: 'Historical Hosting',
  productDescription: null,
  server: {
    id: '90000000-0000-4000-8000-000000000005',
    name: 'Fictional Server',
    hostname: 'server.example.test',
    status: 'ACTIVE',
    adapterKey: 'fake',
  },
  status: 'CANCELLED',
  domain: 'older.example.test',
  controlPanelUsername: null,
  externalAccountId: null,
  billingPeriod: 'MONTHLY',
  recurringAmount: { amount: '25000', currency: 'BDT' },
  startedAt: '2026-01-01T00:00:00Z',
  nextDueAt: '2026-02-01T00:00:00Z',
  activatedAt: null,
  suspendedAt: null,
  suspensionReason: null,
  provisioningFailureReason: null,
  cancelledAt: null,
  cancellationReason: null,
  terminatedAt: null,
  terminationReason: null,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}
function page(
  data: Service[] = [service],
  query: CustomerServiceQuery = { page: 1, pageSize: 20 },
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
function selection(query: Partial<CustomerServiceQuery> = {}) {
  return readCustomerServiceQuery(
    Object.fromEntries(
      Object.entries(query).map(([key, value]) => [key, String(value)]),
    ),
  );
}
function history(query: Partial<CustomerServiceQuery> = {}) {
  return <CustomerServiceList selection={selection(query)} />;
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

describe('customer service inventory', () => {
  it('reads an older page beyond 100 with combined filters, authoritative counts and original display/routes', async () => {
    const query: CustomerServiceQuery = {
      page: 6,
      pageSize: 20,
      search: 'old',
      status: 'CANCELLED',
    };
    const rows = Array.from({ length: 20 }, (_, index) => ({
      ...service,
      id: `90000000-0000-4000-8002-${String(index).padStart(12, '0')}`,
      domain: `older-${index}.example.test`,
    }));
    const mock = vi.fn<
      (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
    >(async () => json(page(rows, query, 140)));
    vi.stubGlobal('fetch', mock);
    render(history(query));
    await screen.findByText('older-19.example.test');
    expect(screen.getByText(/140 matching services/).textContent).toContain(
      '101–120',
    );
    expect(screen.getByText(/140 matching services/).textContent).toContain(
      'Page 6 of 7',
    );
    const request = new URL(String(mock.mock.calls[0]?.[0]));
    expect(request.pathname).toBe('/services/my');
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
    expect(screen.getAllByText('BDT 250.00')).toHaveLength(20);
    expect(screen.getAllByText(service.server.hostname)).toHaveLength(20);
    expect(screen.getAllByText('Pending setup')).toHaveLength(20);
    expect(screen.getAllByRole('link')).toHaveLength(20);
    screen
      .getAllByRole('link')
      .forEach((link, index) =>
        expect(link.getAttribute('href')).toBe(
          '/portal/services/' + rows[index]!.id,
        ),
      );
    expect(mock).toHaveBeenCalledTimes(1);
    expect(
      screen.getByText(/Stored application state does not verify/),
    ).toBeDefined();
  });
  it.each(['search', 'status', 'size', 'next', 'previous', 'clear'] as const)(
    'applies %s navigation with only fixed local filters',
    async (action) => {
      const user = userEvent.setup();
      const query: CustomerServiceQuery = {
        page: 6,
        pageSize: 20,
        search: 'old',
        status: 'CANCELLED',
      };
      const rows = Array.from({ length: 20 }, (_, index) => ({
        ...service,
        id: `90000000-0000-4000-8002-${String(index).padStart(12, '0')}`,
      }));
      vi.stubGlobal(
        'fetch',
        vi.fn<
          (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
        >(async () => json(page(rows, query, 140))),
      );
      render(history(query));
      await screen.findByText(/140 matching services/);
      let next: CustomerServiceQuery = { ...query };
      if (action === 'search') {
        await user.clear(screen.getByRole('searchbox'));
        await user.type(screen.getByRole('searchbox'), 'new');
        await user.click(screen.getByRole('button', { name: 'Search' }));
        next = { ...query, search: 'new', page: 1 };
      }
      if (action === 'status') {
        await user.selectOptions(
          screen.getByLabelText('Service status'),
          'ACTIVE',
        );
        next = { ...query, status: 'ACTIVE', page: 1 };
      }
      if (action === 'size') {
        await user.selectOptions(
          screen.getByLabelText('Services per page'),
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
          screen.getByRole('button', { name: 'Clear service filters' }),
        );
        next = { page: 1, pageSize: 20 };
      }
      const href = push.mock.calls[0]?.[0] as string;
      expect(href.startsWith('/portal/services?')).toBe(true);
      expect(
        readCustomerServiceQuery(new URLSearchParams(href.split('?')[1])).query,
      ).toEqual(next);
      expect(push.mock.calls[0]?.[1]).toEqual({ scroll: false });
      expect(screen.queryByText(/140 matching services/)).toBeNull();
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
      <CustomerServiceList
        selection={readCustomerServiceQuery({
          page: ['1', '2'],
          customerId: 'other',
        })}
      />,
    );
    await screen.findByRole('heading', { name: 'Invalid service filters' });
    expect(mock).not.toHaveBeenCalled();
    await user.click(
      screen.getByRole('button', { name: 'Clear service filters' }),
    );
    expect(push).toHaveBeenCalledWith('/portal/services?page=1&pageSize=20', {
      scroll: false,
    });
    mock.mockResolvedValue(json(page()));
    view.rerender(
      <CustomerServiceList
        selection={readCustomerServiceQuery({
          customerId: 'other',
          serverId: 'other-server',
          next: 'https://example.test',
        })}
      />,
    );
    await screen.findByText(service.domain!);
    expect(
      new URL(String(mock.mock.calls[0]?.[0])).searchParams.has('customerId'),
    ).toBe(false);
    expect(
      new URL(String(mock.mock.calls[0]?.[0])).searchParams.has('serverId'),
    ).toBe(false);
  });
  it('preserves an out-of-range page without clamping and recovers with its filters', async () => {
    const user = userEvent.setup();
    const query: CustomerServiceQuery = {
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
      name: 'This service page is out of range',
    });
    expect(screen.getByText(/140 matching services/).textContent).toContain(
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
      readCustomerServiceQuery(
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
        name: kind === 'empty' ? 'No hosting services' : 'No matching services',
      });
      expect(screen.queryAllByRole('link')).toHaveLength(0);
    },
  );
  it.each([
    'numeric money',
    'server',
    'unsafe domain',
    'bad status',
    'duplicate',
    'missing row',
    'bad metadata',
    'nullable date',
    'nullable reference',
    'fractional money',
    'server secret',
  ] as const)('rejects %s without displaying untrusted cards', async (kind) => {
    let body: unknown = page();
    if (kind === 'numeric money')
      body = page([
        {
          ...service,
          recurringAmount: { amount: 7 as unknown as string, currency: 'BDT' },
        },
      ]);
    if (kind === 'server')
      body = page([{ ...service, server: { ...service.server, id: 'bad' } }]);
    if (kind === 'unsafe domain')
      body = page([{ ...service, domain: 'javascript:alert(1)' }]);
    if (kind === 'bad status')
      body = page([{ ...service, status: 'ACTIVE' }], {
        page: 1,
        pageSize: 20,
        status: 'CANCELLED',
      });
    if (kind === 'duplicate') body = page([service, service]);
    if (kind === 'missing row') body = page([], undefined, 1);
    if (kind === 'bad metadata')
      body = {
        ...page(),
        pagination: { page: 2, pageSize: 20, totalItems: 1, totalPages: 1 },
      };
    if (kind === 'nullable date')
      body = page([{ ...service, activatedAt: 'not-a-date' }]);
    if (kind === 'nullable reference')
      body = page([{ ...service, orderId: 'not-an-id' }]);
    if (kind === 'fractional money')
      body = page([
        { ...service, recurringAmount: { amount: '1.1', currency: 'BDT' } },
      ]);
    if (kind === 'server secret')
      body = page([
        {
          ...service,
          server: {
            ...service.server,
            ...{ apiToken: 'SECRET fictional response' },
          },
        },
      ]);
    vi.stubGlobal(
      'fetch',
      vi.fn<
        (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
      >(async () => json(body)),
    );
    render(history(kind === 'bad status' ? { status: 'CANCELLED' } : {}));
    await screen.findByRole('heading', {
      name: 'Service inventory could not be loaded',
    });
    expect(screen.queryByText(service.domain!)).toBeNull();
    expect(screen.queryByText(/matching services ·/)).toBeNull();
    expect(screen.queryByText(/SECRET/)).toBeNull();
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
        name: 'Service inventory could not be loaded',
      });
      expect(screen.queryByText(/SECRET/)).toBeNull();
      await user.click(
        screen.getByRole('button', { name: 'Retry service inventory' }),
      );
      await screen.findByText(service.domain!);
      expect(mock).toHaveBeenCalledTimes(2);
      expect(
        mock.mock.calls.every(
          (call) => !(call[1] as RequestInit | undefined)?.method,
        ),
      ).toBe(true);
      expect(screen.getByRole('heading', { name: 'Service inventory' })).toBe(
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
      return json(page([{ ...service, domain: 'current.example.test' }]));
    });
    vi.stubGlobal('fetch', mock);
    const view = render(history({ search: 'old' }));
    await user.click(
      await screen.findByRole('button', { name: 'Retry service inventory' }),
    );
    await waitFor(() => expect(calls).toBe(2));
    const retrySignal = mock.mock.calls[1]?.[1]?.signal;
    view.rerender(history({ search: 'new' }));
    await screen.findByText('current.example.test');
    expect(retrySignal?.aborted).toBe(true);
    await act(async () =>
      retry.resolve(
        json(page([{ ...service, domain: 'stale-retry.example.test' }])),
      ),
    );
    expect(screen.queryByText('stale-retry.example.test')).toBeNull();
    expect(screen.getByText('current.example.test')).toBeDefined();
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
    await screen.findByText(service.domain!);
    expect(oldSignal?.aborted).toBe(true);
    await act(async () =>
      slow.resolve(json(page([{ ...service, domain: 'stale.example.test' }]))),
    );
    expect(screen.queryByText('stale.example.test')).toBeNull();
    view.rerender(history({ search: 'old' }));
    await waitFor(() => expect(calls).toBe(3));
    expect((screen.getByRole('searchbox') as HTMLInputElement).value).toBe(
      'old',
    );
    const lastSignal = (mock.mock.calls.at(-1)?.[1] as RequestInit).signal;
    view.unmount();
    expect(lastSignal?.aborted).toBe(true);
  });
  it('renders nullable domain/account facts without inferred panel state or new links', async () => {
    const mock = vi.fn<
      (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
    >(async () => json(page([{ ...service, domain: null }])));
    vi.stubGlobal('fetch', mock);
    render(history());
    await screen.findByText('Domain unavailable');
    expect(screen.getByText('Pending setup')).toBeDefined();
    expect(screen.getByRole('link').getAttribute('href')).toBe(
      '/portal/services/' + service.id,
    );
    expect(mock).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: /panel login/i })).toBeNull();
  });

  it('preserves recurring amounts above the safe JavaScript number range', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        json(
          page([
            {
              ...service,
              recurringAmount: { amount: '9007199254740993', currency: 'BDT' },
            },
          ]),
        ),
      ),
    );
    render(history());
    await screen.findByText('BDT 90,071,992,547,409.93');
  });

  it('aborts a pending read on unmount and discards its eventual completion', async () => {
    const slow = deferred<Response>();
    const mock = vi.fn<
      (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
    >(async () => slow.promise);
    vi.stubGlobal('fetch', mock);
    const view = render(history());
    await waitFor(() => expect(mock).toHaveBeenCalledTimes(1));
    const signal = mock.mock.calls[0]?.[1]?.signal;
    view.unmount();
    expect(signal?.aborted).toBe(true);
    await act(async () => slow.resolve(json(page())));
    expect(screen.queryByText(service.domain!)).toBeNull();
  });
});
