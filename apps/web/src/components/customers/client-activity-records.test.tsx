import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ClientActivityRecords,
  type ClientActivityKind,
} from './client-activity-records';
import { ClientProfileNavigation } from './client-profile-navigation';
import {
  client,
  clientId,
  clientSummary,
  otherClientId,
} from '../../test/client-record-fixtures';
import {
  order,
  invoice,
  payment,
  ticket,
  email,
} from '../../test/client-activity-fixtures';
const api = vi.hoisted(() => ({
  get: vi.fn(),
  page: vi.fn(),
  mutate: vi.fn(),
  push: vi.fn(),
}));
vi.mock('../../lib/auth-api', () => ({
  authenticatedGet: api.get,
  authenticatedPaginatedGet: api.page,
  authMutation: api.mutate,
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: api.push }) }));
const { messages: _messages, ...ticketSummary } = ticket;
void _messages; // The list contract deliberately excludes conversation messages.
const fixtures = {
  orders: order,
  invoices: invoice,
  payments: payment,
  support: ticketSummary,
  'email-history': email,
};
const paths = {
  orders: '/orders',
  invoices: '/invoices',
  payments: '/payments',
  support: '/tickets',
  'email-history': `/email-notifications/customers/${clientId}`,
};
const labels = {
  orders: order.orderNumber,
  invoices: invoice.invoiceNumber,
  payments: payment.reference,
  support: ticket.ticketNumber,
  'email-history': email.subject,
};
const pageOf = (data: unknown[], page = 1, totalItems = data.length) => ({
  data,
  pagination: {
    page,
    pageSize: 20,
    totalItems,
    totalPages: Math.ceil(totalItems / 20),
  },
});
beforeEach(() => {
  vi.resetAllMocks();
  api.get.mockResolvedValue({ timeZone: 'Asia/Dhaka' });
});
afterEach(cleanup);

