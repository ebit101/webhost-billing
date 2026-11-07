import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SslCheckoutDetail } from '@webhost-billing/shared';
import { SslCheckoutReview } from './ssl-checkout-review';
import { authMutation, authenticatedGet } from '../../lib/auth-api';

vi.mock('../../lib/auth-api', () => ({
  authMutation: vi.fn(),
  authenticatedGet: vi.fn(),
}));
const row: SslCheckoutDetail = {
  paymentId: '10000000-0000-4000-8000-000000000220',
  invoiceId: '10000000-0000-4000-8000-000000000221',
  invoiceNumber: 'FICTIONAL-220',
  state: 'CAPTURED',
  merchantReference: 'WHBfictional220',
  bankReference: 'fictional-bank-220',
  appliedToInvoice: false,
  amount: { amount: '10000', currency: 'BDT' },
  reviewReason:
    'Captured payment was not credited. Review and refund the unapplied amount.',
  refunds: [],
};
describe('SSLCOMMERZ administrator recovery controls', () => {
  beforeEach(() => {
    vi.mocked(authenticatedGet).mockReset().mockResolvedValue([row]);
    vi.mocked(authMutation).mockReset().mockResolvedValue(row);
  });
  it('shows unapplied cash for review and submits exact decimal refunds only after confirmation', async () => {
    const user = userEvent.setup();
    render(<SslCheckoutReview />);
    expect(authenticatedGet).not.toHaveBeenCalled();
    await user.click(
      screen.getByRole('button', { name: 'Review online checkouts' }),
    );
    expect(
      await screen.findByText(/Captured but not credited to the invoice/),
    ).toBeTruthy();
    expect(screen.getByText(/Bank reference fictional-bank-220/)).toBeTruthy();
    await user.type(screen.getByLabelText('Refund amount (BDT)'), '30.25');
    await user.type(
      screen.getByLabelText('Refund reason'),
      'Fictional duplicate capture refund',
    );
    await user.click(
      screen.getByRole('button', { name: 'Approve sandbox refund' }),
    );
    expect(authMutation).not.toHaveBeenCalled();
    await user.click(screen.getByRole('checkbox'));
    await user.click(
      screen.getByRole('button', { name: 'Approve sandbox refund' }),
    );
    expect(authMutation).toHaveBeenCalledWith(
      `/payment-gateways/sslcommerz/payments/${row.paymentId}/refunds`,
      'POST',
      {
        submissionKey: expect.any(String),
        amount: '3025',
        reason: 'Fictional duplicate capture refund',
        confirmation: 'APPROVE_SANDBOX_REFUND',
      },
    );
  });
  it('retains a refund submission key after a lost response rather than blindly creating another mutation', async () => {
    vi.mocked(authMutation).mockRejectedValueOnce(
      new Error('The local response was lost.'),
    );
    const user = userEvent.setup();
    render(<SslCheckoutReview />);
    await user.click(
      screen.getByRole('button', { name: 'Review online checkouts' }),
    );
    await user.type(
      await screen.findByLabelText('Refund amount (BDT)'),
      '25.00',
    );
    await user.type(
      screen.getByLabelText('Refund reason'),
      'Fictional refund recovery test',
    );
    await user.click(screen.getByRole('checkbox'));
    await user.click(
      screen.getByRole('button', { name: 'Approve sandbox refund' }),
    );
    await screen.findByRole('alert');
    await user.click(
      screen.getByRole('button', { name: 'Approve sandbox refund' }),
    );
    expect(vi.mocked(authMutation).mock.calls[0]![2]?.submissionKey).toBe(
      vi.mocked(authMutation).mock.calls[1]![2]?.submissionKey,
    );
  });
  it('explains an unknown refund and requires a reason when linking its provider reference', async () => {
    vi.mocked(authenticatedGet).mockResolvedValue([
      {
        ...row,
        refunds: [
          {
            id: '10000000-0000-4000-8000-000000000222',
            state: 'UNKNOWN',
            amount: { amount: '10000', currency: 'BDT' },
            providerReference: null,
          },
        ],
      },
    ]);
    const user = userEvent.setup();
    render(<SslCheckoutReview />);
    await user.click(
      screen.getByRole('button', { name: 'Review online checkouts' }),
    );
    expect(
      await screen.findByText(/Do not submit another refund/),
    ).toBeTruthy();
    await user.type(
      screen.getByLabelText('Provider refund reference'),
      'fictional-refund-reference',
    );
    await user.type(
      screen.getByLabelText('Reference review reason'),
      'Verified fictional merchant record',
    );
    await user.click(screen.getByRole('button', { name: 'Reconcile refund' }));
    expect(authMutation).toHaveBeenCalledWith(
      '/payment-gateways/sslcommerz/refunds/10000000-0000-4000-8000-000000000222/reconcile',
      'POST',
      {
        providerReference: 'fictional-refund-reference',
        reason: 'Verified fictional merchant record',
        confirmation: 'LINK_REFUND_REFERENCE',
      },
    );
  });
});
