import { createHash } from 'node:crypto';
import type { HostingAccount } from '@webhost-billing/shared';
import type {
  CpanelWhmHttpClient,
  WhmApiEnvelope,
} from './cpanel-whm-http.client';
import { CpanelWhmHostingPanel } from './cpanel-whm.hosting-panel';
import type {
  HostingAccountReference,
  HostingPanelConnection,
} from './hosting-panel.interface';

const connection: HostingPanelConnection = {
  serverId: '10000000-0000-4000-8000-000000000001',
  hostname: 'whm.example.test',
  port: 2087,
  useTls: true,
  apiUsername: 'reseller',
  credential: 'T'.repeat(40),
};

const reference: HostingAccountReference = {
  externalAccountId: 'w1234567890abcde',
  username: 'w1234567890abcde',
  domain: 'site.example.test',
  packageIdentifier: 'starter_plan',
};

function response(
  data: unknown,
  command = 'test',
  result: 0 | 1 = 1,
  reason = 'OK',
): WhmApiEnvelope {
  return { data, metadata: { command, result, reason, version: 1 } };
}

function summary(
  username = reference.username,
  domain = reference.domain,
  plan = reference.packageIdentifier,
  suspended: 0 | 1 = 0,
): WhmApiEnvelope {
  return response(
    { acct: [{ user: username, domain, plan, suspended }] },
    'accountsummary',
  );
}

function missing(): WhmApiEnvelope {
  return response(undefined, 'accountsummary', 0, 'Account does not exist');
}

function setup() {
  const call = jest.fn();
  const panel = new CpanelWhmHostingPanel({
    call,
  } as unknown as CpanelWhmHttpClient);
  return { call, panel };
}

