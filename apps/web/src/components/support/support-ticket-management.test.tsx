import type {
  Service,
  TicketDetail,
  TicketSetupOptions,
} from '@webhost-billing/shared';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdminTicketManager } from './admin-ticket-manager';
import { CustomerTicketManager } from './customer-ticket-manager';

const ticketId = '40000000-0000-4000-8000-000000000001';
const customerId = '40000000-0000-4000-8000-000000000002';
const customerUserId = '40000000-0000-4000-8000-000000000003';
const adminId = '40000000-0000-4000-8000-000000000004';
const serviceId = '40000000-0000-4000-8000-000000000005';

const ticket: TicketDetail = {
  id: ticketId,
  ticketNumber: 'TKT-20260825-ABC123',
  customer: {
    id: customerId,
    customerNumber: 'CUS-COMMAND20',
    name: 'Fictional Hosting Customer',
  },
  service: {
    id: serviceId,
    productName: 'Starter Hosting',
    domain: 'ticket-customer.example.test',
    status: 'ACTIVE',
  },
  assignee: null,
  subject: 'Fictional hosting account is unavailable',
  status: 'WAITING_FOR_STAFF',
  priority: 'NORMAL',
  messageCount: 1,
  lastReplyAt: '2026-08-25T10:00:00.000Z',
  closedAt: null,
  createdAt: '2026-08-25T10:00:00.000Z',
  updatedAt: '2026-08-25T10:00:00.000Z',
  messages: [
    {
      id: '40000000-0000-4000-8000-000000000006',
      ticketId,
      authorUserId: customerUserId,
      authorName: 'Fictional Hosting Customer',
      kind: 'CUSTOMER',
      body: 'Please check the development-only hosting account.',
      createdAt: '2026-08-25T10:00:00.000Z',
    },
  ],
};

const service: Service = {
  id: serviceId,
  customerId,
  customerName: ticket.customer.name,
  customerEmail: 'command20-customer@example.test',
  orderId: null,
  orderNumber: null,
  orderItemId: null,
  productId: '40000000-0000-4000-8000-000000000007',
  productPriceId: '40000000-0000-4000-8000-000000000008',
  productName: 'Starter Hosting',
  productDescription: 'Fictional service.',
  server: {
    id: '40000000-0000-4000-8000-000000000009',
    name: 'Development Server',
    hostname: 'server.example.test',
    status: 'ACTIVE',
    adapterKey: 'fake-panel',
  },
  status: 'ACTIVE',
  domain: 'ticket-customer.example.test',
  controlPanelUsername: 'ticketcustomer',
  externalAccountId: 'fake-command20-account',
  billingPeriod: 'MONTHLY',
  recurringAmount: { amount: '12000', currency: 'BDT' },
  startedAt: '2026-08-25T10:00:00.000Z',
  nextDueAt: '2026-09-25T10:00:00.000Z',
  activatedAt: '2026-08-25T10:00:00.000Z',
  suspendedAt: null,
  suspensionReason: null,
  provisioningFailureReason: null,
  cancelledAt: null,
  cancellationReason: null,
  terminatedAt: null,
  terminationReason: null,
  createdAt: '2026-08-25T10:00:00.000Z',
  updatedAt: '2026-08-25T10:00:00.000Z',
};

const setup: TicketSetupOptions = {
  admins: [{ userId: adminId, displayName: 'Support Administrator' }],
};

