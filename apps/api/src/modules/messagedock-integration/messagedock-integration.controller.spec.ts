import type { ApiEnvironment } from '@webhost-billing/config';
import type { PrismaClient } from '@webhost-billing/database';
import type { Request } from 'express';
import { MessageDockIntegrationController } from './messagedock-integration.controller';

const token = 'test-only-message-dock-read-token-1234567890';
const customerId = '11111111-1111-4111-8111-111111111111';
const request = (key?: string) =>
  ({
    get: (name: string) =>
      name === 'authorization' && key ? `Bearer ${key}` : undefined,
  }) as unknown as Request;

describe('MessageDock read-only integration', () => {
  const findMany = jest.fn();
  const findFirst = jest.fn();
  const prisma = {
    customer: { findMany, findFirst },
  } as unknown as PrismaClient;
  const environment = { MESSAGEDOCK_READ_TOKEN: token } as ApiEnvironment;
  const controller = new MessageDockIntegrationController(prisma, environment);

  beforeEach(() => jest.clearAllMocks());

  it('is disabled without the configured key and rejects invalid keys before a database read', async () => {
    const disabled = new MessageDockIntegrationController(
      prisma,
      {} as ApiEnvironment,
    );
    await expect(
      disabled.search(request(token), 'Customer'),
    ).rejects.toMatchObject({ status: 401 });
    await expect(
      controller.search(request('wrong-key'), 'Customer'),
    ).rejects.toMatchObject({ status: 401 });
    await expect(
      controller.context(request(), customerId),
    ).rejects.toMatchObject({ status: 401 });
    expect(findMany).not.toHaveBeenCalled();
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('bounds search and returns only a minimal customer identity', async () => {
    await expect(controller.search(request(token), 'ab')).rejects.toMatchObject(
      { status: 400 },
    );
    findMany.mockResolvedValue([
      {
        id: customerId,
        customerNumber: 'CUS-1',
        firstName: 'Sample',
        lastName: 'Customer',
        companyName: null,
        user: { email: 'sample@example.test' },
      },
    ]);
    await expect(controller.search(request(token), 'Sample')).resolves.toEqual({
      customers: [
        {
          id: customerId,
          customerNumber: 'CUS-1',
          firstName: 'Sample',
          lastName: 'Customer',
          companyName: null,
          email: 'sample@example.test',
        },
      ],
    });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 10 }),
    );
  });

  it('returns bounded status context without payment or ticket message bodies', async () => {
    findFirst.mockResolvedValue({
      id: customerId,
      customerNumber: 'CUS-1',
      firstName: 'Sample',
      lastName: 'Customer',
      companyName: null,
      services: [],
      tickets: [],
      invoices: [
        {
          id: customerId,
          invoiceNumber: 'INV-1',
          status: 'UNPAID',
          currency: 'BDT',
          balanceDue: 12500n,
          dueAt: new Date('2026-10-18T00:00:00Z'),
        },
      ],
    });
    const result = await controller.context(request(token), customerId);
    expect(result.customer.invoices[0]?.balanceDue).toBe('12500');
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: customerId, deletedAt: null },
      }),
    );
    expect(JSON.stringify(result)).not.toContain('password');
  });
});