describe('CpanelWhmHostingPanel', () => {
  it('tests the WHM API 1 connection and reports exact capabilities', async () => {
    const { call, panel } = setup();
    call.mockResolvedValueOnce(
      response({ users: 12 }, 'get_current_users_count'),
    );

    const result = await panel.testConnection(connection);
    expect(result.providerVersion).toBe('WHM API 1');
    for (const capability of [
      'createacct',
      'accountsummary',
      'create_user_session',
      'removeacct',
    ]) {
      expect(result.capabilities).toContain(capability);
    }
    expect(call).toHaveBeenCalledWith(
      connection,
      'get_current_users_count',
      {},
      false,
    );
  });

  it('creates an account with a deterministic safe username and verifies it', async () => {
    const { call, panel } = setup();
    const serviceReference = '10000000-0000-4000-8000-000000000099';
    const username = `w${createHash('sha256').update(serviceReference).digest('hex').slice(0, 15)}`;
    call
      .mockResolvedValueOnce(missing())
      .mockResolvedValueOnce(missing())
      .mockResolvedValueOnce(response({}, 'createacct'))
      .mockResolvedValueOnce(
        summary(username, 'new.example.test', 'starter_plan'),
      );

    const result = await panel.createAccount(connection, {
      serviceReference,
      domain: 'new.example.test',
      packageIdentifier: 'starter_plan',
      contactEmail: 'owner@example.test',
      idempotencyKey: 'local-ledger-key',
    });

    expect(result.created).toBe(true);
    expect(result.account.username).toBe(username);
    expect(username).toMatch(/^[a-z][a-z0-9]{15}$/);
    expect(call).toHaveBeenNthCalledWith(
      3,
      connection,
      'createacct',
      {
        username,
        domain: 'new.example.test',
        plan: 'starter_plan',
        contactemail: 'owner@example.test',
        showpass: 'n',
      },
      true,
    );
  });

  it('returns an exact existing account as an idempotent create replay', async () => {
    const { call, panel } = setup();
    const serviceReference = '10000000-0000-4000-8000-000000000099';
    const username = `w${createHash('sha256').update(serviceReference).digest('hex').slice(0, 15)}`;
    call.mockResolvedValueOnce(
      summary(username, 'new.example.test', 'starter_plan'),
    );

    await expect(
      panel.createAccount(connection, {
        serviceReference,
        domain: 'new.example.test',
        packageIdentifier: 'starter_plan',
        contactEmail: 'owner@example.test',
        idempotencyKey: 'local-ledger-key',
      }),
    ).resolves.toMatchObject({ created: false });
    expect(call).toHaveBeenCalledTimes(1);
  });

  it('holds conflicting pre-existing account identity for reconciliation', async () => {
    const { call, panel } = setup();
    call.mockResolvedValueOnce(
      summary('anotheruser', 'other.example.test', 'other_plan'),
    );

    await expect(
      panel.createAccount(connection, {
        serviceReference: '10000000-0000-4000-8000-000000000099',
        domain: 'new.example.test',
        packageIdentifier: 'starter_plan',
        contactEmail: 'owner@example.test',
        idempotencyKey: 'local-ledger-key',
      }),
    ).rejects.toMatchObject({
      kind: 'INCONSISTENT',
      code: 'CPANEL_ACCOUNT_INCONSISTENT',
    });
  });

  it('maps account state and every supported non-destructive mutation', async () => {
    const { call, panel } = setup();
    call.mockResolvedValueOnce(summary(undefined, undefined, undefined, 1));
    await expect(
      panel.getAccount(connection, reference),
    ).resolves.toMatchObject({
      state: 'SUSPENDED',
    });

    const operations: Array<{
      run: () => Promise<HostingAccount>;
      functionName: string;
      state?: HostingAccount['state'];
      packageIdentifier?: string;
    }> = [
      {
        functionName: 'suspendacct',
        state: 'SUSPENDED',
        run: () => panel.suspendAccount(connection, reference, 'Non-payment'),
      },
      {
        functionName: 'unsuspendacct',
        state: 'ACTIVE',
        run: () => panel.unsuspendAccount(connection, reference),
      },
      {
        functionName: 'changepackage',
        packageIdentifier: 'business_plan',
        run: () => panel.changePackage(connection, reference, 'business_plan'),
      },
      {
        functionName: 'passwd',
        run: () =>
          panel.changePassword(
            connection,
            reference,
            'Fictional-Password-2026!',
          ),
      },
    ];
    for (const operation of operations) {
      call
        .mockResolvedValueOnce(response({}, operation.functionName))
        .mockResolvedValueOnce(
          summary(
            reference.username,
            reference.domain,
            operation.packageIdentifier ?? reference.packageIdentifier,
            operation.state === 'SUSPENDED' ? 1 : 0,
          ),
        );
      const account = await operation.run();
      if (operation.state) expect(account.state).toBe(operation.state);
      if (operation.packageIdentifier) {
        expect(account.packageIdentifier).toBe(operation.packageIdentifier);
      }
    }
    expect(call).toHaveBeenCalledWith(
      connection,
      'passwd',
      {
        user: reference.username,
        password: 'Fictional-Password-2026!',
        db_pass_update: '0',
      },
      true,
    );
  });

  it('creates only an HTTPS temporary session for the expected hostname', async () => {
    const { call, panel } = setup();
    call.mockResolvedValueOnce(
      response(
        {
          expires: 1_800_000_000,
          service: 'cpaneld',
          url: 'https://whm.example.test:2083/cpsess123/login/?session=fake',
        },
        'create_user_session',
      ),
    );
    const login = await panel.generateLoginUrl(connection, reference);
    expect(login.url).toContain('https://whm.example.test:2083/');
    expect(login.expiresAt.toISOString()).toBe('2027-01-15T08:00:00.000Z');

    call.mockResolvedValueOnce(
      response(
        {
          expires: 1_800_000_000,
          service: 'cpaneld',
          url: 'https://attacker.example.test/cpsess123/login/?session=fake',
        },
        'create_user_session',
      ),
    );
    await expect(
      panel.generateLoginUrl(connection, reference),
    ).rejects.toMatchObject({ kind: 'INCONSISTENT' });
  });

  it('verifies that a terminated account is absent', async () => {
    const { call, panel } = setup();
    call
      .mockResolvedValueOnce(response({}, 'removeacct'))
      .mockResolvedValueOnce(missing());

    await expect(
      panel.terminateAccount(connection, reference, 'Confirmed closure'),
    ).resolves.toBeUndefined();
    expect(call).toHaveBeenNthCalledWith(
      1,
      connection,
      'removeacct',
      { user: reference.username },
      true,
    );
  });

  it('returns MISSING safely and normalizes rejected or malformed reads', async () => {
    const { call, panel } = setup();
    call.mockResolvedValueOnce(missing());
    await expect(
      panel.getAccount(connection, reference),
    ).resolves.toMatchObject({
      state: 'MISSING',
    });

    call.mockResolvedValueOnce(
      response(undefined, 'accountsummary', 0, 'Denied'),
    );
    await expect(panel.getAccount(connection, reference)).rejects.toMatchObject(
      {
        kind: 'TEMPORARY',
        code: 'CPANEL_OPERATION_REJECTED',
      },
    );

    call.mockResolvedValueOnce(response({ unsafe: true }, 'accountsummary'));
    await expect(panel.getAccount(connection, reference)).rejects.toMatchObject(
      {
        kind: 'TEMPORARY',
        code: 'CPANEL_RESPONSE_INVALID',
      },
    );
  });
});
