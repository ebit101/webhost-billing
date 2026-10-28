import type { PrismaClient } from '@webhost-billing/database';
import type { ApiEnvironment } from '@webhost-billing/config';
import { DomainService } from './domain.service';
import type { DomainAdministrationService } from './domain-administration.service';
import type { AuthRequestContext } from '../auth/auth.types';
const customerId = '13900000-0000-4000-8000-000000000001';
const otherId = '13900000-0000-4000-8000-000000000002';
const admin: AuthRequestContext = {
  sessionId: 'fictional',
  identity: {
    role: 'ADMIN',
    userId: otherId,
    adminProfileId: otherId,
    staffRole: 'FULL_ADMINISTRATOR',
    email: 'admin139@example.test',
    twoFactorEnabled: true,
  },
};
describe('client domain read scope', () => {
  function fixture() {
    const findMany = jest.fn().mockResolvedValue([]);
    const invoice = jest.fn();
    const findUnique = jest.fn().mockResolvedValue({ customerId: otherId });
    const service = new DomainService(
      {
        domain: { findMany, findUnique },
        invoice: { findUniqueOrThrow: invoice },
      } as unknown as PrismaClient,
      {
        NODE_ENV: 'test',
        RESELLBIZ_LIVE_ENABLED: false,
        CREDENTIAL_ENCRYPTION_KEY: 'test-encryption-key-at-least-32-characters',
      } as ApiEnvironment,
      {} as DomainAdministrationService,
    );
    return { service, findMany, invoice };
  }
  it('applies client ownership in the database query before the 100-record limit', async () => {
    const { service, findMany } = fixture();
    await service.list(admin, customerId);
    expect(findMany).toHaveBeenCalledWith({
      where: { customerId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 100,
    });
  });
  it('denies a wrong parent before reading billing or sensitive record details', async () => {
    const { service, invoice } = fixture();
    await expect(
      service.detail(otherId, admin, customerId),
    ).rejects.toMatchObject({ status: 403 });
    expect(invoice).not.toHaveBeenCalled();
  });
  it('cannot widen a customer session by supplying another client ID', async () => {
    const { service, findMany } = fixture();
    const actor: AuthRequestContext = {
      sessionId: 'fictional',
      identity: {
        role: 'CUSTOMER',
        userId: customerId,
        customerId,
        email: 'client139@example.test',
      },
    };
    await expect(service.list(actor, otherId)).rejects.toMatchObject({
      status: 403,
    });
    expect(findMany).not.toHaveBeenCalled();
    await service.list(actor);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { customerId } }),
    );
  });
});
