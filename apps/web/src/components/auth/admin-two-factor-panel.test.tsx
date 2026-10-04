import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdminTwoFactorPanel } from './admin-two-factor-panel';

const navigation = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => navigation }));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function success(data: unknown) {
  return new Response(JSON.stringify({ success: true, data }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('shared-control administrator MFA regression', () => {
  it('does not server-render credential forms before loading security status', () => {
    const container = document.createElement('div');
    container.innerHTML = renderToString(<AdminTwoFactorPanel />);
    expect(container.querySelector('form')).toBeNull();
    expect(container.textContent).toContain('Loading security status');
  });

  it('retains setup, enable, recovery-code replacement and confirmed disable requests', async () => {
    let enabled = false;
    const posts: {
      path: string;
      method: string | undefined;
      validBody: boolean;
    }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const path = new URL(String(input)).pathname;
        if (path === '/auth/csrf')
          return success({ csrfToken: 'x'.repeat(96) });
        if (!init?.method)
          return success({ enabled, recoveryCodesRemaining: enabled ? 1 : 0 });
        expect(init.headers).toMatchObject({ 'X-CSRF-Token': 'x'.repeat(96) });
        expect(init.credentials).toBe('include');
        posts.push({
          path,
          method: init.method,
          validBody:
            init.body ===
            JSON.stringify(
              path === '/auth/two-factor/setup'
                ? { password: 'Fictional-83!' }
                : path === '/auth/two-factor/enable'
                  ? { code: '123456' }
                  : { password: 'Fictional-83!', code: '123456' },
            ),
        });
        if (path === '/auth/two-factor/setup')
          return success({ secret: 'FICTIONALSETUPSECRET' });
        if (path === '/auth/two-factor/enable') enabled = true;
        return success({ recoveryCodes: ['fictional-recovery-code'] });
      }),
    );
    const view = render(<AdminTwoFactorPanel />);
    fireEvent.change(await screen.findByLabelText('Current password'), {
      target: { value: 'Fictional-83!' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Start secure setup' }));
    fireEvent.change(
      await screen.findByLabelText('Six-digit authenticator code'),
      { target: { value: '123456' } },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Verify and enable' }));
    await screen.findByText('Enabled · 1 recovery codes remain');
    for (const form of view.container.querySelectorAll('form')) {
      fireEvent.change(form.querySelector('input[name="password"]')!, {
        target: { value: 'Fictional-83!' },
      });
      fireEvent.change(form.querySelector('input[name="code"]')!, {
        target: { value: '123456' },
      });
    }
    fireEvent.click(
      screen.getByRole('button', { name: 'Generate new recovery codes' }),
    );
    await screen.findByText(
      'Old recovery codes were revoked. Save the new codes now.',
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Disable and sign out' }),
    );
    await waitFor(() => expect(navigation.push).toHaveBeenCalledWith('/login'));
    expect(navigation.refresh).toHaveBeenCalledTimes(1);
    expect(posts).toEqual([
      {
        path: '/auth/two-factor/setup',
        method: 'POST',
        validBody: true,
      },
      {
        path: '/auth/two-factor/enable',
        method: 'POST',
        validBody: true,
      },
      {
        path: '/auth/two-factor/recovery-codes',
        method: 'POST',
        validBody: true,
      },
      {
        path: '/auth/two-factor',
        method: 'DELETE',
        validBody: true,
      },
    ]);
  });
});
