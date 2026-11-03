import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { RegisterForm } from '../components/auth/register-form';
import { InvoiceDateText } from '../components/invoices/invoice-date-text';
import { BusinessWebsiteLink } from '../components/layout/business-website-link';
import { PublicPreferencesProvider } from './public-preferences';

afterEach(() => vi.unstubAllGlobals());

it.each(['', 'CA'])(
  'applies public display preferences and preserves an entered country %s',
  async (entered) => {
    const user = userEvent.setup();
    let release: ((response: Response) => void) | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            release = resolve;
          }),
      ),
    );
    render(
      <PublicPreferencesProvider>
        <RegisterForm />
        <BusinessWebsiteLink fallback="https://fallback.example.test/" />
        <span data-testid="admin-date">
          <InvoiceDateText
            value="2026-11-23T23:59:59Z"
            audience="admin"
            calendar
          />
        </span>
        <span data-testid="client-date">
          <InvoiceDateText
            value="2026-11-23T23:59:59Z"
            audience="client"
            calendar
          />
        </span>
      </PublicPreferencesProvider>,
    );
    const country = screen.getByLabelText('Country code');
    if (entered) await user.type(country, entered);
    release?.(
      Response.json({
        success: true,
        data: {
          website: 'https://example.test/',
          defaultCountry: 'GB',
          adminDateFormat: 'iso',
          clientDateFormat: 'long',
        },
      }),
    );
    await waitFor(() =>
      expect(
        screen
          .getByRole('link', { name: 'Business website' })
          .getAttribute('href'),
      ).toBe('https://example.test/'),
    );
    expect(country).toHaveProperty('value', entered || 'GB');
    expect(screen.getByTestId('admin-date').textContent).toBe('2026-11-23');
    expect(screen.getByTestId('client-date').textContent).toBe(
      '23 November 2026',
    );
  },
);
