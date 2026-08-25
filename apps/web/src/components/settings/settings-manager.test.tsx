import {
  DEFAULT_BUSINESS_SETTINGS,
  type SettingsOverview,
} from '@webhost-billing/shared';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SettingsManager } from './settings-manager';

const overview: SettingsOverview = {
  ...DEFAULT_BUSINESS_SETTINGS,
  credentialStatuses: [
    {
      provider: 'bkash',
      configured: false,
      maskedIdentifier: null,
      updatedAt: null,
      keyVersion: null,
      managedAt: 'SETTINGS',
    },
    {
      provider: 'sslcommerz',
      configured: false,
      maskedIdentifier: null,
      updatedAt: null,
      keyVersion: null,
      managedAt: 'SETTINGS',
    },
    {
      provider: 'cpanel-whm',
      configured: true,
      maskedIdentifier: '1 WHM server',
      updatedAt: '2026-08-26T04:30:00.000Z',
      keyVersion: 'cpanel-token-v1',
      managedAt: 'HOSTING_SERVERS',
    },
  ],
};

describe('settings manager', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('edits ordinary settings and treats provider secrets as write-only', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(
      (request: RequestInfo | URL, init?: RequestInit) => {
        const url = String(request);
        if (url.includes('/auth/csrf')) {
          return Promise.resolve(success({ csrfToken: 'x'.repeat(32) }));
        }
        if (url.endsWith('/settings/credentials')) {
          return Promise.resolve(
            success({
              provider: 'bkash',
              configured: true,
              maskedIdentifier: 'User fi***er · App fi***ey',
              updatedAt: '2026-08-26T04:35:00.000Z',
              keyVersion: 'integration-credential-v1',
              managedAt: 'SETTINGS',
            }),
          );
        }
        if (init?.method === 'PUT') {
          return Promise.resolve(success(overview));
        }
        return Promise.resolve(success(overview));
      },
    );
    vi.stubGlobal('fetch', fetchMock);

    render(<SettingsManager />);

    expect(
      await screen.findByRole('heading', {
        name: 'Business settings and secrets',
      }),
    ).toBeTruthy();
    expect(screen.getByText('1 WHM server')).toBeTruthy();

    const bKashCard = screen
      .getByRole('heading', { name: 'bKash sandbox' })
      .closest('form');
    expect(bKashCard).toBeTruthy();
    const fields = bKashCard!.querySelectorAll('input[type="password"]');
    await user.type(fields[0] as HTMLInputElement, 'fictional-app-key');
    await user.type(fields[1] as HTMLInputElement, 'fictional-app-secret');
    await user.type(fields[2] as HTMLInputElement, 'fictional-user');
    await user.type(fields[3] as HTMLInputElement, 'fictional-password');
    await user.click(
      within(bKashCard!).getByRole('button', {
        name: 'Configure credentials',
      }),
    );

    expect(await screen.findByText('User fi***er · App fi***ey')).toBeTruthy();
    expect(screen.queryByDisplayValue('fictional-app-secret')).toBeNull();
    await waitFor(() => {
      const write = fetchMock.mock.calls.find(([url]) =>
        String(url).endsWith('/settings/credentials'),
      );
      expect((write?.[1] as RequestInit).body).toContain('REPLACE_CREDENTIALS');
    });
  });
});

function success(data: unknown) {
  return new Response(JSON.stringify({ success: true, data }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
