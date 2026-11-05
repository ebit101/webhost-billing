import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { service } from '../../test/client-record-fixtures';
import { AdminServiceAddOns } from './admin-service-add-ons';

const api = vi.hoisted(() => ({ get: vi.fn(), mutate: vi.fn() }));
vi.mock('../../lib/auth-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/auth-api')>()),
  authenticatedGet: api.get,
  authMutation: api.mutate,
}));
const item = {
  id: '20500000-0000-4000-8000-000000000001',
  name: '<b>Purchased backup</b>',
  recurringAmount: { amount: '9007199254740993', currency: 'BDT' },
  renewalEndsAt: '2026-12-01T18:30:00.000Z',
  availableEndAt: null,
  manualCompletion: null,
};
afterEach(() => {
  vi.resetAllMocks();
});

describe('administrator recurring add-on visibility', () => {
  it('shows exact purchased money, the business-zone cutoff and pending manual work as plain text', async () => {
    api.get.mockResolvedValue([item]);
    const { container } = render(
      <AdminServiceAddOns service={service} timeZone="Asia/Dhaka" />,
    );
    const table = await screen.findByRole('table');
    expect(within(table).getByText('BDT 90,071,992,547,409.93')).toBeTruthy();
    expect(within(table).getByText('02/12/2026, 00:30')).toBeTruthy();
    expect(
      within(table).getByText(
        /Stop providing <b>Purchased backup<\/b> from 02\/12\/2026, 00:30/,
      ),
    ).toBeTruthy();
    expect(
      screen.getByText(/leaves hosting on its existing cycle/),
    ).toBeTruthy();
    expect(container.querySelector('b, form, input')).toBeNull();
    expect(
      (
        screen.getByRole('button', {
          name: `Mark ${item.name} completed`,
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(api.get).toHaveBeenCalledWith(
      `/services/${service.id}/add-ons?customerId=${service.customerId}`,
    );
  });
  it('distinguishes renewal without cancellation and reads localization for the client record', async () => {
    api.get.mockImplementation(async (path: string) =>
      path === '/settings'
        ? { timeZone: 'UTC' }
        : [{ ...item, renewalEndsAt: null }],
    );
    render(<AdminServiceAddOns service={service} />);
    await screen.findByText('No cancellation requested');
    expect(screen.getByText('Not scheduled')).toBeTruthy();
    expect(
      screen.getByText('No cancellation follow-up requested'),
    ).toBeTruthy();
    expect(screen.getByText(/Dates shown in UTC/)).toBeTruthy();
  });
  it('shows a clear empty result for services without fulfilled recurring extras', async () => {
    api.get.mockResolvedValue([]);
    render(<AdminServiceAddOns service={service} timeZone="UTC" />);
    await screen.findByText(
      'No fulfilled recurring add-ons recorded for this service.',
    );
    expect(screen.queryByRole('table')).toBeNull();
  });
  it.each(['denied', 'malformed', 'zone'])(
    'recovers from %s without presenting a missing cancellation as an empty list',
    async (failure) => {
      api.get.mockImplementation(async (path: string) => {
        if (failure === 'denied') throw new Error('private-response');
        if (failure === 'zone')
          return path === '/settings' ? { timeZone: 'invalid-zone' } : [item];
        return [{ ...item, recurringAmount: { amount: 12, currency: 'BDT' } }];
      });
      render(<AdminServiceAddOns service={service} />);
      await screen.findByText('Add-ons could not be loaded');
      expect(screen.queryByRole('table')).toBeNull();
      expect(screen.queryByText(/private-response/)).toBeNull();
      api.get.mockImplementation(async (path: string) =>
        path === '/settings' ? { timeZone: 'UTC' } : [item],
      );
      await userEvent
        .setup()
        .click(screen.getByRole('button', { name: 'Retry add-ons' }));
      await screen.findByRole('table');
    },
  );
  it('discards a delayed response when the selected service changes', async () => {
    let finish!: (value: unknown) => void;
    api.get
      .mockReturnValueOnce(
        new Promise((resolve) => {
          finish = resolve;
        }),
      )
      .mockResolvedValue([]);
    const view = render(
      <AdminServiceAddOns service={service} timeZone="UTC" />,
    );
    view.rerender(
      <AdminServiceAddOns
        service={{ ...service, id: item.id }}
        timeZone="UTC"
      />,
    );
    await screen.findByText(
      'No fulfilled recurring add-ons recorded for this service.',
    );
    await act(async () => {
      finish([item]);
    });
    expect(screen.queryByRole('table')).toBeNull();
  });

  const dueItem = { ...item, renewalEndsAt: '2025-03-11T12:00:00.000Z' };
  const completion = {
    completedAt: '2026-11-05T12:00:00.000Z',
    completedByUserId: item.id,
    completedByName: '<b>Fictional admin</b>',
  };
  async function openCompletion() {
    api.get.mockResolvedValue([dueItem]);
    render(<AdminServiceAddOns service={service} timeZone="UTC" />);
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', {
        name: `Mark ${item.name} completed`,
      }),
    );
    return {
      user,
      dialog: screen.getByRole('dialog', {
        name: 'Confirm add-on cancellation completion',
      }),
    };
  }
  it('requires acknowledgement, records completion and shows who and when without another action', async () => {
    const { user, dialog } = await openCompletion();
    const submit = within(dialog).getByRole('button', {
      name: 'Record completion',
    }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    await user.click(within(dialog).getByRole('checkbox'));
    api.mutate.mockResolvedValue({ ...dueItem, manualCompletion: completion });
    await user.click(submit);
    await screen.findByText(
      'Completion confirmed by <b>Fictional admin</b> on 05/11/2026, 12:00.',
    );
    expect(api.mutate).toHaveBeenCalledWith(
      `/services/${service.id}/add-ons/${item.id}/complete-cancellation?customerId=${service.customerId}`,
      'POST',
      { expectedEndAt: dueItem.renewalEndsAt, acknowledged: true },
    );
    expect(
      screen.queryByRole('button', { name: `Mark ${item.name} completed` }),
    ).toBeNull();
    expect(document.querySelector('b')).toBeNull();
  });
  it('does not write when the confirmation is closed', async () => {
    const { user, dialog } = await openCompletion();
    await user.click(within(dialog).getByRole('button', { name: /Close/ }));
    expect(api.mutate).not.toHaveBeenCalled();
  });
  it('keeps the pending work visible when recording fails and permits a deliberate retry', async () => {
    const { user, dialog } = await openCompletion();
    await user.click(within(dialog).getByRole('checkbox'));
    api.mutate
      .mockRejectedValueOnce(new Error('private-response'))
      .mockResolvedValueOnce({ ...dueItem, manualCompletion: completion });
    await user.click(
      within(dialog).getByRole('button', { name: 'Record completion' }),
    );
    await screen.findByText(
      'Completion could not be recorded. Reload and retry.',
    );
    expect(screen.queryByText(/private-response/)).toBeNull();
    expect(screen.queryByText(/Completion confirmed by/)).toBeNull();
    await user.click(
      within(dialog).getByRole('button', { name: 'Record completion' }),
    );
    await screen.findByText(/Completion confirmed by/);
  });
  it('loads an existing acknowledgement without offering completion again', async () => {
    api.get.mockResolvedValue([{ ...dueItem, manualCompletion: completion }]);
    render(<AdminServiceAddOns service={service} timeZone="UTC" />);
    await screen.findByText(/Completion confirmed by/);
    expect(screen.queryByRole('button')).toBeNull();
    expect(api.mutate).not.toHaveBeenCalled();
  });
});
