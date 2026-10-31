import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdminDomainInventory } from './admin-domain-inventory';
import { readAdminDomainQuery } from '../../lib/admin-domain-inventory-query';
import {
  inventoryCustomerId,
  inventoryPage,
  inventoryRow,
} from '../../test/domain-inventory-fixtures';
const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
const json = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200 });
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('global domain inventory', () => {
  it('shows full result totals, compact rows and client-owned links for an older result', async () => {
    const selection = readAdminDomainQuery({
      page: '6',
      customerId: inventoryCustomerId,
    });
    const get = vi
      .fn()
      .mockResolvedValue(
        json(inventoryPage([inventoryRow], selection.query, 101)),
      );
    vi.stubGlobal('fetch', get);
    render(<AdminDomainInventory selection={selection} />);
    expect(
      (await screen.findByText(/101 matching domains/)).textContent,
    ).toContain('Page 6 of 6');
    expect(
      screen.getByRole('table', { name: 'Domain inventory' }),
    ).toBeTruthy();
    for (const name of [
      inventoryRow.domainName,
      'View ' + inventoryRow.domainName,
    ])
      expect(screen.getByRole('link', { name }).getAttribute('href')).toBe(
        `/admin/customers/${inventoryCustomerId}/domains/${inventoryRow.id}`,
      );
    expect(get).toHaveBeenCalledWith(
      expect.stringContaining(
        '/domains/inventory?page=6&pageSize=20&customerId=',
      ),
      expect.objectContaining({ cache: 'no-store', credentials: 'include' }),
    );
    expect(
      (screen.getByRole('button', { name: 'Next page' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Previous page' }));
    expect(push).toHaveBeenCalledWith(
      expect.stringContaining('page=5&pageSize=20&customerId='),
      { scroll: false },
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });
  it('resets page on search, preserves client context and never submits a mutation', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async () => json(inventoryPage())),
    );
    const view = render(
      <AdminDomainInventory
        selection={readAdminDomainQuery({ customerId: inventoryCustomerId })}
      />,
    );
    await screen.findByRole('table');
    fireEvent.change(
      screen.getByRole('searchbox', { name: 'Search domains' }),
      { target: { value: 'older160.com' } },
    );
    fireEvent.submit(
      screen.getByRole('form', { name: 'Domain inventory filters' }),
    );
    expect(push).toHaveBeenLastCalledWith(
      expect.stringContaining(
        'page=1&pageSize=20&search=older160.com&customerId=',
      ),
      { scroll: false },
    );
    view.rerender(
      <AdminDomainInventory
        selection={readAdminDomainQuery({
          search: 'older160.com',
          customerId: inventoryCustomerId,
        })}
      />,
    );
    await screen.findByRole('table');
    fireEvent.change(screen.getByLabelText('Domain origin'), {
      target: { value: 'EXISTING' },
    });
    expect(push).toHaveBeenLastCalledWith(
      expect.stringContaining('origin=EXISTING&customerId='),
      { scroll: false },
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Clear inventory filters' }),
    );
    expect(push).toHaveBeenLastCalledWith(
      `/admin/domains?page=1&pageSize=20&customerId=${inventoryCustomerId}`,
      { scroll: false },
    );
    for (const [, options] of vi.mocked(fetch).mock.calls)
      expect(options?.method).toBeUndefined();
  });
  it('combines rapid filter changes before the router returns updated URL props', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async () => json(inventoryPage())),
    );
    render(
      <AdminDomainInventory
        selection={readAdminDomainQuery({ customerId: inventoryCustomerId })}
      />,
    );
    await screen.findByRole('table');
    fireEvent.change(
      screen.getByRole('combobox', { name: /^Domain origin$/ }),
      { target: { value: 'EXISTING' } },
    );
    fireEvent.change(
      screen.getByRole('combobox', { name: /^Domain status$/ }),
      { target: { value: 'REGISTERED' } },
    );
    expect(push).toHaveBeenLastCalledWith(
      `/admin/domains?page=1&pageSize=20&state=REGISTERED&origin=EXISTING&customerId=${inventoryCustomerId}`,
      { scroll: false },
    );
  });
  it('fails closed for invalid client URLs, failed responses and inconsistent totals, with read-only retry', async () => {
    const get = vi
      .fn()
      .mockResolvedValueOnce(new Response('failure', { status: 500 }))
      .mockResolvedValueOnce(
        json({
          ...inventoryPage(),
          summary: { ...inventoryPage().summary, REGISTERED: 9 },
        }),
      )
      .mockResolvedValueOnce(json(inventoryPage()));
    vi.stubGlobal('fetch', get);
    const view = render(
      <AdminDomainInventory
        selection={readAdminDomainQuery({ customerId: 'bad' })}
      />,
    );
    expect(screen.getByRole('alert').textContent).toContain(
      'No inventory request',
    );
    expect(get).not.toHaveBeenCalled();
    view.rerender(
      <AdminDomainInventory selection={readAdminDomainQuery({})} />,
    );
    await screen.findByRole('button', { name: 'Retry domain inventory' });
    expect(screen.queryByText(/matching domains/)).toBeNull();
    fireEvent.click(
      screen.getByRole('button', { name: 'Retry domain inventory' }),
    );
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
    await screen.findByRole('button', { name: 'Retry domain inventory' });
    fireEvent.click(
      screen.getByRole('button', { name: 'Retry domain inventory' }),
    );
    await screen.findByRole('table');
  });
  it('ignores a late response from a previous URL and aborts its request', async () => {
    let finish!: (response: Response) => void;
    const first = new Promise<Response>((done) => {
      finish = done;
    });
    const get = vi
      .fn()
      .mockReturnValueOnce(first)
      .mockResolvedValueOnce(
        json(
          inventoryPage([{ ...inventoryRow, domainName: 'current160.com' }]),
        ),
      );
    vi.stubGlobal('fetch', get);
    const view = render(
      <AdminDomainInventory
        selection={readAdminDomainQuery({ search: 'old' })}
      />,
    );
    view.rerender(
      <AdminDomainInventory
        selection={readAdminDomainQuery({ search: 'current' })}
      />,
    );
    await screen.findByRole('link', { name: 'current160.com' });
    expect(get.mock.calls[0]![1].signal.aborted).toBe(true);
    await act(async () => {
      finish(json(inventoryPage()));
    });
    expect(
      screen.queryByRole('link', { name: inventoryRow.domainName }),
    ).toBeNull();
  });
  it('shows an honest empty out-of-range page and retains filters when returning to page one', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          json(inventoryPage([], { page: 9, pageSize: 20 }, 101)),
        ),
    );
    render(
      <AdminDomainInventory
        selection={readAdminDomainQuery({ page: '9', search: 'historic' })}
      />,
    );
    await screen.findByText('This domain page is out of range.');
    fireEvent.click(
      screen.getByRole('button', { name: 'Return to first page' }),
    );
    expect(push).toHaveBeenCalledWith(
      '/admin/domains?page=1&pageSize=20&search=historic',
      { scroll: false },
    );
  });
});
