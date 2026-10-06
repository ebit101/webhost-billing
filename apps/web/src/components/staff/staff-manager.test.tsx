import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { StaffAccount } from '@webhost-billing/shared';
import { StaffManager } from './staff-manager';

const id = '92000000-0000-4000-8000-000000000001';
const other = '92000000-0000-4000-8000-000000000002';
const accounts: StaffAccount[] = [
  {
    id,
    email: 'owner@example.test',
    displayName: 'Fictional owner',
    staffRole: 'FULL_ADMINISTRATOR',
    status: 'ACTIVE',
    twoFactorEnabled: true,
  },
  {
    id: other,
    email: 'support@example.test',
    displayName: 'Fictional support',
    staffRole: 'SUPPORT_OPERATOR',
    status: 'PENDING_VERIFICATION',
    twoFactorEnabled: false,
  },
];
const response = (data: unknown, status = 200) =>
  new Response(JSON.stringify({ success: status < 300, data }), { status });
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
function setup(read: () => unknown = () => accounts) {
  const mock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).endsWith('/auth/csrf'))
      return response({ csrfToken: 'x'.repeat(96) });
    if (init?.method) return response(accounts[1], 201);
    return response(read());
  });
  vi.stubGlobal('fetch', mock);
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  return mock;
}

describe('administrator account management', () => {
  it('reads without mutations and disables own access controls', async () => {
    const mock = setup();
    render(<StaffManager currentUserId={id} twoFactorEnabled />);
    const owner = (
      await screen.findByRole('heading', { name: 'owner@example.test' })
    ).closest('section')!;
    expect(
      (
        within(owner).getByRole('button', {
          name: 'Save access',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(
      (within(owner).getByRole('checkbox') as HTMLInputElement).disabled,
    ).toBe(true);
    expect(screen.getByText(/You cannot disable or demote/)).toBeTruthy();
    expect(mock.mock.calls).toHaveLength(1);
    expect(mock.mock.calls[0]?.[1]).toMatchObject({
      credentials: 'include',
      cache: 'no-store',
    });
  });
  it('requires MFA for changes while keeping account setup reachable', async () => {
    setup();
    render(<StaffManager currentUserId={id} twoFactorEnabled={false} />);
    await screen.findByRole('heading', { name: 'support@example.test' });
    expect(
      (
        screen.getByRole('button', {
          name: 'Send invitation',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(
      (
        screen.getByRole('button', {
          name: 'Resend invitation',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(
      screen
        .getByRole('link', { name: 'two-factor authentication' })
        .getAttribute('href'),
    ).toBe('/account');
  });
  it('sends only invitation identity/role with CSRF, not a password or permission override', async () => {
    const mock = setup();
    render(<StaffManager currentUserId={id} twoFactorEnabled />);
    await screen.findByRole('heading', { name: 'support@example.test' });
    const form = screen
      .getByRole('button', { name: 'Send invitation' })
      .closest('form')!;
    fireEvent.change(
      within(form).getByRole('textbox', { name: 'Display name' }),
      { target: { value: 'New staff' } },
    );
    fireEvent.change(within(form).getByRole('textbox', { name: 'Email' }), {
      target: { value: 'new@example.test' },
    });
    await userEvent.setup().click(within(form).getByRole('button'));
    await screen.findByText(/Invitation emails queued/);
    const writes = mock.mock.calls.filter(([, init]) => init?.method);
    expect(writes).toHaveLength(1);
    expect(JSON.parse(String(writes[0]?.[1]?.body))).toEqual({
      email: 'new@example.test',
      displayName: 'New staff',
      staffRole: 'SUPPORT_OPERATOR',
    });
    expect(writes[0]?.[1]?.headers).toMatchObject({
      'X-CSRF-Token': 'x'.repeat(96),
    });
    expect(document.querySelector('input[type="password"]')).toBeNull();
  });
  it('captures the selected account and requires confirmation before a role/disable change', async () => {
    const mock = setup();
    render(<StaffManager currentUserId={id} twoFactorEnabled />);
    const section = (
      await screen.findByRole('heading', { name: 'support@example.test' })
    ).closest('section')!;
    fireEvent.change(within(section).getByRole('combobox'), {
      target: { value: 'BILLING_OPERATOR' },
    });
    await userEvent.setup().click(within(section).getByRole('checkbox'));
    await userEvent
      .setup()
      .click(within(section).getByRole('button', { name: 'Save access' }));
    await screen.findByText(/Administrator access updated/);
    const write = mock.mock.calls.find(([, init]) => init?.method === 'PATCH');
    expect(String(write?.[0])).toContain(`/staff/${other}`);
    expect(JSON.parse(String(write?.[1]?.body))).toEqual({
      displayName: 'Fictional support',
      staffRole: 'BILLING_OPERATOR',
      enabled: false,
    });
    expect(window.confirm).toHaveBeenCalledOnce();
  });
  it('fails closed on a malformed list and never presents it as an empty success', async () => {
    setup(() => [{ ...accounts[0], staffRole: 'API_USER' }]);
    render(<StaffManager currentUserId={id} twoFactorEnabled />);
    await screen.findByRole('alert');
    expect(
      screen.queryByRole('heading', { name: 'owner@example.test' }),
    ).toBeNull();
  });
  it('keeps a successful invitation separate from a failed refresh without repeating it', async () => {
    let fail = false;
    const mock = setup(() => (fail ? {} : accounts));
    render(<StaffManager currentUserId={id} twoFactorEnabled />);
    await screen.findByRole('heading', { name: 'support@example.test' });
    fail = true;
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Resend invitation' }));
    await screen.findByRole('alert');
    expect(
      mock.mock.calls.filter(([, init]) => init?.method === 'POST'),
    ).toHaveLength(1);
    expect(
      screen.queryByRole('button', { name: 'Resend invitation' }),
    ).toBeNull();
    await act(async () => {
      await userEvent
        .setup()
        .click(screen.getByRole('button', { name: 'Refresh accounts' }));
    });
    expect(
      mock.mock.calls.filter(([, init]) => init?.method === 'POST'),
    ).toHaveLength(1);
  });
});
