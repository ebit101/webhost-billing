import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ForgotPasswordForm } from './forgot-password-form';
import { ResetPasswordForm } from './reset-password-form';

afterEach(() => vi.unstubAllGlobals());

describe('password reset submission after readiness', () => {
  it.each([
    {
      element: <ForgotPasswordForm />,
      label: 'Email address',
      value: 'reset@example.test',
      endpoint: '/auth/password-reset/request',
      body: { email: 'reset@example.test' },
      button: 'Request reset instructions',
    },
    {
      element: <ResetPasswordForm token="fictional-reset-token" />,
      label: 'New password (at least 12 characters)',
      value: 'Fictional-Reset-83!',
      endpoint: '/auth/password-reset/confirm',
      body: { token: 'fictional-reset-token', password: 'Fictional-Reset-83!' },
      button: 'Change password',
    },
  ])(
    'preserves $endpoint CSRF body, busy state and retry',
    async ({ element, label, value, endpoint, body, button }) => {
      let finishFailure: (response: Response) => void = () => {};
      let attempts = 0;
      const fetchMock = vi.fn(
        async (input: RequestInfo | URL, init?: RequestInit) => {
          if (String(input).endsWith('/auth/csrf'))
            return success({ csrfToken: 'x'.repeat(96) });
          expect(String(input).endsWith(endpoint)).toBe(true);
          expect(init?.method).toBe('POST');
          expect(init?.credentials).toBe('include');
          expect(init?.headers).toMatchObject({
            'X-CSRF-Token': 'x'.repeat(96),
          });
          expect(init?.body === JSON.stringify(body)).toBe(true);
          attempts++;
          if (attempts === 1)
            return new Promise<Response>((resolve) => {
              finishFailure = resolve;
            });
          return success({ message: 'Fictional reset response.' });
        },
      );
      vi.stubGlobal('fetch', fetchMock);
      render(element);
      fireEvent.change(screen.getByLabelText(label), { target: { value } });
      fireEvent.click(screen.getByRole('button', { name: button }));
      await waitFor(() => expect(attempts).toBe(1));
      expect(
        screen
          .getByRole('button', { name: 'Please wait…' })
          .hasAttribute('disabled'),
      ).toBe(true);
      finishFailure(
        new Response(
          JSON.stringify({
            success: false,
            error: {
              code: 'UNAVAILABLE',
              message: 'Fictional retry required.',
            },
          }),
          { status: 503 },
        ),
      );
      await screen.findByText('Fictional retry required.');
      expect(
        screen.getByRole('button', { name: button }).hasAttribute('disabled'),
      ).toBe(false);
      fireEvent.click(screen.getByRole('button', { name: button }));
      await screen.findByText('Fictional reset response.');
      expect(attempts).toBe(2);
      expect(
        screen.getByRole('button', { name: button }).hasAttribute('disabled'),
      ).toBe(false);
      expect(screen.getByRole('link').getAttribute('href')).toBe('/login');
    },
  );

  it('does not create a form or request without a reset token', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const view = render(<ResetPasswordForm />);
    expect(view.container.querySelector('form')).toBeNull();
    expect(screen.getByRole('alert').textContent).toContain('incomplete');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

function success(data: unknown) {
  return new Response(JSON.stringify({ success: true, data }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