describe('client billing and communication tabs', () => {
  it('links all five tabs and changes client without retaining record or filters', async () => {
    api.page.mockResolvedValue({
      data: [
        clientSummary,
        { ...clientSummary, id: otherClientId, firstName: 'Other' },
      ],
    });
    render(<ClientProfileNavigation customer={client} section="payments" />);
    for (const [section, label] of Object.entries({
      orders: 'Orders',
      invoices: 'Invoices',
      payments: 'Payments',
      support: 'Support',
      'email-history': 'Email history',
    })) {
      const link = screen.getByRole('link', { name: label });
      expect(link.getAttribute('href')).toBe(
        `/admin/customers/${clientId}/${section}`,
      );
      expect(link.getAttribute('aria-current')).toBe(
        section === 'payments' ? 'page' : null,
      );
    }
    await screen.findByRole('option', { name: /Other Client/ });
    fireEvent.change(screen.getByRole('combobox', { name: 'Client' }), {
      target: { value: otherClientId },
    });
    expect(api.push).toHaveBeenCalledWith(
      `/admin/customers/${otherClientId}/payments`,
    );
  });
  it.each(Object.keys(fixtures) as ClientActivityKind[])(
    'renders a compact scoped %s table and its empty state',
    async (kind) => {
      api.page.mockResolvedValue(pageOf([fixtures[kind]]));
      const view = render(
        <ClientActivityRecords customerId={clientId} kind={kind} />,
      );
      await screen.findByRole('button', { name: labels[kind] });
      expect(screen.getAllByRole('table')).toHaveLength(1);
      const url = new URL(api.page.mock.calls[0]![0], 'http://localhost');
      expect(url.pathname).toBe(paths[kind]);
      expect(url.searchParams.get('customerId')).toBe(
        kind === 'email-history' ? null : clientId,
      );
      expect(url.searchParams.get('pageSize')).toBe('20');
      expect(screen.getByText(/1 record found/)).toBeTruthy();
      if (kind === 'payments' || kind === 'orders')
        expect(screen.getByText('BDT 90,071,992,547,409.93')).toBeTruthy();
      view.unmount();
      api.page.mockResolvedValue(pageOf([]));
      render(<ClientActivityRecords customerId={clientId} kind={kind} />);
      await screen.findByText('No matching records for this client.');
      expect(api.mutate).not.toHaveBeenCalled();
    },
  );
  it('applies server search, status and pagination and clears them without losing scope', async () => {
    api.page.mockImplementation(async (path: string) =>
      pageOf(
        [payment],
        Number(new URL(path, 'http://localhost').searchParams.get('page')),
        25,
      ),
    );
    render(<ClientActivityRecords customerId={clientId} kind="payments" />);
    await screen.findByRole('button', { name: payment.reference });
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await screen.findByText(/Page 2 of 2/);
    fireEvent.change(screen.getByRole('textbox', { name: 'Search' }), {
      target: { value: ' invoice 141 ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    await waitFor(() =>
      expect(api.page.mock.lastCall?.[0]).toContain('search=invoice+141'),
    );
    fireEvent.change(screen.getByRole('combobox', { name: 'Status' }), {
      target: { value: 'VERIFIED' },
    });
    await screen.findByRole('button', { name: payment.reference });
    const url = new URL(api.page.mock.lastCall![0], 'http://localhost');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      page: '1',
      pageSize: '20',
      customerId: clientId,
      search: 'invoice 141',
      state: 'VERIFIED',
    });
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    await screen.findByRole('button', { name: payment.reference });
    expect(api.page.mock.lastCall![0]).toBe(
      `/payments?page=1&pageSize=20&customerId=${clientId}`,
    );
    expect(api.mutate).not.toHaveBeenCalled();
  });
  it.each(Object.keys(fixtures) as ClientActivityKind[])(
    'rejects wrong-client %s rows before display',
    async (kind) => {
      const wrong =
        kind === 'support'
          ? { ...ticket, customer: { ...ticket.customer, id: otherClientId } }
          : { ...fixtures[kind], customerId: otherClientId };
      api.page.mockResolvedValue(pageOf([wrong]));
      render(<ClientActivityRecords customerId={clientId} kind={kind} />);
      await screen.findByText(/Client records could not be loaded/);
      expect(screen.queryByRole('button', { name: labels[kind] })).toBeNull();
    },
  );
  it('rejects malformed paging, retries failures, and rejects invalid clients without requests', async () => {
    api.page.mockResolvedValue({
      ...pageOf([email]),
      pagination: { page: 1, pageSize: 100, totalItems: 1, totalPages: 1 },
    });
    const view = render(
      <ClientActivityRecords customerId={clientId} kind="email-history" />,
    );
    await screen.findByText(/Client records could not be loaded/);
    api.page.mockResolvedValue(pageOf([email]));
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await screen.findByRole('button', { name: email.subject });
    view.unmount();
    api.page.mockClear();
    render(<ClientActivityRecords customerId="invalid" kind="orders" />);
    expect(screen.getByText('Invalid client selection.')).toBeTruthy();
    expect(api.page).not.toHaveBeenCalled();
  });
  it('ignores a late response after switching client and clears filters', async () => {
    let resolve!: (value: unknown) => void;
    api.page
      .mockImplementationOnce(
        () =>
          new Promise((done) => {
            resolve = done;
          }),
      )
      .mockResolvedValue(pageOf([]));
    const view = render(
      <ClientActivityRecords customerId={clientId} kind="invoices" />,
    );
    fireEvent.change(screen.getByRole('textbox', { name: 'Search' }), {
      target: { value: 'old search' },
    });
    view.rerender(
      <ClientActivityRecords customerId={otherClientId} kind="invoices" />,
    );
    await screen.findByText('No matching records for this client.');
    await act(async () => resolve(pageOf([invoice])));
    expect(
      screen.queryByRole('button', { name: invoice.invoiceNumber }),
    ).toBeNull();
    expect(
      (screen.getByRole('textbox', { name: 'Search' }) as HTMLInputElement)
        .value,
    ).toBe('');
    expect(api.page.mock.lastCall![0]).toContain(`customerId=${otherClientId}`);
  });
  it.each(['invoices', 'support'] as const)(
    'opens read-only %s details with the expected client and rejects mismatches',
    async (kind) => {
      api.page.mockResolvedValue(pageOf([fixtures[kind]]));
      api.get.mockImplementation(async (path: string) =>
        path.startsWith('/settings')
          ? { timeZone: 'Asia/Dhaka' }
          : kind === 'support'
            ? ticket
            : invoice,
      );
      const view = render(
        <ClientActivityRecords customerId={clientId} kind={kind} />,
      );
      fireEvent.click(
        await screen.findByRole('button', { name: labels[kind] }),
      );
      const dialog = screen.getByRole('dialog');
      await within(dialog).findByText(
        kind === 'support'
          ? ticket.messages[0]!.body
          : invoice.businessIdentity.name,
      );
      expect(api.get).toHaveBeenCalledWith(
        `${paths[kind]}/${fixtures[kind].id}?customerId=${clientId}`,
      );
      expect(
        within(dialog).queryByRole('button', { name: /Send reply|Issue|Pay/ }),
      ).toBeNull();
      expect(api.mutate).not.toHaveBeenCalled();
      view.unmount();
      api.get.mockImplementation(async (path: string) =>
        path.startsWith('/settings')
          ? { timeZone: 'Asia/Dhaka' }
          : kind === 'support'
            ? { ...ticket, customer: { ...ticket.customer, id: otherClientId } }
            : { ...invoice, customerId: otherClientId },
      );
      render(<ClientActivityRecords customerId={clientId} kind={kind} />);
      fireEvent.click(
        await screen.findByRole('button', { name: labels[kind] }),
      );
      await screen.findByText(
        'The selected client record could not be loaded.',
      );
    },
  );
  it('shows safe email metadata without sending or retrieving message bodies', async () => {
    api.page.mockResolvedValue(pageOf([email]));
    render(
      <ClientActivityRecords customerId={clientId} kind="email-history" />,
    );
    fireEvent.click(await screen.findByRole('button', { name: email.subject }));
    await within(screen.getByRole('dialog')).findByText(
      'No delivery attempts recorded.',
    );
    expect(api.get).toHaveBeenCalledTimes(1);
    expect(api.mutate).not.toHaveBeenCalled();
  });
});
