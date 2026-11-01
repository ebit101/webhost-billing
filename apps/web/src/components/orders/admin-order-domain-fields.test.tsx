import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useState } from 'react';
import {
  AdminOrderDomainFields,
  type AdminDomainDraft,
} from './admin-order-domain-fields';
import { client, clientId, domainId } from '../../test/client-record-fixtures';

const api = vi.hoisted(() => ({ get: vi.fn(), mutate: vi.fn() }));
vi.mock('../../lib/auth-api', () => ({
  authenticatedGet: api.get,
  authMutation: api.mutate,
}));
const priceId = '14900000-0000-4000-8000-000000000001';
const offerId = '14900000-0000-4000-8000-000000000002';
const quoteId = '14900000-0000-4000-8000-000000000003';
const name = 'fictional-combined.com';
const date = '2026-10-30T00:00:00.000Z';
const options = {
  customerId: clientId,
  prices: [
    {
      tld: 'com',
      priceId,
      name: '.com domain',
      amount: { amount: '189000', currency: 'BDT' },
    },
  ],
  domains: [
    {
      id: domainId,
      domainName: name,
      ownershipVerifiedAt: date,
      expiresAt: '2030-01-01T00:00:00.000Z',
    },
  ],
};
const offer = {
  id: offerId,
  tld: 'com',
  years: 1,
  currency: 'BDT',
  sellingAmount: '189000',
  nameservers: ['ns1.example.test', 'ns2.example.test'],
  simulated: true,
};
function Harness() {
  const [domainName, setDomainName] = useState(name);
  const [selection, setSelection] = useState<AdminDomainDraft>();
  const [busy, setBusy] = useState(false);
  return (
    <>
      <input
        aria-label="Requested domain"
        value={domainName}
        onChange={(e) => setDomainName(e.target.value)}
      />
      <AdminOrderDomainFields
        customerId={clientId}
        domainName={domainName}
        onDomainName={setDomainName}
        onSelection={setSelection}
        onBusy={setBusy}
        disabled={false}
      />
      <output data-testid="draft">{JSON.stringify({ selection, busy })}</output>
    </>
  );
}
beforeEach(() => {
  vi.resetAllMocks();
  api.get.mockImplementation(async (path: string) => {
    if (path.startsWith('/orders/admin/domain-options')) return options;
    if (path === '/domains/offers') return [offer];
    if (path === `/customers/${clientId}`) return client;
    throw new Error('Unexpected read');
  });
});
afterEach(cleanup);
it('defaults to no registration, uses client-scoped catalogue billing and never fetches offers implicitly', async () => {
  render(<Harness />);
  expect(
    screen.getByRole('checkbox', { name: 'Send registration to registrar' }),
  ).toHaveProperty('checked', false);
  await screen.findByRole('option', { name });
  fireEvent.change(screen.getByLabelText('Verified existing domain'), {
    target: { value: domainId },
  });
  fireEvent.change(screen.getByLabelText('Annual domain price'), {
    target: { value: priceId },
  });
  await waitFor(() =>
    expect(screen.getByTestId('draft').textContent).toContain(
      '"sendToRegistrar":false',
    ),
  );
  expect(screen.getByTestId('draft').textContent).toContain(
    '"amount":"189000"',
  );
  expect(api.get.mock.calls.map((call) => call[0])).toEqual([
    `/orders/admin/domain-options?customerId=${clientId}`,
  ]);
  expect(api.mutate).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('Requested domain'), {
    target: { value: 'other-fictional.com' },
  });
  await waitFor(() =>
    expect(screen.getByTestId('draft').textContent).not.toContain(
      '"selection"',
    ),
  );
});
it('does not expose choices returned for another client', async () => {
  api.get.mockResolvedValue({ ...options, customerId: priceId });
  render(<Harness />);
  await screen.findByRole('alert');
  expect(screen.queryByRole('option', { name })).toBeNull();
});
async function registrationQuote() {
  fireEvent.click(
    screen.getByRole('checkbox', { name: 'Send registration to registrar' }),
  );
  await screen.findByRole('option', { name: /Simulated/ });
  fireEvent.change(screen.getByLabelText('Registration offer'), {
    target: { value: offerId },
  });
  for (const [label, value] of Object.entries({
    'Registrant name': 'Fictional registrant',
    Company: 'Fictional company',
    'Registrant email': 'fictional@example.test',
    Address: '1 Test Street',
    City: 'Dhaka',
    Region: 'Dhaka',
    'Postal code': '1000',
    'Country code': 'BD',
    'Phone country code': '880',
    'Phone number': '1700000000',
    'Consent date and time': '29/10/2026 12:00',
    'Consent record reference': 'fictional-consent-149',
  }))
    fireEvent.change(screen.getByLabelText(label, { exact: true }), {
      target: { value },
    });
  fireEvent.click(
    screen.getByRole('checkbox', { name: /I verified the customer/ }),
  );
  fireEvent.click(
    screen.getByRole('button', { name: 'Check domain and price' }),
  );
}
it('uses an explicit consented quote, clears it on edit or unchecking, and never dispatches registration', async () => {
  api.mutate.mockResolvedValue({
    id: quoteId,
    domainName: name,
    sellingAmount: '189000',
    currency: 'BDT',
    costAmount: '1000',
    costCurrency: 'USD',
    expiresAt: '2030-01-01T00:00:00.000Z',
    simulated: true,
  });
  render(<Harness />);
  await registrationQuote();
  await screen.findByText(/Quoted domain:/);
  expect(api.mutate).toHaveBeenCalledOnce();
  expect(api.mutate.mock.calls[0]).toMatchObject([
    '/domains/admin/quotes',
    'POST',
    {
      customerId: clientId,
      domainName: name,
      offlineConsent: { attestation: true },
      customerPolicyConsent: true,
    },
  ]);
  await waitFor(() =>
    expect(screen.getByTestId('draft').textContent).toContain(
      '"sendToRegistrar":true',
    ),
  );
  fireEvent.change(screen.getByLabelText('Requested domain'), {
    target: { value: 'changed-fictional.com' },
  });
  await waitFor(() =>
    expect(screen.getByTestId('draft').textContent).not.toContain(
      '"selection"',
    ),
  );
  fireEvent.change(screen.getByLabelText('Requested domain'), {
    target: { value: name },
  });
  expect(screen.queryByText(/Quoted domain:/)).toBeNull();
  fireEvent.click(
    screen.getByRole('checkbox', { name: 'Send registration to registrar' }),
  );
  expect(
    screen.getByRole('checkbox', { name: 'Send registration to registrar' }),
  ).toHaveProperty('checked', false);
  expect(api.mutate).toHaveBeenCalledOnce();
});
