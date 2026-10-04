import {
  serviceStatusSchema,
  type HostingPanelOperation,
  type Service,
} from '@webhost-billing/shared';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdminServiceReview } from './admin-service-review';
import { AdminServiceManager } from './admin-service-manager';
import { AdminServicesWorkspace } from './admin-services-workspace';

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
function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
function success(data: unknown) {
  return json({ success: true, data });
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function review(serviceId = id, scope?: string) {
  return (
    <AdminServiceReview
      serviceId={serviceId}
      customerId={scope}
      onClose={vi.fn()}
    />
  );
}
function reads(row = service) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) =>
    String(input).endsWith('/settings')
      ? success({ timeZone: 'Asia/Dhaka', currency: 'BDT' })
      : success(row),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('selected administrator service read', () => {
  it.each(serviceStatusSchema.options)(
    'shows %s application facts without provider or financial claims',
    async (status) => {
      const fetchMock = reads({ ...service, status });
      const { container } = render(review());
      const link = await screen.findByRole('link', { name: 'View customer' });
      expect(link.getAttribute('href')).toBe(`/admin/customers/${customerId}`);
      expect(
        screen.getByText('Application service state').nextElementSibling
          ?.textContent,
      ).toBe(status.replaceAll('_', ' '));
      expect(
        screen.getByText(`${service.customerName} · ${service.customerEmail}`),
      ).toBeTruthy();
      expect(screen.getByText(service.productDescription!)).toBeTruthy();
      expect(container.querySelector('b, script, form, input')).toBeNull();
      expect(screen.getByText('BDT 90,071,992,547,409.93')).toBeTruthy();
      expect(screen.getAllByText('4 Oct 2026, 02:00').length).toBe(3);
      expect(screen.getByText(/Dates shown in Asia\/Dhaka/)).toBeTruthy();
      expect(
        screen.getByText(/current profile, not a historical invoice snapshot/),
      ).toBeTruthy();
      expect(
        screen.getByText(/does not contact the hosting panel/),
      ).toBeTruthy();
      expect(screen.getAllByRole('link')).toHaveLength(1);
      expect(screen.getAllByText('Not recorded').length).toBeGreaterThan(10);
      expect(screen.getByRole('heading', { name: 'Service review' })).toBe(
        document.activeElement,
      );
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(fetchMock.mock.calls[0][0]).toContain(`/services/${id}`);
      // No write, per-row read, order/invoice chain, panel action or login URL.
      expect(fetchMock.mock.calls[1][0]).toMatch(/\/settings$/);
    },
  );
  it('renders all reasons/timestamps/order references as text and handles missing domain', async () => {
    reads({
      ...service,
      domain: null,
      orderId: otherId,
      orderItemId: otherId,
      orderNumber: 'ORDER-86',
      activatedAt: service.startedAt,
      suspendedAt: service.startedAt,
      cancelledAt: service.startedAt,
      terminatedAt: service.startedAt,
      suspensionReason: '<b>Suspended</b>',
      cancellationReason: 'https://example.test/cancel',
      terminationReason: '<i>Terminated</i>',
      provisioningFailureReason: 'Fictional provider failure',
      controlPanelUsername: 'fictional86',
      externalAccountId: 'external86',
    });
    const { container } = render(review());
    await screen.findByText('Domain not recorded');
    for (const text of [
      '<b>Suspended</b>',
      '<i>Terminated</i>',
      'https://example.test/cancel',
      'Fictional provider failure',
      'ORDER-86',
      'fictional86',
      'external86',
    ])
      expect(screen.getByText(text)).toBeTruthy();
    expect(container.querySelector('b, i')).toBeNull();
    expect(screen.getAllByRole('link')).toHaveLength(1);
  });
  it.each([
    ['bad', undefined],
    [id, 'bad'],
  ] as const)(
    'rejects invalid selection without GET: %s %s',
    async (selected, scope) => {
      const fetchMock = reads();
      render(review(selected, scope));
      expect(screen.getByText('Invalid service review selection')).toBeTruthy();
      expect(
        screen.queryByRole('button', { name: 'Retry service review' }),
      ).toBeNull();
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );
  it.each([
    [403, 'Service review access denied'],
    [404, 'Service review record not found'],
    [401, 'Service review could not be loaded'],
    [503, 'Service review could not be loaded'],
  ])(
    'shows a safe HTTP %s recovery without applying context',
    async (status, title) => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(
          json({ secret: 'private-response' }, Number(status)),
        );
      vi.stubGlobal('fetch', fetchMock);
      render(review());
      await screen.findByText(String(title));
      expect(screen.queryByText(/private-response/)).toBeNull();
      expect(screen.queryByRole('link')).toBeNull();
      expect(fetchMock).toHaveBeenCalledOnce();
    },
  );
  it.each([
    { success: false, data: service },
    { success: true, data: { ...service, id: 'bad' } },
    {
      success: true,
      data: { ...service, recurringAmount: { amount: 12, currency: 'BDT' } },
    },
    { success: true, data: { ...service, credential: 'private-response' } },
  ])('rejects malformed runtime responses %j', async (body) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(body)));
    render(review());
    await screen.findByText('Service review response is invalid');
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.queryByText(/private-response/)).toBeNull();
  });
  it('rejects non-JSON without displaying response contents', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('private-response')),
    );
    render(review());
    await screen.findByText('Service review response is invalid');
    expect(screen.queryByText(/private-response/)).toBeNull();
  });
  it.each([
    { ...service, id: otherId },
    { ...service, customerId: otherId },
  ])('rejects mismatched service or customer context', async (row) => {
    const fetchMock = reads(row);
    render(review(id, customerId));
    await screen.findByText('Service review context does not match');
    expect(screen.queryByRole('link')).toBeNull();
    expect(fetchMock).toHaveBeenCalledOnce();
  });
  it.each([success({ timeZone: 'invalid/zone' }), success({}), json({}, 503)])(
    'requires valid business-zone evidence before showing dates/links',
    async (response) => {
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockResolvedValueOnce(success(service))
          .mockResolvedValueOnce(response),
      );
      render(review());
      await screen.findByRole('button', { name: 'Retry service review' });
      expect(screen.queryByRole('link')).toBeNull();
      expect(screen.queryByText(/Dates shown/)).toBeNull();
    },
  );
  it('retries deliberately with abortable cookie/no-store GETs only', async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('private-response'))
      .mockResolvedValueOnce(success(service))
      .mockResolvedValueOnce(success({ timeZone: 'UTC' }));
    vi.stubGlobal('fetch', fetchMock);
    render(review());
    await user.click(
      await screen.findByRole('button', { name: 'Retry service review' }),
    );
    await screen.findByRole('link', { name: 'View customer' });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    for (const [, options] of fetchMock.mock.calls)
      expect(options).toEqual({
        credentials: 'include',
        cache: 'no-store',
        signal: expect.any(AbortSignal),
      });
  });
  it('aborts/discards delayed selection and settings reads on selection, scope and unmount', async () => {
    const slow = deferred<Response>();
    const settings = deferred<Response>();
    const fetchMock = vi
      .fn()
      .mockReturnValueOnce(slow.promise)
      .mockResolvedValueOnce(success({ ...service, id: otherId }))
      .mockReturnValueOnce(settings.promise);
    vi.stubGlobal('fetch', fetchMock);
    const view = render(review());
    const signal = fetchMock.mock.calls[0][1].signal as AbortSignal;
    view.rerender(review(otherId));
    expect(signal.aborted).toBe(true);
    await act(async () => slow.resolve(success(service)));
    expect(screen.queryByRole('link')).toBeNull();
    const settingsSignal = fetchMock.mock.calls[2][1].signal as AbortSignal;
    fetchMock.mockResolvedValue(success(service));
    view.rerender(review(otherId, otherId));
    expect(settingsSignal.aborted).toBe(true);
    await act(async () => settings.resolve(success({ timeZone: 'UTC' })));
    await screen.findByText('Service review context does not match');
    expect(screen.queryByRole('link')).toBeNull();
    view.unmount();
    expect(
      (fetchMock.mock.calls.at(-1)?.[1].signal as AbortSignal).aborted,
    ).toBe(true);
  });
});

