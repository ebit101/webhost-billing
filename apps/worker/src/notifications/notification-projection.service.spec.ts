import { parseWorkerEnvironment } from '@webhost-billing/config';
import type { PrismaClient } from '@webhost-billing/database';
import { DEFAULT_RENEWAL_AUTOMATION_POLICY } from '@webhost-billing/shared';
import { NotificationProjectionService } from './notification-projection.service';

const invoiceId = '20000000-0000-4000-8000-000000000168';
type Entry = {
  id: string;
  sourceKey: string;
  key: string;
  userId: string;
  channel: string;
  status: string;
};

describe('invoice notification projection', () => {
  it.each(['EMAIL_INVOICE_CREATED', 'EMAIL_OVERDUE_NOTICE'])(
    'projects %s for the owning client and full administrators with canonical deduplication',
    async (eventType) => {
      const env = parseWorkerEnvironment({
        NODE_ENV: 'test',
        DATABASE_URL: 'postgresql://user:pass@127.0.0.1:5432/test',
        REDIS_URL: 'redis://127.0.0.1:6379',
        CREDENTIAL_ENCRYPTION_KEY: 'f'.repeat(40),
        NOTIFICATION_DELIVERY_MODE: 'preview',
      });
      const sources = [
        {
          key: 'outbox:test',
          kind: 'OUTBOX',
          id: invoiceId,
          createdAt: new Date(),
        },
      ];
      const entries: Entry[] = [];
      const keys = new Set<string>();
      const createMany = jest.fn(
        ({ data }: { data: Entry[]; skipDuplicates: boolean }) => {
          const key = `${data[0].sourceKey}:${data[0].key}:${data[0].userId}:${data[0].channel}`;
          if (keys.has(key)) return Promise.resolve({ count: 0 });
          keys.add(key);
          entries.push(data[0]);
          return Promise.resolve({ count: 1 });
        },
      );
      const findUsers = jest.fn(({ where }: { where: { role: string } }) =>
        Promise.resolve([
          {
            id: where.role === 'ADMIN' ? 'admin-fixture' : 'client-fixture',
            email: 'fictional@example.test',
            // An admin without an encrypted recipient number gets a suppressed alert,
            // never the sender number or the client's phone as an implicit destination.
            customer:
              where.role === 'CUSTOMER'
                ? { phone: '+8801700000168', countryCode: 'BD' }
                : null,
            notificationPreference: null,
          },
        ]),
      );
      const createOutbox = jest.fn().mockResolvedValue({});
      const invoice = {
        id: invoiceId,
        customerId: 'client-record',
        issuedAt: new Date(),
        status: 'UNPAID',
        balanceDue: 390000n,
      };
      const tx = {
        $queryRaw: jest
          .fn()
          .mockResolvedValueOnce([{ acquired: true }])
          .mockResolvedValueOnce(sources)
          .mockResolvedValueOnce([{ acquired: true }])
          .mockResolvedValueOnce(sources)
          .mockResolvedValueOnce([{ acquired: true }])
          .mockResolvedValueOnce(sources),
        notificationEpoch: {
          findUniqueOrThrow: jest
            .fn()
            .mockResolvedValue({ startedAt: new Date(0) }),
        },
        notificationSource: {
          findUnique: jest
            .fn()
            .mockResolvedValue({ key: 'daily-already-projected' }),
          create: jest.fn().mockResolvedValue({}),
        },
        outboxEvent: {
          findUniqueOrThrow: jest.fn().mockResolvedValue({
            eventType,
            payload: { schemaVersion: 1, invoiceId },
          }),
          create: createOutbox,
        },
        invoice: {
          findUnique: jest
            .fn()
            .mockImplementation(() => Promise.resolve(invoice)),
        },
        user: { findMany: findUsers },
        notificationEntry: { createMany },
        domain: { findMany: jest.fn().mockResolvedValue([]) },
        setting: {
          findUnique: jest.fn().mockResolvedValue({
            value: { ...DEFAULT_RENEWAL_AUTOMATION_POLICY, enabled: false },
          }),
        },
      };
      const prisma = {
        $transaction: (fn: (value: typeof tx) => Promise<number>) => fn(tx),
      } as unknown as PrismaClient;
      const service = new NotificationProjectionService(prisma, env);
      await service.projectOnce();
      await service.projectOnce();
      const suffix =
        eventType === 'EMAIL_INVOICE_CREATED'
          ? 'invoice-issued'
          : 'overdue-notice';
      expect(entries.filter((entry) => entry.channel === 'WHATSAPP')).toEqual([
        expect.objectContaining({
          key: `client-${suffix}`,
          userId: 'client-fixture',
          status: 'QUEUED',
        }),
        expect.objectContaining({
          key: `admin-${suffix}`,
          userId: 'admin-fixture',
          status: 'SUPPRESSED',
        }),
      ]);
      expect(entries).toHaveLength(3); // Existing client email pipeline is not duplicated.
      expect(createOutbox).toHaveBeenCalledTimes(2); // Client WhatsApp plus new admin email preview.
      expect(
        createOutbox.mock.calls.every(
          ([value]) => JSON.stringify(value).indexOf('8801700000168') === -1,
        ),
      ).toBe(true);
      expect(findUsers.mock.calls[1][0]).toMatchObject({
        where: {
          role: 'ADMIN',
          adminProfile: { is: { staffRole: 'FULL_ADMINISTRATOR' } },
        },
      });
      expect(findUsers.mock.calls[0][0]).toMatchObject({
        where: {
          role: 'CUSTOMER',
          customer: {
            is: { id: 'client-record', status: 'ACTIVE', deletedAt: null },
          },
        },
      });
      expect(
        createMany.mock.calls.every(([value]) => value.skipDuplicates),
      ).toBe(true);
      const before = createMany.mock.calls.length;
      invoice.status = 'CANCELLED';
      await service.projectOnce();
      expect(createMany.mock.calls.length).toBe(before);
    },
  );
});
