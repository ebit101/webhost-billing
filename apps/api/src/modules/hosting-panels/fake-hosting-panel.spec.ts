import { FakeHostingPanel } from './fake-hosting-panel';
import {
  HostingPanelProviderError,
  normalizeHostingPanelError,
  withHostingPanelTimeout,
} from './hosting-panel.error';
import type { HostingPanelConnection } from './hosting-panel.interface';

const connection: HostingPanelConnection = {
  serverId: '40000000-0000-4000-8000-000000000001',
  hostname: 'fake-whm.example.test',
  port: 2087,
  useTls: true,
  apiUsername: null,
  credential: null,
};

describe('FakeHostingPanel', () => {
  let panel: FakeHostingPanel;

  beforeEach(() => {
    panel = new FakeHostingPanel();
  });

  it('supports the complete hosting-panel capability contract', async () => {
    const tested = await panel.testConnection(connection);
    expect(tested.capabilities).toContain('terminate');
    const created = await panel.createAccount(connection, {
      serviceReference: '40000000-0000-4000-8000-000000000002',
      domain: 'panel-account.example.test',
      packageIdentifier: 'starter_package',
      contactEmail: 'customer@example.test',
      idempotencyKey: 'create-account-one',
    });
    expect(created).toMatchObject({
      created: true,
      account: { state: 'ACTIVE', packageIdentifier: 'starter_package' },
    });
    const reference = {
      externalAccountId: created.account.externalAccountId,
      username: created.account.username,
      domain: created.account.domain,
      packageIdentifier: created.account.packageIdentifier,
    };
    expect((await panel.getAccount(connection, reference)).state).toBe(
      'ACTIVE',
    );
    expect(
      (await panel.suspendAccount(connection, reference, 'Test suspension'))
        .state,
    ).toBe('SUSPENDED');
    expect((await panel.unsuspendAccount(connection, reference)).state).toBe(
      'ACTIVE',
    );
    expect(
      (await panel.changePackage(connection, reference, 'business_package'))
        .packageIdentifier,
    ).toBe('business_package');
    expect(
      await panel.changePassword(
        connection,
        reference,
        'fake-secure-password-123',
      ),
    ).toMatchObject({ externalAccountId: reference.externalAccountId });
    expect((await panel.generateLoginUrl(connection, reference)).url).toMatch(
      /^https:\/\/fake-whm\.example\.test\/fake-login\//,
    );
    await panel.terminateAccount(connection, reference, 'Confirmed test');
    await expect(
      panel.getAccount(connection, reference),
    ).resolves.toMatchObject({ state: 'MISSING' });
  });

  it('replays duplicate provisioning without creating another account', async () => {
    const input = {
      serviceReference: '40000000-0000-4000-8000-000000000003',
      domain: 'duplicate.example.test',
      packageIdentifier: 'starter_package',
      contactEmail: 'customer@example.test',
      idempotencyKey: 'duplicate-create',
    };
    const first = await panel.createAccount(connection, input);
    const replay = await panel.createAccount(connection, input);
    expect(replay).toEqual({ account: first.account, created: false });
  });

  it('holds a conflicting existing domain for reconciliation', async () => {
    await panel.createAccount(connection, {
      serviceReference: 'service-a',
      domain: 'conflict.example.test',
      packageIdentifier: 'starter_package',
      contactEmail: 'a@example.test',
      idempotencyKey: 'domain-a',
    });
    await expect(
      panel.createAccount(connection, {
        serviceReference: 'service-b',
        domain: 'conflict.example.test',
        packageIdentifier: 'starter_package',
        contactEmail: 'b@example.test',
        idempotencyKey: 'domain-b',
      }),
    ).rejects.toMatchObject({
      kind: 'INCONSISTENT',
      code: 'PANEL_DOMAIN_ALREADY_EXISTS',
    });
  });

  it.each(['TEMPORARY', 'PERMANENT', 'INCONSISTENT'] as const)(
    'returns a normalized %s test failure',
    async (kind) => {
      panel.failNext(kind);
      await expect(panel.testConnection(connection)).rejects.toMatchObject({
        kind,
        code: 'FAKE_PANEL_FAILURE',
      });
    },
  );

  it('classifies read and uncertain mutation timeouts differently', async () => {
    const never = new Promise<never>(() => undefined);
    await expect(
      withHostingPanelTimeout(never, 5, false),
    ).rejects.toMatchObject({
      kind: 'TEMPORARY',
      code: 'PANEL_TIMEOUT',
    });
    await expect(withHostingPanelTimeout(never, 5, true)).rejects.toMatchObject(
      {
        kind: 'INCONSISTENT',
        code: 'PANEL_TIMEOUT',
      },
    );
  });

  it('redacts unknown provider errors instead of reflecting secrets', () => {
    const normalized = normalizeHostingPanelError(
      new Error('upstream response contained secret-token-value'),
      false,
    );
    expect(normalized).toBeInstanceOf(HostingPanelProviderError);
    expect(normalized.message).not.toContain('secret-token-value');
    expect(normalized).toMatchObject({
      kind: 'TEMPORARY',
      code: 'PANEL_TEMPORARILY_UNAVAILABLE',
    });
  });
});
