import {
  DEFAULT_BUSINESS_SETTINGS,
  type CustomerDetail,
  type CustomerSummary,
} from '@webhost-billing/shared';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdminCustomerManager } from './admin-customer-manager';
import { AdminCustomerDetail } from './admin-customer-detail';
import { CustomerProfile } from './customer-profile';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
}));

const summary: CustomerSummary = {
  id: '70000000-0000-4000-8000-000000000001',
  customerNumber: 'CUS-70000000',
  status: 'ACTIVE',
  accountStatus: 'ACTIVE',
  email: 'customer@example.test',
  emailVerified: true,
  firstName: 'Amina',
  lastName: 'Rahman',
  companyName: 'Amina Studio',
  createdAt: '2026-08-24T12:00:00.000Z',
  linkedCounts: { orders: 1, services: 2, invoices: 3, tickets: 0 },
};

const detail: CustomerDetail = {
  ...summary,
  phone: '+8801700000000',
  addressLine1: '7 Test Avenue',
  addressLine2: null,
  city: 'Dhaka',
  region: null,
  postalCode: '1200',
  countryCode: 'BD',
  taxIdentifier: null,
  updatedAt: '2026-08-24T12:00:00.000Z',
  linked: {
    orders: [],
    services: [],
    invoices: [],
    payments: [],
    tickets: [],
    counts: { orders: 1, services: 2, invoices: 3, payments: 1, tickets: 0 },
  },
};

const populatedDetail: CustomerDetail = {
  ...detail,
  createdAt: '2026-01-01T20:30:00.000Z',
  updatedAt: '2026-01-01T20:30:00.000Z',
  linked: {
    counts: { orders: 1, services: 1, invoices: 1, payments: 1, tickets: 1 },
    orders: [
      {
        id: '71000000-0000-4000-8000-000000000001',
        status: 'PAID',
        total: { amount: '120000', currency: 'BDT' },
        createdAt: '2026-01-01T20:30:00.000Z',
      },
    ],
    services: [
      {
        id: '71000000-0000-4000-8000-000000000002',
        status: 'ACTIVE',
        productName: 'Starter Hosting',
        domain: 'customer.example.test',
        recurringAmount: { amount: '120000', currency: 'BDT' },
        createdAt: '2026-01-01T20:30:00.000Z',
      },
    ],
    invoices: [
      {
        id: '71000000-0000-4000-8000-000000000003',
        invoiceNumber: 'INV-001003',
        status: 'UNPAID',
        total: { amount: '120000', currency: 'BDT' },
        balanceDue: { amount: '120000', currency: 'BDT' },
        dueAt: '2026-01-01T20:30:00.000Z',
        createdAt: '2026-01-01T20:30:00.000Z',
      },
    ],
    payments: [
      {
        id: '71000000-0000-4000-8000-000000000004',
        invoiceId: '71000000-0000-4000-8000-000000000003',
        invoiceNumber: 'INV-001003',
        kind: 'CHARGE',
        status: 'SUCCEEDED',
        provider: 'manual',
        amount: { amount: '120000', currency: 'BDT' },
        createdAt: '2026-01-01T20:30:00.000Z',
      },
    ],
    tickets: [
      {
        id: '71000000-0000-4000-8000-000000000005',
        ticketNumber: 'TKT-001005',
        subject: 'Account question',
        status: 'OPEN',
        priority: 'NORMAL',
        createdAt: '2026-01-01T20:30:00.000Z',
        updatedAt: '2026-01-01T20:30:00.000Z',
      },
    ],
  },
};

afterEach(() => vi.unstubAllGlobals());

