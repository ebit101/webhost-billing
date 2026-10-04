import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LoginForm } from './login-form';

const navigation = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));

vi.mock('next/navigation', () => ({ useRouter: () => navigation }));
const intent = {
  productId: '10000000-0000-4000-8000-000000000080',
  priceId: '10000000-0000-4000-8000-000000000081',
};
const query = `productId=${intent.productId}&priceId=${intent.priceId}`;
beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.unstubAllGlobals());

describe('administrator login security', () => {
  it('shows the administrator entry without customer registration', () => {
    render(<LoginForm audience="admin" />);

    expect(
      screen
        .getByRole('link', { name: 'Customer sign in' })
        .getAttribute('href'),
    ).toBe('/login');
    expect(
      screen.queryByRole('link', { name: 'Create an account' }),
    ).toBeNull();
  });

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

    render(<LoginForm checkoutIntent={intent} />);
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
    expect(
      loginCall?.[1]?.body ===
        JSON.stringify({
          email: 'admin@example.test',
          password: 'a-private-password',
        }),
    ).toBe(true);
    const mfaCall = fetchMock.mock.calls.find(([url]) =>
      String(url).endsWith('/auth/login/two-factor'),
    );
    expect(mfaCall?.[1]?.method).toBe('POST');
    expect(mfaCall?.[1]?.headers).toMatchObject({
      'X-CSRF-Token': 'x'.repeat(96),
    });
    expect(
      mfaCall?.[1]?.body ===
        JSON.stringify({
          challengeToken: 'challenge-token-that-is-long-enough-for-validation',
          code: '123456',
        }),
    ).toBe(true);
  });
});

describe('customer checkout sign-in', () => {
  it.each([
    ['CUSTOMER', intent, `/portal/checkout?${query}`],
    ['CUSTOMER', undefined, '/portal'],
    ['CUSTOMER', { ...intent, priceId: '//evil.example' }, '/portal'],
    ['ADMIN', intent, '/admin'],
  ] as const)(
    'lands role %s with validated selection only',
    async (role, selection, destination) => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async (input: RequestInfo | URL) =>
          String(input).endsWith('/auth/csrf')
            ? success({ csrfToken: 'x'.repeat(96) })
            : success({ identity: { role } }),
        ),
      );
      render(<LoginForm checkoutIntent={selection} />);
      const user = userEvent.setup();
      await user.type(
        screen.getByLabelText('Email address'),
        'customer@example.test',
      );
      await user.type(screen.getByLabelText('Password'), 'fictional-password');
      await user.click(screen.getByRole('button', { name: 'Sign in' }));
      await waitFor(() =>
        expect(navigation.push).toHaveBeenCalledWith(destination),
      );
      expect(navigation.refresh).toHaveBeenCalledTimes(1);
    },
  );

  it('retains selection and registration link across a failed login and retry without ordering', async () => {
    let attempts = 0;
    const mock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).endsWith('/auth/csrf'))
        return success({ csrfToken: 'x'.repeat(96) });
      attempts++;
      return attempts === 1
        ? new Response(
            JSON.stringify({
              success: false,
              error: {
                code: 'UNAUTHORIZED',
                message: 'Fictional invalid credentials',
              },
            }),
            { status: 401 },
          )
        : success({ identity: { role: 'CUSTOMER' } });
    });
    vi.stubGlobal('fetch', mock);
    render(<LoginForm checkoutIntent={intent} />);
    expect(
      screen
        .getByRole('link', { name: 'Create an account' })
        .getAttribute('href'),
    ).toBe(`/register?${query}`);
    expect(
      screen
        .getByRole('link', { name: 'Forgot password?' })
        .getAttribute('href'),
    ).toBe('/forgot-password');
    const user = userEvent.setup();
    await user.type(
      screen.getByLabelText('Email address'),
      'customer@example.test',
    );
    await user.type(screen.getByLabelText('Password'), 'fictional-password');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    await screen.findByText('Fictional invalid credentials');
    expect(navigation.push).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() =>
      expect(navigation.push).toHaveBeenCalledWith(`/portal/checkout?${query}`),
    );
    expect(
      mock.mock.calls.every(([url]) =>
        /\/auth\/(csrf|login)$/.test(String(url)),
      ),
    ).toBe(true);
  });
});

function success(data: unknown) {
  return new Response(JSON.stringify({ success: true, data }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
