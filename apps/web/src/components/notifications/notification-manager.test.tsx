import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { notificationCatalog } from '@webhost-billing/shared';
import { NotificationManager } from './notification-manager';

afterEach(() => vi.unstubAllGlobals());
function response(data: unknown, pagination?: unknown) {
  return new Response(
    JSON.stringify({
      success: true,
      data,
      ...(pagination ? { pagination } : {}),
    }),
    { headers: { 'Content-Type': 'application/json' } },
  );
}
describe('notification interfaces', () => {
  it('lists important invoices and overdue notices and saves automatic WhatsApp preferences without opt-in', async () => {
    const fetch = vi.fn(async (url: string, options?: RequestInit) => {
      if (url.endsWith('/catalog'))
        return response(
          notificationCatalog.filter((item) => item.audience === 'CUSTOMER'),
        );
      if (url.endsWith('/auth/csrf'))
        return response({ csrfToken: 'fictional-csrf' });
      return response({
        whatsAppEnabled: options?.method === 'PATCH' ? false : true,
        maskedPhone: '••••0001',
        deliveryMode: 'disabled',
      });
    });
    vi.stubGlobal('fetch', fetch);
    const user = userEvent.setup();
    render(<NotificationManager />);
    const table = within(
      await screen.findByRole('table', { name: 'Notification list' }),
    );
    const invoice = await table.findByRole('cell', { name: 'Invoice issued' });
    expect(
      within(invoice.closest('tr')!).getByText('Important alert'),
    ).toBeTruthy();
    const overdue = table.getByRole('cell', { name: 'Overdue notice' });
    expect(
      within(overdue.closest('tr')!).getByText('Important alert'),
    ).toBeTruthy();
    const reset = table.getByRole('cell', { name: 'Password reset' });
    expect(within(reset.closest('tr')!).getByText('—')).toBeTruthy();
    await user.click(
      await screen.findByRole('button', { name: 'Notification preferences' }),
    );
    const dialog = within(
      screen.getByRole('dialog', { name: 'Notification preferences' }),
    );
    expect(dialog.getByRole('checkbox')).toHaveProperty('checked', true);
    expect(dialog.queryByText(/consent/i)).toBeNull();
    await user.click(dialog.getByRole('checkbox'));
    await user.click(dialog.getByRole('button', { name: 'Save preferences' }));
    await dialog.findByText(
      'Notification preferences saved. Live delivery remains disabled.',
    );
    const patch = fetch.mock.calls.find(
      ([, options]) => options?.method === 'PATCH',
    );
    expect(JSON.parse(String(patch?.[1]?.body))).toEqual({
      whatsAppEnabled: false,
    });
  });

  it('loads paginated account history and filters WhatsApp without claiming previews were delivered', async () => {
    const fetch = vi.fn(async (url: string) => {
      if (url.endsWith('/catalog')) return response([]);
      if (url.endsWith('/preferences'))
        return response({
          whatsAppEnabled: true,
          maskedPhone: null,
          deliveryMode: 'preview',
        });
      return response(
        [
          {
            id: '80000000-0000-4000-8000-000000000001',
            key: 'client-invoice-issued',
            channel: 'WHATSAPP',
            status: 'PREVIEWED',
            createdAt: '2026-10-27T00:00:00.000Z',
            completedAt: '2026-10-27T00:00:01.000Z',
          },
        ],
        {
          page: url.includes('page=2') ? 2 : 1,
          pageSize: 25,
          totalItems: 26,
          totalPages: 2,
        },
      );
    });
    vi.stubGlobal('fetch', fetch);
    const user = userEvent.setup();
    render(<NotificationManager />);
    await user.click(screen.getByRole('button', { name: 'Alert history' }));
    await screen.findByRole('cell', { name: 'Local preview saved' });
    await user.selectOptions(screen.getByLabelText('Channel'), 'WHATSAPP');
    await screen.findByText('26 records found. Page 1 of 2.');
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await screen.findByText('26 records found. Page 2 of 2.');
    expect(
      fetch.mock.calls.some(
        ([url]) => url.includes('page=2') && url.includes('channel=WHATSAPP'),
      ),
    ).toBe(true);
    expect(screen.queryByText('Sent')).toBeNull();
  });
});