describe('service review integration preserves deliberate operations', () => {
  const panelOperation: HostingPanelOperation = {
    id: otherId,
    serviceId: id,
    server: service.server,
    requestedByUserId: otherId,
    automationRunId: null,
    retryOfOperationId: null,
    type: 'CREATE_ACCOUNT',
    status: 'FAILED',
    adapterKey: 'fake-panel',
    attemptNumber: 1,
    retryable: true,
    errorKind: 'TEMPORARY',
    errorCode: 'FICTIONAL',
    errorMessage: 'Fictional temporary failure',
    account: null,
    startedAt: service.startedAt,
    completedAt: service.startedAt,
    createdAt: service.startedAt,
  };
  function fixture(
    row = service,
    handler?: (
      path: string,
      options?: RequestInit,
    ) => Response | Promise<Response> | undefined,
  ) {
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, options?: RequestInit) => {
        const path = new URL(String(input)).pathname;
        const custom = handler?.(path, options);
        if (custom) return custom;
        if (path === '/auth/csrf')
          return success({ csrfToken: 'fictional-csrf' });
        if (path === '/settings') return success({ timeZone: 'Asia/Dhaka' });
        if (path === '/services/setup-options')
          return success({
            servers: [service.server],
            orderItems: [
              {
                orderItemId: otherId,
                orderId: otherId,
                orderNumber: 'ORDER-NEW',
                customerId,
                customerName: service.customerName,
                productName: service.productName,
                domain: 'new86.example.test',
                billingPeriod: 'MONTHLY',
                recurringAmount: service.recurringAmount,
              },
            ],
          });
        if (path.startsWith('/customers/'))
          return success({
            id: path.split('/').at(-1),
            firstName: 'Current',
            lastName: 'Customer',
            customerNumber: 'CUS-86',
          });
        if (path === `/services/${id}`) return success(row);
        return json({
          success: true,
          data: [row],
          pagination: { page: 1, pageSize: 100, totalItems: 1, totalPages: 1 },
        });
      },
    );
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }
  async function open(user: ReturnType<typeof userEvent.setup>) {
    await user.click(
      await screen.findByRole('button', { name: `Review ${service.domain}` }),
    );
    await screen.findByRole('link', { name: 'View customer' });
  }
  it.each([
    'test',
    'configure',
    'retry',
    'GET_ACCOUNT',
    'CHANGE_PACKAGE',
    'CHANGE_PASSWORD',
    'GENERATE_LOGIN_URL',
  ] as const)(
    'clears review at sibling %s dispatch and preserves forms and the original request on failure',
    async (tool) => {
      const user = userEvent.setup();
      const mutation = deferred<Response>();
      const row = { ...service, status: 'ACTIVE' as const };
      const fetchMock = fixture(row, (path, options) => {
        if (options?.method === 'POST') return mutation.promise;
        if (path === '/hosting-panel/operations')
          return json({
            success: true,
            data: [panelOperation],
            pagination: {
              page: 1,
              pageSize: 100,
              totalItems: 1,
              totalPages: 1,
            },
          });
      });
      render(
        <AdminServicesWorkspace
          customerFilter={{ customerId, invalid: false }}
        />,
      );
      await screen.findByRole('heading', { name: 'Account tools' });
      await user.selectOptions(
        screen.getByLabelText('Paid order item'),
        otherId,
      );
      await user.selectOptions(
        screen.getByLabelText('Active server'),
        service.server.id,
      );
      await user.click(screen.getByRole('button', { name: 'Suspend' }));
      await user.type(
        screen.getByLabelText('Reason'),
        'Unfinished service reason',
      );
      await open(user);
      const readsBefore = fetchMock.mock.calls.filter(([url]) =>
        String(url).endsWith(`/services/${id}`),
      ).length;
      if (tool === 'test')
        await user.click(
          screen.getByRole('button', { name: `Test ${service.server.name}` }),
        );
      else if (tool === 'retry')
        await user.click(
          screen.getByRole('button', { name: 'Retry manually' }),
        );
      else if (tool === 'configure') {
        await user.type(
          screen.getByLabelText('WHM username'),
          'fictional-admin',
        );
        await user.type(
          screen.getByLabelText('New API token'),
          'FictionalTokenValue1234567890',
        );
        await user.click(
          screen.getByRole('button', { name: 'Encrypt and save cPanel' }),
        );
      } else {
        await user.selectOptions(screen.getByLabelText('Action'), tool);
        if (tool === 'CHANGE_PACKAGE')
          await user.type(
            screen.getByLabelText('Panel package'),
            'fictional_package',
          );
        if (tool === 'CHANGE_PASSWORD')
          await user.type(
            screen.getByLabelText('New password'),
            'FictionalPassword123456',
          );
        await user.click(
          screen.getByRole('button', { name: 'Run account tool' }),
        );
      }
      expect(
        screen.queryByRole('heading', { name: 'Service review' }),
      ).toBeNull();
      const trigger = screen.getByRole('button', {
        name: `Review ${service.domain}`,
      });
      expect((trigger as HTMLButtonElement).disabled).toBe(true);
      expect(
        screen.getByText(/inspection is paused while a panel operation/),
      ).toBeTruthy();
      const write = fetchMock.mock.calls.find(
        ([, options]) => options?.method === 'POST',
      );
      const path =
        tool === 'test'
          ? `/hosting-panel/servers/${service.server.id}/test`
          : tool === 'configure'
            ? `/hosting-panel/servers/${service.server.id}/cpanel-configuration`
            : tool === 'retry'
              ? `/hosting-panel/operations/${otherId}/retry`
              : `/hosting-panel/services/${id}/operations`;
      expect(new URL(String(write?.[0])).pathname).toBe(path);
      expect(write?.[1]?.credentials).toBe('include');
      expect(write?.[1]?.headers).toEqual({
        'X-CSRF-Token': 'fictional-csrf',
        'Content-Type': 'application/json',
      });
      expect(JSON.parse(String(write?.[1]?.body))).toEqual(
        tool === 'configure'
          ? {
              hostname: service.server.hostname,
              port: 2087,
              apiUsername: 'fictional-admin',
              apiToken: 'FictionalTokenValue1234567890',
              confirmation: 'CONFIGURE_CPANEL',
            }
          : {
              submissionKey: expect.stringMatching(/^[0-9a-f-]{36}$/),
              ...(['test', 'retry'].includes(tool) ? {} : { type: tool }),
              ...(tool === 'CHANGE_PACKAGE'
                ? { packageIdentifier: 'fictional_package' }
                : {}),
              ...(tool === 'CHANGE_PASSWORD'
                ? { newPassword: 'FictionalPassword123456' }
                : {}),
            },
      );
      await act(async () =>
        mutation.resolve(
          json(
            { success: false, error: { message: 'Fictional panel failure' } },
            503,
          ),
        ),
      );
      await screen.findByText('Fictional panel failure');
      expect((trigger as HTMLButtonElement).disabled).toBe(false);
      expect(
        screen.queryByRole('heading', { name: 'Service review' }),
      ).toBeNull();
      expect(
        (screen.getByLabelText('Reason') as HTMLTextAreaElement).value,
      ).toBe('Unfinished service reason');
      expect(
        (screen.getByLabelText('Paid order item') as HTMLSelectElement).value,
      ).toBe(otherId);
      expect(
        (screen.getByLabelText('Active server') as HTMLSelectElement).value,
      ).toBe(service.server.id);
      expect(
        fetchMock.mock.calls.filter(([url]) =>
          String(url).endsWith(`/services/${id}`),
        ),
      ).toHaveLength(readsBefore);
      expect(
        fetchMock.mock.calls.filter(
          ([, options]) => options?.method === 'POST',
        ),
      ).toHaveLength(1);
      await open(user);
    },
  );
  it('aborts a pending review at sibling dispatch and never restores it after successful completion', async () => {
    const user = userEvent.setup();
    const slow = deferred<Response>();
    const mutation = deferred<Response>();
    const fetchMock = fixture(service, (path, options) => {
      if (options?.method === 'POST') return mutation.promise;
      if (path === '/hosting-panel/operations')
        return json({
          success: true,
          data: [panelOperation],
          pagination: { page: 1, pageSize: 100, totalItems: 1, totalPages: 1 },
        });
      if (path === `/services/${id}`) return slow.promise;
    });
    render(<AdminServicesWorkspace customerFilter={{ invalid: false }} />);
    await screen.findByRole('heading', { name: 'Account tools' });
    await user.click(
      screen.getByRole('button', { name: `Review ${service.domain}` }),
    );
    const signal = fetchMock.mock.calls.find(([url]) =>
      String(url).endsWith(`/services/${id}`),
    )?.[1]?.signal;
    await user.click(
      screen.getByRole('button', { name: `Test ${service.server.name}` }),
    );
    expect(signal?.aborted).toBe(true);
    await act(async () => slow.resolve(success(service)));
    expect(
      screen.queryByRole('heading', { name: 'Service review' }),
    ).toBeNull();
    await act(async () =>
      mutation.resolve(
        success({
          operation: {
            ...panelOperation,
            type: 'TEST_CONNECTION',
            status: 'SUCCEEDED',
            retryable: false,
          },
          duplicate: false,
          loginUrl: null,
        }),
      ),
    );
    await screen.findByText('Connection test finished.');
    expect(
      screen.queryByRole('heading', { name: 'Service review' }),
    ).toBeNull();
    expect(
      (
        screen.getByRole('button', {
          name: `Review ${service.domain}`,
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false);
    await open(user);
  });
  it('reads only after selection, preserves unfinished creation/action input and restores focus on close', async () => {
    const user = userEvent.setup();
    const fetchMock = fixture();
    render(<AdminServiceManager />);
    const trigger = await screen.findByRole('button', {
      name: `Review ${service.domain}`,
    });
    expect(
      fetchMock.mock.calls.some(([url]) =>
        String(url).endsWith(`/services/${id}`),
      ),
    ).toBe(false);
    await user.selectOptions(screen.getByLabelText('Paid order item'), otherId);
    await user.selectOptions(
      screen.getByLabelText('Active server'),
      service.server.id,
    );
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await user.type(screen.getByLabelText('Reason'), 'Unsaved reason');
    await open(user);
    await user.click(
      screen.getByRole('button', { name: 'Close service review' }),
    );
    expect(document.activeElement).toBe(trigger);
    expect((screen.getByLabelText('Reason') as HTMLTextAreaElement).value).toBe(
      'Unsaved reason',
    );
    expect(
      (screen.getByLabelText('Paid order item') as HTMLSelectElement).value,
    ).toBe(otherId);
    expect(
      (screen.getByLabelText('Active server') as HTMLSelectElement).value,
    ).toBe(service.server.id);
    await user.keyboard('{Enter}');
    await screen.findByRole('link', { name: 'View customer' });
    expect(fetchMock.mock.calls.every(([, options]) => !options?.method)).toBe(
      true,
    );
  });
  it('invalidates filter/clear/back selection without resetting forms or resurrecting old review', async () => {
    const user = userEvent.setup();
    fixture();
    const view = render(
      <AdminServiceManager customerFilter={{ customerId, invalid: false }} />,
    );
    await open(user);
    await user.selectOptions(screen.getByLabelText('Paid order item'), otherId);
    await act(async () =>
      view.rerender(
        <AdminServiceManager
          customerFilter={{ customerId: otherId, invalid: false }}
        />,
      ),
    );
    expect(
      screen.queryByRole('heading', { name: 'Service review' }),
    ).toBeNull();
    await act(async () =>
      view.rerender(
        <AdminServiceManager customerFilter={{ customerId, invalid: false }} />,
      ),
    );
    expect(
      screen.queryByRole('heading', { name: 'Service review' }),
    ).toBeNull();
    expect(
      (screen.getByLabelText('Paid order item') as HTMLSelectElement).value,
    ).toBe(otherId);
    await open(user);
    await act(async () =>
      view.rerender(<AdminServiceManager customerFilter={{ invalid: true }} />),
    );
    expect(
      screen.queryByRole('heading', { name: 'Service review' }),
    ).toBeNull();
    expect(screen.getByText(/The customer filter is invalid/)).toBeTruthy();
  });
  it('close aborts a pending selected read without applying its delayed context', async () => {
    const user = userEvent.setup();
    const slow = deferred<Response>();
    const fetchMock = fixture(service, (path) =>
      path === `/services/${id}` ? slow.promise : undefined,
    );
    render(<AdminServiceManager />);
    await user.click(
      await screen.findByRole('button', { name: `Review ${service.domain}` }),
    );
    const signal = fetchMock.mock.calls.find(([url]) =>
      String(url).endsWith(`/services/${id}`),
    )?.[1]?.signal;
    await user.click(
      screen.getByRole('button', { name: 'Close service review' }),
    );
    expect(signal?.aborted).toBe(true);
    await act(async () => slow.resolve(success(service)));
    expect(
      screen.queryByRole('heading', { name: 'Service review' }),
    ).toBeNull();
  });
  it.each([
    'create',
    'provision',
    'reactivate',
    'cancel',
    'suspend',
    'terminate',
  ] as const)(
    'invalidates review at %s dispatch, retaining original body/CSRF and failed-refresh behavior',
    async (action) => {
      const user = userEvent.setup();
      const mutation = deferred<Response>();
      let wrote = false;
      const row = {
        ...service,
        status:
          action === 'suspend' || action === 'terminate'
            ? ('ACTIVE' as const)
            : action === 'reactivate'
              ? ('SUSPENDED' as const)
              : ('PENDING' as const),
      };
      const fetchMock = fixture(row, (path, options) => {
        if (options?.method === 'POST' || options?.method === 'PATCH') {
          wrote = true;
          return mutation.promise;
        }
        if (wrote && path === `/services/${id}`)
          return json(
            { success: false, error: { message: 'Refresh failed' } },
            503,
          );
      });
      render(<AdminServiceManager />);
      await open(user);
      if (action === 'create') {
        await user.selectOptions(
          screen.getByLabelText('Paid order item'),
          otherId,
        );
        await user.selectOptions(
          screen.getByLabelText('Active server'),
          service.server.id,
        );
        await user.click(
          screen.getByRole('button', { name: 'Create pending service' }),
        );
      } else if (action === 'provision' || action === 'reactivate')
        await user.click(
          screen.getByRole('button', {
            name: action === 'provision' ? 'Provision account' : 'Reactivate',
          }),
        );
      else {
        await user.click(
          screen.getByRole('button', {
            name:
              action === 'cancel'
                ? 'Cancel'
                : action === 'suspend'
                  ? 'Suspend'
                  : 'Terminate',
          }),
        );
        await user.type(
          screen.getByLabelText('Reason'),
          'Fictional operational reason',
        );
        if (action === 'terminate')
          await user.type(
            screen.getByLabelText('Type TERMINATE to confirm'),
            'TERMINATE',
          );
        await user.click(
          screen.getByRole('button', {
            name: `Confirm ${action === 'cancel' ? 'cancelled' : action === 'suspend' ? 'suspended' : 'terminated'}`,
          }),
        );
      }
      expect(
        screen.queryByRole('heading', { name: 'Service review' }),
      ).toBeNull();
      const write = fetchMock.mock.calls.find(
        ([, options]) =>
          options?.method === 'POST' || options?.method === 'PATCH',
      );
      expect(write?.[1]?.headers).toEqual({
        'X-CSRF-Token': 'fictional-csrf',
        'Content-Type': 'application/json',
      });
      expect(new URL(String(write?.[0])).pathname).toBe(
        action === 'create'
          ? '/services'
          : action === 'cancel'
            ? `/services/${id}/status`
            : `/hosting-panel/services/${id}/operations`,
      );
      expect(write?.[1]?.method).toBe(action === 'cancel' ? 'PATCH' : 'POST');
      expect(write?.[1]?.credentials).toBe('include');
      const body = JSON.parse(String(write?.[1]?.body));
      if (action === 'create')
        expect(body).toEqual({
          orderItemId: otherId,
          serverId: service.server.id,
        });
      else if (action === 'cancel')
        expect(body).toEqual({
          status: 'CANCELLED',
          reason: 'Fictional operational reason',
        });
      else
        expect(body).toEqual({
          type:
            action === 'provision'
              ? 'CREATE_ACCOUNT'
              : action === 'reactivate'
                ? 'UNSUSPEND_ACCOUNT'
                : action === 'suspend'
                  ? 'SUSPEND_ACCOUNT'
                  : 'TERMINATE_ACCOUNT',
          submissionKey: expect.stringMatching(/^[0-9a-f-]{36}$/),
          ...(action === 'suspend' || action === 'terminate'
            ? { reason: 'Fictional operational reason' }
            : {}),
          ...(action === 'terminate' ? { confirmation: 'TERMINATE' } : {}),
        });
      await act(async () =>
        mutation.resolve(
          action === 'create'
            ? success({ service, duplicate: false })
            : action === 'cancel'
              ? success(service)
              : success({
                  operation: { status: 'SUCCEEDED', type: body.type },
                  duplicate: false,
                  loginUrl: null,
                }),
        ),
      );
      if (action !== 'create') await screen.findByText('Refresh failed');
      expect(
        screen.queryByRole('heading', { name: 'Service review' }),
      ).toBeNull();
      expect(
        fetchMock.mock.calls.filter(
          ([, options]) =>
            options?.method === 'POST' || options?.method === 'PATCH',
        ),
      ).toHaveLength(1);
    },
  );
  it('discards a delayed review when an existing mutation fails, without hiding the failure', async () => {
    const user = userEvent.setup();
    const slow = deferred<Response>();
    const fetchMock = fixture(service, (path, options) => {
      if (options?.method === 'POST')
        return json(
          { success: false, error: { message: 'Mutation failed' } },
          503,
        );
      if (path === `/services/${id}`) return slow.promise;
    });
    render(<AdminServiceManager />);
    await user.click(
      await screen.findByRole('button', { name: `Review ${service.domain}` }),
    );
    const signal = fetchMock.mock.calls.find(([url]) =>
      String(url).endsWith(`/services/${id}`),
    )?.[1]?.signal;
    await user.click(screen.getByRole('button', { name: 'Provision account' }));
    expect(signal?.aborted).toBe(true);
    await screen.findByText('Mutation failed');
    await act(async () => slow.resolve(success(service)));
    expect(
      screen.queryByRole('heading', { name: 'Service review' }),
    ).toBeNull();
    expect(
      fetchMock.mock.calls.filter(([, options]) => options?.method === 'POST'),
    ).toHaveLength(1);
  });
  it('keeps the exact termination phrase and server rejection without adding an inspection gate', async () => {
    const user = userEvent.setup();
    const fetchMock = fixture({ ...service, status: 'ACTIVE' }, (_, options) =>
      options?.method === 'POST'
        ? json(
            {
              success: false,
              error: { message: 'Exact confirmation required' },
            },
            400,
          )
        : undefined,
    );
    render(<AdminServiceManager />);
    await user.click(await screen.findByRole('button', { name: 'Terminate' }));
    await user.type(screen.getByLabelText('Reason'), 'Fictional termination');
    await user.type(
      screen.getByLabelText('Type TERMINATE to confirm'),
      'wrong',
    );
    await user.click(
      screen.getByRole('button', { name: 'Confirm terminated' }),
    );
    await screen.findByText('Exact confirmation required');
    expect(screen.getByLabelText('Type TERMINATE to confirm')).toBeTruthy();
    const write = fetchMock.mock.calls.find(
      ([, options]) => options?.method === 'POST',
    );
    expect(JSON.parse(String(write?.[1]?.body)).confirmation).toBe('wrong');
    expect(
      fetchMock.mock.calls.some(([url]) => String(url).endsWith('/settings')),
    ).toBe(false);
  });
});
