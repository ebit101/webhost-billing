import {
  DEFAULT_BUSINESS_SETTINGS,
  PARTIAL_PAYMENT_POLICY_CONFIRMATION,
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

  it('saves an unchanged policy without requiring a review or confirmation', async () => {
    const user = userEvent.setup();
    const mock = settingsFetch();
    render(<SettingsManager />);
    await screen.findByRole('checkbox', {
      name: 'Allow partial manual payments',
    });
    await user.click(screen.getByRole('button', { name: 'Save settings' }));
    await screen.findByRole('status');
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(writes(mock)).toHaveLength(1);
    expect(JSON.parse(String(writes(mock)[0]?.[1]?.body))).not.toHaveProperty(
      'partialPaymentPolicyConfirmation',
    );
  });

  it.each([false, true])(
    'reviews and confirms a change from saved %s before updating the baseline',
    async (previous) => {
      const user = userEvent.setup();
      const initial = {
        ...overview,
        manualPayments: {
          ...overview.manualPayments,
          partialPaymentsEnabled: previous,
        },
      };
      const mock = settingsFetch(initial);
      render(<SettingsManager />);
      await user.click(
        await screen.findByRole('checkbox', {
          name: 'Allow partial manual payments',
        }),
      );
      expect(
        screen.getByText(
          `Current saved partial-payment policy: ${previous ? 'Enabled' : 'Disabled'}.`,
          { exact: false },
        ),
      ).toBeTruthy();
      await user.click(
        screen.getByRole('button', {
          name: previous ? 'Save all settings' : 'Save settings',
        }),
      );
      const review = screen.getByRole('alertdialog');
      expect(review.textContent).toContain(
        `Current policy: ${previous ? 'Enabled' : 'Disabled'}. Proposed policy: ${previous ? 'Disabled' : 'Enabled'}.`,
      );
      expect(review.textContent).toContain('pending-reference verifications');
      expect(review.textContent).toContain(
        previous ? 'full current balance' : 'positive amount up to',
      );
      expect(review.textContent).toContain(
        'Existing invoices, payments, balances, and pending references are unchanged',
      );
      expect(writes(mock)).toHaveLength(0);
      await user.click(
        within(review).getByRole('button', {
          name: 'Confirm policy change and save settings',
        }),
      );
      await screen.findByRole('status');
      expect(screen.queryByRole('alertdialog')).toBeNull();
      expect(JSON.parse(String(writes(mock)[0]?.[1]?.body))).toMatchObject({
        partialPaymentPolicyConfirmation: PARTIAL_PAYMENT_POLICY_CONFIRMATION,
        manualPayments: { partialPaymentsEnabled: !previous },
      });
      expect(
        screen.getByText(
          `Current saved partial-payment policy: ${previous ? 'Disabled' : 'Enabled'}.`,
          { exact: false },
        ),
      ).toBeTruthy();
      await user.click(screen.getByRole('button', { name: 'Save settings' }));
      await waitFor(() => expect(writes(mock)).toHaveLength(2));
      expect(JSON.parse(String(writes(mock)[1]?.[1]?.body))).not.toHaveProperty(
        'partialPaymentPolicyConfirmation',
      );
    },
  );

  it('cancels the policy change while retaining unrelated draft edits', async () => {
    const user = userEvent.setup();
    const mock = settingsFetch();
    render(<SettingsManager />);
    const name = await screen.findByRole('textbox', { name: 'Business name' });
    await user.clear(name);
    await user.type(name, 'Fictional draft business');
    await user.click(
      screen.getByRole('checkbox', { name: 'Allow partial manual payments' }),
    );
    await user.click(screen.getByRole('button', { name: 'Save settings' }));
    await user.click(
      within(screen.getByRole('alertdialog')).getByRole('button', {
        name: 'Cancel',
      }),
    );
    expect(writes(mock)).toHaveLength(0);
    expect(
      (
        screen.getByRole('checkbox', {
          name: 'Allow partial manual payments',
        }) as HTMLInputElement
      ).checked,
    ).toBe(false);
    expect((name as HTMLInputElement).value).toBe('Fictional draft business');
    await user.click(screen.getByRole('button', { name: 'Save settings' }));
    await screen.findByRole('status');
    expect(JSON.parse(String(writes(mock)[0]?.[1]?.body))).toMatchObject({
      businessIdentity: { name: 'Fictional draft business' },
      manualPayments: { partialPaymentsEnabled: false },
    });
  });

  it('retains the draft and persisted baseline on failure, then allows a successful retry', async () => {
    const user = userEvent.setup();
    const mock = settingsFetch(overview, true);
    render(<SettingsManager />);
    await user.click(
      await screen.findByRole('checkbox', {
        name: 'Allow partial manual payments',
      }),
    );
    await user.click(screen.getByRole('button', { name: 'Save settings' }));
    await user.click(
      within(screen.getByRole('alertdialog')).getByRole('button', {
        name: 'Confirm policy change and save settings',
      }),
    );
    await waitFor(() =>
      expect(screen.getByRole('alertdialog').textContent).toContain(
        'Save failed: Fictional retryable failure',
      ),
    );
    expect(
      screen.getByText(/Current saved partial-payment policy: Disabled/),
    ).toBeTruthy();
    await user.click(
      within(screen.getByRole('alertdialog')).getByRole('button', {
        name: 'Confirm policy change and save settings',
      }),
    );
    await screen.findByRole('status');
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(writes(mock)).toHaveLength(2);
    expect(
      screen.getByText(/Current saved partial-payment policy: Enabled/),
    ).toBeTruthy();
  });

  it('does not save guessed defaults when the persisted settings fail to load', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('Fictional load failure')),
    );
    render(<SettingsManager />);
    await screen.findByRole('alert');
    expect(
      (
        screen.getByRole('button', {
          name: 'Save settings',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(
      screen.getByText(/Current saved partial-payment policy: Unavailable/),
    ).toBeTruthy();
  });

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

function settingsFetch(initial = overview, failFirst = false) {
  let saved = initial;
  let failed = false;
  const mock = vi.fn((request: RequestInfo | URL, init?: RequestInit) => {
    if (String(request).endsWith('/auth/csrf'))
      return Promise.resolve(success({ csrfToken: 'x'.repeat(32) }));
    if (init?.method === 'PUT') {
      if (failFirst && !failed) {
        failed = true;
        return Promise.resolve(
          new Response(
            JSON.stringify({
              success: false,
              error: { message: 'Fictional retryable failure' },
            }),
            { status: 422 },
          ),
        );
      }
      const body = JSON.parse(String(init.body)) as Record<string, unknown>;
      const { partialPaymentPolicyConfirmation, ...ordinary } = body;
      void partialPaymentPolicyConfirmation;
      saved = {
        ...ordinary,
        credentialStatuses: initial.credentialStatuses,
      } as SettingsOverview;
    }
    return Promise.resolve(success(saved));
  });
  vi.stubGlobal('fetch', mock);
  return mock;
}

function writes(mock: ReturnType<typeof settingsFetch>) {
  return mock.mock.calls.filter(([, init]) => init?.method === 'PUT');
}
