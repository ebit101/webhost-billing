import { execFileSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { parseApiEnvironment } from '@webhost-billing/config';
import {
  createPrismaClient,
  Prisma,
  type PrismaClient,
} from '@webhost-billing/database';
import {
  RegistrarCipher,
  credentialBinding,
  ResellbizHttpsTransport,
} from '@webhost-billing/database/registrar';
import {
  domainInventoryResponseSchema,
  type DomainInventoryResponse,
} from '@webhost-billing/shared';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { API_ENVIRONMENT } from '../src/infrastructure/environment/environment.module';
import { PRISMA_CLIENT } from '../src/infrastructure/database/database.module';
import { hashOpaqueToken } from '../src/modules/auth/services/auth-token.service';
import { TotpService } from '../src/modules/auth/services/totp.service';
import { DomainService } from '../src/modules/domains/domain.service';

const id = (value: number) =>
  `16000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
describe('global domain inventory with 200 fictional multi-service clients', () => {
  const schema = `inventory160_${randomUUID().replaceAll('-', '')}`;
  let administration: PrismaClient;
  let prisma: PrismaClient;
  let app: INestApplication<App>;
  let created = false;
  let primary: ReturnType<typeof request.agent>;
  let secondary: ReturnType<typeof request.agent>;
  let billing: ReturnType<typeof request.agent>;
  let support: ReturnType<typeof request.agent>;
  let client: ReturnType<typeof request.agent>;
  let domainIds: string[];
  const wire = jest
    .spyOn(ResellbizHttpsTransport.prototype, 'request')
    .mockImplementation(() =>
      Promise.reject(
        new Error('Inventory acceptance must never contact a registrar'),
      ),
    );

  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL ?? '');
    if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
      throw new Error('Inventory requires fictional loopback PostgreSQL');
    url.searchParams.delete('schema');
    url.searchParams.delete('options');
    administration = createPrismaClient(url.toString());
    await administration.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    created = true;
    url.searchParams.set('schema', schema);
    url.searchParams.set('options', `-c search_path=${schema}`);
    const args = ['--filter', '@webhost-billing/database', 'db:migrate:deploy'];
    execFileSync(
      process.platform === 'win32'
        ? (process.env.ComSpec ?? 'cmd.exe')
        : 'pnpm',
      process.platform === 'win32' ? ['/d', '/s', '/c', 'pnpm', ...args] : args,
      {
        cwd: '../..',
        env: { ...process.env, DATABASE_URL: url.toString() },
        stdio: 'pipe',
      },
    );
    const environment = parseApiEnvironment({
      ...process.env,
      DATABASE_URL: url.toString(),
      NODE_ENV: 'test',
      PORT: '3001',
      AUTH_RATE_LIMIT_NAMESPACE: schema,
      BULLMQ_PREFIX: schema,
      BKASH_ENABLED: 'false',
      SSLCOMMERZ_ENABLED: 'false',
      RESELLBIZ_LIVE_ENABLED: 'false',
      EMAIL_TRANSPORT: 'preview',
      NOTIFICATION_DELIVERY_MODE: 'disabled',
    });
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(API_ENVIRONMENT)
      .useValue(environment)
      .compile();
    app = module.createNestApplication();
    await app.init();
    prisma = module.get(PRISMA_CLIENT);
    const cipher = new RegistrarCipher(environment.CREDENTIAL_ENCRYPTION_KEY);
    // A disabled LIVE-mode identity satisfies existing-domain storage constraints.
    // It is fictional, has no usable external account and cannot dispatch networking.
    const registrar = await prisma.registrarAccount.create({
      data: {
        mode: 'LIVE',
        enabled: false,
        configuration: { schemaVersion: 2, resellerId: '16000' },
      },
    });
    await prisma.registrarProfile.create({
      data: {
        accountId: registrar.id,
        name: 'Fictional disabled inventory registrar',
      },
    });
    const credential = await prisma.registrarCredential.create({
      data: {
        accountId: registrar.id,
        version: 1,
        ciphertext: cipher.encrypt(credentialBinding(registrar.id, 1, 'LIVE'), {
          resellerId: '16000',
          apiKey: 'fictional'.repeat(4),
        }),
      },
    });
    await prisma.user.createMany({
      data: Array.from({ length: 200 }, (_, index) => ({
        id: id(1000 + index),
        role: 'CUSTOMER',
        status: 'ACTIVE',
        email: `client160-${String(index).padStart(3, '0')}@example.test`,
        emailVerifiedAt: new Date(),
      })),
    });
    await prisma.customer.createMany({
      data: Array.from({ length: 200 }, (_, index) => ({
        id: id(2000 + index),
        userId: id(1000 + index),
        customerNumber: `CUS-160-${String(index).padStart(3, '0')}`,
        firstName: 'Fictional',
        lastName: `Client ${index}`,
        companyName: `Studio 160 ${index}`,
        status: 'ACTIVE',
        addressLine1: '1 Fictional Road',
        city: 'Dhaka',
        countryCode: 'BD',
      })),
    });
    const product = await prisma.product.create({
      data: {
        slug: 'inventory160-fictional-hosting',
        name: 'Fictional inventory hosting',
        status: 'ACTIVE',
        provisioningAdapter: 'fake-panel',
      },
    });
    const price = await prisma.productPrice.create({
      data: {
        productId: product.id,
        currency: 'BDT',
        billingPeriod: 'MONTHLY',
        amount: 120000n,
      },
    });
    const server = await prisma.server.create({
      data: {
        name: 'Fictional disabled inventory server',
        hostname: 'inventory160.example.test',
        status: 'DISABLED',
        adapterKey: 'fake-panel',
        maxAccounts: 1000,
      },
    });
    let sequence = 0;
    const records = Array.from({ length: 200 }, (_, customerIndex) =>
      Array.from({ length: (customerIndex % 5) + 1 }, () => ({
        index: sequence++,
        customerIndex,
      })),
    ).flat();
    expect(records).toHaveLength(600);
    domainIds = records.map(({ index }) => id(3000 + index));
    await prisma.service.createMany({
      data: records.map(({ index, customerIndex }) => ({
        customerId: id(2000 + customerIndex),
        productId: product.id,
        productPriceId: price.id,
        serverId: server.id,
        status: 'PENDING',
        domain: `inventory160-${String(index).padStart(4, '0')}.com`,
        productNameSnapshot: 'Fictional inventory hosting',
        billingPeriod: 'MONTHLY',
        recurringAmount: 120000n,
        currency: 'BDT',
        startedAt: new Date('2026-01-01T00:00:00Z'),
        nextDueAt: new Date('2026-02-01T00:00:00Z'),
      })),
    });
    await prisma.domain.createMany({
      data: records.map(({ index, customerIndex }) => ({
        id: id(3000 + index),
        customerId: id(2000 + customerIndex),
        accountId: registrar.id,
        executionAccountId: registrar.id,
        origin: 'EXISTING',
        state: 'REGISTERED',
        domainName: `inventory160-${String(index).padStart(4, '0')}.com`,
        submissionKey: randomUUID(),
        providerOrderId: String(160000 + index),
        linkCredentialId: credential.id,
        linkEvidenceCiphertext: cipher.encrypt(
          `resellbiz:existing-link:${id(3000 + index)}`,
          {
            remoteCustomerId: String(260000 + customerIndex),
            remoteContactId: String(360000 + index),
            nameservers: ['ns1.fictional-host.com', 'ns2.fictional-host.com'],
            contact: {
              name: 'Private fictional registrant',
              company: 'Private fictional company',
              address: '1 Private Road',
              city: 'Dhaka',
              region: 'Dhaka',
              postalCode: '1000',
              country: 'BD',
              email: 'private-registry-contact@example.test',
              phoneCountryCode: '880',
              phone: '1700000000',
            },
          },
        ),
        ownershipVerifiedAt: new Date('2026-01-01T00:00:00Z'),
        expiresAt: new Date(
          index === 0 ? '2025-01-01T00:00:00Z' : '2027-01-01T00:00:00Z',
        ),
        createdAt: new Date('2026-01-01T00:00:00Z'),
      })),
    });
    primary = await administrator('FULL_ADMINISTRATOR');
    secondary = await administrator('FULL_ADMINISTRATOR');
    billing = await administrator('BILLING_OPERATOR');
    support = await administrator('SUPPORT_OPERATOR');
    client = await session(id(1000));
  }, 120000);
  afterAll(async () => {
    wire.mockRestore();
    if (app) await app.close();
    if (administration) {
      if (!/^inventory160_[a-f0-9]{32}$/.test(schema))
        throw new Error('Invalid inventory disposal scope');
      if (created)
        await administration.$executeRawUnsafe(
          `DROP SCHEMA "${schema}" CASCADE`,
        );
      await administration.$disconnect();
    }
  });
  async function session(userId: string, verified = false) {
    const now = new Date();
    const token = randomBytes(32).toString('hex');
    await prisma.authSession.create({
      data: {
        userId,
        tokenHash: hashOpaqueToken(token),
        createdAt: now,
        expiresAt: new Date(now.getTime() + 3600000),
        twoFactorVerifiedAt: verified ? now : null,
      },
    });
    return request
      .agent(app.getHttpServer())
      .set('Cookie', `webhost_session=${token}`);
  }
  async function administrator(
    staffRole: 'FULL_ADMINISTRATOR' | 'BILLING_OPERATOR' | 'SUPPORT_OPERATOR',
  ) {
    const totp = app.get(TotpService);
    const now = new Date();
    const user = await prisma.user.create({
      data: {
        email: `${randomUUID()}@example.test`,
        role: 'ADMIN',
        status: 'ACTIVE',
        emailVerifiedAt: new Date(),
        adminProfile: {
          create: { displayName: 'Fictional inventory operator', staffRole },
        },
        adminTotpCredential: {
          create: {
            secretCiphertext: totp.encryptSecret(totp.generateSecret()),
            keyVersion: 'mfa-v1',
            createdAt: now,
            enabledAt: now,
          },
        },
      },
    });
    return session(user.id, true);
  }
  async function read(
    path: string,
    actor = primary,
  ): Promise<DomainInventoryResponse> {
    const response = await actor.get('/domains/inventory' + path).expect(200);
    expect(response.headers['cache-control']).toBe(
      'private, no-store, max-age=0',
    );
    return domainInventoryResponseSchema.parse(response.body);
  }
  async function fingerprint() {
    const tables = [
      'customers',
      'domains',
      'services',
      'registrar_accounts',
      'registrar_credentials',
      'invoices',
      'payments',
      'registrar_operations',
      'domain_actions',
      'outbox_events',
      'email_logs',
    ];
    return Promise.all(
      tables.map((table) =>
        prisma.$queryRaw(Prisma.sql`
      SELECT count(*)::text AS count, md5(coalesce(string_agg(md5(to_jsonb(t)::text), '' ORDER BY id), '')) AS fingerprint
      FROM ${Prisma.raw(table)} t`),
      ),
    );
  }
  it('denies anonymous, customer and restricted-staff inventory access without weakening parent ownership', async () => {
    await request(app.getHttpServer()).get('/domains/inventory').expect(401);
    for (const actor of [client, billing, support])
      await actor.get('/domains/inventory').expect(403);
    await client.get(`/domains?customerId=${id(2001)}`).expect(403);
    await primary
      .get(`/domains/${id(3000)}?customerId=${id(2001)}`)
      .expect(403);
  });
  it('enumerates every domain for two concurrent administrators with bounded pages, stable ties and no detail fan-out', async () => {
    expect(await prisma.customer.count()).toBe(200);
    expect(await prisma.service.count()).toBe(600);
    const before = await fingerprint();
    const detail = jest.spyOn(app.get(DomainService), 'detail');
    const seen = [new Set<string>(), new Set<string>()];
    for (let page = 1; page <= 6; page++) {
      const results = await Promise.all([
        read(`?page=${page}&pageSize=100`),
        read(`?page=${page}&pageSize=100`, secondary),
      ]);
      for (const [index, result] of results.entries()) {
        expect(result.data).toHaveLength(100);
        expect(result.pagination).toEqual({
          page,
          pageSize: 100,
          totalItems: 600,
          totalPages: 6,
        });
        expect(result.summary.REGISTERED).toBe(600);
        expect(result.data.map((row) => row.id)).toEqual(
          [...domainIds].reverse().slice((page - 1) * 100, page * 100),
        );
        for (const row of result.data) {
          expect(seen[index].has(row.id)).toBe(false);
          seen[index].add(row.id);
        }
        expect(JSON.stringify(result)).not.toMatch(
          /private-registry-contact|ciphertext|remoteCustomerId|remoteContactId|providerOrderId|credential|nameservers|costCeiling|contactMapping/,
        );
      }
    }
    expect([...seen[0]].sort()).toEqual([...domainIds].sort());
    expect([...seen[1]].sort()).toEqual([...domainIds].sort());
    expect(detail).not.toHaveBeenCalled();
    detail.mockRestore();
    expect(await fingerprint()).toEqual(before);
    expect(wire).not.toHaveBeenCalled();
  });
  it('searches the whole inventory literally by domain and client fields and retains exact scope and summaries', async () => {
    for (const search of [
      'INVENTORY160-0000.COM',
      'client160-000@example.test',
      'CUS-160-000',
      'Studio 160 0',
    ]) {
      const result = await read('?search=' + encodeURIComponent(search));
      expect(result.pagination.totalItems).toBe(1);
      expect(result.data[0].id).toBe(id(3000));
      expect(result.data[0].expiresAt).toBe('2025-01-01T00:00:00.000Z');
      expect(result.data[0].state).toBe('REGISTERED');
    }
    const scoped = await read(
      `?customerId=${id(2004)}&origin=EXISTING&state=REGISTERED`,
    );
    expect(scoped.pagination.totalItems).toBe(5);
    expect(scoped.summary.REGISTERED).toBe(5);
    expect(scoped.data.every((row) => row.customerId === id(2004))).toBe(true);
    for (const search of ['%', '_', "' OR 1=1 --", 'absent160'])
      expect(
        (await read('?search=' + encodeURIComponent(search))).pagination
          .totalItems,
      ).toBe(0);
    expect(
      (await read('?search=Fictional%20Client%20199')).pagination.totalItems,
    ).toBe(5);
    expect((await read('?origin=REGISTRATION')).pagination.totalItems).toBe(0);
    expect((await read('?state=AWAITING_APPROVAL')).pagination.totalItems).toBe(
      0,
    );
    const outOfRange = await read('?page=7&pageSize=100');
    expect(outOfRange.data).toEqual([]);
    expect(outOfRange.pagination.totalItems).toBe(600);
  });
  it('covers every client-owned subset with one to five domains and services per client', async () => {
    const before = await fingerprint();
    for (let index = 0; index < 200; index += 2) {
      const results = await Promise.all([
        read(`?customerId=${id(2000 + index)}`),
        read(`?customerId=${id(2001 + index)}`, secondary),
      ]);
      for (const [offset, result] of results.entries()) {
        expect(result.pagination.totalItems).toBe(((index + offset) % 5) + 1);
        expect(result.data).toHaveLength(((index + offset) % 5) + 1);
        expect(
          result.data.every(
            (row) => row.customerId === id(2000 + index + offset),
          ),
        ).toBe(true);
      }
    }
    expect(await fingerprint()).toEqual(before);
    expect(wire).not.toHaveBeenCalled();
  }, 120000);
  it('rejects invalid, duplicated and excessive filters before serving an inventory page', async () => {
    for (const query of [
      'page=0',
      'page=01',
      'page=1e2',
      'pageSize=101',
      'page=2147483647&pageSize=100',
      'customerId=bad',
      `customerId=${id(2000)}&customerId=${id(2001)}`,
      'page=1&page=2',
      'state=ACTIVE',
      'origin=TRANSFER',
      'search=' + 'a'.repeat(201),
      'register=true',
    ])
      await primary.get('/domains/inventory?' + query).expect(400);
  });
});
