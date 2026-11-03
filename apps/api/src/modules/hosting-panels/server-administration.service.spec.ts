import type { PrismaClient, Prisma } from '@webhost-billing/database';
import {
  createServerRequestSchema,
  updateServerRequestSchema,
} from '@webhost-billing/shared';
import type { AuthRequestContext } from '../auth/auth.types';
import type { SecurityRequestContext } from '../../common/http/request-context';
import { ServerAdministrationService } from './server-administration.service';
import { HostingPanelService } from './hosting-panel.service';
import { CpanelCredentialCipher } from './cpanel-credential-cipher';

const actor = {
  identity: { role: 'ADMIN', userId: 'fictional-admin' },
} as AuthRequestContext;
const context = { ipAddressHash: 'fictional-hash' } as SecurityRequestContext;
const record = {
  id: '90000000-0000-4000-8000-000000000001',
  name: 'Fictional node',
  hostname: 'node.example.test',
  port: 4085,
  status: 'DISABLED',
  adapterKey: 'virtualizor',
  useTls: true,
  apiUsername: null,
  credentialsCiphertext: 'encrypted',
  credentialKeyVersion: 'v1',
  maxAccounts: null,
  _count: { services: 0 },
};
function harness() {
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    server: {
      findFirst: jest.fn().mockResolvedValue(record),
      findMany: jest.fn().mockResolvedValue([record]),
      create: jest
        .fn<Promise<typeof record>, [Prisma.ServerCreateArgs]>()
        .mockResolvedValue(record),
      update: jest
        .fn<Promise<typeof record>, [Prisma.ServerUpdateArgs]>()
        .mockResolvedValue(record),
    },
    activityLog: { create: jest.fn().mockResolvedValue({}) },
    hostingPanelOperation: { count: jest.fn().mockResolvedValue(0) },
    service: { count: jest.fn().mockResolvedValue(0) },
  };
  const prisma = {
    ...tx,
    $transaction: (action: (transaction: typeof tx) => unknown) => action(tx),
  };
  const panels = {
    createServer: jest.fn().mockResolvedValue('cpanel'),
    listServers: jest.fn().mockResolvedValue([]),
    updateServer: jest.fn(),
    removeServer: jest.fn(),
  };
  const cipher = {
    keyVersion: 'v1',
    encrypt: jest.fn().mockReturnValue('encrypted'),
  };
  const service = new ServerAdministrationService(
    prisma as unknown as PrismaClient,
    panels as unknown as HostingPanelService,
    cipher as unknown as CpanelCredentialCipher,
  );
  return { service, tx, cipher, panels };
}
describe('Server administration', () => {
  it('encrypts both Virtualizor credentials, saves disabled and never serializes or audits secrets', async () => {
    const { service, cipher, tx } = harness();
    const input = createServerRequestSchema.parse({
      name: record.name,
      hostname: record.hostname,
      serverType: 'VIRTUALIZOR',
      credentials: { apiKey: 'fictional-key', apiPassword: 'fictional-pass' },
    });
    const result = await service.create(input, actor, context);
    expect(cipher.encrypt).toHaveBeenCalledWith(
      expect.any(String),
      JSON.stringify({
        apiKey: 'fictional-key',
        apiPassword: 'fictional-pass',
      }),
    );
    expect(tx.server.create.mock.calls[0]?.[0].data).toMatchObject({
      status: 'DISABLED',
      adapterKey: 'virtualizor',
      apiUsername: null,
    });
    expect(JSON.stringify(result)).not.toMatch(
      /fictional-key|fictional-pass|encrypted/,
    );
    expect(JSON.stringify(tx.activityLog.create.mock.calls)).not.toMatch(
      /fictional-key|fictional-pass|encrypted/,
    );
  });
  it('preserves existing cPanel creation through its original service', async () => {
    const { service, panels } = harness();
    const input = createServerRequestSchema.parse({
      name: 'Fictional WHM',
      hostname: 'whm.example.test',
      serverType: 'CPANEL',
      apiUsername: 'reseller',
      apiToken: 'FictionalTokenValue1234567890',
    });
    await service.create(input, actor, context);
    expect(panels.createServer).toHaveBeenCalledWith(
      expect.not.objectContaining({ serverType: 'CPANEL' }),
      actor,
      context,
    );
  });
  it('retains credentials on a name edit and keeps the provider disabled', async () => {
    const { service, tx, cipher } = harness();
    await service.update(
      record.id,
      updateServerRequestSchema.parse({
        serverType: 'VIRTUALIZOR',
        name: 'Renamed',
      }),
      actor,
      context,
    );
    expect(cipher.encrypt).not.toHaveBeenCalled();
    expect(tx.server.update.mock.calls[0]?.[0].data).toMatchObject({
      name: 'Renamed',
      status: 'DISABLED',
    });
    expect(tx.server.update.mock.calls[0]?.[0].data).not.toHaveProperty(
      'credentialsCiphertext',
    );
  });
  it('rejects provider changes, address changes without credentials, assigned services and unresolved operations', async () => {
    for (const scenario of ['type', 'address', 'assigned', 'unresolved']) {
      const { service, tx } = harness();
      if (scenario === 'assigned')
        tx.server.findFirst.mockResolvedValue({
          ...record,
          _count: { services: 1 },
        });
      if (scenario === 'unresolved')
        tx.hostingPanelOperation.count.mockResolvedValue(1);
      const input = updateServerRequestSchema.parse({
        serverType: scenario === 'type' ? 'VULTR' : 'VIRTUALIZOR',
        ...(scenario === 'address'
          ? { hostname: 'new.example.test' }
          : { name: 'Rename' }),
      });
      await expect(
        service.update(record.id, input, actor, context),
      ).rejects.toThrow();
      expect(tx.server.update).not.toHaveBeenCalled();
    }
  });
  it('soft-removes without deleting history and blocks outstanding services or operations', async () => {
    const { service, tx } = harness();
    await service.remove(record.id, actor, context);
    expect(tx.server.update.mock.calls[0]?.[0].data).toMatchObject({
      credentialsCiphertext: null,
      status: 'DISABLED',
    });
    expect(tx.server.update.mock.calls[0]?.[0].data.deletedAt).toBeInstanceOf(
      Date,
    );
    for (const kind of ['service', 'operation']) {
      const h = harness();
      if (kind === 'service') h.tx.service.count.mockResolvedValue(1);
      else h.tx.hostingPanelOperation.count.mockResolvedValue(1);
      await expect(
        h.service.remove(record.id, actor, context),
      ).rejects.toThrow();
      expect(h.tx.server.update).not.toHaveBeenCalled();
    }
  });
  it('denies non-administrators before reading or writing server data', async () => {
    const { service, tx } = harness();
    const customer = { identity: { role: 'CUSTOMER' } } as AuthRequestContext;
    await expect(service.list(customer)).rejects.toThrow();
    await expect(
      service.remove(record.id, customer, context),
    ).rejects.toThrow();
    expect(tx.server.findFirst).not.toHaveBeenCalled();
    expect(tx.server.findMany).not.toHaveBeenCalled();
  });
});
