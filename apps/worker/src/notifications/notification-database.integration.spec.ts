import {
  createCipheriv,
  createHash,
  randomBytes,
  randomUUID,
} from 'node:crypto';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  parseWorkerEnvironment,
  type WorkerEnvironment,
} from '@webhost-billing/config';
import {
  createPrismaClient,
  type PrismaClient,
} from '@webhost-billing/database';
import {
  type BackgroundJobData,
  type NotificationKey,
  type MetaWhatsAppConfiguration,
} from '@webhost-billing/shared';
import { NotificationDeliveryService } from './notification-delivery.service';
import {
  NotificationProjectionService,
  notificationDestinationFingerprint,
} from './notification-projection.service';
import {
  WhatsAppPreviewAdapter,
  type WhatsAppNotificationAdapter,
} from './whatsapp-preview.adapter';
import {
  MetaWhatsAppAdapter,
  META_WHATSAPP_PROVIDER_KEY,
} from './meta-whatsapp.adapter';
import {
  MetaWhatsAppConfigurationCipher,
  META_WHATSAPP_KEY_VERSION,
} from './meta-whatsapp-configuration-cipher';
import {
  WhatsAppProviderError,
  type WhatsAppNotificationMessage,
  type WhatsAppSendResult,
} from './whatsapp-message';

// This suite is deliberately opt-in: the canonical driver creates/migrates a
// fresh marked schema and forces process-level provider gates off before Jest.
const databaseDescribe =
  process.env.WEBHOST_WHATSAPP_DATABASE_ACCEPTANCE === '1'
    ? describe
    : describe.skip;

