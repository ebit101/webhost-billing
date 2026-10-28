import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import DomainList from './(admin)/admin/customers/[customerId]/domains/page';
import DomainDetail from './(admin)/admin/customers/[customerId]/domains/[domainId]/page';
import ServiceList from './(admin)/admin/customers/[customerId]/services/page';
import ServiceDetail from './(admin)/admin/customers/[customerId]/services/[serviceId]/page';
import {
  clientId,
  otherClientId,
  domainId,
  serviceId,
} from '../test/client-record-fixtures';
const access = vi.hoisted(() => vi.fn());
vi.mock('../lib/server-admin-access', () => ({ authorizeAdminPage: access }));
vi.mock('../components/customers/admin-customer-detail', () => ({
  AdminCustomerDetail: ({
    children,
    ...props
  }: {
    children: import('react').ReactNode;
  }) => (
    <div>
      <output data-testid="client">{JSON.stringify(props)}</output>
      {children}
    </div>
  ),
}));
vi.mock('../components/customers/client-records', () => ({
  ClientRecords: (props: unknown) => (
    <output data-testid="record">{JSON.stringify(props)}</output>
  ),
}));
vi.mock('../components/services/admin-service-manager', () => ({
  AdminServiceManager: (props: unknown) => (
    <output data-testid="manager">{JSON.stringify(props)}</output>
  ),
}));
beforeEach(() => {
  access.mockReset();
  access.mockResolvedValue({ role: 'ADMIN', staffRole: 'FULL_ADMINISTRATOR' });
});
afterEach(cleanup);
it('binds domain index and details to a client after domain-specific authorization', async () => {
  const view = render(
    await DomainList({ params: Promise.resolve({ customerId: clientId }) }),
  );
  expect(access).toHaveBeenLastCalledWith('/admin/domains');
  expect(JSON.parse(screen.getByTestId('client').textContent!)).toEqual({
    customerId: clientId,
    section: 'domains',
  });
  view.unmount();
  render(
    await DomainDetail({
      params: Promise.resolve({ customerId: clientId, domainId }),
    }),
  );
  expect(JSON.parse(screen.getByTestId('record').textContent!)).toEqual({
    customerId: clientId,
    kind: 'domains',
    recordId: domainId,
  });
});
it('binds the service index to the path client even when a query supplies another client', async () => {
  render(
    await ServiceList({
      params: Promise.resolve({ customerId: clientId }),
      searchParams: Promise.resolve({
        customerId: otherClientId,
        page: '2',
        search: 'hosting',
      }),
    }),
  );
  expect(access).toHaveBeenCalledWith('/admin/services');
  expect(JSON.parse(screen.getByTestId('manager').textContent!)).toMatchObject({
    embedded: true,
    basePath: `/admin/customers/${clientId}/services`,
    selection: { query: { customerId: clientId, page: 2, search: 'hosting' } },
  });
});
it('keeps the selected service under the client header', async () => {
  render(
    await ServiceDetail({
      params: Promise.resolve({ customerId: clientId, serviceId }),
    }),
  );
  expect(access).toHaveBeenCalledWith('/admin/services');
  expect(JSON.parse(screen.getByTestId('record').textContent!)).toEqual({
    customerId: clientId,
    kind: 'services',
    recordId: serviceId,
  });
});
it('does not render client workspace content when authorization is unavailable', async () => {
  access.mockResolvedValue(null);
  expect(
    await DomainList({ params: Promise.resolve({ customerId: clientId }) }),
  ).toBeNull();
  expect(
    await DomainDetail({
      params: Promise.resolve({ customerId: clientId, domainId }),
    }),
  ).toBeNull();
  expect(
    await ServiceList({
      params: Promise.resolve({ customerId: clientId }),
      searchParams: Promise.resolve({}),
    }),
  ).toBeNull();
  expect(
    await ServiceDetail({
      params: Promise.resolve({ customerId: clientId, serviceId }),
    }),
  ).toBeNull();
});
