import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ResellbizSettingsPanel } from './resellbiz-settings';
import { authenticatedGet, authMutation } from '../../lib/auth-api';
vi.mock('../../lib/auth-api', () => ({
  authenticatedGet: vi.fn(),
  authMutation: vi.fn(),
}));
const configured = {
  id: '80000000-0000-4000-8000-000000000051',
  mode: 'Live',
  enabled: false,
  networkEnabled: true,
  maskedResellerId: '••••2345',
  credentialVersion: 1,
  agreementUrl: 'https://fictional-host.com/domain-agreement',
  customerTermsUrl: 'https://fictional-host.com/customer-terms',
  customerPrivacyUrl: 'https://fictional-host.com/privacy',
  nameservers: ['ns1.fictional-host.com', 'ns2.fictional-host.com'],
  sellingAmount: '150000',
};
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
describe('live registrar configuration boundary', () => {
  it('loads only local masked status, discloses real charges and makes no provider mutation', async () => {
    vi.mocked(authenticatedGet).mockResolvedValue(configured);
    render(<ResellbizSettingsPanel />);
    await screen.findByText(/Reseller ••••2345/);
    expect(authenticatedGet).toHaveBeenCalledExactlyOnceWith(
      '/domains/registrar/live',
    );
    expect(authMutation).not.toHaveBeenCalled();
    expect(screen.getByText(/Real account, real charges/)).toBeTruthy();
    expect(
      screen
        .getByRole('link', { name: 'Review configured registrar agreement' })
        .getAttribute('href'),
    ).toBe(configured.agreementUrl);
  });
  it('clears password immediately, validates confirmations and saves disabled only', async () => {
    vi.mocked(authenticatedGet).mockResolvedValue(null);
    vi.mocked(authMutation).mockResolvedValue(null);
    render(<ResellbizSettingsPanel />);
    await screen.findByLabelText('API key');
    for (const [label, value] of Object.entries({
      'Reseller ID': '12345',
      'API key': 'fake'.repeat(8),
      '.com selling price in BDT minor units': '150000',
      'Nameservers, separated by commas': configured.nameservers.join(', '),
      'Actual registrar agreement URL': configured.agreementUrl,
      'Actual registrar customer terms URL': configured.customerTermsUrl,
      'Actual registrar customer privacy URL': configured.customerPrivacyUrl,
      'Type Configure live resell.biz': 'Configure live resell.biz',
    }))
      fireEvent.change(screen.getByLabelText(label), { target: { value } });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.submit(
      screen
        .getByRole('button', { name: 'Save credentials, disabled' })
        .closest('form')!,
    );
    expect(screen.getByLabelText('API key')).toHaveProperty('value', '');
    await screen.findByText(/Credentials saved. Registrar remains disabled/);
    expect(authMutation).toHaveBeenCalledWith(
      '/domains/registrar/live',
      'POST',
      expect.objectContaining({
        confirmation: 'Configure live resell.biz',
        confirmNativeUsdCosts: true,
      }),
    );
    expect(authMutation).toHaveBeenCalledTimes(1);
  });
  it('cannot enable or check when the server networking flag is disabled', async () => {
    vi.mocked(authenticatedGet).mockResolvedValue({
      ...configured,
      networkEnabled: false,
    });
    render(<ResellbizSettingsPanel />);
    expect(
      await screen.findByRole('button', {
        name: 'Check availability and cost',
      }),
    ).toHaveProperty('disabled', true);
    expect(
      screen.getByRole('button', {
        name: 'Enable live offers after connection check',
      }),
    ).toHaveProperty('disabled', true);
    expect(authMutation).not.toHaveBeenCalled();
  });
  it('shows a read-only quote as an observation, never a purchase or charge guarantee', async () => {
    vi.mocked(authenticatedGet).mockResolvedValue(configured);
    vi.mocked(authMutation).mockResolvedValue({
      available: true,
      costAmount: '1099',
      costCurrency: 'USD',
    });
    render(<ResellbizSettingsPanel />);
    fireEvent.change(
      await screen.findByLabelText('Domain for read-only check'),
      { target: { value: 'fictional-live.com' } },
    );
    fireEvent.submit(
      screen
        .getByRole('button', { name: 'Check availability and cost' })
        .closest('form')!,
    );
    await screen.findByText(/USD 10.99. Price observation only/);
    expect(authMutation).toHaveBeenCalledExactlyOnceWith(
      `/domains/registrar/live/${configured.id}/check`,
      'POST',
      { domainName: 'fictional-live.com' },
    );
  });
  it('does not render an unauthorized credential form after a status error', async () => {
    vi.mocked(authenticatedGet).mockRejectedValue(new Error('Denied'));
    render(<ResellbizSettingsPanel />);
    await screen.findByText(/Registrar settings could not be loaded/);
    expect(screen.queryByLabelText('API key')).toBeNull();
    await waitFor(() => expect(authMutation).not.toHaveBeenCalled());
  });
});
