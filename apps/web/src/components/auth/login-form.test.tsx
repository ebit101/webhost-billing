import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { LoginForm } from './login-form';

const navigation = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));

vi.mock('next/navigation', () => ({ useRouter: () => navigation }));

describe('administrator login security', () => {
  it('completes the password and MFA challenge without putting credentials in the URL', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(
      (request: RequestInfo | URL, init?: RequestInit) => {
        void init;
        const url = String(request);
        if (url.endsWith('/auth/csrf')) {
          return Promise.resolve(success({ csrfToken: 'x'.repeat(96) }));
        }
        if (url.endsWith('/auth/login/two-factor')) {
          return Promise.resolve(
            success({
              identity: {
                userId: '10000000-0000-4000-8000-000000000001',
                email: 'admin@example.test',
                role: 'ADMIN',
                adminProfileId: '10000000-0000-4000-8000-000000000002',
              },
              session: {
                id: '10000000-0000-4000-8000-000000000003',
                createdAt: '2026-08-26T08:00:00.000Z',
                lastSeenAt: '2026-08-26T08:00:00.000Z',
                expiresAt: '2026-08-27T08:00:00.000Z',
                current: true,
              },
            }),
          );
        }
        return Promise.resolve(
          success({
            requiresTwoFactor: true,
            challengeToken:
              'challenge-token-that-is-long-enough-for-validation',
            expiresAt: '2026-08-26T08:05:00.000Z',
          }),
        );
      },
    );
    vi.stubGlobal('fetch', fetchMock);

    render(<LoginForm />);
    await user.type(
      screen.getByLabelText('Email address'),
      'admin@example.test',
    );
    await user.type(screen.getByLabelText('Password'), 'a-private-password');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByLabelText('Authentication code')).toBeTruthy();
    await user.type(screen.getByLabelText('Authentication code'), '123456');
    await user.click(
      screen.getByRole('button', { name: 'Verify and sign in' }),
    );

    await waitFor(() => expect(navigation.push).toHaveBeenCalledWith('/admin'));
    const loginCall = fetchMock.mock.calls.find(([url]) =>
      String(url).endsWith('/auth/login'),
    );
    expect(String(loginCall?.[0])).not.toContain('password=');
    expect((loginCall?.[1] as RequestInit).method).toBe('POST');
  });
});

function success(data: unknown) {
  return new Response(JSON.stringify({ success: true, data }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
