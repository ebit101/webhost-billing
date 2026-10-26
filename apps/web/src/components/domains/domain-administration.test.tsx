import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {
  DomainDetail,
  DomainTld,
  RegistrarConnection,
} from '@webhost-billing/shared';
import { RegistrarConnections } from './registrar-connections';
import { TldManager } from './tld-manager';
import { RegistrationApproval } from './registration-approval';
import { DomainDefaults } from './domain-defaults';
const api = vi.hoisted(() => ({ get: vi.fn(), mutate: vi.fn() }));
vi.mock('../../lib/auth-api', () => ({
  authenticatedGet: api.get,
  authMutation: api.mutate,
}));
const primary = '80000000-0000-4000-8000-000000000118';
const secondary = '80000000-0000-4000-8000-000000000119';
const connection: RegistrarConnection = {
  id: primary,
  name: 'Fictional primary',
  module: 'logicboxes',
  mode: 'Live',
  enabled: true,
  isDefault: true,
  networkEnabled: false,
  credentialVersion: 1,
  maskedResellerId: '••••2345',
  nativeCostConfirmed: true,
  capabilities: {
    registration: true,
    renewal: true,
    transfer: false,
    dnsManagement: false,
    emailForwarding: false,
    idProtection: false,
  },
};
const row: DomainTld = {
  id: primary,
  tld: 'com',
  revision: 1,
  registrationAmount: '150000',
  renewalAmount: '160000',
  enabled: true,
  featured: false,
  displayOrder: 1,
  preferredRegistrarId: null,
  currency: 'BDT',
  years: 1,
  registrationSupported: true,
  transferSupported: false,
  renewalSupported: true,
};
beforeEach(() => {
  api.get.mockReset();
  api.mutate.mockReset();
  api.mutate.mockResolvedValue({});
  api.get.mockImplementation((path: string) =>
    Promise.resolve(path.endsWith('/tlds') ? [row] : [connection]),
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
describe('separate registrar connections', () => {
  it('contains only credentials/name, clears the secret immediately and saves disabled', async () => {
    render(<RegistrarConnections />);
    await userEvent
      .setup()
      .click(
        await screen.findByRole('button', { name: 'Add registrar connection' }),
      );
    for (const [label, value] of [
      ['Connection name', 'Fictional secondary'],
      ['Reseller ID', '45678'],
      ['API key', 'fake'.repeat(8)],
    ])
      fireEvent.change(screen.getByLabelText(label!), { target: { value } });
    expect(screen.queryByLabelText(/selling price/i)).toBeNull();
    expect(screen.queryByLabelText(/Nameservers/i)).toBeNull();
    expect(screen.queryByLabelText(/agreement URL/i)).toBeNull();
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Save connection' }));
    await screen.findByRole('status');
    expect(api.mutate).toHaveBeenCalledWith(
      '/domains/administration/registrars',
      'POST',
      expect.objectContaining({
        resellerId: '45678',
        module: 'logicboxes',
        confirmation: 'Save registrar connection',
      }),
    );
    expect((screen.getByLabelText('API key') as HTMLInputElement).value).toBe(
      '',
    );
  });
  it('requires explicit review before selecting a default and never auto-selects on load', async () => {
    api.get.mockResolvedValue([{ ...connection, isDefault: false }]);
    render(<RegistrarConnections />);
    await userEvent
      .setup()
      .click(
        await screen.findByRole('button', { name: 'Manage Fictional primary' }),
      );
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Set as default' }));
    expect(api.mutate).not.toHaveBeenCalled();
    await userEvent.setup().click(
      within(screen.getByRole('alertdialog')).getByRole('button', {
        name: 'Confirm',
      }),
    );
    await screen.findByRole('status');
    expect(api.mutate).toHaveBeenCalledWith(
      `/domains/administration/registrars/${primary}/default`,
      'PUT',
      { confirmation: 'Set default registrar' },
    );
  });
  it('fails closed rather than showing an empty successful account list', async () => {
    api.get.mockResolvedValue({});
    render(<RegistrarConnections />);
    await screen.findByRole('alert');
    expect(
      screen.queryByRole('heading', { name: 'Add registrar connection' }),
    ).toBeNull();
  });
});
describe('TLD catalogue', () => {
  it('edits exact BDT prices separately from credentials and posts a revision', async () => {
    render(<TldManager />);
    await userEvent
      .setup()
      .click(await screen.findByRole('button', { name: 'Pricing for .com' }));
    fireEvent.change(
      screen.getByLabelText('One-year registration price (BDT)'),
      { target: { value: '1500.01' } },
    );
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Save TLD pricing' }));
    await screen.findByText(/TLD revision saved/);
    expect(api.mutate).toHaveBeenCalledWith(
      '/domains/administration/tlds',
      'PUT',
      expect.objectContaining({
        registrationAmount: '150001',
        renewalAmount: '160000',
        revision: 1,
        preferredRegistrarId: null,
      }),
    );
    expect(screen.queryByLabelText('API key')).toBeNull();
  });
  it('reviews a bounded bulk operation and sends exactly one write after confirmation', async () => {
    render(<TldManager />);
    await userEvent.setup().click(await screen.findByLabelText('Select .com'));
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Review selected TLDs' }));
    expect(api.mutate).not.toHaveBeenCalled();
    await userEvent.setup().click(
      within(screen.getByRole('alertdialog')).getByRole('button', {
        name: 'Confirm',
      }),
    );
    await screen.findByText(/Reviewed TLD batch applied/);
    expect(api.mutate).toHaveBeenCalledTimes(1);
    expect(api.mutate).toHaveBeenCalledWith(
      '/domains/administration/tlds/bulk',
      'POST',
      {
        entries: [{ id: primary, revision: 1 }],
        enabled: false,
        confirmation: 'Apply TLD changes',
      },
    );
  });
  it('does not submit zero, exponent or excessive-precision prices', async () => {
    render(<TldManager />);
    await userEvent
      .setup()
      .click(await screen.findByRole('button', { name: 'Pricing for .com' }));
    for (const value of ['0', '1e3', '1500.001']) {
      fireEvent.change(
        screen.getByLabelText('One-year registration price (BDT)'),
        { target: { value } },
      );
      await userEvent
        .setup()
        .click(screen.getByRole('button', { name: 'Save TLD pricing' }));
    }
    expect(api.mutate).not.toHaveBeenCalled();
    await screen.findByRole('alert');
  });
  it('preserves a completed write when its refresh fails and never retries it', async () => {
    render(<TldManager />);
    await userEvent
      .setup()
      .click(await screen.findByRole('button', { name: 'Pricing for .com' }));
    api.get.mockRejectedValue(new Error('fictional refresh failure'));
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Save TLD pricing' }));
    await screen.findByText(
      /The change completed, but the catalogue could not be refreshed/,
    );
    expect(api.mutate).toHaveBeenCalledTimes(1);
  });
});
describe('explicit registrar execution review', () => {
  const domain: DomainDetail = {
    id: primary,
    domainName: 'fictional-choice.com',
    state: 'AWAITING_APPROVAL',
    verification: 'Pending',
    expiresAt: null,
    simulated: true,
    autoRenew: false,
    registrar: 'Fictional primary',
    registrationYears: 1,
    requestedAt: '2026-10-12T01:00:00.000Z',
    sellingAmount: '150000',
    financialAttention: false,
    invoiceId: primary,
    invoiceStatus: 'PAID',
    orderId: primary,
    balanceDue: '0',
    currency: 'BDT',
    nameservers: ['ns1.example.test', 'ns2.example.test'],
    agreement: 'fictional-registration-v1',
    accountId: primary,
    selectedRegistrarId: null,
    eligibleRegistrars: [
      { id: primary, name: 'Fictional primary', isDefault: true },
      { id: secondary, name: 'Fictional secondary', isDefault: false },
    ],
  };
  it('preselects the default but allows explicit choice without changing invoice prices', async () => {
    const approve = vi.fn();
    render(
      <RegistrationApproval domain={domain} busy={false} onApprove={approve} />,
    );
    expect(
      (screen.getByLabelText('Registrar') as HTMLSelectElement).value,
    ).toBe(primary);
    expect(api.mutate).not.toHaveBeenCalled();
    await userEvent
      .setup()
      .selectOptions(screen.getByLabelText('Registrar'), secondary);
    fireEvent.change(screen.getByLabelText('Type exact domain name'), {
      target: { value: domain.domainName },
    });
    fireEvent.change(
      screen.getByLabelText('Approved USD preflight threshold in minor units'),
      { target: { value: '1000' } },
    );
    await userEvent
      .setup()
      .click(
        screen.getByRole('button', { name: 'Approve simulated registration' }),
      );
    expect(approve).toHaveBeenCalledWith({
      confirmation: domain.domainName,
      costCeiling: '1000',
      costCurrency: 'USD',
      registrarAccountId: secondary,
    });
  });
  it('uses a read-only check only when requested and locks an existing approval', async () => {
    api.mutate.mockResolvedValue({
      available: true,
      costAmount: '1000',
      costCurrency: 'USD',
      simulated: true,
    });
    const view = render(
      <RegistrationApproval domain={domain} busy={false} onApprove={vi.fn()} />,
    );
    expect(api.mutate).not.toHaveBeenCalled();
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Check selected registrar' }));
    await screen.findByText(/Simulated read-only check/);
    expect(api.mutate).toHaveBeenCalledWith(
      `/domains/${primary}/registration-check`,
      'POST',
      { registrarAccountId: primary },
    );
    view.unmount();
    render(
      <RegistrationApproval
        domain={{
          ...domain,
          selectedRegistrarId: secondary,
          operationId: secondary,
        }}
        busy={false}
        onApprove={vi.fn()}
      />,
    );
    expect(
      (screen.getByLabelText('Registrar') as HTMLSelectElement).disabled,
    ).toBe(true);
    expect(
      (screen.getByLabelText('Registrar') as HTMLSelectElement).value,
    ).toBe(secondary);
  });
});
it('keeps DNS and centrally reviewed policy inputs off registrar/pricing forms', async () => {
  api.get.mockResolvedValue({ dns: null, policies: null });
  render(<DomainDefaults />);
  await screen.findByRole('heading', { name: 'Default nameservers' });
  expect(
    (screen.getByLabelText('Domain-registration policy') as HTMLInputElement)
      .required,
  ).toBe(true);
  expect(screen.queryByLabelText('API key')).toBeNull();
});
