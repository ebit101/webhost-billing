import type { PrismaClient } from '@webhost-billing/database';
import type { AuthRequestContext } from '../auth/auth.types';
import { ServiceAddOnsService } from './service-add-ons.service';

const customerId = '20500000-0000-4000-8000-000000000001';
const serviceId = '20500000-0000-4000-8000-000000000002';
const otherId = '20500000-0000-4000-8000-000000000003';
const endAt = new Date('2026-12-01T18:00:00Z');
const admin: AuthRequestContext = {
  sessionId: 'fictional',
  identity: {
    role: 'ADMIN',
    userId: otherId,
    adminProfileId: otherId,
    staffRole: 'FULL_ADMINISTRATOR',
    email: 'admin205@example.test',
    twoFactorEnabled: true,
  },
};
const customer: AuthRequestContext = {
  sessionId: 'fictional-customer',
  identity: {
    role: 'CUSTOMER',
    userId: customerId,
    customerId,
    email: 'customer205@example.test',
  },
};

function fixture() {
  const findFirst = jest.fn().mockResolvedValue({
    id: serviceId,
    customerId,
    status: 'ACTIVE',
    billingPeriod: 'MONTHLY',
    currency: 'BDT',
    nextDueAt: endAt,
    orderItem: { orderId: otherId },
  });
  const purchased = {
    id: otherId,
    productNameSnapshot: 'Purchased backup',
    currency: 'BDT',
    lineTotal: 9007199254740993n,
    renewalEndsAt: endAt,
    invoiceItems: [],
  };
  const findMany = jest.fn().mockResolvedValue([purchased]);
  const update = jest.fn();
  const service = new ServiceAddOnsService({
    service: { findFirst },
    orderItem: { findMany, update },
  } as unknown as PrismaClient);
  return { service, findFirst, findMany, update, purchased };
}

describe('administrator purchased add-on read', () => {
  it.each([
    { label: 'administrator', actor: admin, offered: null },
    { label: 'owning customer', actor: customer, offered: endAt.toISOString() },
    {
      label: 'read-only support',
      actor: { ...customer, supportAdministratorId: otherId },
      offered: null,
    },
  ])(
    'offers a cancellation date only to an owning customer: $label',
    async ({ actor, offered }) => {
      const { service, findMany, purchased } = fixture();
      findMany.mockResolvedValue([{ ...purchased, renewalEndsAt: null }]);
      await expect(service.list(serviceId, actor)).resolves.toMatchObject([
        { renewalEndsAt: null, availableEndAt: offered },
      ]);
    },
  );
  it('returns purchased money and the recorded cutoff without offering a staff cancellation or writing', async () => {
    const { service, findMany, update } = fixture();
    await expect(service.list(serviceId, admin, customerId)).resolves.toEqual([
      {
        id: otherId,
        name: 'Purchased backup',
        recurringAmount: { amount: '9007199254740993', currency: 'BDT' },
        renewalEndsAt: endAt.toISOString(),
        availableEndAt: null,
      },
    ]);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          orderId: otherId,
          kind: 'ADD_ON',
          billingPeriod: 'MONTHLY',
          currency: 'BDT',
          fulfilledAt: { not: null },
        },
      }),
    );
    expect(update).not.toHaveBeenCalled();
  });
  it('denies a mismatched parent before reading purchased items', async () => {
    const { service, findMany } = fixture();
    await expect(service.list(serviceId, admin, otherId)).rejects.toMatchObject(
      { status: 403 },
    );
    expect(findMany).not.toHaveBeenCalled();
  });
  it('does not let a customer query widen ownership', async () => {
    const { service, findFirst, findMany } = fixture();
    await expect(
      service.list(serviceId, customer, otherId),
    ).rejects.toMatchObject({ status: 403 });
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: serviceId, customerId },
      }),
    );
    expect(findMany).not.toHaveBeenCalled();
  });
  it('denies missing services without reading their order', async () => {
    const { service, findFirst, findMany } = fixture();
    findFirst.mockResolvedValue(null);
    await expect(service.list(serviceId, admin)).rejects.toMatchObject({
      status: 403,
    });
    expect(findMany).not.toHaveBeenCalled();
  });
  it('denies restricted staff at the service boundary', async () => {
    const { service, findFirst } = fixture();
    if (admin.identity.role !== 'ADMIN') throw new Error('Expected staff');
    await expect(
      service.list(serviceId, {
        ...admin,
        identity: { ...admin.identity, staffRole: 'SUPPORT_OPERATOR' },
      }),
    ).rejects.toMatchObject({ status: 403 });
    expect(findFirst).not.toHaveBeenCalled();
  });
});
