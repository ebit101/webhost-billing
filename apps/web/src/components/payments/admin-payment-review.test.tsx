import type { ManualPayment } from '@webhost-billing/shared';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdminPaymentReview } from './admin-payment-review';
import { AdminPaymentManager } from './admin-payment-manager';

const id = '84000000-0000-4000-8000-000000000001';
const otherId = '84000000-0000-4000-8000-000000000002';
const customerId = '84000000-0000-4000-8000-000000000003';
const invoiceId = '84000000-0000-4000-8000-000000000004';
const payment: ManualPayment = {
  id,
  invoiceId,
  customerId,
  invoiceNumber: 'INV-REVIEW-84',
  customerName: 'Historical Payer',
  originalPaymentId: null,
  kind: 'CHARGE',
  state: 'VERIFIED',
  method: 'BANK_TRANSFER',
  reference: 'Fictional receipt 84',
  proof: {
    payerName: '<b>Fictional payer</b>',
    note: '<script>fictional()</script>\nUnverified note',
  },
  amount: { amount: '9007199254740993', currency: 'BDT' },
  adjustedAmount: { amount: '500', currency: 'BDT' },
  refundableAmount: { amount: '9007199254740493', currency: 'BDT' },
  submittedByRole: 'CUSTOMER',
  failureReason: null,
  receivedAt: '2026-10-04T02:00:00.000Z',
  reviewedAt: '2026-10-04T03:00:00.000Z',
  verifiedAt: '2026-10-04T04:00:00.000Z',
  createdAt: '2026-10-04T01:00:00.000Z',
  updatedAt: '2026-10-04T05:00:00.000Z',
};
const response = (data: unknown = payment, status = 200) =>
  new Response(JSON.stringify({ success: status === 200, data }), { status });
const paginated = (data: unknown[]) =>
  new Response(
    JSON.stringify({
      success: true,
      data,
      pagination: {
        page: 1,
        pageSize: 100,
        totalItems: data.length,
        totalPages: 1,
      },
    }),
  );
const pending = {
  ...payment,
  state: 'PENDING' as const,
  refundableAmount: { amount: '0', currency: 'BDT' },
};
const invoice = {
  id: invoiceId,
  invoiceNumber: payment.invoiceNumber,
  customerName: payment.customerName,
  status: 'UNPAID',
  currency: 'BDT',
  balanceDue: { amount: '12000', currency: 'BDT' },
};
afterEach(() => vi.unstubAllGlobals());
const fact = (label: string) =>
  screen
    .getByText(label, { selector: 'dt' })
    .parentElement!.querySelector('dd')!.textContent;
function mockRead(
  detail: () => Promise<Response> = async () => response(),
  settings: unknown = { timeZone: 'America/New_York' },
) {
  const mock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    void init;
    return String(input).endsWith('/settings') ? response(settings) : detail();
  });
  vi.stubGlobal('fetch', mock);
  return mock;
}
function workspace(
  payments: ManualPayment[] = [pending],
  detail: () => Promise<Response> = async () => response(pending),
  mutate: (path: string, body: unknown) => Promise<Response> = async () =>
    response(payment),
  invoiceRead: () => Promise<Response> = async () => response(invoice),
) {
  const mock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.pathname === '/auth/csrf')
      return response({ csrfToken: 'x'.repeat(96) });
    if (init?.method && init.method !== 'GET')
      return mutate(url.pathname, JSON.parse(String(init.body)) as unknown);
    if (url.pathname === '/payment-gateways/failures') return response([]);
    if (url.pathname === '/payments/settings')
      return response({ partialPaymentsEnabled: false });
    if (url.pathname === '/settings')
      return response({ timeZone: 'America/New_York' });
    if (url.pathname === '/payments') return paginated(payments);
    if (url.pathname === '/invoices') return paginated([invoice]);
    if (url.pathname.startsWith('/invoices/')) return invoiceRead();
    if (url.pathname.startsWith('/customers/'))
      return response({
        id: customerId,
        firstName: 'Fictional',
        lastName: 'Payer',
      });
    return detail();
  });
  vi.stubGlobal('fetch', mock);
  return mock;
}

