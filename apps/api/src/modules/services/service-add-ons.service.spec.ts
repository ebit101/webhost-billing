import type { PrismaClient } from '@webhost-billing/database';
import type { AuthRequestContext } from '../auth/auth.types';
import type { AdminServiceAddOn } from '@webhost-billing/shared';
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
  const auditReads = jest.fn().mockResolvedValue([]);
  const service = new ServiceAddOnsService({
    service: { findFirst },
    orderItem: { findMany, update },
    activityLog: { findMany: auditReads },
  } as unknown as PrismaClient);
  return { service, findFirst, findMany, update, purchased, auditReads };
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
        manualCompletion: null,
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

describe('manual add-on cancellation completion', () => {
  const pastEnd = new Date('2025-03-11T12:00:00.000Z');
  const context = { ipAddressHash: 'fictional-ip-hash' };
  function completionFixture() {
    const base = fixture();
    base.findMany.mockResolvedValue([
      { ...base.purchased, renewalEndsAt: pastEnd },
    ]);
    const records: { metadata: Record<string, string>; createdAt: Date }[] = [];
    const create = jest.fn(
      ({
        data,
      }: {
        data: { metadata: Record<string, string>; createdAt: Date };
      }) => {
        const record = { metadata: data.metadata, createdAt: data.createdAt };
        records.push(record);
        return Promise.resolve(record);
      },
    );
    const tx = {
      service: { findFirst: base.findFirst },
      orderItem: { findMany: base.findMany, update: base.update },
      activityLog: {
        findMany: jest.fn(() => Promise.resolve(records)),
        create,
      },
      $queryRaw: jest.fn().mockResolvedValue([{ id: serviceId }]),
    };
    const prisma = {
      ...tx,
      $transaction: jest.fn(
        async (work: (client: typeof tx) => Promise<AdminServiceAddOn>) =>
          work(tx),
      ),
    };
    const service = new ServiceAddOnsService(prisma as unknown as PrismaClient);
    const complete = (
      actor = admin,
      date = pastEnd.toISOString(),
      scope = customerId,
    ) =>
      service.completeCancellation(
        serviceId,
        otherId,
        date,
        actor,
        context,
        scope,
      );
    return { ...base, service, complete, create, records, prisma };
  }
  it('records the administrator and completion time once, then returns the original acknowledgement on replay', async () => {
    const { complete, create, records, update, service } = completionFixture();
    const first = await complete();
    expect(first.manualCompletion).toMatchObject({
      completedByUserId: otherId,
      completedByName: `Administrator (${otherId})`,
    });
    expect(first.manualCompletion?.completedAt).toBe(
      records[0].createdAt.toISOString(),
    );
    expect(await complete()).toEqual(first);
    if (admin.identity.role !== 'ADMIN')
      throw new Error('Expected administrator');
    expect(
      await complete({
        ...admin,
        identity: {
          ...admin.identity,
          userId: customerId,
          displayName: 'Another administrator',
        },
      }),
    ).toEqual(first);
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0]).toMatchObject({
      data: {
        actorUserId: otherId,
        action: 'HOSTING_ADD_ON_CANCELLATION_COMPLETED',
        entityType: 'SERVICE',
        entityId: serviceId,
        metadata: {
          orderItemId: otherId,
          renewalEndsAt: pastEnd.toISOString(),
        },
      },
    });
    expect(update).not.toHaveBeenCalled();
    await expect(service.list(serviceId, admin, customerId)).resolves.toEqual([
      first,
    ]);
    const customerRead = await service.list(serviceId, customer);
    expect(customerRead[0]).not.toHaveProperty('manualCompletion');
  });
  it.each(['future', 'not-cancelled', 'stale'] as const)(
    'rejects %s completion without an audit write',
    async (state) => {
      const { complete, findMany, purchased, create } = completionFixture();
      const end =
        state === 'future'
          ? new Date('2099-01-01T00:00:00Z')
          : state === 'not-cancelled'
            ? null
            : pastEnd;
      findMany.mockResolvedValue([{ ...purchased, renewalEndsAt: end }]);
      await expect(
        complete(
          admin,
          state === 'stale'
            ? endAt.toISOString()
            : (end ?? pastEnd).toISOString(),
        ),
      ).rejects.toMatchObject({ status: 409 });
      expect(create).not.toHaveBeenCalled();
    },
  );
  it.each(['customer', 'support', 'restricted-staff'] as const)(
    'denies %s completion before opening a transaction',
    async (role) => {
      const { complete, prisma } = completionFixture();
      if (admin.identity.role !== 'ADMIN')
        throw new Error('Expected administrator');
      const actor =
        role === 'customer'
          ? customer
          : role === 'support'
            ? { ...customer, supportAdministratorId: otherId }
            : {
                ...admin,
                identity: {
                  ...admin.identity,
                  staffRole: 'SUPPORT_OPERATOR' as const,
                },
              };
      await expect(complete(actor)).rejects.toMatchObject({ status: 403 });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    },
  );
  it('denies wrong service ownership or missing add-ons without an audit write', async () => {
    const { complete, findFirst, findMany, create } = completionFixture();
    findFirst.mockResolvedValueOnce(null);
    await expect(complete()).rejects.toMatchObject({ status: 403 });
    findMany.mockResolvedValueOnce([]);
    await expect(complete()).rejects.toMatchObject({ status: 403 });
    expect(create).not.toHaveBeenCalled();
  });
  it('propagates an audit write failure rather than reporting completion', async () => {
    const { complete, create } = completionFixture();
    create.mockRejectedValueOnce(new Error('Fictional database failure'));
    await expect(complete()).rejects.toThrow('Fictional database failure');
  });
});
