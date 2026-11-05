import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { service } from '../../test/client-record-fixtures';
import { HostingUpgrades } from './hosting-upgrades';
const api = vi.hoisted(() => ({ get: vi.fn(), mutate: vi.fn() }));
vi.mock('../../lib/auth-api', async (original) => ({
  ...(await original<typeof import('../../lib/auth-api')>()),
  authenticatedGet: api.get,
  authMutation: api.mutate,
}));
const row = {
  id: '21100000-0000-4000-8000-000000000001',
  serviceId: service.id,
  status: 'QUOTED',
  sourceName: 'Fictional starter',
  targetName: 'Fictional business',
  amount: { amount: '30000', currency: 'BDT' },
  nextRecurringAmount: { amount: '160000', currency: 'BDT' },
  quotedAt: '2026-11-05T12:00:00.000Z',
  expiresAt: '2026-11-05T12:15:00.000Z',
  periodEndAt: '2026-12-01T00:00:00.000Z',
  acceptedAt: null,
  approvedAt: null,
  completedAt: null,
  invoiceId: null,
  invoiceNumber: null,
  paymentStatus: null,
  operationStatus: null,
  error: null,
  canAccept: true,
};
afterEach(() => vi.resetAllMocks());
describe('customer and administrator hosting upgrades', () => {
  it('shows a zero-charge scheduled downgrade and requires explicit withdrawal', async () => {
    const scheduled = {
      ...row,
      change: 'DOWNGRADE',
      status: 'SCHEDULED',
      amount: { amount: '0', currency: 'BDT' },
      canAccept: false,
      canWithdraw: true,
      acceptedAt: row.quotedAt,
    };
    api.get.mockResolvedValue([scheduled]);
    render(<HostingUpgrades service={service} />);
    const user = userEvent.setup();
    await screen.findByText(/Immediate charge: BDT 0.00/);
    expect(
      screen.getByText(/No mid-period credit or automatic refund/),
    ).toBeTruthy();
    await user.click(
      await screen.findByRole('button', { name: 'Withdraw downgrade' }),
    );
    const dialog = screen.getByRole('dialog', {
      name: 'Confirm hosting downgrade action',
    });
    const confirm = within(dialog).getByRole('button', {
      name: 'Confirm downgrade action',
    }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    await user.click(within(dialog).getByRole('checkbox'));
    api.mutate.mockResolvedValue({
      ...scheduled,
      status: 'CANCELLED',
      canWithdraw: false,
    });
    await user.click(confirm);
    await screen.findByText(/Downgrade request: Cancelled/);
    expect(api.mutate).toHaveBeenCalledWith(
      `/services/${service.id}/upgrades/${row.id}/withdraw`,
      'POST',
      { acknowledged: true },
    );
  });
  it('requires a boundary capacity result and reason without requiring payment for a downgrade', async () => {
    const scheduled = {
      ...row,
      change: 'DOWNGRADE',
      status: 'SCHEDULED',
      canAccept: false,
      periodEndAt: '2020-01-01T00:00:00.000Z',
      amount: { amount: '0', currency: 'BDT' },
    };
    api.get.mockResolvedValue([scheduled]);
    render(<HostingUpgrades service={service} administrator />);
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', { name: 'Review due downgrade' }),
    );
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('checkbox'));
    expect(
      (
        within(dialog).getByRole('button', {
          name: 'Confirm downgrade action',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    await user.selectOptions(
      within(dialog).getByLabelText('Capacity and add-on review'),
      'review',
    );
    await user.type(
      within(dialog).getByLabelText('Review reason'),
      'Usage cannot be confirmed.',
    );
    api.mutate.mockResolvedValue({ ...scheduled, status: 'REVIEW_REQUIRED' });
    await user.click(
      within(dialog).getByRole('button', { name: 'Confirm downgrade action' }),
    );
    await screen.findByText(/Downgrade request: Review required/);
    expect(api.mutate).toHaveBeenCalledWith(
      `/services/${service.id}/upgrades/${row.id}/approve?customerId=${service.customerId}`,
      'POST',
      {
        acknowledged: true,
        downgradeReview: {
          capacityFits: false,
          reason: 'Usage cannot be confirmed.',
        },
      },
    );
  });
  it('keeps scheduled downgrades read-only in support sessions', async () => {
    api.get.mockResolvedValue([
      {
        ...row,
        change: 'DOWNGRADE',
        status: 'SCHEDULED',
        canAccept: false,
        canWithdraw: false,
      },
    ]);
    render(<HostingUpgrades service={service} />);
    await screen.findByText(/Downgrade request: Scheduled/);
    expect(
      screen.queryByRole('button', { name: 'Withdraw downgrade' }),
    ).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Review due downgrade' }),
    ).toBeNull();
  });
  it('shows the quoted charge, next renewal and separate payment and package states', async () => {
    api.get.mockResolvedValue([row]);
    render(<HostingUpgrades service={service} />);
    await screen.findByText(/Prorated charge: BDT 300.00/);
    expect(screen.getByText(/Next hosting renewal: BDT 1,600.00/)).toBeTruthy();
    expect(
      screen.getByText(/Payment: Not invoiced · Package change: Not started/),
    ).toBeTruthy();
    expect(api.mutate).not.toHaveBeenCalled();
  });
  it('requires explicit acceptance and follows the existing customer invoice route', async () => {
    api.get.mockResolvedValue([row]);
    render(<HostingUpgrades service={service} />);
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', { name: 'Review and accept upgrade' }),
    );
    const dialog = screen.getByRole('dialog', {
      name: 'Confirm hosting upgrade action',
    });
    const confirm = within(dialog).getByRole('button', {
      name: 'Confirm upgrade action',
    }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    await user.click(within(dialog).getByRole('checkbox'));
    api.mutate.mockResolvedValue({
      ...row,
      status: 'REQUESTED',
      canAccept: false,
      acceptedAt: row.quotedAt,
      invoiceId: row.id,
      invoiceNumber: 'UP-211',
      paymentStatus: 'UNPAID',
    });
    await user.click(confirm);
    expect(
      (
        await screen.findByRole('link', { name: 'View upgrade invoice UP-211' })
      ).getAttribute('href'),
    ).toBe(`/portal/invoices/${row.id}`);
    expect(api.mutate).toHaveBeenCalledWith(
      `/services/${service.id}/upgrades/${row.id}/accept`,
      'POST',
      { acknowledged: true },
    );
    expect(
      screen.queryByRole('button', { name: 'Review and accept upgrade' }),
    ).toBeNull();
  });
  it('keeps support sessions read-only and does not offer acceptance when the server forbids it', async () => {
    api.get.mockResolvedValue([{ ...row, canAccept: false }]);
    render(<HostingUpgrades service={service} />);
    await screen.findByText(/Fictional starter → Fictional business/);
    expect(
      screen.queryByRole('button', { name: 'Review and accept upgrade' }),
    ).toBeNull();
    expect(api.mutate).not.toHaveBeenCalled();
  });
  it('does not offer approval for an unpaid request', async () => {
    api.get.mockResolvedValue([
      {
        ...row,
        status: 'REQUESTED',
        paymentStatus: 'UNPAID',
        canAccept: false,
      },
    ]);
    render(<HostingUpgrades service={service} administrator />);
    const button = (await screen.findByRole('button', {
      name: 'Approve paid upgrade',
    })) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(api.mutate).not.toHaveBeenCalled();
  });
  it('requires reviewed approval and refreshes the service only after confirmed completion', async () => {
    api.get.mockResolvedValue([
      { ...row, status: 'REQUESTED', paymentStatus: 'PAID', canAccept: false },
    ]);
    const onCompleted = vi.fn();
    render(
      <HostingUpgrades
        service={service}
        administrator
        onCompleted={onCompleted}
      />,
    );
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', { name: 'Approve paid upgrade' }),
    );
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('checkbox'));
    api.mutate.mockResolvedValue({
      ...row,
      status: 'COMPLETED',
      canAccept: false,
      paymentStatus: 'PAID',
      operationStatus: 'SUCCEEDED',
      completedAt: row.quotedAt,
    });
    await user.click(
      within(dialog).getByRole('button', { name: 'Confirm upgrade action' }),
    );
    await screen.findByText(
      'The hosting package and recorded plan are updated.',
    );
    expect(onCompleted).toHaveBeenCalledOnce();
    expect(api.mutate).toHaveBeenCalledWith(
      `/services/${service.id}/upgrades/${row.id}/approve?customerId=${service.customerId}`,
      'POST',
      { acknowledged: true },
    );
  });
  it('keeps failed payment or provider actions visible without claiming completion', async () => {
    api.get.mockResolvedValue([
      {
        ...row,
        status: 'REVIEW_REQUIRED',
        paymentStatus: 'PAID',
        operationStatus: 'FAILED',
        error: 'Review the provider result.',
        canAccept: false,
      },
    ]);
    render(<HostingUpgrades service={service} administrator />);
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', { name: 'Review and recover upgrade' }),
    );
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('checkbox'));
    api.mutate.mockRejectedValue(new Error('private-response'));
    await user.click(
      within(dialog).getByRole('button', { name: 'Confirm upgrade action' }),
    );
    await screen.findByText(
      'The upgrade could not be saved. Refresh and retry.',
    );
    expect(screen.queryByText(/private-response/)).toBeNull();
    expect(
      screen.queryByText('The hosting package and recorded plan are updated.'),
    ).toBeNull();
  });
  it('rejects malformed reads rather than claiming no requests exist', async () => {
    api.get.mockResolvedValue([
      { ...row, amount: { amount: 30000, currency: 'BDT' } },
    ]);
    render(<HostingUpgrades service={service} />);
    await screen.findByText('Upgrade requests could not be loaded.');
    expect(
      screen.queryByRole('button', { name: 'Review and accept upgrade' }),
    ).toBeNull();
  });
});
