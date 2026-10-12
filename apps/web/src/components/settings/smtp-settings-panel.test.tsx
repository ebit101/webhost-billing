import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SmtpSettingsStatus } from '@webhost-billing/shared';
import { SmtpSettingsPanel } from './smtp-settings-panel';
import { authenticatedGet, authMutation } from '../../lib/auth-api';
vi.mock('../../lib/auth-api', () => ({
  authenticatedGet: vi.fn(),
  authMutation: vi.fn(),
}));
const empty: SmtpSettingsStatus = {
  configured: false,
  enabled: false,
  host: null,
  connection: null,
  maskedUsername: null,
  passwordConfigured: false,
  updatedAt: null,
  revision: null,
};
const saved: SmtpSettingsStatus = {
  ...empty,
  configured: true,
  host: 'smtp.provider.com',
  connection: { security: 'STARTTLS', port: 587 },
  maskedUsername: '••••••••',
  passwordConfigured: true,
  updatedAt: '2026-10-12T03:00:00.000Z',
  revision: 'a'.repeat(64),
};
describe('SMTP settings panel', () => {
  afterEach(() => vi.resetAllMocks());
  it('shows inactive deployment status without revealing or inventing credentials', async () => {
    vi.mocked(authenticatedGet).mockResolvedValue(saved);
    render(<SmtpSettingsPanel />);
    expect(
      await screen.findByText(
        'Deployment transport in use (may be a test mail catcher)',
      ),
    ).toBeTruthy();
    expect(
      (screen.getByLabelText('SMTP password') as HTMLInputElement).value,
    ).toBe('');
    expect(
      (screen.getByLabelText('SMTP username') as HTMLInputElement).value,
    ).toBe('');
    expect(authMutation).not.toHaveBeenCalled();
  });
  it('clears secrets immediately, saves inactive and cannot activate without a review', async () => {
    vi.mocked(authenticatedGet).mockResolvedValue(empty);
    let resolveSave!: (value: unknown) => void;
    vi.mocked(authMutation).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveSave = resolve;
        }),
    );
    render(<SmtpSettingsPanel />);
    await screen.findByLabelText('SMTP hostname');
    const user = userEvent.setup();
    await user.type(
      screen.getByLabelText('SMTP hostname'),
      'smtp.provider.com',
    );
    await user.type(screen.getByLabelText('SMTP username'), 'fictional-user');
    await user.type(screen.getByLabelText('SMTP password'), 'fake'.repeat(8));
    await user.click(
      screen.getByRole('button', { name: 'Save SMTP configuration' }),
    );
    expect(
      (screen.getByLabelText('SMTP password') as HTMLInputElement).value,
    ).toBe('');
    expect(authMutation).toHaveBeenCalledWith(
      '/settings/smtp',
      'PUT',
      expect.objectContaining({
        confirmation: 'SAVE_SMTP',
        connection: { security: 'STARTTLS', port: 587 },
      }),
    );
    resolveSave(saved);
    await screen.findByText(
      'SMTP configuration saved and encrypted. It is inactive until you activate it.',
    );
    await user.click(
      screen.getByRole('button', { name: 'Activate custom SMTP' }),
    );
    const dialog = screen.getByRole('alertdialog');
    expect(dialog.textContent).toContain('Queued and future emails');
    expect(authMutation).toHaveBeenCalledTimes(1);
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(authMutation).toHaveBeenCalledTimes(1);
    vi.mocked(authMutation).mockResolvedValue({ ...saved, enabled: true });
    await user.click(
      screen.getByRole('button', { name: 'Activate custom SMTP' }),
    );
    await user.click(
      screen.getByRole('button', { name: 'Confirm SMTP activation' }),
    );
    await screen.findByText('Custom SMTP active');
    expect(authMutation).toHaveBeenLastCalledWith(
      '/settings/smtp/activation',
      'POST',
      { enabled: true, confirmation: 'ENABLE_SMTP', revision: saved.revision },
    );
  });
  it('supports TLS port 465 and clears secrets even when saving fails', async () => {
    vi.mocked(authenticatedGet).mockResolvedValue(empty);
    vi.mocked(authMutation).mockRejectedValue(new Error('raw provider secret'));
    render(<SmtpSettingsPanel />);
    await screen.findByLabelText('SMTP hostname');
    const user = userEvent.setup();
    await user.type(
      screen.getByLabelText('SMTP hostname'),
      'smtp.provider.com',
    );
    await user.selectOptions(
      screen.getByLabelText('Connection security'),
      'TLS',
    );
    await user.type(screen.getByLabelText('SMTP username'), 'fictional-user');
    await user.type(screen.getByLabelText('SMTP password'), 'fake'.repeat(8));
    await user.click(
      screen.getByRole('button', { name: 'Save SMTP configuration' }),
    );
    await screen.findByRole('alert');
    expect(screen.queryByText('raw provider secret')).toBeNull();
    expect(
      (screen.getByLabelText('SMTP password') as HTMLInputElement).value,
    ).toBe('');
    expect(authMutation).toHaveBeenCalledWith(
      '/settings/smtp',
      'PUT',
      expect.objectContaining({ connection: { security: 'TLS', port: 465 } }),
    );
  });
  it('fails closed when status cannot be loaded', async () => {
    vi.mocked(authenticatedGet).mockRejectedValue(new Error('no rights'));
    render(<SmtpSettingsPanel />);
    await screen.findByRole('alert');
    expect(
      screen.queryByRole('button', { name: 'Save SMTP configuration' }),
    ).toBeNull();
    expect(
      screen
        .getByRole('link', { name: /Open account security/ })
        .getAttribute('href'),
    ).toBe('/account');
  });
  it('permits an authorized replacement of unreadable credentials without offering activation or claiming fallback delivery', async () => {
    vi.mocked(authenticatedGet).mockRejectedValue(
      new Error('Protected SMTP configuration is unavailable. Save it again.'),
    );
    render(<SmtpSettingsPanel />);
    await screen.findByText('Replace unreadable SMTP configuration');
    expect(
      screen.getByRole('button', { name: 'Save SMTP configuration' }),
    ).toBeTruthy();
    expect(
      screen.queryByRole('button', { name: 'Activate custom SMTP' }),
    ).toBeNull();
    expect(
      screen.queryByText(
        'Deployment transport in use (may be a test mail catcher)',
      ),
    ).toBeNull();
  });
  it('requires separate confirmation when reverting to the deployment transport', async () => {
    vi.mocked(authenticatedGet).mockResolvedValue({ ...saved, enabled: true });
    vi.mocked(authMutation).mockResolvedValue(saved);
    render(<SmtpSettingsPanel />);
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', { name: 'Use deployment transport' }),
    );
    const dialog = screen.getByRole('alertdialog');
    await user.click(
      within(dialog).getByRole('button', { name: 'Use deployment transport' }),
    );
    await waitFor(() =>
      expect(authMutation).toHaveBeenCalledWith(
        '/settings/smtp/activation',
        'POST',
        {
          enabled: false,
          confirmation: 'USE_DEPLOYMENT_EMAIL',
          revision: saved.revision,
        },
      ),
    );
  });
});
