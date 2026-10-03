import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { RegisterForm } from './register-form';

describe('customer registration', () => {
  it('omits empty optional fields from the strict registration request', async () => {
    const intent = {
      productId: '10000000-0000-4000-8000-000000000080',
      priceId: '10000000-0000-4000-8000-000000000081',
    };
    const loginHref = `/login?productId=${intent.productId}&priceId=${intent.priceId}`;
    const user = userEvent.setup();
    const fetchMock = vi.fn(
      (request: RequestInfo | URL, init?: RequestInit) => {
        void init;
        const url = String(request);
        if (url.endsWith('/auth/csrf')) {
          return Promise.resolve(success({ csrfToken: 'x'.repeat(96) }));
        }
        return Promise.resolve(
          success({
            message: 'Check your email for verification instructions.',
          }),
        );
      },
    );
    vi.stubGlobal('fetch', fetchMock);

    render(<RegisterForm checkoutIntent={intent} />);
    expect(
      screen.getByRole('link', { name: /^Sign in$/ }).getAttribute('href'),
    ).toBe(loginHref);
    await user.type(screen.getByLabelText('First name'), 'Browser');
    await user.type(screen.getByLabelText('Last name'), 'Customer');
    await user.type(
      screen.getByLabelText('Email address'),
      'browser@example.test',
    );
    await user.type(
      screen.getByLabelText('Password (at least 12 characters)'),
      'Fictional-Password-26!',
    );
    await user.type(
      screen.getByLabelText('Address', { exact: true }),
      '26 Browser Road',
    );
    await user.type(screen.getByLabelText('City'), 'Dhaka');
    await user.type(screen.getByLabelText('Country code'), 'BD');
    await user.click(
      screen.getByRole('button', { name: 'Create customer account' }),
    );

    await screen.findByText(/verification instructions/i);
    expect(
      screen
        .getByRole('link', { name: 'sign in to continue your selected plan' })
        .getAttribute('href'),
    ).toBe(loginHref);
    const registrationCall = fetchMock.mock.calls.find(([url]) =>
      String(url).endsWith('/auth/register'),
    );
    await waitFor(() => expect(registrationCall).toBeDefined());
    const payload = JSON.parse(
      String((registrationCall?.[1] as RequestInit).body),
    ) as Record<string, unknown>;
    expect(payload).not.toHaveProperty('companyName');
    expect(payload).not.toHaveProperty('productId');
    expect(payload).not.toHaveProperty('priceId');
    expect(payload).toMatchObject({
      email: 'browser@example.test',
      countryCode: 'BD',
    });
  });
});

function success(data: unknown) {
  return new Response(JSON.stringify({ success: true, data }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
