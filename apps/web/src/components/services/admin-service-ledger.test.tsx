import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Service, ServiceListQuery } from '@webhost-billing/shared';
import {
  readAdminServiceQuery,
  parseAdminServicePage,
} from '../../lib/admin-service-ledger-query';
import { AdminServiceManager } from './admin-service-manager';
import { AdminServicesWorkspace } from './admin-services-workspace';
const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
const id = '86000000-0000-4000-8000-000000000001';
const customerId = '86000000-0000-4000-8000-000000000002';
const otherId = '86000000-0000-4000-8000-000000000003';
const service: Service = {
  id,
  customerId,
  customerName: '<b>Current Profile</b>',
  customerEmail: 'service86@example.test',
  orderId: null,
  orderNumber: null,
  orderItemId: null,
  productId: '86000000-0000-4000-8000-000000000004',
  productPriceId: '86000000-0000-4000-8000-000000000005',
  productName: 'Historical Hosting',
  productDescription: '<script>Fictional text</script>',
  server: {
    id: '86000000-0000-4000-8000-000000000006',
    name: 'Fictional Server',
    hostname: 'server86.example.test',
    status: 'ACTIVE',
    adapterKey: 'fake-panel',
  },
  status: 'PENDING',
  domain: 'service86.example.test',
  controlPanelUsername: null,
  externalAccountId: null,
  billingPeriod: 'MONTHLY',
  recurringAmount: { amount: '9007199254740993', currency: 'BDT' },
  startedAt: '2026-10-03T20:00:00.000Z',
  nextDueAt: '2026-11-03T20:00:00.000Z',
  activatedAt: null,
  suspendedAt: null,
  suspensionReason: null,
  provisioningFailureReason: null,
  cancelledAt: null,
  cancellationReason: null,
  terminatedAt: null,
  terminationReason: null,
  createdAt: '2026-10-03T20:00:00.000Z',
  updatedAt: '2026-10-03T20:00:00.000Z',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
function page(
  rows: Service[],
  query: Pick<ServiceListQuery, 'page' | 'pageSize'> = {
    page: 1,
    pageSize: 20,
  },
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
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function fixture(
  custom?: (
    url: URL,
    init?: RequestInit,
  ) => Promise<Response> | Response | undefined,
) {
  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      const result = custom?.(url, init);
      if (result) return result;
      if (url.pathname === '/services/setup-options')
        return json({
          success: true,
          data: {
            servers: [service.server],
            orderItems: [
              {
                orderItemId: otherId,
                orderId: otherId,
                orderNumber: 'ORDER-87',
                customerId,
                customerName: service.customerName,
                productName: service.productName,
                domain: 'new87.example.test',
                billingPeriod: 'MONTHLY',
                recurringAmount: service.recurringAmount,
              },
            ],
          },
        });
      if (url.pathname === '/services')
        return json(
          page([service], {
            page: Number(url.searchParams.get('page') ?? 1),
            pageSize: Number(url.searchParams.get('pageSize') ?? 100),
          }),
        );
      if (url.pathname === '/settings')
        return json({ success: true, data: { timeZone: 'Asia/Dhaka' } });
      if (url.pathname.startsWith('/customers/'))
        return json({
          success: true,
          data: {
            id: customerId,
            firstName: 'Fictional',
            lastName: 'Customer',
            customerNumber: 'CUSTOMER-87',
          },
        });
      if (url.pathname === '/auth/csrf')
        return json({ success: true, data: { csrfToken: 'fictional-csrf' } });
      if (url.pathname === '/hosting-panel/operations')
        return json({
          success: true,
          data: [],
          pagination: { page: 1, pageSize: 100, totalItems: 0, totalPages: 0 },
        });
      return json({ success: true, data: service });
    },
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}
function manager(input: Record<string, string | string[] | undefined> = {}) {
  return <AdminServiceManager selection={readAdminServiceQuery(input)} />;
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  push.mockReset();
});
describe('administrator service inventory', () => {
  it('reaches older rows beyond 100 with authoritative counts, cookie/no-store GET and combined applied scope', async () => {
    const fetchMock = fixture((url) =>
      url.pathname === '/services'
        ? json(
            page(
              [{ ...service, status: 'PROVISION_FAILED' }],
              { page: 6, pageSize: 20 },
              101,
            ),
          )
        : undefined,
    );
    render(
      manager({
        page: '6',
        pageSize: '20',
        search: 'Historical',
        status: 'PROVISION_FAILED',
        customerId,
      }),
    );
    await screen.findByRole('button', { name: `Review ${service.domain}` });
    expect(
      screen.getByText(/101 matching services · 101–101 · Page 6 of 6/),
    ).toBeTruthy();
    const read = fetchMock.mock.calls.find(
      ([url]) => new URL(String(url)).pathname === '/services',
    )!;
    expect(new URL(String(read[0])).searchParams.get('status')).toBe(
      'PROVISION_FAILED',
    );
    expect(new URL(String(read[0])).searchParams.get('customerId')).toBe(
      customerId,
    );
    expect(read[1]).toMatchObject({
      credentials: 'include',
      cache: 'no-store',
    });
    expect(read[1]?.signal).toBeInstanceOf(AbortSignal);
    expect(fetchMock.mock.calls.every(([, init]) => !init?.method)).toBe(true);
    expect(
      fetchMock.mock.calls.some(([url]) =>
        String(url).endsWith('/services/' + id),
      ),
    ).toBe(false);
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
    'reconstructs %s navigation, resets filters to page one and preserves independent customer scope',
    async (control) => {
      const user = userEvent.setup();
      fixture((url) =>
        url.pathname === '/services'
          ? json(
              page(
                [{ ...service, status: 'ACTIVE' }],
                { page: 6, pageSize: 1 },
                140,
              ),
            )
          : undefined,
      );
      render(
        manager({
          page: '6',
          pageSize: '1',
          search: 'old',
          status: 'ACTIVE',
          customerId,
        }),
      );
      await screen.findByRole('button', { name: `Review ${service.domain}` });
      if (control === 'search') {
        await user.clear(screen.getByRole('searchbox'));
        await user.type(screen.getByRole('searchbox'), ' account-87 ');
        await user.click(screen.getByRole('button', { name: 'Search' }));
      }
      if (control === 'status')
        await user.selectOptions(
          screen.getByLabelText('Service status'),
          'CANCELLED',
        );
      if (control === 'size')
        await user.selectOptions(
          screen.getByLabelText('Services per page'),
          '50',
        );
      if (control === 'clear')
        await user.click(
          screen.getByRole('button', { name: 'Clear inventory filters' }),
        );
      if (control === 'customer')
        await user.click(
          screen.getByRole('button', { name: 'Clear customer scope' }),
        );
      if (control === 'previous')
        await user.click(screen.getByRole('button', { name: 'Previous page' }));
      if (control === 'next')
        await user.click(screen.getByRole('button', { name: 'Next page' }));
      const href = String(push.mock.calls.at(-1)?.[0]);
      expect(href.startsWith('/admin/services?')).toBe(true);
      const query = readAdminServiceQuery(
        new URLSearchParams(href.split('?')[1]),
      ).query;
      expect(query.page).toBe(
        control === 'previous' ? 5 : control === 'next' ? 7 : 1,
      );
      expect(query.customerId).toBe(
        control === 'customer' ? undefined : customerId,
      );
      expect(query.search).toBe(
        control === 'clear'
          ? undefined
          : control === 'search'
            ? 'account-87'
            : 'old',
      );
      expect(query.status).toBe(
        control === 'clear'
          ? undefined
          : control === 'status'
            ? 'CANCELLED'
            : 'ACTIVE',
      );
      expect(query.pageSize).toBe(
        control === 'clear' ? 20 : control === 'size' ? 50 : 1,
      );
      expect(screen.queryByText(/140 matching services/)).toBeNull();
    },
  );
  it('does not fetch an invalid inventory query and retains the customer warning for independently invalid scope', async () => {
    const fetchMock = fixture();
    render(manager({ page: ['1', '2'], customerId: ['bad', 'bad'] }));
    await screen.findByRole('heading', { name: 'Invalid service filters' });
    expect(screen.getByText(/customer filter is invalid/)).toBeTruthy();
    expect(
      screen.getByText(/All customers \(unfiltered customer scope\)/),
    ).toBeTruthy();
    expect(
      fetchMock.mock.calls.some(
        ([input]) => new URL(String(input)).pathname === '/services',
      ),
    ).toBe(false);
  });
  it('shows out-of-range without clamping, and returns to page one with retained filters', async () => {
    const user = userEvent.setup();
    fixture((url) =>
      url.pathname === '/services'
        ? json(page([], { page: 8, pageSize: 20 }, 140))
        : undefined,
    );
    render(manager({ page: '8', search: 'old', customerId }));
    await screen.findByRole('heading', {
      name: 'This service page is out of range',
    });
    expect(screen.getByText(/140 matching services.*Page 8 of 7/)).toBeTruthy();
    await user.click(
      screen.getByRole('button', { name: 'Return to first page' }),
    );
    expect(
      readAdminServiceQuery(
        new URLSearchParams(String(push.mock.calls[0]![0]).split('?')[1]),
      ).query,
    ).toMatchObject({ page: 1, search: 'old', customerId });
  });
  it.each([
    'row',
    'customer',
    'status',
    'meta',
    'duplicate',
    'length',
  ] as const)(
    'rejects %s mismatch instead of displaying untrusted rows/counts',
    async (kind) => {
      const row = { ...service, status: 'ACTIVE' as const };
      const response = page([row]);
      const body =
        kind === 'row'
          ? {
              ...response,
              data: [
                { ...row, recurringAmount: { amount: '1.2', currency: 'BDT' } },
              ],
            }
          : kind === 'customer'
            ? { ...response, data: [{ ...row, customerId: otherId }] }
            : kind === 'status'
              ? { ...response, data: [service] }
              : kind === 'duplicate'
                ? {
                    ...response,
                    data: [row, row],
                    pagination: { ...response.pagination, totalItems: 2 },
                  }
                : kind === 'length'
                  ? {
                      ...response,
                      pagination: { ...response.pagination, totalItems: 2 },
                    }
                  : {
                      ...response,
                      pagination: { ...response.pagination, pageSize: 100 },
                    };
      fixture((url) => (url.pathname === '/services' ? json(body) : undefined));
      render(manager({ customerId, status: 'ACTIVE' }));
      await screen.findByRole('heading', {
        name: 'Service inventory could not be loaded',
      });
      expect(
        screen.queryByRole('button', { name: `Review ${service.domain}` }),
      ).toBeNull();
      expect(screen.queryByText(/matching services ·/)).toBeNull();
      expect(() =>
        parseAdminServicePage(body, {
          page: 1,
          pageSize: 20,
          status: 'ACTIVE',
          customerId,
        }),
      ).toThrow();
    },
  );
  it.each([403, 404, 503, 'json', 'network'] as const)(
    'recovers from %s reads using only GET retry',
    async (failure) => {
      const user = userEvent.setup();
      let count = 0;
      const fetchMock = fixture((url) => {
        if (url.pathname !== '/services') return;
        count++;
        if (count > 1) return json(page([service]));
        if (failure === 'network')
          return Promise.reject(new Error('private-secret'));
        if (failure === 'json')
          return new Response('<html>private-secret</html>');
        return json({ message: 'private-secret' }, failure);
      });
      render(manager());
      await screen.findByRole('heading', {
        name: 'Service inventory could not be loaded',
      });
      expect(screen.queryByText(/private-secret/)).toBeNull();
      await user.click(
        screen.getByRole('button', { name: 'Retry service inventory' }),
      );
      await screen.findByRole('button', { name: `Review ${service.domain}` });
      expect(count).toBe(2);
      expect(fetchMock.mock.calls.every(([, init]) => !init?.method)).toBe(
        true,
      );
    },
  );
  it('discards delayed inventory on query change/back and aborts on unmount', async () => {
    const slow = deferred<Response>();
    let count = 0;
    const fetchMock = fixture((url) => {
      if (url.pathname === '/services') {
        count++;
        return count === 1 ? slow.promise : json(page([service]));
      }
    });
    const view = render(manager({ search: 'old' }));
    await screen.findByRole('searchbox');
    const oldRead = fetchMock.mock.calls.find(
      ([url]) => new URL(String(url)).pathname === '/services',
    )!;
    await act(async () => view.rerender(manager({ search: 'new' })));
    await screen.findByRole('button', { name: `Review ${service.domain}` });
    expect(oldRead[1]?.signal?.aborted).toBe(true);
    await act(async () =>
      slow.resolve(
        json(page([{ ...service, domain: 'late-secret.example.test' }])),
      ),
    );
    expect(screen.queryByText('late-secret.example.test')).toBeNull();
    await act(async () => view.rerender(manager({ search: 'old' })));
    expect((screen.getByRole('searchbox') as HTMLInputElement).value).toBe(
      'old',
    );
    const latest = fetchMock.mock.calls
      .filter(([url]) => new URL(String(url)).pathname === '/services')
      .at(-1)!;
    view.unmount();
    expect(latest[1]?.signal?.aborted).toBe(true);
  });
  it('preserves unfinished creation, original termination target, phrase and panel inputs while invalidating a delayed selected review', async () => {
    const user = userEvent.setup();
    const slow = deferred<Response>();
    const fetchMock = fixture((url) =>
      url.pathname === '/services/' + id
        ? slow.promise
        : url.pathname === '/services'
          ? json(
              page([{ ...service, status: 'ACTIVE' }], {
                page: Number(url.searchParams.get('page') ?? 1),
                pageSize: Number(url.searchParams.get('pageSize') ?? 100),
              }),
            )
          : undefined,
    );
    const view = render(
      <AdminServicesWorkspace selection={readAdminServiceQuery({})} />,
    );
    await screen.findByRole('heading', { name: 'Account tools' });
    await user.click(await screen.findByRole('button', { name: 'Terminate' }));
    await user.type(screen.getByLabelText('Reason'), 'Unfinished reason');
    await user.type(
      screen.getByLabelText('Type TERMINATE to confirm'),
      'TERMI',
    );
    await user.selectOptions(screen.getByLabelText('Paid order item'), otherId);
    await user.selectOptions(
      screen.getByLabelText('Active server'),
      service.server.id,
    );
    await user.type(screen.getByLabelText('WHM username'), 'fictional');
    await user.type(screen.getByLabelText('New API token'), 'FictionalToken87');
    await user.click(
      screen.getByRole('button', { name: `Review ${service.domain}` }),
    );
    const detailRead = fetchMock.mock.calls.find(([url]) =>
      String(url).endsWith('/services/' + id),
    )!;
    await act(async () =>
      view.rerender(
        <AdminServicesWorkspace
          selection={readAdminServiceQuery({ page: '2', pageSize: '1' })}
        />,
      ),
    );
    expect(detailRead[1]?.signal?.aborted).toBe(true);
    await act(async () => slow.resolve(json({ success: true, data: service })));
    expect(
      screen.queryByRole('heading', { name: 'Service review' }),
    ).toBeNull();
    expect((screen.getByLabelText('Reason') as HTMLTextAreaElement).value).toBe(
      'Unfinished reason',
    );
    expect(
      (screen.getByLabelText('Type TERMINATE to confirm') as HTMLInputElement)
        .value,
    ).toBe('TERMI');
    expect(
      (screen.getByLabelText('Paid order item') as HTMLSelectElement).value,
    ).toBe(otherId);
    expect(
      (screen.getByLabelText('Active server') as HTMLSelectElement).value,
    ).toBe(service.server.id);
    expect(
      (screen.getByLabelText('WHM username') as HTMLInputElement).value,
    ).toBe('fictional');
    expect(
      (screen.getByLabelText('New API token') as HTMLInputElement).value,
    ).toBe('FictionalToken87');
    expect(screen.getByText(/Original action target:/).textContent).toContain(
      id,
    );
    expect(fetchMock.mock.calls.every(([, init]) => !init?.method)).toBe(true);
  });
  it('refreshes the latest applied query after creation without injecting a nonmatching row or duplicating the write after read failure', async () => {
    const user = userEvent.setup();
    const mutation = deferred<Response>();
    let wrote = false;
    const fetchMock = fixture((url, init) => {
      if (init?.method === 'POST') {
        wrote = true;
        return mutation.promise;
      }
      if (url.pathname === '/services') {
        if (wrote && url.searchParams.get('search') === 'new')
          return json({}, 503);
        return json(page([service]));
      }
    });
    const view = render(manager({ search: 'old' }));
    await screen.findByRole('button', { name: `Review ${service.domain}` });
    await user.selectOptions(screen.getByLabelText('Paid order item'), otherId);
    await user.selectOptions(
      screen.getByLabelText('Active server'),
      service.server.id,
    );
    await user.click(
      screen.getByRole('button', { name: 'Create pending service' }),
    );
    await act(async () =>
      view.rerender(manager({ search: 'new', status: 'ACTIVE' })),
    );
    await act(async () =>
      mutation.resolve(
        json({
          success: true,
          data: {
            service: {
              ...service,
              id: otherId,
              domain: 'out-of-scope.example.test',
            },
            duplicate: false,
          },
        }),
      ),
    );
    await screen.findByText(
      'out-of-scope.example.test is ready for provisioning.',
    );
    await screen.findByRole('heading', {
      name: 'Service inventory could not be loaded',
    });
    expect(
      screen.queryByRole('button', {
        name: 'Review out-of-scope.example.test',
      }),
    ).toBeNull();
    const last = fetchMock.mock.calls
      .filter(
        ([url, init]) =>
          new URL(String(url)).pathname === '/services' && !init?.method,
      )
      .at(-1)!;
    expect(new URL(String(last[0])).searchParams.get('search')).toBe('new');
    expect(new URL(String(last[0])).searchParams.get('status')).toBe('ACTIVE');
    await user.click(
      screen.getByRole('button', { name: 'Retry service inventory' }),
    );
    await screen.findByRole('heading', {
      name: 'Service inventory could not be loaded',
    });
    const writes = fetchMock.mock.calls.filter(
      ([, init]) => init?.method === 'POST',
    );
    expect(writes).toHaveLength(1);
    expect(JSON.parse(String(writes[0]![1]?.body))).toEqual({
      orderItemId: otherId,
      serverId: service.server.id,
    });
    expect(writes[0]![1]?.headers).toEqual({
      'X-CSRF-Token': 'fictional-csrf',
      'Content-Type': 'application/json',
    });
  });
  it('keeps an original action target through a new query and reconciles only matching rows after successful cancellation', async () => {
    const user = userEvent.setup();
    let wrote = false;
    const fetchMock = fixture((url, init) => {
      if (init?.method === 'PATCH') {
        wrote = true;
        return json({
          success: true,
          data: { ...service, status: 'CANCELLED' },
        });
      }
      if (url.pathname === '/services/' + id && wrote)
        return json({
          success: true,
          data: { ...service, status: 'CANCELLED' },
        });
      if (url.pathname === '/services')
        return json(
          page(
            wrote
              ? []
              : [
                  {
                    ...service,
                    id: url.searchParams.get('search') === 'new' ? otherId : id,
                    domain:
                      url.searchParams.get('search') === 'new'
                        ? 'new-row.example.test'
                        : service.domain,
                  },
                ],
          ),
        );
    });
    const view = render(manager({ status: 'PENDING' }));
    await user.click(await screen.findByRole('button', { name: 'Cancel' }));
    await user.type(
      screen.getByLabelText('Reason'),
      'Fictional original target evidence',
    );
    await act(async () =>
      view.rerender(manager({ search: 'new', status: 'PENDING' })),
    );
    await screen.findByRole('button', { name: 'Review new-row.example.test' });
    expect(
      screen.getByRole('heading', { name: `CANCELLED · ${service.domain}` }),
    ).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Confirm cancelled' }));
    await screen.findByText(`${service.domain} moved to cancelled.`);
    await screen.findByRole('heading', { name: 'No matching services' });
    expect(
      screen.queryByRole('button', { name: `Review ${service.domain}` }),
    ).toBeNull();
    const writes = fetchMock.mock.calls.filter(
      ([, init]) => init?.method === 'PATCH',
    );
    expect(writes).toHaveLength(1);
    expect(new URL(String(writes[0]![0])).pathname).toBe(
      `/services/${id}/status`,
    );
    expect(JSON.parse(String(writes[0]![1]?.body))).toEqual({
      status: 'CANCELLED',
      reason: 'Fictional original target evidence',
    });
    const last = fetchMock.mock.calls
      .filter(
        ([url, init]) =>
          new URL(String(url)).pathname === '/services' && !init?.method,
      )
      .at(-1)!;
    expect(new URL(String(last[0])).searchParams.get('search')).toBe('new');
    expect(new URL(String(last[0])).searchParams.get('status')).toBe('PENDING');
  });
  it('shows honest empty matching history', async () => {
    fixture((url) =>
      url.pathname === '/services' ? json(page([])) : undefined,
    );
    render(manager({ search: 'missing' }));
    await screen.findByRole('heading', { name: 'No matching services' });
    expect(
      screen.getByText(/0 matching services · 0 shown · No pages/),
    ).toBeTruthy();
  });
});