describe('read-only administrator manual-payment review', () => {
  it('shows only validated facts, escaped proof, lossless money, business-zone dates and fixed links', async () => {
    const mock = mockRead();
    const close = vi.fn();
    render(
      <AdminPaymentReview
        paymentId={id}
        customerId={customerId}
        onClose={close}
      />,
    );
    expect(
      screen.getByRole('status', { name: 'Loading payment review' }),
    ).toBeTruthy();
    expect(document.activeElement?.textContent).toBe('Payment review');
    await screen.findByText(payment.reference);
    expect(fact('Payment state')).toBe('VERIFIED');
    expect(fact('Transaction kind')).toBe('CHARGE');
    expect(fact('Manual method')).toBe('BANK TRANSFER');
    expect(fact('Submitted by role')).toBe('CUSTOMER');
    expect(fact('Payer name')).toBe(payment.proof.payerName);
    expect(fact('Submitted note')).toBe(payment.proof.note);
    expect(document.querySelector('b, script')).toBeNull();
    expect(fact('Original transaction amount')).toBe(
      'BDT 90,071,992,547,409.93',
    );
    expect(fact('Adjusted amount')).toBe('BDT 5.00');
    expect(fact('Remaining refundable capacity')).toBe(
      'BDT 90,071,992,547,404.93',
    );
    for (const [label, value] of [
      ['Received', '3 Oct 2026, 22:00'],
      ['Reviewed', '3 Oct 2026, 23:00'],
      ['Verified', '4 Oct 2026, 00:00'],
      ['Created', '3 Oct 2026, 21:00'],
      ['Updated', '4 Oct 2026, 01:00'],
    ])
      expect(fact(label!)).toBe(value);
    expect(screen.getByText(/Dates shown in America\/New_York/)).toBeTruthy();
    expect(screen.getByText(/not the current customer profile/)).toBeTruthy();
    expect(
      screen.getByText(/Payment is not proof of hosting provisioning/),
    ).toBeTruthy();
    expect(
      screen.getByRole('link', { name: 'View customer' }).getAttribute('href'),
    ).toBe(`/admin/customers/${customerId}`);
    expect(
      screen.getByRole('link', { name: 'View invoice' }).getAttribute('href'),
    ).toBe(`/admin/invoices/${invoiceId}`);
    expect(
      screen.queryByText('Invoice balance', { selector: 'dt' }),
    ).toBeNull();
    expect(document.querySelector('form, input')).toBeNull();
    expect(
      mock.mock.calls.map(([url]) => new URL(String(url)).pathname),
    ).toEqual([`/payments/${id}`, '/settings']);
    expect(
      mock.mock.calls.every(
        ([, init]) =>
          init?.credentials === 'include' &&
          init.cache === 'no-store' &&
          !init.method,
      ),
    ).toBe(true);
    const user = userEvent.setup();
    screen.getByRole('button', { name: 'Close payment review' }).focus();
    await user.keyboard('{Enter}');
    expect(close).toHaveBeenCalledTimes(1);
    expect(mock).toHaveBeenCalledTimes(2);
  });

  it.each(['REFUND', 'REVERSAL'] as const)(
    'explains %s as a separate transaction without fetching original history',
    async (kind) => {
      const mock = mockRead(async () =>
        response({
          ...payment,
          kind,
          state: kind === 'REFUND' ? 'REFUNDED' : 'REVERSED',
          originalPaymentId: otherId,
        }),
      );
      render(<AdminPaymentReview paymentId={id} onClose={vi.fn()} />);
      await screen.findByText(payment.reference);
      expect(fact('Transaction kind')).toBe(kind);
      expect(
        screen.getByText(/the original payment remains unchanged/).textContent,
      ).toContain(otherId);
      expect(screen.getAllByRole('link')).toHaveLength(2);
      expect(mock).toHaveBeenCalledTimes(2);
    },
  );

  it.each(['PENDING', 'REJECTED'] as const)(
    'keeps %s distinct, with absent facts and zero capacity not presented as settlement',
    async (state) => {
      mockRead(async () =>
        response({
          ...pending,
          state,
          proof: { payerName: null, note: null },
          submittedByRole: null,
          receivedAt: null,
          reviewedAt: null,
          verifiedAt: null,
          failureReason:
            state === 'REJECTED' ? '<i>Rejected reference</i>' : null,
        }),
      );
      render(<AdminPaymentReview paymentId={id} onClose={vi.fn()} />);
      await screen.findByText(payment.reference);
      expect(fact('Payment state')).toBe(state);
      for (const label of [
        'Payer name',
        'Submitted note',
        'Submitted by role',
        'Received',
        'Reviewed',
        'Verified',
      ])
        expect(fact(label)).toBe('Not recorded');
      expect(fact('Remaining refundable capacity')).toBe('BDT 0.00');
      expect(screen.getByText(/does not prove settlement/)).toBeTruthy();
      if (state === 'REJECTED')
        expect(fact('Rejection or failure reason')).toBe(
          '<i>Rejected reference</i>',
        );
      expect(document.querySelector('i')).toBeNull();
    },
  );

  it.each(['../settings', 'not-a-uuid'])(
    'rejects invalid selected ID %s before dispatch',
    (paymentId) => {
      const mock = mockRead();
      render(<AdminPaymentReview paymentId={paymentId} onClose={vi.fn()} />);
      expect(
        screen.getByRole('heading', { name: 'Payment review unavailable' }),
      ).toBeTruthy();
      expect(
        screen.queryByRole('button', { name: 'Retry payment review' }),
      ).toBeNull();
      expect(mock).not.toHaveBeenCalled();
    },
  );
  it('rejects invalid customer context before dispatch', () => {
    const mock = mockRead();
    render(
      <AdminPaymentReview
        paymentId={id}
        customerId="../customers"
        onClose={vi.fn()}
      />,
    );
    expect(mock).not.toHaveBeenCalled();
  });

  it.each([
    { customerId: '//evil.example' },
    { invoiceId: '../invoices' },
    { id: null },
    { amount: { amount: 12000, currency: 'BDT' } },
    { proof: { payerName: 'Name', note: null, html: '<b>x</b>' } },
    { receivedAt: 'invalid' },
  ])(
    'fails closed for malformed data %j without links or settings reads',
    async (override) => {
      const mock = mockRead(async () => response({ ...payment, ...override }));
      render(<AdminPaymentReview paymentId={id} onClose={vi.fn()} />);
      await screen.findByRole('heading', {
        name: 'Payment review response is invalid',
      });
      expect(screen.queryAllByRole('link')).toHaveLength(0);
      expect(mock).toHaveBeenCalledTimes(1);
    },
  );
  it.each([{ id: otherId }, { customerId: otherId }])(
    'rejects valid but mismatched selected context %j',
    async (override) => {
      const mock = mockRead(async () => response({ ...payment, ...override }));
      render(
        <AdminPaymentReview
          paymentId={id}
          customerId={customerId}
          onClose={vi.fn()}
        />,
      );
      await screen.findByRole('heading', {
        name: 'Payment review unavailable',
      });
      expect(screen.queryAllByRole('link')).toHaveLength(0);
      expect(mock).toHaveBeenCalledTimes(1);
    },
  );
  it.each([403, 404])(
    'treats %s as unavailable, not cached context',
    async (status) => {
      mockRead(async () => response(undefined, status));
      render(<AdminPaymentReview paymentId={id} onClose={vi.fn()} />);
      await screen.findByRole('heading', {
        name: 'Payment review unavailable',
      });
      expect(screen.queryAllByRole('link')).toHaveLength(0);
    },
  );
  it.each([{}, { timeZone: 'made/up' }])(
    'requires validated business timezone %j',
    async (settings) => {
      mockRead(undefined, settings);
      render(<AdminPaymentReview paymentId={id} onClose={vi.fn()} />);
      await screen.findByRole('heading', {
        name: 'Payment review response is invalid',
      });
      expect(screen.queryByText(payment.reference)).toBeNull();
    },
  );
  it('recovers from transport failure without exposing raw errors or mutating', async () => {
    let failed = true;
    const mock = mockRead(async () => {
      if (failed) throw new Error('raw-sensitive-provider-error');
      return response();
    });
    render(<AdminPaymentReview paymentId={id} onClose={vi.fn()} />);
    await screen.findByRole('heading', {
      name: 'Payment review could not be loaded',
    });
    expect(screen.queryByText(/raw-sensitive-provider-error/)).toBeNull();
    failed = false;
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Retry payment review' }));
    await screen.findByText(payment.reference);
    expect(mock).toHaveBeenCalledTimes(3);
  });
  it('discards a delayed old selection and aborts its request', async () => {
    let resolve: (value: Response) => void = () => {};
    const held = new Promise<Response>((done) => {
      resolve = done;
    });
    const mock = mockRead(() => held);
    const view = render(
      <AdminPaymentReview paymentId={id} onClose={vi.fn()} />,
    );
    const signal = mock.mock.calls[0]![1]!.signal!;
    mock.mockImplementation(async (input) =>
      String(input).endsWith('/settings')
        ? response({ timeZone: 'Asia/Dhaka' })
        : response({ ...payment, id: otherId, reference: 'New selection' }),
    );
    view.rerender(<AdminPaymentReview paymentId={otherId} onClose={vi.fn()} />);
    await screen.findByText('New selection');
    expect(signal.aborted).toBe(true);
    await act(async () => resolve(response()));
    expect(screen.queryByText(payment.reference)).toBeNull();
    expect(screen.getByText('New selection')).toBeTruthy();
  });

  it('rejects non-JSON detail without exposing the body', async () => {
    const mock = mockRead(async () => new Response('fictional-raw-response'));
    render(<AdminPaymentReview paymentId={id} onClose={vi.fn()} />);
    await screen.findByRole('heading', {
      name: 'Payment review response is invalid',
    });
    expect(screen.queryByText('fictional-raw-response')).toBeNull();
    expect(mock).toHaveBeenCalledTimes(1);
  });

  it('fails closed when the required settings read fails', async () => {
    const mock = mockRead();
    mock.mockImplementation(async (input) =>
      String(input).endsWith('/settings')
        ? response(undefined, 500)
        : response(),
    );
    render(<AdminPaymentReview paymentId={id} onClose={vi.fn()} />);
    await screen.findByRole('heading', {
      name: 'Payment review could not be loaded',
    });
    expect(screen.queryAllByRole('link')).toHaveLength(0);
  });

  it('cannot revive an old selection through a delayed retry or timezone response', async () => {
    let resolve: (value: Response) => void = () => {};
    const held = new Promise<Response>((done) => {
      resolve = done;
    });
    const mock = mockRead(async () => response(undefined, 500));
    const view = render(
      <AdminPaymentReview paymentId={id} onClose={vi.fn()} />,
    );
    await screen.findByRole('heading', {
      name: 'Payment review could not be loaded',
    });
    mock.mockImplementation(async (input) =>
      String(input).endsWith('/settings') ? held : response(),
    );
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Retry payment review' }));
    await waitFor(() =>
      expect(
        mock.mock.calls.some(([input]) => String(input).endsWith('/settings')),
      ).toBe(true),
    );
    const oldSignal = mock.mock.calls.find(([input]) =>
      String(input).endsWith('/settings'),
    )![1]!.signal!;
    mock.mockImplementation(async (input) =>
      String(input).endsWith('/settings')
        ? response({ timeZone: 'Asia/Dhaka' })
        : response({
            ...payment,
            id: otherId,
            reference: 'Retried new selection',
          }),
    );
    view.rerender(<AdminPaymentReview paymentId={otherId} onClose={vi.fn()} />);
    await screen.findByText('Retried new selection');
    expect(oldSignal.aborted).toBe(true);
    await act(async () => resolve(response({ timeZone: 'America/New_York' })));
    expect(screen.queryByText(payment.reference)).toBeNull();
    expect(screen.getByText(/Dates shown in Asia\/Dhaka/)).toBeTruthy();
  });
});

