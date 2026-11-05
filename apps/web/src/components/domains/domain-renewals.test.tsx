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
const invoice = {
  id: domainId,
  invoiceNumber: 'INV-FICTIONAL',
  status: 'PAID',
  amount: '170000',
  balanceDue: '0',
  currency: 'BDT',
  dueAt: '2026-11-20T00:00:00.000Z',
  termStart: '2026-11-20T00:00:00.000Z',
  termEnd: '2027-11-20T00:00:00.000Z',
};
it('requires a paid-renewal confirmation, review reason and exact USD cost ceiling before queueing', async () => {
  api.get.mockResolvedValue({
    ...empty,
    enabled: true,
    terms,
    reviewCode: null,
    invoice,
    canApprove: true,
  });
  const execution = {
    id: domainId,
    attempt: 1,
    status: 'QUEUED',
    code: null,
    submittedAt: null,
    completedAt: null,
    expiryAfter: null,
    financialReviewRequired: false,
  };
  api.mutate.mockResolvedValue({
    ...empty,
    enabled: true,
    terms,
    reviewCode: null,
    invoice,
    execution,
  });
  render(<DomainRenewals {...props} administrator />);
  const user = userEvent.setup();
  await user.click(
    await screen.findByRole('button', { name: 'Approve paid renewal' }),
  );
  const dialog = screen.getByRole('dialog', { name: 'Approve paid renewal' });
  const save = within(dialog).getByRole('button', {
    name: 'Queue approved renewal',
  }) as HTMLButtonElement;
  expect(save.disabled).toBe(true);
  await user.type(
    within(dialog).getByLabelText('Confirm domain name'),
    props.domainName,
  );
  await user.type(within(dialog).getByLabelText('Review reason'), 'Verified');
  await user.type(
    within(dialog).getByLabelText('Registrar cost ceiling (USD)'),
    '10.00',
  );
  await user.click(within(dialog).getByRole('checkbox'));
  await user.click(save);
  expect(api.mutate).toHaveBeenCalledWith(
    `/domains/${domainId}/renewal-billing/execute`,
    'POST',
    expect.objectContaining({
      costCeiling: '1000',
      costCurrency: 'USD',
      years: 1,
      approved: true,
      invoiceId: domainId,
    }),
  );
  await screen.findByText(/Renewal fulfillment: Queued/);
});
it('offers read-only reconciliation for an uncertain operation without another purchase approval', async () => {
  const execution = {
    id: domainId,
    attempt: 1,
    status: 'NEEDS_RECONCILIATION',
    code: 'RENEWAL_OUTCOME_UNCONFIRMED',
    submittedAt: '2026-11-05T12:00:00.000Z',
    completedAt: null,
    expiryAfter: null,
    financialReviewRequired: false,
  };
  api.get.mockResolvedValue({
    ...empty,
    terms,
    invoice,
    execution,
    canReconcile: true,
  });
  api.mutate.mockResolvedValue({ ...empty, terms, invoice, execution });
  render(<DomainRenewals {...props} administrator />);
  const user = userEvent.setup();
  await user.click(
    await screen.findByRole('button', { name: 'Reconcile renewal' }),
  );
  expect(
    screen.queryByRole('button', { name: 'Approve paid renewal' }),
  ).toBeNull();
  const dialog = screen.getByRole('dialog', { name: 'Reconcile renewal' });
  await user.type(
    within(dialog).getByLabelText('Confirm domain name'),
    props.domainName,
  );
  await user.type(within(dialog).getByLabelText('Review reason'), 'Reviewed');
  expect(
    within(dialog).queryByLabelText('Registrar cost ceiling (USD)'),
  ).toBeNull();
  await user.click(
    within(dialog).getByRole('button', { name: 'Request reconciliation' }),
  );
  expect(api.mutate).toHaveBeenCalledWith(
    `/domains/${domainId}/renewal-billing/${domainId}/reconcile`,
    'POST',
    expect.not.objectContaining({ costCeiling: expect.anything() }),
  );
});
it('shows completed expiry and financial review without exposing staff execution actions to a customer', async () => {
  const execution = {
    id: domainId,
    attempt: 1,
    status: 'SUCCEEDED',
    code: 'FINANCIAL_REVIEW_REQUIRED',
    submittedAt: '2026-11-05T12:00:00.000Z',
    completedAt: '2026-11-05T12:01:00.000Z',
    expiryAfter: '2027-11-20T00:00:00.000Z',
    financialReviewRequired: true,
  };
  api.get.mockResolvedValue({ ...empty, invoice, execution });
  render(<DomainRenewals {...props} />);
  await screen.findByText(/Renewal fulfillment: Succeeded/);
  expect(screen.getByText(/Confirmed provider expiry/)).toBeTruthy();
  expect(
    screen.queryByRole('button', { name: 'Approve paid renewal' }),
  ).toBeNull();
});

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
