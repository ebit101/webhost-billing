import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { domainDetailSchema, serviceSchema } from '@webhost-billing/shared';
import {
  client,
  clientSummary,
  clientId,
  otherClientId,
  domain,
  domainId,
  service,
  serviceId,
} from '../../test/client-record-fixtures';
import { ClientRecords } from './client-records';
import { ClientProfileNavigation } from './client-profile-navigation';
import { DomainManager } from '../domains/domain-manager';
import {
  inventoryPage,
  inventoryRow,
} from '../../test/domain-inventory-fixtures';
import { DomainOwnerRedirect } from '../domains/domain-owner-redirect';
import {
  clientRecordHref,
  domainRecordHref,
} from '../../lib/client-record-href';
const api = vi.hoisted(() => ({
  get: vi.fn(),
  page: vi.fn(),
  mutate: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
}));
vi.mock('../../lib/auth-api', () => ({
  authenticatedGet: api.get,
  authenticatedPaginatedGet: api.page,
  authMutation: api.mutate,
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: api.push, replace: api.replace }),
}));
beforeEach(() => {
  vi.resetAllMocks();
  api.get.mockImplementation(async (path: string) =>
    path.startsWith('/domains/') ? domain : [domain],
  );
  api.page.mockResolvedValue({ data: [service] });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
describe('client-owned record workspace', () => {
  it('retains profile tabs and switches clients without carrying the selected record', async () => {
    api.page.mockResolvedValue({
      data: [
        clientSummary,
        { ...clientSummary, id: otherClientId, firstName: 'Other' },
      ],
    });
    render(<ClientProfileNavigation customer={client} section="domains" />);
    expect(
      screen
        .getByRole('link', { name: 'Domains' })
        .getAttribute('aria-current'),
    ).toBe('page');
    expect(
      screen
        .getByRole('link', { name: 'Products/services' })
        .getAttribute('href'),
    ).toBe(clientRecordHref(clientId, 'services'));
    await screen.findByRole('option', { name: /Other Client/ });
    fireEvent.change(screen.getByRole('combobox', { name: 'Client' }), {
      target: { value: otherClientId },
    });
    expect(api.push).toHaveBeenCalledWith(
      clientRecordHref(otherClientId, 'domains'),
    );
  });
  it('links the domain list directly to owned details and performs only reads', async () => {
    render(<ClientRecords customerId={clientId} kind="domains" />);
    expect(
      (
        await screen.findByRole('link', { name: domain.domainName })
      ).getAttribute('href'),
    ).toBe(clientRecordHref(clientId, 'domains', domainId));
    expect(api.get).toHaveBeenCalledWith('/domains?customerId=' + clientId);
    expect(api.mutate).not.toHaveBeenCalled();
  });
  it('retains an older selected record missing from the bounded list', async () => {
    api.get.mockImplementation(async (path: string) =>
      path.startsWith('/domains?') ? [] : domain,
    );
    render(
      <ClientRecords
        customerId={clientId}
        kind="domains"
        recordId={domainId}
      />,
    );
    await screen.findByRole('heading', { name: domain.domainName });
    expect(
      screen.getByRole('combobox', { name: 'Domains' }).getAttribute('value') ??
        (screen.getByRole('combobox', { name: 'Domains' }) as HTMLSelectElement)
          .value,
    ).toBe(domainId);
    expect(api.get).toHaveBeenCalledWith(
      `/domains/${domainId}?customerId=${clientId}`,
    );
    fireEvent.change(screen.getByRole('combobox', { name: 'Domains' }), {
      target: { value: '' },
    });
    expect(api.push).toHaveBeenCalledWith(
      clientRecordHref(clientId, 'domains'),
    );
  });
  it.each(['list', 'detail', 'id', 'malformed'] as const)(
    'rejects a mismatched %s without displaying record data',
    async (mode) => {
      api.get.mockImplementation(async (path: string) =>
        path.startsWith('/domains?')
          ? mode === 'list'
            ? [{ ...domain, customerId: otherClientId }]
            : []
          : mode === 'malformed'
            ? { id: domainId }
            : mode === 'id'
              ? { ...domain, id: serviceId }
              : { ...domain, customerId: otherClientId },
      );
      render(
        <ClientRecords
          customerId={clientId}
          kind="domains"
          recordId={domainId}
        />,
      );
      await screen.findByText('Something went wrong');
      expect(
        screen.queryByRole('heading', { name: domain.domainName }),
      ).toBeNull();
      expect(screen.queryByRole('combobox')).toBeNull();
      expect(api.mutate).not.toHaveBeenCalled();
    },
  );
  it('does not fall back to a global collection for invalid client or record IDs', () => {
    const view = render(<ClientRecords customerId="bad" kind="domains" />);
    expect(screen.getByText('Invalid client record selection.')).toBeTruthy();
    view.rerender(
      <ClientRecords customerId={clientId} kind="services" recordId="bad" />,
    );
    expect(api.get).not.toHaveBeenCalled();
    expect(api.page).not.toHaveBeenCalled();
  });
  it('shows saved service facts with a client-owned return link without panel operations', async () => {
    api.get.mockResolvedValue(service);
    render(
      <ClientRecords
        customerId={clientId}
        kind="services"
        recordId={serviceId}
      />,
    );
    await screen.findByRole('heading', { name: service.domain! });
    expect(api.page).toHaveBeenCalledWith(
      `/services?customerId=${clientId}&pageSize=100`,
    );
    expect(api.get).toHaveBeenCalledWith(
      `/services/${serviceId}?customerId=${clientId}`,
    );
    expect(
      screen
        .getByRole('link', { name: "Manage this client's services" })
        .getAttribute('href'),
    ).toBe(clientRecordHref(clientId, 'services'));
    expect(screen.getByText(/90,071,992,547,409.93/)).toBeTruthy();
    expect(api.mutate).not.toHaveBeenCalled();
  });
  it('discards stale responses and details when the client changes', async () => {
    let resolve!: (value: unknown) => void;
    api.get.mockImplementation((path: string) =>
      path.includes(otherClientId)
        ? Promise.resolve([])
        : new Promise((done) => {
            resolve = done;
          }),
    );
    const view = render(
      <ClientRecords
        customerId={clientId}
        kind="domains"
        recordId={domainId}
      />,
    );
    view.rerender(<ClientRecords customerId={otherClientId} kind="domains" />);
    await screen.findByRole('combobox', { name: 'Domains' });
    await act(async () => {
      resolve([domain]);
    });
    expect(
      screen.queryByRole('option', { name: domain.domainName }),
    ).toBeNull();
  });
  it('keeps the portal owned by the authenticated customer and uses no administrator scope', async () => {
    const ownDomain = { ...domain };
    delete ownDomain.customerId;
    api.get.mockImplementation(async (path: string) =>
      path === '/domains' ? [ownDomain] : ownDomain,
    );
    render(
      <ClientRecords
        kind="domains"
        recordId={domainId}
        administrator={false}
      />,
    );
    await screen.findByRole('heading', { name: domain.domainName });
    expect(api.get.mock.calls.map(([path]) => path)).toEqual([
      '/domains',
      '/domains/' + domainId,
    ]);
    expect(screen.queryByRole('link', { name: /Customer/ })).toBeNull();
  });
  it('global domain names and View links both navigate into client context', async () => {
    api.get.mockResolvedValue([]);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify(
            inventoryPage([
              {
                ...inventoryRow,
                id: domainId,
                customerId: clientId,
                domainName: domain.domainName,
              },
            ]),
          ),
        ),
      ),
    );
    render(<DomainManager administrator />);
    for (const name of [domain.domainName, 'View ' + domain.domainName])
      expect(
        (await screen.findByRole('link', { name })).getAttribute('href'),
      ).toBe(clientRecordHref(clientId, 'domains', domainId));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(api.mutate).not.toHaveBeenCalled();
  });
  it('resolves older domain links without displaying private domain facts', async () => {
    api.get.mockResolvedValue(domain);
    render(<DomainOwnerRedirect domainId={domainId} />);
    await waitFor(() =>
      expect(api.replace).toHaveBeenCalledWith(
        clientRecordHref(clientId, 'domains', domainId),
      ),
    );
    expect(screen.queryByText(domain.domainName)).toBeNull();
  });
  it('validates link contexts and the fictional schemas', () => {
    expect(domainDetailSchema.parse(domain)).toEqual(domain);
    expect(serviceSchema.parse(service)).toEqual(service);
    expect(domainRecordHref({ id: domainId }, true)).toBe(
      '/admin/domains/' + domainId,
    );
    expect(domainRecordHref(domain, false)).toBe('/portal/domains/' + domainId);
    expect(() => clientRecordHref('bad', 'domains', domainId)).toThrow();
    expect(() => clientRecordHref(clientId, 'services', 'bad')).toThrow();
  });
});
