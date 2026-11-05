import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { service } from '../../test/client-record-fixtures';
import { AdminServiceAddOns } from './admin-service-add-ons';

const api = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('../../lib/auth-api', () => ({ authenticatedGet: api.get }));
const item = {
  id: '20500000-0000-4000-8000-000000000001',
  name: '<b>Purchased backup</b>',
  recurringAmount: { amount: '9007199254740993', currency: 'BDT' },
  renewalEndsAt: '2026-12-01T18:30:00.000Z',
  availableEndAt: null,
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
    expect(screen.getByText(/completion is not tracked here/)).toBeTruthy();
    expect(
      screen.getByText(/leaves hosting on its existing cycle/),
    ).toBeTruthy();
    expect(container.querySelector('b, form, input')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
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
});
