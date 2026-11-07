import type { PrismaClient } from '@webhost-billing/database';
import type { ApiEnvironment } from '@webhost-billing/config';
import type { RedisClient } from '../../infrastructure/redis/redis.module';
import type { AuthRequestContext } from '../auth/auth.types';
import type { HostingPanelRegistry } from '../hosting-panels/hosting-panel.registry';
import type { CpanelCredentialCipher } from '../hosting-panels/cpanel-credential-cipher';
import { ServiceUsageService } from './service-usage.service';

const id = '22200000-0000-4000-8000-000000000001';
const customerId = '22200000-0000-4000-8000-000000000002';
const customer: AuthRequestContext = {
  sessionId: 'fictional',
  identity: {
    role: 'CUSTOMER',
    userId: customerId,
    customerId,
    email: 'usage@example.test',
  },
};
const admin: AuthRequestContext = {
  sessionId: 'fictional-admin',
  identity: {
    role: 'ADMIN',
    userId: id,
    adminProfileId: id,
    staffRole: 'FULL_ADMINISTRATOR',
    twoFactorEnabled: true,
    email: 'admin@example.test',
  },
};
const sample = () => ({
  disk: { usedBytes: '100', limitBytes: '1000', limitKind: 'LIMITED' },
  bandwidth: null,
  bandwidthPeriod: new Date().toISOString().slice(0, 7),
});
function fixture() {
  const values = new Map<string, { value: string; until: number }>();
  const get = jest.fn((key: string) => {
    const v = values.get(key);
    return Promise.resolve(v && v.until > Date.now() ? v.value : null);
  });
  const set = jest.fn(
    (key: string, value: string, options: { NX?: boolean; EX: number }) => {
      const existing = values.get(key);
      if (options.NX && existing && existing.until > Date.now())
        return Promise.resolve(null);
      values.set(key, { value, until: Date.now() + options.EX * 1000 });
      return Promise.resolve('OK');
    },
  );
  const record = {
    id,
    customerId,
    serverId: id,
    status: 'ACTIVE',
    domain: 'usage.example.test',
    controlPanelUsername: 'fictional',
    externalAccountId: 'fake-account-fictional',
    currentPackageIdentifier: 'starter',
    server: {
      id,
      adapterKey: 'fake-panel',
      hostname: 'panel.example.test',
      port: 2087,
      useTls: true,
      apiUsername: null,
      credentialsCiphertext: null,
      credentialKeyVersion: null,
      updatedAt: new Date(),
      deletedAt: null,
      status: 'ACTIVE',
    },
  };
  const findFirst = jest.fn().mockResolvedValue(record);
  const getUsage = jest
    .fn()
    .mockImplementation(() => Promise.resolve(sample()));
  const registry = { get: jest.fn().mockReturnValue({ getUsage }) };
  const redis = { get, set };
  const environment = {
    NODE_ENV: 'test',
    HOSTING_PANEL_TIMEOUT_MS: 1000,
    AUTH_RATE_LIMIT_NAMESPACE: 'fictional222',
  } as ApiEnvironment;
  const cipher = { decrypt: jest.fn().mockReturnValue('fictional-only') };
  const makeService = () =>
    new ServiceUsageService(
      { service: { findFirst } } as unknown as PrismaClient,
      redis as unknown as RedisClient,
      environment,
      registry as unknown as HostingPanelRegistry,
      cipher as unknown as CpanelCredentialCipher,
    );
  return {
    service: makeService(),
    makeService,
    get,
    set,
    findFirst,
    getUsage,
    registry,
    environment,
    record,
    cipher,
    values,
  };
}
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});
describe('owned cached hosting usage', () => {
  it('shares cached customer/admin readings across instances without repeated provider calls', async () => {
    const f = fixture();
    const first = await f.service.get(id, customer);
    expect(first).toMatchObject({
      status: 'AVAILABLE',
      simulated: true,
      disk: { usedBytes: '100' },
      bandwidth: null,
    });
    expect(await f.makeService().get(id, admin, customerId)).toEqual(first);
    expect(f.getUsage).toHaveBeenCalledTimes(1);
    expect(f.findFirst).toHaveBeenLastCalledWith({
      where: { id, customerId },
      include: { server: true },
    });
    expect(JSON.stringify([...f.values])).not.toContain('credential');
  });
  it('authorizes before reading even a populated cache', async () => {
    const f = fixture();
    await f.service.get(id, customer);
    f.get.mockClear();
    f.findFirst.mockResolvedValue(null);
    await expect(f.service.get(id, customer)).rejects.toMatchObject({
      status: 404,
    });
    expect(f.get).not.toHaveBeenCalled();
    expect(f.getUsage).toHaveBeenCalledTimes(1);
  });
  it('rejects a mismatched customer context and restricted staff before provider/cache reads', async () => {
    const f = fixture();
    await expect(f.service.get(id, customer, id)).rejects.toMatchObject({
      status: 404,
    });
    await expect(
      f.service.get(id, {
        ...admin,
        identity: {
          ...admin.identity,
          role: 'ADMIN',
          staffRole: 'SUPPORT_OPERATOR',
          adminProfileId: id,
          twoFactorEnabled: true,
        },
      }),
    ).rejects.toMatchObject({ status: 403 });
    expect(f.get).not.toHaveBeenCalled();
    expect(f.getUsage).not.toHaveBeenCalled();
  });
  it('allows the same owned read in a read-only customer support session', async () => {
    const f = fixture();
    expect(
      (await f.service.get(id, { ...customer, supportAdministratorId: id }))
        .status,
    ).toBe('AVAILABLE');
  });
  it('retains the timestamp and values on provider failure, then enforces retry cooldown', async () => {
    jest.useFakeTimers();
    const f = fixture();
    const initial = await f.service.get(id, customer);
    jest.advanceTimersByTime(301000);
    f.getUsage.mockRejectedValue(new Error('fictional-secret'));
    const stale = await f.service.get(id, customer);
    expect(stale).toMatchObject({
      status: 'STALE',
      sampledAt: initial.sampledAt,
      disk: initial.disk,
    });
    expect(JSON.stringify(stale)).not.toContain('secret');
    await f.service.get(id, admin);
    expect(f.getUsage).toHaveBeenCalledTimes(2);
  });
  it('does not return last month bandwidth as current or retain samples beyond a day', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-11-30T23:59:00Z'));
    const f = fixture();
    await f.service.get(id, customer);
    jest.advanceTimersByTime(120000);
    f.getUsage.mockRejectedValue(new Error('offline'));
    expect(await f.service.get(id, customer)).toMatchObject({
      status: 'UNAVAILABLE',
      disk: null,
      bandwidthPeriod: '2026-12',
    });
    jest.advanceTimersByTime(86400001);
    expect((await f.service.get(id, customer)).status).toBe('UNAVAILABLE');
  });
  it('returns unavailable, never zero, when initial provider or Redis access fails', async () => {
    const f = fixture();
    f.getUsage.mockRejectedValue(new Error('private'));
    expect(await f.service.get(id, customer)).toMatchObject({
      status: 'UNAVAILABLE',
      disk: null,
      bandwidth: null,
      sampledAt: null,
    });
    const other = fixture();
    other.get.mockRejectedValue(new Error('redis down'));
    expect((await other.service.get(id, customer)).status).toBe('UNAVAILABLE');
    expect(other.getUsage).not.toHaveBeenCalled();
  });
  it('deduplicates concurrent reads across API instances with a shared lease', async () => {
    const f = fixture();
    let release!: (value: ReturnType<typeof sample>) => void;
    f.getUsage.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const first = f.service.get(id, customer);
    while (!release) await Promise.resolve();
    expect((await f.makeService().get(id, admin)).status).toBe('UNAVAILABLE');
    release(sample());
    expect((await first).status).toBe('AVAILABLE');
    expect(f.getUsage).toHaveBeenCalledTimes(1);
  });
  it('caps concurrent account reads at four per API process', async () => {
    const f = fixture();
    const releases: ((value: ReturnType<typeof sample>) => void)[] = [];
    f.getUsage.mockImplementation(
      () =>
        new Promise((resolve) => {
          releases.push(resolve);
        }),
    );
    const pending = Array.from({ length: 5 }, (_, index) =>
      f.service.get(`22200000-0000-4000-8000-00000000000${index + 1}`, admin),
    );
    while (releases.length < 4) await Promise.resolve();
    releases.forEach((release) => release(sample()));
    const results = await Promise.all(pending);
    expect(
      results.filter((result) => result.status === 'AVAILABLE'),
    ).toHaveLength(4);
    expect(f.getUsage).toHaveBeenCalledTimes(4);
  });
  it('times out a stalled read and prevents immediate replacement calls', async () => {
    jest.useFakeTimers();
    const f = fixture();
    f.getUsage.mockReturnValue(new Promise(() => {}));
    const pending = f.service.get(id, customer);
    await jest.advanceTimersByTimeAsync(2600);
    expect((await pending).status).toBe('UNAVAILABLE');
    await f.service.get(id, admin);
    expect(f.getUsage).toHaveBeenCalledTimes(1);
  });
  it('invalidates cache on mapping changes and refuses a changed in-flight binding', async () => {
    const f = fixture();
    await f.service.get(id, customer);
    f.record.controlPanelUsername = 'changed';
    f.getUsage.mockImplementation(() => {
      f.record.domain = 'reassigned.example.test';
      return Promise.resolve(sample());
    });
    expect(await f.service.get(id, customer)).toMatchObject({
      status: 'NOT_READY',
      disk: null,
    });
    expect(f.getUsage).toHaveBeenCalledTimes(2);
  });
  it('rechecks ownership after the provider finishes and publishes no transferred data', async () => {
    const f = fixture();
    f.findFirst.mockResolvedValueOnce(f.record).mockResolvedValueOnce(null);
    await expect(f.service.get(id, customer)).rejects.toMatchObject({
      status: 404,
    });
    expect(
      [...f.values.keys()].filter((key) => !key.endsWith(':attempt')),
    ).toHaveLength(0);
  });
  it.each(['PENDING', 'PROVISION_FAILED', 'CANCELLED', 'TERMINATED'])(
    'does not read unready lifecycle %s',
    async (status) => {
      const f = fixture();
      f.record.status = status;
      expect((await f.service.get(id, customer)).status).toBe('NOT_READY');
      expect(f.getUsage).not.toHaveBeenCalled();
    },
  );
  it('does not use unsupported adapters or a fake adapter in production', async () => {
    const f = fixture();
    f.record.server.adapterKey = 'virtualizor';
    expect((await f.service.get(id, customer)).status).toBe('UNSUPPORTED');
    f.record.server.adapterKey = 'fake-panel';
    f.environment.NODE_ENV = 'production';
    expect((await f.service.get(id, customer)).status).toBe('UNSUPPORTED');
    expect(f.getUsage).not.toHaveBeenCalled();
  });
});
