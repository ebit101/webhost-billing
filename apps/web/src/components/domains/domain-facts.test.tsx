import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DomainFacts } from './domain-facts';
const api = vi.hoisted(() => ({ get: vi.fn(), mutate: vi.fn() }));
vi.mock('../../lib/auth-api', async (original) => ({
  ...(await original<typeof import('../../lib/auth-api')>()),
  authenticatedGet: api.get,
  authMutation: api.mutate,
}));
const domainId = '21300000-0000-4000-8000-000000000001';
const props = { domainId, domainName: 'fictional.com', administrator: true };
const empty = {
  domainId,
  attemptId: null,
  outcome: 'NOT_CHECKED',
  code: null,
  lastAttemptAt: null,
  lastSuccessAt: null,
  observedAt: null,
  expiresAt: null,
  providerStatus: null,
  renewalEligibility: 'UNKNOWN',
  registrarAutoRenew: null,
  simulated: true,
  freshness: 'NOT_CHECKED',
  reviewRequired: false,
  candidateExpiry: null,
  canReview: false,
};
afterEach(() => vi.resetAllMocks());
describe('registrar domain facts', () => {
  it('allows an administrator to retry an abandoned running check through the server lease guard', async () => {
    api.get.mockResolvedValue({
      ...empty,
      attemptId: domainId,
      outcome: 'RUNNING',
    });
    render(<DomainFacts {...props} />);
    await screen.findByText(/Latest check: Running/);
    const user = userEvent.setup();
    await user.click(
      screen.getByRole('button', { name: 'Synchronize registrar facts' }),
    );
    expect(
      screen.getByRole('dialog', { name: 'Synchronize registrar facts' }),
    ).toBeTruthy();
  });
  it('loads only saved facts for customers and support sessions', async () => {
    api.get.mockResolvedValue(empty);
    render(<DomainFacts {...props} administrator={false} />);
    await screen.findByText(/Latest check: Not checked/);
    expect(api.get).toHaveBeenCalledWith(
      `/domains/${domainId}/registrar-facts`,
    );
    expect(api.mutate).not.toHaveBeenCalled();
    expect(
      screen.queryByRole('button', { name: 'Synchronize registrar facts' }),
    ).toBeNull();
  });
  it('requires exact domain confirmation for a read and shows trusted source freshness', async () => {
    api.get.mockResolvedValue(empty);
    const onUpdated = vi.fn();
    render(<DomainFacts {...props} onUpdated={onUpdated} />);
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', {
        name: 'Synchronize registrar facts',
      }),
    );
    const dialog = screen.getByRole('dialog');
    const save = within(dialog).getByRole('button', {
      name: 'Check registrar facts',
    }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    await user.type(
      within(dialog).getByLabelText('Confirm domain name'),
      props.domainName,
    );
    api.mutate.mockResolvedValue({
      ...empty,
      attemptId: domainId,
      outcome: 'SUCCEEDED',
      lastSuccessAt: '2026-11-05T12:00:00.000Z',
      observedAt: '2026-11-05T12:00:00.000Z',
      expiresAt: '2027-11-05T12:00:00.000Z',
      providerStatus: 'ACTIVE',
      renewalEligibility: 'ELIGIBLE',
      freshness: 'FRESH',
      registrarAutoRenew: false,
    });
    await user.click(save);
    await screen.findByText(/Latest check: Succeeded/);
    expect(onUpdated).toHaveBeenCalledOnce();
    expect(api.mutate).toHaveBeenCalledWith(
      `/domains/${domainId}/registrar-facts/synchronize`,
      'POST',
      { submissionKey: expect.any(String), confirmation: props.domainName },
    );
  });
  it('requires a reason and acknowledgement to accept a fresh expiry conflict', async () => {
    const conflict = {
      ...empty,
      attemptId: domainId,
      outcome: 'REVIEW_REQUIRED',
      code: 'EXPIRY_CONFLICT',
      reviewRequired: true,
      candidateExpiry: '2027-10-01T00:00:00.000Z',
      canReview: true,
    };
    api.get.mockResolvedValue(conflict);
    render(<DomainFacts {...props} />);
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', { name: 'Review observed expiry' }),
    );
    const dialog = screen.getByRole('dialog');
    const save = within(dialog).getByRole('button', {
      name: 'Accept observed expiry',
    }) as HTMLButtonElement;
    await user.type(
      within(dialog).getByLabelText('Confirm domain name'),
      props.domainName,
    );
    await user.type(
      within(dialog).getByLabelText('Review reason'),
      'Fictional expiry correction verified.',
    );
    expect(save.disabled).toBe(true);
    await user.click(within(dialog).getByRole('checkbox'));
    api.mutate.mockResolvedValue({
      ...conflict,
      outcome: 'SUCCEEDED',
      code: null,
      canReview: false,
      candidateExpiry: null,
      reviewRequired: false,
    });
    await user.click(save);
    await screen.findByText(/Latest check: Succeeded/);
    expect(api.mutate).toHaveBeenCalledWith(
      `/domains/${domainId}/registrar-facts/${domainId}/review`,
      'POST',
      {
        confirmation: props.domainName,
        acknowledged: true,
        reason: 'Fictional expiry correction verified.',
      },
    );
  });
  it('never offers expiry acceptance for an ownership mismatch or stale candidate', async () => {
    api.get.mockResolvedValue({
      ...empty,
      outcome: 'REVIEW_REQUIRED',
      code: 'OWNERSHIP_MISMATCH',
      reviewRequired: true,
    });
    render(<DomainFacts {...props} />);
    await screen.findByText(/Ownership mismatch/);
    expect(
      screen.queryByRole('button', { name: 'Review observed expiry' }),
    ).toBeNull();
  });
  it('rejects malformed or cross-domain reads and redacts unexpected mutation errors', async () => {
    api.get.mockResolvedValue({
      ...empty,
      domainId: '21300000-0000-4000-8000-000000000002',
    });
    render(<DomainFacts {...props} />);
    await screen.findByText('Registrar facts could not be loaded.');
    const user = userEvent.setup();
    await user.click(
      screen.getByRole('button', { name: 'Synchronize registrar facts' }),
    );
    const dialog = screen.getByRole('dialog');
    await user.type(
      within(dialog).getByLabelText('Confirm domain name'),
      props.domainName,
    );
    api.mutate.mockRejectedValue(new Error('secret-registrar-body'));
    await user.click(
      within(dialog).getByRole('button', { name: 'Check registrar facts' }),
    );
    await screen.findByText(
      'The registrar check could not be saved. Refresh and retry.',
    );
    expect(screen.queryByText(/secret-registrar/)).toBeNull();
  });
});