databaseDescribe(
  'WhatsApp PostgreSQL acceptance (fictional, no external networking)',
  () => {
    let prisma: PrismaClient;
    let environment: WorkerEnvironment;
    let directory: string;
    let customer: { id: string; userId: string };
    let other: { id: string; userId: string };
    let adminId: string;
    let restrictedId: string;
    const clientPhone = '+8801700000169';
    const adminPhone = '+8801700000269';
    let denyNetwork: jest.SpyInstance;

    beforeAll(async () => {
      const schema = process.env.WEBHOST_BROWSER_E2E_SCHEMA ?? '';
      environment = parseWorkerEnvironment(process.env);
      const url = new URL(environment.DATABASE_URL);
      if (
        !/^command26_e2e_[a-f0-9]{32}$/.test(schema) ||
        !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
        url.searchParams.get('schema') !== schema ||
        url.searchParams.get('options') !== `-csearch_path=${schema}` ||
        environment.NOTIFICATION_DELIVERY_MODE !== 'disabled' ||
        environment.WHATSAPP_LIVE_ENABLED ||
        environment.RESELLBIZ_LIVE_ENABLED ||
        environment.EMAIL_TRANSPORT !== 'preview'
      )
        throw new Error(
          'WhatsApp acceptance requires an isolated fictional schema and disabled process-level providers.',
        );
      prisma = createPrismaClient(environment.DATABASE_URL);
      const scopes = await prisma.$queryRaw<
        { schema: string; path: string; owner: string }[]
      >`
      SELECT current_schema() AS schema, current_setting('search_path') AS path, owner FROM __browser_e2e_scope
    `;
      if (
        scopes.length !== 1 ||
        scopes[0].schema !== schema ||
        scopes[0].path !== schema ||
        scopes[0].owner !== schema ||
        (await prisma.user.count()) !== 0
      )
        throw new Error('Fresh database ownership proof failed.');
      directory = await mkdtemp(join(tmpdir(), 'webhost-whatsapp-169-'));
      environment = {
        ...environment,
        EMAIL_PREVIEW_DIRECTORY: directory,
        EMAIL_PUBLIC_WEB_URL: 'https://billing.example.test',
      };
      denyNetwork = jest
        .spyOn(globalThis, 'fetch')
        .mockRejectedValue(
          new Error('External HTTP is blocked in database acceptance.'),
        );
      const makeCustomer = async (suffix: string, phone: string) => {
        const user = await prisma.user.create({
          data: {
            email: `whatsapp-${suffix}-${randomUUID()}@example.test`,
            role: 'CUSTOMER',
            status: 'ACTIVE',
            emailVerifiedAt: new Date(),
            customer: {
              create: {
                customerNumber: `N169-${randomUUID().slice(0, 8)}`,
                firstName: 'Fictional',
                lastName: suffix,
                phone,
                addressLine1: '169 Fictional Road',
                city: 'Dhaka',
                countryCode: 'BD',
              },
            },
          },
          include: { customer: true },
        });
        return { id: user.customer!.id, userId: user.id };
      };
      customer = await makeCustomer('owner', clientPhone);
      other = await makeCustomer('other', '+8801700000369');
      const makeAdmin = async (
        role: 'FULL_ADMINISTRATOR' | 'SUPPORT_OPERATOR',
      ) =>
        (
          await prisma.user.create({
            data: {
              email: `whatsapp-admin-${randomUUID()}@example.test`,
              role: 'ADMIN',
              status: 'ACTIVE',
              emailVerifiedAt: new Date(),
              adminProfile: {
                create: {
                  displayName: 'Fictional administrator',
                  staffRole: role,
                },
              },
              notificationPreference: {
                create: {
                  whatsAppEnabled: true,
                  phoneCiphertext: encryptPhone(
                    adminPhone,
                    environment.CREDENTIAL_ENCRYPTION_KEY,
                  ),
                  phoneLastFour: '0269',
                },
              },
            },
          })
        ).id;
      adminId = await makeAdmin('FULL_ADMINISTRATOR');
      restrictedId = await makeAdmin('SUPPORT_OPERATOR');
    }, 30000);

    afterAll(async () => {
      if (denyNetwork) {
        expect(denyNetwork).not.toHaveBeenCalled();
        denyNetwork.mockRestore();
      }
      if (prisma) await prisma.$disconnect();
      if (directory) {
        const absolute = resolve(directory);
        if (
          !absolute.startsWith(resolve(tmpdir()) + '\\') &&
          !absolute.startsWith(resolve(tmpdir()) + '/')
        )
          throw new Error('Unsafe test cleanup path.');
        if (
          !absolute.split(/[\\/]/).at(-1)?.startsWith('webhost-whatsapp-169-')
        )
          throw new Error('Unsafe test directory identity.');
        await rm(absolute, { recursive: true });
      }
    });

    async function invoice() {
      return prisma.invoice.create({
        data: {
          invoiceNumber: `N169-${randomUUID().slice(0, 8)}`,
          submissionKey: `notification-169:${randomUUID()}`,
          customerId: customer.id,
          status: 'UNPAID',
          currency: 'BDT',
          subtotal: 390000n,
          total: 390000n,
          balanceDue: 390000n,
          customerNameSnapshot: 'Fictional recipient',
          customerEmailSnapshot: 'fictional@example.test',
          customerAddressSnapshot: { countryCode: 'BD' },
          businessIdentitySnapshot: { name: 'Fictional hosting' },
          issuedAt: new Date(Date.now() - 86400000),
          dueAt: new Date('2026-11-02T00:00:00Z'),
        },
      });
    }
    async function entry(
      key: NotificationKey = 'client-invoice-issued',
      userId = customer.userId,
      phone = clientPhone,
    ) {
      const bill = await invoice();
      const notice = await prisma.notificationEntry.create({
        data: {
          userId,
          key,
          sourceKey: `database169:${randomUUID()}`,
          channel: 'WHATSAPP',
          status: 'QUEUED',
          metadata: {
            invoiceId: bill.id,
            destinationFingerprint: notificationDestinationFingerprint(
              phone,
              environment.CREDENTIAL_ENCRYPTION_KEY,
            ),
          },
        },
      });
      const event = await prisma.outboxEvent.create({
        data: {
          aggregateType: 'NOTIFICATION',
          aggregateId: notice.id,
          eventType: 'NOTIFICATION_DELIVERY_REQUESTED',
          status: 'PUBLISHED',
          publishedAt: new Date(),
          idempotencyKey: `notification:${notice.id}`,
          payload: { schemaVersion: 1, notificationId: notice.id },
        },
      });
      const job: BackgroundJobData = {
        schemaVersion: 1,
        outboxEventId: event.id,
        aggregateType: 'NOTIFICATION',
        aggregateId: notice.id,
        eventType: event.eventType,
        correlationId: randomUUID(),
      };
      return { bill, notice, job };
    }
    function syntheticDelivery(send: WhatsAppNotificationAdapter['send']) {
      // In-memory simulation only. The process gates remain disabled, fetch is
      // blocked, and this adapter cannot make an external request.
      return new NotificationDeliveryService(
        prisma,
        {
          ...environment,
          NOTIFICATION_DELIVERY_MODE: 'live',
          WHATSAPP_LIVE_ENABLED: true,
        },
        { key: 'meta', send },
      );
    }
    const read = (id: string) =>
      prisma.notificationEntry.findUniqueOrThrow({ where: { id } });

    it('preserves database-generated UTC instants even with a conflicting connection timezone', async () => {
      const alternative = new URL(environment.DATABASE_URL);
      alternative.searchParams.set(
        'options',
        `${alternative.searchParams.get('options') ?? ''} -c timezone=Asia/Dhaka`,
      );
      const client = createPrismaClient(alternative.toString());
      try {
        const rows = await client.$queryRaw<
          { zone: string; path: string; epochMillis: bigint }[]
        >`
        SELECT current_setting('TimeZone') AS zone, current_setting('search_path') AS path,
          (extract(epoch FROM started_at)*1000)::bigint AS "epochMillis" FROM notification_epochs WHERE id='main'
      `;
        expect(rows[0].zone).toBe('UTC');
        expect(rows[0].path).toBe(process.env.WEBHOST_BROWSER_E2E_SCHEMA);
        const epoch = await client.notificationEpoch.findUniqueOrThrow({
          where: { id: 'main' },
        });
        expect(BigInt(epoch.startedAt.getTime())).toBe(rows[0].epochMillis);
      } finally {
        await client.$disconnect();
      }
    });

    it('projects issued/overdue invoices exactly once for the owning client and full admins under concurrent projection', async () => {
      const bill = await invoice();
      for (const eventType of ['EMAIL_INVOICE_CREATED', 'EMAIL_OVERDUE_NOTICE'])
        await prisma.outboxEvent.create({
          data: {
            aggregateType: 'INVOICE',
            aggregateId: bill.id,
            eventType,
            idempotencyKey: `database169:${eventType}:${bill.id}`,
            payload: { schemaVersion: 1, invoiceId: bill.id },
          },
        });
      const projector = new NotificationProjectionService(prisma, environment);
      await Promise.all([projector.projectOnce(), projector.projectOnce()]);
      await projector.projectOnce();
      const rows = await prisma.notificationEntry.findMany({
        where: {
          sourceKey: {
            in: [
              `EMAIL_INVOICE_CREATED:${bill.id}`,
              `EMAIL_OVERDUE_NOTICE:${bill.id}`,
            ],
          },
        },
      });
      expect(
        rows
          .filter((row) => row.channel === 'WHATSAPP')
          .map((row) => `${row.userId}:${row.key}`)
          .sort(),
      ).toEqual(
        [
          `${customer.userId}:client-invoice-issued`,
          `${customer.userId}:client-overdue-notice`,
          `${adminId}:admin-invoice-issued`,
          `${adminId}:admin-overdue-notice`,
        ].sort(),
      );
      expect(rows.every((row) => row.status === 'DISABLED')).toBe(true);
      expect(
        rows.some(
          (row) => row.userId === other.userId || row.userId === restrictedId,
        ),
      ).toBe(false);
      expect(
        rows
          .filter((row) => row.channel === 'EMAIL')
          .map((row) => row.key)
          .sort(),
      ).toEqual(['admin-invoice-issued', 'admin-overdue-notice']);
      for (const row of rows)
        expect(
          await prisma.outboxEvent.count({
            where: {
              aggregateId: row.id,
              eventType: 'NOTIFICATION_DELIVERY_REQUESTED',
            },
          }),
        ).toBe(0);
    });

    it('never invokes a send with the real process gates disabled and persists that result', async () => {
      const item = await entry();
      const send = jest.fn<
        Promise<WhatsAppSendResult>,
        [WhatsAppNotificationMessage]
      >();
      await new NotificationDeliveryService(prisma, environment, {
        key: 'meta',
        send,
      }).deliver(item.job);
      expect((await read(item.notice.id)).status).toBe('DISABLED');
      expect(send).not.toHaveBeenCalled();
    });

    it('uses a committed claim so two clients and worker replay perform only one synthetic submission', async () => {
      const item = await entry();
      let release!: () => void;
      let started!: () => void;
      const barrier = new Promise<void>((done) => {
        release = done;
      });
      const beginning = new Promise<void>((done) => {
        started = done;
      });
      const send = jest
        .fn<Promise<WhatsAppSendResult>, [WhatsAppNotificationMessage]>()
        .mockImplementation(async (message) => {
          expect((await read(item.notice.id)).status).toBe('SUBMITTING');
          expect(message.detail).toBe(
            'Balance due: BDT 3900.00; due 02/11/2026',
          );
          started();
          await barrier;
          return { status: 'ACCEPTED', providerMessageId: 'wamid.database169' };
        });
      const service = syntheticDelivery(send);
      const first = service.deliver(item.job);
      try {
        await Promise.race([
          beginning,
          first.then(() => {
            throw new Error('Delivery did not reach the synthetic provider.');
          }),
        ]);
        await service.deliver(item.job);
        expect(send).toHaveBeenCalledTimes(1);
      } finally {
        release();
        await first;
      }
      await service.deliver(item.job);
      expect(await read(item.notice.id)).toMatchObject({
        status: 'ACCEPTED',
        attemptCount: 1,
        metadata: { provider: 'meta', providerMessageId: 'wamid.database169' },
      });
      expect(send).toHaveBeenCalledTimes(1);
    });

    it('preserves uncertain results, blocks automatic/manual queue replay and projects one nonrecursive admin alert', async () => {
      const item = await entry();
      const send = jest
        .fn<Promise<WhatsAppSendResult>, [WhatsAppNotificationMessage]>()
        .mockRejectedValue(new WhatsAppProviderError('UNKNOWN'));
      const service = syntheticDelivery(send);
      await service.deliver(item.job);
      await service.deliver({
        ...item.job,
        failureKind: 'TEMPORARY',
        manualRetryAllowed: true,
      });
      expect(await read(item.notice.id)).toMatchObject({
        status: 'UNKNOWN',
        attemptCount: 1,
        failureCode: 'WHATSAPP_UNKNOWN',
      });
      expect(send).toHaveBeenCalledTimes(1);
      const projector = new NotificationProjectionService(prisma, environment);
      await projector.projectOnce();
      await projector.projectOnce();
      const alerts = await prisma.notificationEntry.findMany({
        where: {
          sourceKey: `failed-notification:${item.notice.id}`,
          key: 'admin-delivery-failure',
        },
      });
      expect(alerts).toHaveLength(2);
      expect(alerts.every((row) => row.userId === adminId)).toBe(true);
      await prisma.notificationEntry.updateMany({
        where: { id: { in: alerts.map((row) => row.id) } },
        data: { status: 'UNKNOWN', completedAt: new Date() },
      });
      await projector.projectOnce();
      expect(
        await prisma.notificationEntry.count({
          where: {
            sourceKey: {
              in: alerts.map((row) => `failed-notification:${row.id}`),
            },
          },
        }),
      ).toBe(0);
    });

    it('retains a persisted interrupted claim across service reconstruction without resending', async () => {
      const item = await entry();
      await prisma.notificationEntry.update({
        where: { id: item.notice.id },
        data: { status: 'SUBMITTING', attemptCount: 1 },
      });
      const send = jest.fn<
        Promise<WhatsAppSendResult>,
        [WhatsAppNotificationMessage]
      >();
      await syntheticDelivery(send).deliver(item.job);
      expect(await read(item.notice.id)).toMatchObject({
        status: 'SUBMITTING',
        attemptCount: 1,
      });
      expect(send).not.toHaveBeenCalled();
    });

    it('preserves the committed database claim when both acknowledgement writes fail after a synthetic acceptance', async () => {
      const item = await entry();
      const send = jest
        .fn<Promise<WhatsAppSendResult>, [WhatsAppNotificationMessage]>()
        .mockResolvedValue({
          status: 'ACCEPTED',
          providerMessageId: 'wamid.acknowledgement-lost169',
        });
      const unavailableWrites = {
        $transaction: prisma.$transaction.bind(prisma),
        notificationEntry: {
          updateMany: () =>
            Promise.reject(
              new Error('Fictional acknowledgement storage failure.'),
            ),
        },
      } as unknown as PrismaClient;
      const service = new NotificationDeliveryService(
        unavailableWrites,
        {
          ...environment,
          NOTIFICATION_DELIVERY_MODE: 'live',
          WHATSAPP_LIVE_ENABLED: true,
        },
        { key: 'meta', send },
      );
      await expect(service.deliver(item.job)).rejects.toThrow(
        'Fictional acknowledgement storage failure.',
      );
      expect(await read(item.notice.id)).toMatchObject({
        status: 'SUBMITTING',
        attemptCount: 1,
      });
      await syntheticDelivery(send).deliver(item.job);
      expect(send).toHaveBeenCalledTimes(1);
    });

    it('serializes preference changes with delivery and suppresses changed recipients and stale invoice ownership/payment', async () => {
      const item = await entry();
      let release!: () => void;
      let locked!: () => void;
      const barrier = new Promise<void>((done) => {
        release = done;
      });
      const beginning = new Promise<void>((done) => {
        locked = done;
      });
      const preferenceChange = prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM users WHERE id=${customer.userId}::uuid FOR UPDATE`;
        locked();
        await barrier;
        await tx.notificationPreference.upsert({
          where: { userId: customer.userId },
          create: { userId: customer.userId, whatsAppEnabled: false },
          update: { whatsAppEnabled: false },
        });
      });
      await beginning;
      const send = jest.fn<
        Promise<WhatsAppSendResult>,
        [WhatsAppNotificationMessage]
      >();
      const delivery = syntheticDelivery(send).deliver(item.job);
      try {
        let observedLockWait = false;
        for (let attempt = 0; attempt < 40; attempt++) {
          const blocked = await prisma.$queryRaw<
            { count: bigint }[]
          >`SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND wait_event_type='Lock' AND query LIKE '%FROM users WHERE id=%FOR UPDATE%'`;
          if (blocked[0]?.count > 0n) {
            observedLockWait = true;
            break;
          }
          await new Promise<void>((done) => setTimeout(done, 20));
        }
        expect(observedLockWait).toBe(true);
        release();
        await preferenceChange;
        await delivery;
      } finally {
        release();
        await preferenceChange;
      }
      expect((await read(item.notice.id)).status).toBe('SUPPRESSED');
      await prisma.notificationPreference.update({
        where: { userId: customer.userId },
        data: { whatsAppEnabled: true },
      });
      const changed = await entry();
      await prisma.customer.update({
        where: { id: customer.id },
        data: { phone: '+8801700000999' },
      });
      await syntheticDelivery(send).deliver(changed.job);
      expect((await read(changed.notice.id)).status).toBe('SUPPRESSED');
      await prisma.customer.update({
        where: { id: customer.id },
        data: { phone: clientPhone },
      });
      const wrongOwner = await entry(
        'client-invoice-issued',
        other.userId,
        '+8801700000369',
      );
      await syntheticDelivery(send).deliver(wrongOwner.job);
      expect((await read(wrongOwner.notice.id)).status).toBe('SUPPRESSED');
      const overdue = await entry('client-overdue-notice');
      await prisma.invoice.update({
        where: { id: overdue.bill.id },
        data: { status: 'CANCELLED', cancelledAt: new Date() },
      });
      await syntheticDelivery(send).deliver(overdue.job);
      expect((await read(overdue.notice.id)).status).toBe('SUPPRESSED');
      expect(send).not.toHaveBeenCalled();
    });

    it('runs encrypted Meta configuration through the real database and injected HTTP, with sender verification before acceptance', async () => {
      const config: MetaWhatsAppConfiguration = {
        enabled: true,
        senderPhoneNumber: '+8801700000000',
        phoneNumberId: '10000000000169',
        apiVersion: 'v25.0',
        accessToken: 'fictional_meta_169_'.repeat(3),
        templates: {
          'admin-invoice-issued': { name: 'fictional_invoice', language: 'en' },
        },
      };
      const ciphertext = new MetaWhatsAppConfigurationCipher(
        environment.CREDENTIAL_ENCRYPTION_KEY,
      ).encrypt(config);
      await prisma.integrationCredential.create({
        data: {
          providerKey: META_WHATSAPP_PROVIDER_KEY,
          ciphertext,
          keyVersion: META_WHATSAPP_KEY_VERSION,
          maskedIdentifier: '••••0000',
          updatedByUserId: adminId,
        },
      });
      const item = await entry('admin-invoice-issued', adminId, adminPhone);
      const request = jest
        .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              id: config.phoneNumberId,
              display_phone_number: config.senderPhoneNumber,
            }),
          ),
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              messaging_product: 'whatsapp',
              contacts: [
                { input: adminPhone.slice(1), wa_id: adminPhone.slice(1) },
              ],
              messages: [{ id: 'wamid.database-encrypted169' }],
            }),
          ),
        );
      const adapter = new MetaWhatsAppAdapter(
        prisma,
        environment.CREDENTIAL_ENCRYPTION_KEY,
        true,
        request,
      );
      await syntheticDelivery((message) => adapter.send(message)).deliver(
        item.job,
      );
      expect(await read(item.notice.id)).toMatchObject({
        status: 'ACCEPTED',
        metadata: { providerMessageId: 'wamid.database-encrypted169' },
      });
      expect(request).toHaveBeenCalledTimes(2);
      expect(request.mock.calls[0][1]?.method).toBe('GET');
      expect(request.mock.calls[1][1]?.method).toBe('POST');
      const stored = await prisma.integrationCredential.findUniqueOrThrow({
        where: { providerKey: META_WHATSAPP_PROVIDER_KEY },
      });
      expect(stored.ciphertext).not.toContain(config.accessToken);
      expect(
        JSON.stringify((await read(item.notice.id)).metadata),
      ).not.toContain(config.accessToken);
      expect(
        JSON.stringify(
          await prisma.outboxEvent.findMany({
            where: { aggregateId: item.notice.id },
          }),
        ),
      ).not.toContain(adminPhone);
    });

    it('creates one private deterministic preview despite concurrent delivery and leaves the fictional financial state unchanged', async () => {
      const item = await entry();
      const preview = new NotificationDeliveryService(
        prisma,
        { ...environment, NOTIFICATION_DELIVERY_MODE: 'preview' },
        new WhatsAppPreviewAdapter(directory),
      );
      const before = await prisma.invoice.findUniqueOrThrow({
        where: { id: item.bill.id },
      });
      await Promise.all([preview.deliver(item.job), preview.deliver(item.job)]);
      expect(await read(item.notice.id)).toMatchObject({
        status: 'PREVIEWED',
        attemptCount: 1,
      });
      expect(await readdir(join(directory, 'whatsapp'))).toHaveLength(1);
      expect(
        await prisma.invoice.findUniqueOrThrow({ where: { id: item.bill.id } }),
      ).toEqual(before);
      expect(await prisma.payment.count()).toBe(0);
      expect(await prisma.hostingPanelOperation.count()).toBe(0);
      expect(await prisma.registrarOperation.count()).toBe(0);
      expect(await prisma.emailLog.count()).toBe(0);
    });
  },
);

function encryptPhone(phone: string, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(
    'aes-256-gcm',
    createHash('sha256').update(secret).digest(),
    iv,
  );
  const data = Buffer.concat([cipher.update(phone, 'utf8'), cipher.final()]);
  return [
    'v1',
    iv.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
    data.toString('base64url'),
  ].join('.');
}
