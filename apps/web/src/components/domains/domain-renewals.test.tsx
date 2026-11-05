import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { DomainRenewals } from './domain-renewals';
const api = vi.hoisted(() => ({ get: vi.fn(), mutate: vi.fn() }));
vi.mock('../../lib/auth-api', async (original) => ({
  ...(await original<typeof import('../../lib/auth-api')>()),
  authenticatedGet: api.get,
  authMutation: api.mutate,
}));
const domainId = '21400000-0000-4000-8000-000000000001';
const props = { domainId, domainName: 'fictional.com', administrator: false };
const empty = {
  domainId,
  enabled: false,
  revision: 0,
  terms: null,
  suggestedAmount: '170000',
  catalogueRevision: 1,
  reviewCode: 'TERMS_UNCONFIRMED',
  canConfigure: false,
  canChangePreference: true,
  invoice: null,
  externalDispatchEnabled: false,
};
const terms = {
  schemaVersion: 1,
  years: 1,
  currency: 'BDT',
  amount: '170000',
  catalogueRevision: 1,
};
afterEach(() => vi.resetAllMocks());

it('defaults off, explains billing versus registrar renewal and prevents enabling unconfirmed terms', async () => {
  api.get.mockResolvedValue(empty);
  render(<DomainRenewals {...props} />);
  await screen.findByText(/Terms unconfirmed/);
  expect(
    (
      screen.getByRole('button', {
        name: 'Turn renewal billing on',
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  expect(
    screen.getByText(/Registrar renewal dispatch is disabled/),
  ).toBeTruthy();
  expect(api.mutate).not.toHaveBeenCalled();
});
it('lets owning customers opt out with exact confirmation and preserves the invoice link', async () => {
  const invoice = {
    id: domainId,
    invoiceNumber: 'INV-FICTIONAL',
    status: 'UNPAID',
    amount: '170000',
    balanceDue: '170000',
    currency: 'BDT',
    dueAt: '2026-11-20T00:00:00.000Z',
    termStart: '2026-11-20T00:00:00.000Z',
    termEnd: '2027-11-20T00:00:00.000Z',
  };
  api.get.mockResolvedValue({
    ...empty,
    enabled: true,
    revision: 1,
    terms,
    reviewCode: null,
    invoice,
  });
  api.mutate.mockResolvedValue({
    ...empty,
    enabled: false,
    revision: 2,
    terms,
    reviewCode: null,
    invoice,
  });
  render(<DomainRenewals {...props} />);
  const user = userEvent.setup();
  await user.click(
    await screen.findByRole('button', { name: 'Turn renewal billing off' }),
  );
  const dialog = screen.getByRole('dialog');
  const save = within(dialog).getByRole('button', {
    name: 'Save renewal preferences',
  }) as HTMLButtonElement;
  expect(save.disabled).toBe(true);
  await user.type(
    within(dialog).getByLabelText('Confirm domain name'),
    props.domainName,
  );
  await user.click(save);
  expect(api.mutate).toHaveBeenCalledWith(
    `/domains/${domainId}/renewal-billing`,
    'PATCH',
    { confirmation: props.domainName, expectedRevision: 1, enabled: false },
  );
  await screen.findByRole('button', { name: 'Turn renewal billing on' });
  expect(
    screen
      .getByRole('link', { name: 'View renewal invoice' })
      .getAttribute('href'),
  ).toBe(`/portal/invoices/${domainId}`);
});
it('requires administrator review reason and acknowledgement for the current catalogue price', async () => {
  api.get.mockResolvedValue({ ...empty, canConfigure: true });
  api.mutate.mockResolvedValue({
    ...empty,
    revision: 1,
    terms,
    reviewCode: null,
    canConfigure: true,
  });
  render(<DomainRenewals {...props} administrator />);
  const user = userEvent.setup();
  await user.click(
    await screen.findByRole('button', { name: 'Confirm renewal terms' }),
  );
  const dialog = screen.getByRole('dialog');
  const save = within(dialog).getByRole('button', {
    name: 'Save renewal preferences',
  }) as HTMLButtonElement;
  await user.type(
    within(dialog).getByLabelText('Confirm domain name'),
    props.domainName,
  );
  expect(save.disabled).toBe(true);
  await user.type(
    within(dialog).getByLabelText('Review reason'),
    'Verified ordinary renewal',
  );
  await user.click(within(dialog).getByRole('checkbox'));
  await user.click(save);
  expect(api.mutate).toHaveBeenCalledWith(
    `/domains/${domainId}/renewal-billing/terms`,
    'POST',
    expect.objectContaining({
      enabled: false,
      years: 1,
      sellingAmount: '170000',
      ordinaryRenewalConfirmed: true,
    }),
  );
});
it('shows saved support information without preference or configuration actions', async () => {
  api.get.mockResolvedValue({ ...empty, canChangePreference: false });
  render(<DomainRenewals {...props} />);
  await screen.findByText(/Terms unconfirmed/);
  expect(screen.queryByRole('button', { name: /Turn renewal/ })).toBeNull();
});
it('rejects a cross-domain saved response without exposing arbitrary server errors', async () => {
  api.get.mockResolvedValue({
    ...empty,
    domainId: '21400000-0000-4000-8000-000000000002',
  });
  render(<DomainRenewals {...props} />);
  await screen.findByText('Renewal billing could not be loaded.');
  expect(screen.queryByRole('button', { name: /Turn renewal/ })).toBeNull();
});
