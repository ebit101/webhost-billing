import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ExistingDomainLink } from './existing-domain-link';
import { DomainRecord } from './domain-record';
import {
  domain,
  clientId,
  otherClientId,
} from '../../test/client-record-fixtures';
const api = vi.hoisted(() => ({ get: vi.fn(), mutate: vi.fn() }));
vi.mock('../../lib/auth-api', () => ({
  authenticatedGet: api.get,
  authMutation: api.mutate,
}));
const connection = {
  id: '10000000-0000-4000-8000-000000000101',
  name: 'Fictional registrar',
  module: 'logicboxes',
  mode: 'Live',
  enabled: true,
  isDefault: false,
  networkEnabled: true,
  credentialVersion: 1,
  maskedResellerId: '••••1234',
  nativeCostConfirmed: false,
  capabilities: {
    registration: false,
    renewal: false,
    transfer: false,
    dnsManagement: false,
    emailForwarding: false,
    idProtection: false,
  },
};
const linked = {
  ...domain,
  domainName: 'existing-example.com',
  origin: 'EXISTING' as const,
  ownershipVerifiedAt: '2026-10-29T06:00:00.000Z',
  simulated: false,
  state: 'REGISTERED' as const,
  nameservers: ['ns1.fictional-host.com', 'ns2.fictional-host.com'],
  accountId: connection.id,
  customerId: clientId,
  registrationYears: null,
  sellingAmount: null,
  invoiceId: null,
  invoiceStatus: null,
  orderId: null,
  balanceDue: null,
  agreement: 'existing-domain-link-v1' as const,
  contactMappingVerified: true,
  dispatchClaimed: false,
};
beforeEach(() => {
  vi.resetAllMocks();
  api.get.mockResolvedValue([connection]);
});
afterEach(cleanup);
it('links inside the order form without submitting the outer order', async () => {
  api.mutate.mockResolvedValue(linked);
  const outer = vi.fn((event: { preventDefault: () => void }) =>
    event.preventDefault(),
  );
  const completed = vi.fn();
  render(
    <form onSubmit={outer}>
      <ExistingDomainLink customerId={clientId} onLinked={completed} />
    </form>,
  );
  const dialog = await open();
  expect(outer).not.toHaveBeenCalled();
  fireEvent.submit(
    within(dialog)
      .getByRole('button', { name: 'Verify ownership and link domain' })
      .closest('form')!,
  );
  await waitFor(() => expect(completed).toHaveBeenCalledWith(linked.id));
  expect(outer).not.toHaveBeenCalled();
});
async function open() {
  fireEvent.click(screen.getByRole('button', { name: 'Link existing domain' }));
  const dialog = await screen.findByRole('dialog', {
    name: 'Link existing domain',
  });
  await within(dialog).findByRole('option', { name: 'Fictional registrar' });
  fireEvent.change(within(dialog).getByLabelText('Registrar connection'), {
    target: { value: connection.id },
  });
  fireEvent.change(within(dialog).getByLabelText('Existing domain'), {
    target: { value: linked.domainName },
  });
  fireEvent.change(within(dialog).getByLabelText('Type exact domain name'), {
    target: { value: linked.domainName },
  });
  return dialog;
}
it('does not load connections until opened and leaves disabled providers disabled', async () => {
  api.get.mockResolvedValue([
    { ...connection, enabled: false, networkEnabled: false },
  ]);
  render(<ExistingDomainLink customerId={clientId} onLinked={vi.fn()} />);
  expect(api.get).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Link existing domain' }));
  const dialog = await screen.findByRole('dialog', {
    name: 'Link existing domain',
  });
  await within(dialog).findByRole('option', {
    name: 'Fictional registrar · Disabled',
  });
  fireEvent.change(within(dialog).getByLabelText('Registrar connection'), {
    target: { value: connection.id },
  });
  expect(
    (
      within(dialog).getByRole('button', {
        name: 'Verify ownership and link domain',
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  expect(api.mutate).not.toHaveBeenCalled();
});
it('requires exact confirmation and keeps a retry idempotent after a lost response', async () => {
  const completed = vi.fn();
  api.mutate
    .mockRejectedValueOnce(new Error('Response unavailable'))
    .mockResolvedValueOnce(linked);
  render(<ExistingDomainLink customerId={clientId} onLinked={completed} />);
  const dialog = await open();
  fireEvent.change(within(dialog).getByLabelText('Type exact domain name'), {
    target: { value: 'wrong.com' },
  });
  fireEvent.click(
    within(dialog).getByRole('button', {
      name: 'Verify ownership and link domain',
    }),
  );
  await within(dialog).findByText(/type the same domain to confirm/);
  expect(api.mutate).not.toHaveBeenCalled();
  fireEvent.change(within(dialog).getByLabelText('Type exact domain name'), {
    target: { value: linked.domainName },
  });
  fireEvent.click(
    within(dialog).getByRole('button', {
      name: 'Verify ownership and link domain',
    }),
  );
  await within(dialog).findByText('Response unavailable');
  fireEvent.click(
    within(dialog).getByRole('button', {
      name: 'Verify ownership and link domain',
    }),
  );
  await waitFor(() => expect(completed).toHaveBeenCalledOnce());
  expect(completed).toHaveBeenCalledWith(linked.id);
  expect(api.mutate.mock.calls[0]).toEqual(api.mutate.mock.calls[1]);
  expect(api.mutate.mock.calls[0][2]).toMatchObject({
    customerId: clientId,
    registrarAccountId: connection.id,
    domainName: linked.domainName,
  });
});
it('rejects a returned record from a different client', async () => {
  api.mutate.mockResolvedValue({ ...linked, customerId: otherClientId });
  const completed = vi.fn();
  render(<ExistingDomainLink customerId={clientId} onLinked={completed} />);
  const dialog = await open();
  fireEvent.click(
    within(dialog).getByRole('button', {
      name: 'Verify ownership and link domain',
    }),
  );
  await within(dialog).findByText(/does not match this client/);
  expect(completed).not.toHaveBeenCalled();
});
it('shows separately associated billing without inventing a new registration or enabling renewal', async () => {
  api.get.mockImplementation(async (path: string) =>
    path.endsWith('/actions') ? [] : null,
  );
  const invoiceId = '14900000-0000-4000-8000-000000000020';
  const orderId = '14900000-0000-4000-8000-000000000021';
  render(
    <DomainRecord
      domain={{
        ...linked,
        billingOrder: {
          orderId,
          invoiceId,
          invoiceStatus: 'UNPAID',
          sellingAmount: '189000',
          balanceDue: '309000',
          currency: 'BDT',
          billingPeriod: 'ANNUAL',
        },
      }}
      administrator
      busy={false}
      perform={async (action) => {
        await action();
      }}
    />,
  );
  expect(screen.getByText('BDT 1890.00')).toBeTruthy();
  expect(
    screen.getByRole('link', { name: 'View domain service invoice' }),
  ).toHaveProperty(
    'href',
    expect.stringContaining(`/admin/invoices/${invoiceId}`),
  );
  expect(
    screen.getByRole('link', { name: 'View combined order' }),
  ).toHaveProperty('href', expect.stringContaining(orderId));
  expect(screen.getByText(/does not register or renew/)).toBeTruthy();
  expect(
    screen.queryByRole('button', {
      name: /Approve registration|Create renewal invoice/,
    }),
  ).toBeNull();
});
it('shows a linked record without invoice/order/registration or renewal purchase controls', async () => {
  api.get.mockImplementation(async (path: string) =>
    path.endsWith('/actions') ? [] : null,
  );
  await act(async () => {
    render(
      <DomainRecord
        domain={linked}
        administrator
        busy={false}
        perform={vi.fn()}
      />,
    );
  });
  expect(screen.getByText(/No invoice created by linking/)).toBeTruthy();
  expect(
    screen.queryByRole('link', { name: 'View invoice and payment' }),
  ).toBeNull();
  expect(screen.queryByRole('link', { name: 'View order' })).toBeNull();
  expect(screen.queryByText('Prepare paid one-year renewal')).toBeNull();
  expect(screen.queryByText(/Approve registration/)).toBeNull();
});
