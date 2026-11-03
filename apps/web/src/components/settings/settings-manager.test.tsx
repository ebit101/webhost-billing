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
  afterEach(() => {
    vi.unstubAllGlobals();
    window.history.replaceState(null, '', '/');
  });

  it('opens General by default and saves or discards only the active tab', async () => {
    const user = userEvent.setup();
    const mock = settingsFetch();
    render(<SettingsManager />);
    const name = await screen.findByRole('textbox', { name: 'Business name' });
    expect(
      screen
        .getByRole('tab', { name: 'General' })
        .getAttribute('aria-selected'),
    ).toBe('true');
    expect(
      screen.queryByRole('checkbox', { name: 'Allow partial manual payments' }),
    ).toBeNull();
    await user.clear(name);
    await user.type(name, 'Fictional draft business');
    await openInvoices(user);
    const prefix = screen.getByRole('textbox', { name: 'Invoice prefix' });
    await user.clear(prefix);
    await user.type(prefix, 'NEW');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await screen.findByRole('status');
    expect(JSON.parse(String(writes(mock)[0]?.[1]?.body))).toEqual({
      invoiceNumbering: { prefix: 'NEW' },
    });
    await user.click(screen.getByRole('tab', { name: /General/ }));
    expect((name as HTMLInputElement).value).toBe('Fictional draft business');
    await user.click(screen.getByRole('button', { name: 'Discard changes' }));
    expect((name as HTMLInputElement).value).toBe(
      overview.businessIdentity.name,
    );
    expect(writes(mock)).toHaveLength(1);
  });

  it('opens the existing billing link and rebases invoice drafts on a newer sequence', async () => {
    const user = userEvent.setup();
    window.history.replaceState(null, '', '/admin/settings#billing-policy');
    const mock = settingsFetch(overview, false, 1020);
    render(<SettingsManager />);
    const prefix = await screen.findByRole('textbox', {
      name: 'Invoice prefix',
    });
    await user.clear(prefix);
    await user.type(prefix, 'NEW');
    await user.click(screen.getByRole('tab', { name: /General/ }));
    const name = screen.getByRole('textbox', { name: 'Business name' });
    await user.clear(name);
    await user.type(name, 'Fictional business');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await screen.findByRole('status');
    await openInvoices(user);
    expect(
      (
        screen.getByRole('spinbutton', {
          name: 'Next number',
        }) as HTMLInputElement
      ).value,
    ).toBe('1020');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await screen.findByRole('status');
    expect(JSON.parse(String(writes(mock)[1]?.[1]?.body))).toEqual({
      invoiceNumbering: { prefix: 'NEW' },
    });
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
      await openInvoices(user);
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
          name: 'Save changes',
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
      expect(
        (
          screen.getByRole('button', {
            name: 'Save changes',
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(true);
    },
  );

  it('cancels the policy change while retaining unrelated draft edits', async () => {
    const user = userEvent.setup();
    const mock = settingsFetch();
    render(<SettingsManager />);
    const name = await screen.findByRole('textbox', { name: 'Business name' });
    await user.clear(name);
    await user.type(name, 'Fictional draft business');
    await openInvoices(user);
    await user.click(
      screen.getByRole('checkbox', { name: 'Allow partial manual payments' }),
    );
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
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
    await user.click(screen.getByRole('tab', { name: /General/ }));
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await screen.findByRole('status');
    expect(JSON.parse(String(writes(mock)[0]?.[1]?.body))).toMatchObject({
      businessIdentity: { name: 'Fictional draft business' },
    });
  });

  it('retains the draft and persisted baseline on failure, then allows a successful retry', async () => {
    const user = userEvent.setup();
    const mock = settingsFetch(overview, true);
    render(<SettingsManager />);
    await openInvoices(user);
    await user.click(
      await screen.findByRole('checkbox', {
        name: 'Allow partial manual payments',
      }),
    );
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
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
          name: 'Save changes',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
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
        name: 'General settings',
      }),
    ).toBeTruthy();
    await user.click(
      screen.getByRole('tab', { name: 'Security and integrations' }),
    );
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

function settingsFetch(
  initial = overview,
  failFirst = false,
  advancedNextNumber?: number,
) {
  let saved = initial;
  let failed = false;
  const mock = vi.fn((request: RequestInfo | URL, init?: RequestInit) => {
    if (String(request).endsWith('/auth/csrf'))
      return Promise.resolve(success({ csrfToken: 'x'.repeat(32) }));
    if (init?.method === 'PATCH') {
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
      const body = JSON.parse(
        String(init.body),
      ) as import('@webhost-billing/shared').PatchBusinessSettingsRequest;
      saved = {
        ...saved,
        ...(body.businessIdentity
          ? { businessIdentity: body.businessIdentity }
          : {}),
        invoiceNumbering: {
          ...saved.invoiceNumbering,
          ...(advancedNextNumber ? { nextNumber: advancedNextNumber } : {}),
          ...body.invoiceNumbering,
        },
        manualPayments: { ...saved.manualPayments, ...body.manualPayments },
      };
    }
    return Promise.resolve(success(saved));
  });
  vi.stubGlobal('fetch', mock);
  return mock;
}

function writes(mock: ReturnType<typeof settingsFetch>) {
  return mock.mock.calls.filter(([, init]) => init?.method === 'PATCH');
}

async function openInvoices(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('tab', { name: /Invoices/ }));
}