describe('payment workspace review boundaries and existing mutations', () => {
  it('does not preload details; restores trigger focus on keyboard close and discards closed replies', async () => {
    let resolve: (value: Response) => void = () => {};
    const held = new Promise<Response>((done) => {
      resolve = done;
    });
    const mock = workspace([pending], () => held);
    render(<AdminPaymentManager />);
    const trigger = await screen.findByRole('button', {
      name: `Review payment ${payment.reference}`,
    });
    expect(
      mock.mock.calls.some(([url]) => String(url).endsWith(`/payments/${id}`)),
    ).toBe(false);
    const user = userEvent.setup();
    trigger.focus();
    await user.keyboard('{Enter}');
    expect(document.activeElement?.textContent).toBe('Payment review');
    const request = mock.mock.calls.find(([url]) =>
      String(url).endsWith(`/payments/${id}`),
    )!;
    screen.getByRole('button', { name: 'Close payment review' }).focus();
    await user.keyboard('{Enter}');
    expect(document.activeElement).toBe(trigger);
    expect(request[1]?.signal?.aborted).toBe(true);
    await act(async () => resolve(response(pending)));
    expect(screen.queryByRole('region', { name: 'Payment review' })).toBeNull();
    expect(mock.mock.calls.every(([, init]) => !init?.method)).toBe(true);
  });

  it('clears selection and pending reads immediately when the customer filter changes', async () => {
    let resolve: (value: Response) => void = () => {};
    const held = new Promise<Response>((done) => {
      resolve = done;
    });
    const mock = workspace([pending], () => held);
    const view = render(<AdminPaymentManager />);
    await userEvent.setup().click(
      await screen.findByRole('button', {
        name: `Review payment ${payment.reference}`,
      }),
    );
    const request = mock.mock.calls.find(([url]) =>
      String(url).endsWith(`/payments/${id}`),
    )!;
    view.rerender(
      <AdminPaymentManager customerFilter={{ customerId, invalid: false }} />,
    );
    expect(screen.queryByRole('region', { name: 'Payment review' })).toBeNull();
    expect(request[1]?.signal?.aborted).toBe(true);
    await act(async () => resolve(response(pending)));
    await screen.findByRole('heading', { name: 'Payments' });
    expect(
      mock.mock.calls.some(([url]) =>
        String(url).endsWith(`/payments?pageSize=100&customerId=${customerId}`),
      ),
    ).toBe(true);
    expect(screen.queryByRole('region', { name: 'Payment review' })).toBeNull();
  });

  it.each(['VERIFY', 'REJECT'] as const)(
    'preserves deliberate %s body and clears stale review before a failed invoice refresh',
    async (action) => {
      let resolve: (value: Response) => void = () => {};
      const held = new Promise<Response>((done) => {
        resolve = done;
      });
      const mock = workspace(
        [pending],
        () => held,
        async () =>
          response({
            ...pending,
            state: action === 'VERIFY' ? 'VERIFIED' : 'REJECTED',
          }),
        async () => response(undefined, 500),
      );
      render(<AdminPaymentManager />);
      const user = userEvent.setup();
      await user.click(
        await screen.findByRole('button', {
          name: `Review payment ${payment.reference}`,
        }),
      );
      await user.click(
        screen.getByRole('button', {
          name: action === 'VERIFY' ? 'Verify' : 'Reject',
        }),
      );
      await waitFor(() =>
        expect(
          screen.queryByRole('region', { name: 'Payment review' }),
        ).toBeNull(),
      );
      await act(async () => resolve(response(pending)));
      expect(
        screen.queryByRole('region', { name: 'Payment review' }),
      ).toBeNull();
      const mutation = mock.mock.calls.find(
        ([, init]) => init?.method === 'PATCH',
      )!;
      expect(String(mutation[0])).toContain(`/payments/${id}/review`);
      expect(JSON.parse(String(mutation[1]?.body))).toEqual(
        action === 'VERIFY'
          ? { action }
          : { action, reason: 'Reference rejected by administrator.' },
      );
      expect(mutation[1]?.credentials).toBe('include');
      expect(mutation[1]?.headers).toMatchObject({
        'X-CSRF-Token': 'x'.repeat(96),
      });
    },
  );

  it('keeps a failed mutation retry separate from read-only review', async () => {
    workspace(
      [pending],
      async () => response(pending),
      async () => response(undefined, 500),
    );
    render(<AdminPaymentManager />);
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', {
        name: `Review payment ${payment.reference}`,
      }),
    );
    await screen.findByText('Payer name', { selector: 'dt' });
    await user.click(screen.getByRole('button', { name: 'Verify' }));
    await screen.findByRole('alert');
    expect(screen.getByRole('region', { name: 'Payment review' })).toBeTruthy();
  });

  it('preserves recording body and submission-key retry, then invalidates context after success', async () => {
    let fail = true;
    const mock = workspace(
      [pending],
      async () => response(pending),
      async () =>
        fail
          ? response(undefined, 500)
          : response({ payment, duplicate: false }),
    );
    render(<AdminPaymentManager />);
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', {
        name: `Review payment ${payment.reference}`,
      }),
    );
    await screen.findByText('Payer name', { selector: 'dt' });
    const form = screen
      .getByRole('button', { name: 'Record verified payment' })
      .closest('form')!;
    fireEvent.change(form.querySelector('[name="invoiceId"]')!, {
      target: { value: invoiceId },
    });
    fireEvent.change(form.querySelector('[name="amount"]')!, {
      target: { value: '12000' },
    });
    fireEvent.change(form.querySelector('[name="reference"]')!, {
      target: { value: 'RECORDED-84' },
    });
    await user.click(within(form).getByRole('button'));
    await screen.findByRole('alert');
    expect(screen.getByRole('region', { name: 'Payment review' })).toBeTruthy();
    fail = false;
    await user.click(within(form).getByRole('button'));
    await screen.findByText(
      'Verified manual payment recorded and invoice recalculated.',
    );
    expect(screen.queryByRole('region', { name: 'Payment review' })).toBeNull();
    const writes = mock.mock.calls.filter(
      ([, init]) => init?.method === 'POST',
    );
    expect(writes).toHaveLength(2);
    const bodies = writes.map(
      ([, init]) => JSON.parse(String(init?.body)) as Record<string, unknown>,
    );
    expect(bodies[0]).toEqual(bodies[1]);
    expect(bodies[0]).toMatchObject({
      invoiceId,
      amount: '12000',
      proof: { method: 'BANK_TRANSFER', reference: 'RECORDED-84' },
    });
    expect(bodies[0]!.proof).toEqual({
      method: 'BANK_TRANSFER',
      reference: 'RECORDED-84',
    });
    expect(bodies[0]!.submissionKey).toMatch(/^[0-9a-f-]{36}$/);
  });

  it.each(['REFUND', 'REVERSAL'] as const)(
    'preserves %s adjustment body/idempotency and clears old context after success',
    async (kind) => {
      let fail = true;
      const adjustment = {
        ...payment,
        id: otherId,
        originalPaymentId: id,
        kind,
        state: kind === 'REFUND' ? 'REFUNDED' : 'REVERSED',
      };
      const mock = workspace(
        [payment],
        async () => response(payment),
        async () =>
          fail
            ? response(undefined, 500)
            : response({ payment: adjustment, duplicate: false }),
      );
      render(<AdminPaymentManager />);
      const user = userEvent.setup();
      await user.click(
        await screen.findByRole('button', {
          name: `Review payment ${payment.reference}`,
        }),
      );
      await screen.findByText('Payer name', { selector: 'dt' });
      await user.click(
        screen.getByRole('button', {
          name: kind === 'REFUND' ? 'Refund' : 'Reverse',
        }),
      );
      await user.type(
        screen.getByRole('textbox', { name: 'Adjustment reference' }),
        'ADJUST-84',
      );
      await user.click(
        screen.getByRole('button', { name: `Confirm ${kind.toLowerCase()}` }),
      );
      await screen.findByRole('alert');
      expect(
        screen.getByRole('region', { name: 'Payment review' }),
      ).toBeTruthy();
      fail = false;
      await user.click(
        screen.getByRole('button', { name: `Confirm ${kind.toLowerCase()}` }),
      );
      await screen.findByText(`${kind.toLowerCase()} transaction recorded.`);
      expect(
        screen.queryByRole('region', { name: 'Payment review' }),
      ).toBeNull();
      const writes = mock.mock.calls.filter(
        ([, init]) => init?.method === 'POST',
      );
      expect(writes).toHaveLength(2);
      const bodies = writes.map(
        ([, init]) => JSON.parse(String(init?.body)) as Record<string, unknown>,
      );
      expect(bodies[0]).toEqual(bodies[1]);
      expect(bodies[0]).toMatchObject({
        kind,
        amount: payment.refundableAmount.amount,
        reference: 'ADJUST-84',
      });
      expect(bodies[0]).not.toHaveProperty('note');
      expect(String(writes[0]![0])).toContain(`/payments/${id}/adjustments`);
    },
  );
});
