import type { AdministratorIdentity } from '@webhost-billing/shared';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AccountPage from '../../app/account/page';
import { accountDisplayName } from '../../lib/account-display';

const navigation = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => navigation }));
const identity: AdministratorIdentity = {
  userId: '10000000-0000-4000-8000-000000000001',
  adminProfileId: '10000000-0000-4000-8000-000000000002',
  role: 'ADMIN',
  staffRole: 'FULL_ADMINISTRATOR',
  twoFactorEnabled: true,
  email: 'admin@example.test',
  displayName: 'Fictional Administrator',
};
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
function response(data: unknown) {
  return new Response(JSON.stringify({ success: true, data }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('compact account settings', () => {
  it('shows the saved name, human role, compact security disclosures and workspace navigation without mutating security', async () => {
    const fetchMock = vi.fn<typeof fetch>(async (input) =>
      String(input).endsWith('/auth/me')
        ? response(identity)
        : response({ enabled: true, recoveryCodesRemaining: 10 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const view = render(<AccountPage />);
    await screen.findByText('Fictional Administrator');
    expect(screen.getByText('Full administrator')).toBeTruthy();
    expect(screen.queryByText('ADMIN')).toBeNull();
    expect(
      screen.queryByText('Your hosting and billing in one calm workspace.'),
    ).toBeNull();
    expect(
      screen
        .getByRole('link', { name: 'Back to workspace' })
        .getAttribute('href'),
    ).toBe('/admin');
    expect(
      screen.getByRole('link', { name: /home$/ }).getAttribute('href'),
    ).toBe('/admin');
    await screen.findByText('Enabled · 10 recovery codes remain');
    const details = Array.from(view.container.querySelectorAll('details'));
    expect(details).toHaveLength(2);
    expect(details.every((d) => !d.open)).toBe(true);
    const user = userEvent.setup();
    await user.click(screen.getByText('Replace recovery codes'));
    expect(details[0].open).toBe(true);
    expect(
      within(details[0]).getByRole('button', {
        name: 'Generate new recovery codes',
      }),
    ).toBeTruthy();
    await user.click(screen.getByText('Replace recovery codes'));
    expect(details[0].open).toBe(false);
    expect(fetchMock.mock.calls.every(([, init]) => !init?.method)).toBe(true);
  });

  it.each([false, true])(
    'retains CSRF-protected sign-out (all=%s)',
    async (all) => {
      const fetchMock = vi.fn<typeof fetch>(async (input) => {
        const path = new URL(String(input)).pathname;
        if (path === '/auth/me') return response(identity);
        if (path === '/auth/two-factor')
          return response({ enabled: true, recoveryCodesRemaining: 10 });
        if (path === '/auth/csrf')
          return response({ csrfToken: 'x'.repeat(32) });
        return response({ signedOut: true });
      });
      vi.stubGlobal('fetch', fetchMock);
      render(<AccountPage />);
      await screen.findByText('Fictional Administrator');
      await userEvent.setup().click(
        screen.getByRole('button', {
          name: all ? 'Revoke all sessions' : 'Sign out',
        }),
      );
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining(all ? '/auth/logout-all' : '/auth/logout'),
        expect.objectContaining({
          method: 'POST',
          credentials: 'include',
          headers: expect.objectContaining({ 'X-CSRF-Token': 'x'.repeat(32) }),
        }),
      );
      expect(navigation.push).toHaveBeenCalledWith('/login');
      expect(navigation.refresh).toHaveBeenCalledOnce();
    },
  );

  it('uses a neutral administrator fallback without deriving a name from email', () => {
    expect(accountDisplayName({ ...identity, displayName: undefined })).toBe(
      'Administrator',
    );
    expect(accountDisplayName({ ...identity, displayName: '  ' })).toBe(
      'Administrator',
    );
    expect(
      accountDisplayName({ ...identity, displayName: '  Fictional Name  ' }),
    ).toBe('Fictional Name');
  });
});