describe('support ticket interfaces', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('lets a customer open a plain-text ticket linked to their service', async () => {
    const user = userEvent.setup();
    const created: TicketDetail = {
      ...ticket,
      id: '40000000-0000-4000-8000-000000000010',
      ticketNumber: 'TKT-20260825-NEW123',
      subject: 'New fictional support request',
      status: 'OPEN',
    };
    const fetchMock = vi.fn(
      (request: RequestInfo | URL, init?: RequestInit) => {
        const url = String(request);
        if (url.includes('/auth/csrf')) return Promise.resolve(csrf());
        if (init?.method === 'POST' && url.endsWith('/tickets')) {
          return Promise.resolve(success(created));
        }
        if (url.includes('/tickets/my')) {
          return Promise.resolve(paginated([withoutMessages(ticket)]));
        }
        if (url.includes('/services/my')) {
          return Promise.resolve(paginated([service]));
        }
        return Promise.resolve(success(ticket));
      },
    );
    vi.stubGlobal('fetch', fetchMock);
    render(<CustomerTicketManager />);

    expect(
      await screen.findByRole('heading', { name: 'Support tickets' }),
    ).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Open ticket' }));
    await user.type(
      screen.getByLabelText('Subject'),
      'New fictional support request',
    );
    await user.selectOptions(
      screen.getByLabelText('Hosting service (optional)'),
      serviceId,
    );
    await user.type(
      screen.getByLabelText('What can we help with?'),
      'Plain-text customer details.',
    );
    await user.click(
      screen.getByRole('button', { name: 'Open support ticket' }),
    );

    expect(
      await screen.findByText('TKT-20260825-NEW123 was opened.'),
    ).toBeTruthy();
    const mutation = fetchMock.mock.calls.find(
      ([request, init]) =>
        String(request).endsWith('/tickets') &&
        (init as RequestInit | undefined)?.method === 'POST',
    );
    const body = JSON.parse(String((mutation?.[1] as RequestInit).body));
    expect(body).toMatchObject({
      subject: 'New fictional support request',
      body: 'Plain-text customer details.',
      serviceId,
    });
    expect(body.submissionKey).toMatch(/^[0-9a-f-]{36}$/i);
    expect(body).not.toHaveProperty('attachments');
  });

  it('adds a customer reply and explains the no-attachment policy', async () => {
    const user = userEvent.setup();
    const replied: TicketDetail = {
      ...ticket,
      status: 'WAITING_FOR_STAFF',
      messageCount: 2,
      messages: [
        ...ticket.messages,
        {
          ...ticket.messages[0]!,
          id: '40000000-0000-4000-8000-000000000011',
          body: 'Customer follow-up.',
        },
      ],
    };
    const fetchMock = vi.fn(
      (request: RequestInfo | URL, init?: RequestInit) => {
        const url = String(request);
        if (url.includes('/auth/csrf')) return Promise.resolve(csrf());
        if (init?.method === 'POST') return Promise.resolve(success(replied));
        if (url.includes('/tickets/my')) {
          return Promise.resolve(paginated([withoutMessages(ticket)]));
        }
        if (url.includes('/services/my')) return Promise.resolve(paginated([]));
        return Promise.resolve(success(ticket));
      },
    );
    vi.stubGlobal('fetch', fetchMock);
    render(<CustomerTicketManager />);

    const replyBox = await screen.findByLabelText('Reply in plain text');
    expect(
      screen.getByText(/Attachments and HTML are not accepted/i),
    ).toBeTruthy();
    await user.type(replyBox, 'Customer follow-up.');
    await user.click(screen.getByRole('button', { name: 'Send reply' }));
    expect(
      await screen.findByText(
        'Your reply was added and the support team was notified.',
      ),
    ).toBeTruthy();
    const mutation = fetchMock.mock.calls.find(
      ([request, init]) =>
        String(request).includes(`/tickets/${ticketId}/replies`) &&
        (init as RequestInit | undefined)?.method === 'POST',
    );
    expect(
      JSON.parse(String((mutation?.[1] as RequestInit).body)),
    ).toMatchObject({
      body: 'Customer follow-up.',
    });
  });

  it('lets an administrator filter, reply, assign, prioritize, and close', async () => {
    const user = userEvent.setup();
    const replied: TicketDetail = {
      ...ticket,
      status: 'WAITING_FOR_CUSTOMER',
      messageCount: 2,
      messages: [
        ...ticket.messages,
        {
          id: '40000000-0000-4000-8000-000000000012',
          ticketId,
          authorUserId: adminId,
          authorName: 'Support Administrator',
          kind: 'ADMIN',
          body: 'Administrator response.',
          createdAt: '2026-08-25T10:05:00.000Z',
        },
      ],
    };
    const closed: TicketDetail = {
      ...replied,
      assignee: setup.admins[0]!,
      priority: 'HIGH',
      status: 'CLOSED',
      closedAt: '2026-08-25T10:10:00.000Z',
    };
    const fetchMock = vi.fn(
      (request: RequestInfo | URL, init?: RequestInit) => {
        const url = String(request);
        if (url.includes('/auth/csrf')) return Promise.resolve(csrf());
        if (init?.method === 'POST') return Promise.resolve(success(replied));
        if (init?.method === 'PATCH') return Promise.resolve(success(closed));
        if (url.includes('/tickets/setup-options')) {
          return Promise.resolve(success(setup));
        }
        if (url.includes(`/tickets/${ticketId}`)) {
          return Promise.resolve(success(ticket));
        }
        return Promise.resolve(paginated([withoutMessages(ticket)]));
      },
    );
    vi.stubGlobal('fetch', fetchMock);
    render(<AdminTicketManager />);

    expect(
      await screen.findByRole('heading', { name: 'Support queue' }),
    ).toBeTruthy();
    await user.type(
      screen.getByLabelText('Reply in plain text'),
      'Administrator response.',
    );
    await user.click(screen.getByRole('button', { name: 'Send reply' }));
    expect(
      await screen.findByText(
        'Reply added. A customer email notification was queued.',
      ),
    ).toBeTruthy();

    const controlsButton = screen.getByRole('button', {
      name: 'Save ticket controls',
    });
    const controls = controlsButton.closest('form')!;
    await user.selectOptions(
      within(controls).getByLabelText('Assign administrator'),
      adminId,
    );
    await user.selectOptions(
      within(controls).getByLabelText('Priority'),
      'HIGH',
    );
    await user.selectOptions(
      within(controls).getByLabelText('Status'),
      'CLOSED',
    );
    await user.click(controlsButton);
    expect(
      await screen.findByText(
        'Ticket assignment, priority, and status were saved.',
      ),
    ).toBeTruthy();

    const patch = fetchMock.mock.calls.find(
      ([, init]) => (init as RequestInit | undefined)?.method === 'PATCH',
    );
    expect(JSON.parse(String((patch?.[1] as RequestInit).body))).toEqual({
      status: 'CLOSED',
      priority: 'HIGH',
      assignedAdminId: adminId,
    });

    await user.type(screen.getByLabelText('Search queue'), 'fictional');
    await user.click(screen.getByRole('button', { name: 'Apply filters' }));
    expect(
      fetchMock.mock.calls.some(([request]) =>
        String(request).includes('search=fictional'),
      ),
    ).toBe(true);
  });
});

function withoutMessages(value: TicketDetail) {
  const { messages, ...summary } = value;
  void messages;
  return summary;
}

function success(data: unknown) {
  return new Response(JSON.stringify({ success: true, data }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function paginated(data: unknown[]) {
  return new Response(
    JSON.stringify({
      success: true,
      data,
      pagination: {
        page: 1,
        pageSize: 100,
        totalItems: data.length,
        totalPages: data.length ? 1 : 0,
      },
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}

function csrf() {
  return success({ csrfToken: 'x'.repeat(32) });
}