describe('customer management interfaces', () => {
  it('resets the captured form after delayed creation succeeds, closes the modal and refreshes once', async () => {
    let created = false;
    let release: ((response: Response) => void) | undefined;
    const fetchMock = vi.fn(
      (input: RequestInfo | URL, options?: RequestInit) => {
        const url = String(input);
        if (url.endsWith('/auth/csrf'))
          return Promise.resolve(
            jsonResponse({
              success: true,
              data: { csrfToken: 'fictional-csrf-token' },
            }),
          );
        if (url.endsWith('/customers') && options?.method === 'POST')
          return new Promise<Response>((resolve) => {
            release = resolve;
          });
        return Promise.resolve(
          jsonResponse({
            success: true,
            data: created ? [summary] : [],
            pagination: {
              page: 1,
              pageSize: 20,
              totalItems: created ? 1 : 0,
              totalPages: 1,
            },
          }),
        );
      },
    );
    vi.stubGlobal('fetch', fetchMock);
    render(<AdminCustomerManager />);
    fireEvent.click(screen.getByRole('button', { name: 'Add customer' }));
    for (const [label, value] of Object.entries({
      Email: 'customer@example.test',
      'Initial password': 'fictional password for tests only',
      'First name': 'Amina',
      'Last name': 'Rahman',
      Address: '7 Test Avenue',
      City: 'Dhaka',
      'Country code': 'BD',
    }))
      fireEvent.change(screen.getByLabelText(label), { target: { value } });
    const form = screen
      .getByRole('button', { name: 'Create customer' })
      .closest('form')!;
    const reset = vi.spyOn(form, 'reset');
    fireEvent.submit(form);
    await waitFor(() => expect(release).toBeDefined());
    expect(reset).not.toHaveBeenCalled();
    await act(async () => {
      created = true;
      release?.(jsonResponse({ success: true, data: detail }));
    });
    await screen.findByRole('link', { name: 'Amina Rahman' });
    expect(reset).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByRole('button', { name: 'Create customer' }),
    ).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(
      fetchMock.mock.calls.filter(
        ([input, options]) =>
          String(input).endsWith('/customers') && options?.method === 'POST',
      ),
    ).toHaveLength(1);
  });
  it('renders administrator search results with status and detail navigation', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          success: true,
          data: [summary],
          pagination: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 },
        }),
      ),
    );
    render(<AdminCustomerManager />);
    expect(
      (await screen.findByRole('link', { name: 'Amina Rahman' })).getAttribute(
        'href',
      ),
    ).toBe(`/admin/customers/${summary.id}`);
    expect(
      screen.getByRole('cell', { name: 'customer@example.test' }),
    ).toBeTruthy();
    expect(screen.getByText('Verified')).toBeTruthy();
  });

  it('confirms a verification resend, queues once and keeps the account unverified', async () => {
    let finish: ((response: Response) => void) | undefined;
    const pending = {
      ...detail,
      emailVerified: false,
      accountStatus: 'PENDING_VERIFICATION' as const,
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/resend-verification'))
        return new Promise<Response>((resolve) => {
          finish = resolve;
        });
      if (url.endsWith('/auth/csrf'))
        return jsonResponse({
          success: true,
          data: { csrfToken: 'fictional-csrf' },
        });
      return jsonResponse({
        success: true,
        data: url.endsWith('/settings') ? DEFAULT_BUSINESS_SETTINGS : pending,
      });
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<AdminCustomerDetail customerId={detail.id} />);
    const user = userEvent.setup();
    const action = await screen.findByRole('button', {
      name: 'Resend verification email',
    });
    await user.click(action);
    expect(screen.getByRole('alertdialog').textContent).toContain(detail.email);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(
      fetchMock.mock.calls.some(([input]) =>
        String(input).endsWith('/resend-verification'),
      ),
    ).toBe(false);
    await user.click(action);
    await user.click(
      screen.getByRole('button', {
        name: 'Queue verification email',
      }),
    );
    await waitFor(() => expect(finish).toBeDefined());
    expect(
      (screen.getByRole('button', { name: 'Working…' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    await act(async () =>
      finish!(
        jsonResponse(
          { success: true, data: { message: 'Verification email queued.' } },
          202,
        ),
      ),
    );
    expect((await screen.findByRole('status')).textContent).toContain(
      'Verification email queued',
    );
    expect(screen.getByText('Verification pending')).toBeTruthy();
    expect((action as HTMLButtonElement).disabled).toBe(true);
    expect(
      fetchMock.mock.calls.filter(([input]) =>
        String(input).endsWith('/resend-verification'),
      ),
    ).toHaveLength(1);
  });

  it('retains the resend request key after a lost response so retries cannot duplicate email', async () => {
    const bodies: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, options?: RequestInit) => {
        const url = String(input);
        if (url.endsWith('/resend-verification')) {
          bodies.push(String(options?.body));
          if (bodies.length === 1)
            throw new Error('Connection interrupted. Try again.');
          return jsonResponse(
            { success: true, data: { message: 'Verification email queued.' } },
            202,
          );
        }
        if (url.endsWith('/auth/csrf'))
          return jsonResponse({
            success: true,
            data: { csrfToken: 'fictional-csrf' },
          });
        return jsonResponse({
          success: true,
          data: url.endsWith('/settings')
            ? DEFAULT_BUSINESS_SETTINGS
            : {
                ...detail,
                emailVerified: false,
                accountStatus: 'PENDING_VERIFICATION',
              },
        });
      }),
    );
    render(<AdminCustomerDetail customerId={detail.id} />);
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', {
        name: 'Resend verification email',
      }),
    );
    await user.click(
      screen.getByRole('button', {
        name: 'Queue verification email',
      }),
    );
    expect((await screen.findByRole('alert')).textContent).toContain(
      'Connection interrupted',
    );
    await user.click(
      screen.getByRole('button', {
        name: 'Resend verification email',
      }),
    );
    await user.click(
      screen.getByRole('button', {
        name: 'Queue verification email',
      }),
    );
    await screen.findByRole('status');
    expect(bodies).toHaveLength(2);
    expect(bodies[1]).toBe(bodies[0]);
    const body = JSON.parse(bodies[0]) as { requestId: string };
    expect(Object.keys(body)).toEqual(['requestId']);
    expect(body.requestId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it.each([
    detail,
    { ...detail, emailVerified: false, accountStatus: 'DISABLED' as const },
    {
      ...detail,
      emailVerified: false,
      status: 'INACTIVE' as const,
      accountStatus: 'PENDING_VERIFICATION' as const,
    },
  ])(
    'omits resend for verified or unavailable accounts ($accountStatus)',
    async (customer) => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async (input: RequestInfo | URL) =>
          jsonResponse({
            success: true,
            data: String(input).endsWith('/settings')
              ? DEFAULT_BUSINESS_SETTINGS
              : customer,
          }),
        ),
      );
      render(<AdminCustomerDetail customerId={customer.id} />);
      await screen.findByRole('heading', { name: 'Operational context' });
      expect(
        screen.queryByRole('button', { name: 'Resend verification email' }),
      ).toBeNull();
    },
  );

  it('loads the signed-in customer profile and exposes permitted profile fields', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          success: true,
          data: {
            userId: '70000000-0000-4000-8000-000000000002',
            email: summary.email,
            role: 'CUSTOMER',
            customerId: summary.id,
          },
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ success: true, data: detail }));
    vi.stubGlobal('fetch', fetchMock);
    render(<CustomerProfile />);
    expect(
      await screen.findByRole('heading', { name: 'Profile & security' }),
    ).toBeTruthy();
    expect(
      (screen.getByLabelText('First name') as HTMLInputElement).value,
    ).toBe('Amina');
    expect(
      (screen.getByLabelText('Country code') as HTMLInputElement).value,
    ).toBe('BD');
    expect(
      screen.getByRole('button', { name: 'Change password' }),
    ).toBeTruthy();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });

  it('puts safe operational context before edit forms and links to protected workspaces', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith(`/customers/${summary.id}`)) {
          return jsonResponse({ success: true, data: populatedDetail });
        }
        if (url.endsWith('/settings')) {
          return jsonResponse({
            success: true,
            data: {
              ...DEFAULT_BUSINESS_SETTINGS,
              timeZone: 'Asia/Dhaka',
              credentialStatuses: [],
            },
          });
        }
        throw new Error(`Unexpected request: ${url}`);
      }),
    );

    render(<AdminCustomerDetail customerId={summary.id} />);

    const operational = await screen.findByRole('heading', {
      name: 'Operational context',
    });
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Edit customer' }));
    const administration = screen.getByRole('heading', {
      name: 'Customer administration',
    });
    expect(
      operational.compareDocumentPosition(administration) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.getAllByText(/BDT 1,200\.00/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/minor units/i)).toBeNull();
    const businessDate = new Intl.DateTimeFormat('en-BD', {
      dateStyle: 'medium',
      timeZone: 'Asia/Dhaka',
    }).format(new Date('2026-01-01T20:30:00.000Z'));
    expect(
      screen.getAllByText(new RegExp(businessDate)).length,
    ).toBeGreaterThan(0);
    expect(
      screen
        .getByRole('link', { name: 'INV-001003 · Unpaid' })
        .getAttribute('href'),
    ).toBe(`/admin/customers/${summary.id}/invoices`);
    expect(
      screen.getByRole('link', { name: 'Paid' }).getAttribute('href'),
    ).toBe(`/admin/customers/${summary.id}/orders`);
    expect(
      screen.getByRole('link', { name: /Orders\s+1/ }).getAttribute('href'),
    ).toBe(`/admin/customers/${summary.id}/orders`);
  });

  it('shows bounded empty records and a recoverable load failure', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('Customer context unavailable'))
      .mockRejectedValueOnce(new Error('Customer context unavailable'))
      .mockResolvedValueOnce(jsonResponse({ success: true, data: detail }))
      .mockResolvedValueOnce(
        jsonResponse({
          success: true,
          data: {
            ...DEFAULT_BUSINESS_SETTINGS,
            credentialStatuses: [],
          },
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    render(<AdminCustomerDetail customerId={summary.id} />);
    expect(
      await screen.findByText('Customer context unavailable'),
    ).toBeTruthy();
    screen.getByRole('button', { name: 'Try again' }).click();
    expect(await screen.findByText('No orders')).toBeTruthy();
    expect(screen.getByText('No services')).toBeTruthy();
    expect(screen.getByText('No invoices')).toBeTruthy();
    expect(screen.getByText('No payments')).toBeTruthy();
    expect(screen.getByText('No tickets')).toBeTruthy();
  });
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
