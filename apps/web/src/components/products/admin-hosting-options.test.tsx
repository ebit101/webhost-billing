import { hostingAddOnInputSchema } from '@webhost-billing/shared';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminHostingAddOns } from './admin-hosting-add-ons';

const planId = '22300000-0000-4000-8000-000000000001';
const { get, mutate } = vi.hoisted(() => ({ get: vi.fn(), mutate: vi.fn() }));
vi.mock('../../lib/auth-api', () => ({
  authenticatedGet: get,
  authMutation: mutate,
}));
beforeEach(() => {
  get.mockImplementation((path: string) =>
    Promise.resolve(
      path === '/products' ? [{ id: planId, name: 'Fictional Starter' }] : [],
    ),
  );
  mutate.mockImplementation((_path: string, _method: string, body: unknown) => {
    const input = hostingAddOnInputSchema.parse(body);
    return Promise.resolve({
      ...input,
      id: planId,
      priceId: planId,
      amount: { amount: input.amount, currency: input.currency },
    });
  });
});
afterEach(() => vi.clearAllMocks());
describe('administrator configurable choice editor', () => {
  async function fill() {
    const user = userEvent.setup();
    render(<AdminHostingAddOns />);
    await screen.findByRole('checkbox', { name: 'Fictional Starter' });
    await user.type(screen.getByLabelText('Add-on name'), '20 GiB storage');
    await user.type(screen.getByLabelText('Price'), '250.00');
    await user.click(
      screen.getByRole('checkbox', { name: 'Fictional Starter' }),
    );
    await user.click(
      screen.getByRole('checkbox', { name: /Use this product as one choice/ }),
    );
    await user.type(screen.getByLabelText('Option group key'), 'storage');
    await user.type(screen.getByLabelText('Option group name'), 'Storage tier');
    await user.type(screen.getByLabelText('Choice name'), '20 GiB');
    return user;
  }
  it('submits a predefined manual choice and exact money through the existing admin endpoint', async () => {
    const user = await fill();
    await user.type(
      screen.getByLabelText('Public manual fulfillment note'),
      'Apply the purchased limit after setup.',
    );
    await user.click(screen.getByRole('button', { name: 'Save add-on' }));
    await waitFor(() => expect(mutate).toHaveBeenCalledTimes(1));
    expect(mutate.mock.calls[0]).toEqual([
      '/products/add-ons',
      'POST',
      expect.objectContaining({
        amount: '25000',
        hostingProductIds: [planId],
        configuration: {
          version: 1,
          groupKey: 'storage',
          groupName: 'Storage tier',
          choiceName: '20 GiB',
          fulfillment: 'MANUAL',
          fulfillmentNote: 'Apply the purchased limit after setup.',
        },
      }),
    ]);
  });
  it('holds an incomplete manual choice instead of saving an unfulfillable option', async () => {
    const user = await fill();
    await user.click(screen.getByRole('button', { name: 'Save add-on' }));
    await screen.findByRole('alert');
    expect(mutate).not.toHaveBeenCalled();
  });
});
