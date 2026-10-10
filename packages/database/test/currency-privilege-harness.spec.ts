import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  approvedImage,
  harnessLimits,
  isolatedEnvironment,
  verifyEndpoint,
  verifyImage,
  verifyResources,
  verifyContainer,
  verifyNetwork,
  withCurrencyPrivilegeHarness,
  HarnessFailure,
  HarnessSqlFailure,
  type HarnessDependencies,
  type ConnectionTarget,
} from './currency-privilege-harness';
import { loadPinnedMigrations } from './currency-privilege-harness.fixtures';

const nonce = 'a'.repeat(32);
const cid = 'b'.repeat(64);
const nid = 'c'.repeat(64);
const img = `sha256:${'d'.repeat(64)}`;
const sentinel = 'sentinel_credential_do_not_disclose';
const labels = {
  'bd.speedhost.currency-privilege-test': '106',
  'bd.speedhost.currency-privilege-test.nonce': nonce,
};
const owned = {
  nonce,
  name: `c106-${nonce}`,
  image: img,
  networkName: `c106-net-${nonce}`,
  networkId: nid,
  containerId: cid,
};
const context = {
  Name: 'desktop-linux',
  Endpoints: { docker: { Host: 'npipe:////./pipe/dockerDesktopLinuxEngine' } },
};
const image = {
  Id: img,
  RepoDigests: [approvedImage.digest],
  Os: 'linux',
  Architecture: 'amd64',
  Config: { Volumes: { [approvedImage.dataTarget]: {} } },
};
function container() {
  return {
    Id: cid,
    Name: `/${owned.name}`,
    Image: img,
    Labels: { ...labels },
    Status: 'running',
    Host: {
      Privileged: false,
      NetworkMode: owned.networkName,
      Memory: harnessLimits.memory,
      MemorySwap: harnessLimits.memory,
      NanoCpus: 1e9,
      ShmSize: harnessLimits.shm,
      PidsLimit: harnessLimits.pids,
      RestartPolicy: { Name: 'no' },
      LogConfig: {
        Type: 'none',
        Config: {},
      },
      Binds: null,
      SecurityOpt: ['no-new-privileges:true'],
      Mounts: [
        {
          Type: 'tmpfs',
          Target: String(approvedImage.dataTarget),
          TmpfsOptions: { SizeBytes: harnessLimits.data },
        },
      ],
      PortBindings: { '5432/tcp': [{ HostIp: '127.0.0.1', HostPort: '' }] },
    },
    Mounts: [],
    Ports: { '5432/tcp': [{ HostIp: '127.0.0.1', HostPort: '49152' }] },
    Networks: { [owned.networkName]: { IPAddress: '172.30.0.2' } },
  };
}
function network(attached: boolean) {
  return {
    Id: nid,
    Name: owned.networkName,
    Driver: 'bridge',
    Internal: false,
    Options: {
      'com.docker.network.bridge.enable_ip_masquerade': 'false',
      'com.docker.network.bridge.host_binding_ipv4': '127.0.0.1',
    },
    Labels: { ...labels },
    Containers: attached ? { [cid]: {} } : {},
  };
}
function fake() {
  const calls: string[][] = [];
  const targets: ConnectionTarget[] = [];
  const environments: NodeJS.ProcessEnv[] = [];
  const inputs: (string | undefined)[] = [];
  let attached = false;
  let sequence = 0;
  let ended = 0;
  let marker = nonce;
  let changeContainer: ((v: ReturnType<typeof container>) => void) | undefined;
  let changeNetwork: ((v: ReturnType<typeof network>) => void) | undefined;
  let failCommand: string | undefined;
  let hangCommand: string | undefined;
  let closeHangs = false;
  const deps: HarnessDependencies = {
    nonce: () => nonce,
    secret: () => `${String(++sequence).padStart(2, '0')}${'x'.repeat(41)}`,
    freeMemory: () => 2 * 1024 ** 3,
    freeDisk: () => BigInt(2 * 1024 ** 3),
    environment: {
      PATH: 'test-path',
      DATABASE_URL: sentinel,
      PGPASSWORD: sentinel,
      OPENAI_API_KEY: sentinel,
      NODE_OPTIONS: sentinel,
    },
    async command(args, env, _signal, input) {
      const a = args[0] === '--context' ? args.slice(2) : args;
      calls.push(a);
      environments.push(env);
      inputs.push(input);
      const command = a.slice(0, 2).join(' ');
      if (command === failCommand) throw new Error(sentinel);
      if (command === hangCommand) return new Promise<string>(() => undefined);
      if (command === 'context show') return 'desktop-linux';
      if (command === 'context inspect') return JSON.stringify([context]);
      if (command === 'image inspect') return JSON.stringify(image);
      if (a[0] === 'info')
        return JSON.stringify({
          OSType: 'linux',
          MemTotal: 4 * 1024 ** 3,
          NCPU: 2,
          ServerVersion: '28.0.0',
        });
      if (a[0] === 'stats') return '128MiB / 4GiB';
      if (command === 'network create') return nid;
      if (command === 'network inspect') {
        const v = network(attached);
        changeNetwork?.(v);
        return JSON.stringify(v);
      }
      if (command === 'container create') {
        attached = true;
        return cid;
      }
      if (command === 'container inspect') {
        const v = container();
        changeContainer?.(v);
        return JSON.stringify(v);
      }
      if (command === 'container start') return cid;
      if (command === 'container exec') return '';
      if (command === 'container rm') {
        attached = false;
        return cid;
      }
      if (command === 'network rm') return nid;
      throw new Error(sentinel);
    },
    async open(target) {
      targets.push(target);
      return {
        async query(sql) {
          if (sql.includes('current_database() AS database'))
            return {
              rows: [
                {
                  database: `c106_${nonce}`,
                  actor: `c106_${nonce}_bootstrap`,
                  owner: `c106_${nonce}_bootstrap`,
                  version: '180006',
                  data: `${approvedImage.dataTarget}/18/docker`,
                  address: '172.30.0.2',
                  port: 5432,
                },
              ],
              rowCount: 1,
            };
          if (sql.startsWith('SELECT owner FROM'))
            return { rows: [{ owner: marker }], rowCount: 1 };
          if (sql.startsWith('SELECT pg_catalog.shobj_description'))
            return { rows: [{ marker: `c106:${nonce}` }], rowCount: 1 };
          return { rows: [], rowCount: null };
        },
        async end() {
          if (closeHangs && target.user.endsWith('_business'))
            return new Promise<void>(() => undefined);
          ended++;
        },
      };
    },
  };
  return {
    deps,
    calls,
    targets,
    environments,
    inputs,
    get ended() {
      return ended;
    },
    fail: (v: string) => {
      failCommand = v;
    },
    hang: (v: string) => {
      hangCommand = v;
    },
    marker: (v: string) => {
      marker = v;
    },
    container: (f: typeof changeContainer) => {
      changeContainer = f;
    },
    network: (f: typeof changeNetwork) => {
      changeNetwork = f;
    },
    hangingClose: () => {
      closeHangs = true;
    },
  };
}
async function safeRefusal(body: () => Promise<void>, code: string) {
  await assert.rejects(body(), (e) => {
    assert.ok(e instanceof HarnessFailure);
    assert.equal(e.code, code);
    assert.equal(e.message.includes(sentinel), false);
    assert.equal('cause' in e, false);
    assert.equal(JSON.stringify(e).includes(sentinel), false);
    return true;
  });
}

test('test-only mandatory wiring retains every prior gate and has no runtime export/consumer', () => {
  const pkg = JSON.parse(
    readFileSync(resolve(__dirname, '../package.json'), 'utf8'),
  );
  assert.ok(
    pkg.scripts['test:unit'].includes('currency-privilege-harness.spec.ts'),
  );
  assert.equal(
    pkg.scripts.test,
    'pnpm test:unit && pnpm test:privileges && pnpm --filter @webhost-billing/web exec tsx e2e/run-database-tests.ts',
  );
  assert.ok(
    pkg.scripts['test:privileges'].includes(
      'currency-privilege-harness.integration.spec.ts',
    ),
  );
  assert.equal(
    Object.keys(pkg.exports).some((k) => k.includes('privilege')),
    false,
  );
  const ci = readFileSync(
    resolve(__dirname, '../../../.github/workflows/ci.yml'),
    'utf8',
  );
  assert.match(ci, /name: Run package tests\s+run: pnpm test/);
  assert.ok(
    ci.includes(
      `run: docker pull --platform linux/amd64 ${approvedImage.digest}`,
    ),
  );
  assert.ok(
    ci.indexOf(
      `run: docker pull --platform linux/amd64 ${approvedImage.digest}`,
    ) < ci.indexOf('name: Run package tests'),
  );
  const source = readFileSync(
    resolve(__dirname, 'currency-privilege-harness.ts'),
    'utf8',
  );
  assert.doesNotMatch(
    source,
    /from ['"]dotenv|require\(['"]dotenv|stdio:\s*['"]inherit['"]|shell:\s*true|console\.(?:log|error)/,
  );
});
test('canonical content pins retain all 25 original migrations and pin the inert identity addition without rewriting raw bytes', () => {
  const a = loadPinnedMigrations();
  const b = loadPinnedMigrations();
  assert.equal(a.length, 26);
  assert.equal(a[24]?.name, '20261008090000_unselected_currency_control');
  assert.equal(a[25]?.name, '20261010090000_inert_currency_identity');
  assert.deepEqual(a, b);
});
test('child environment discards ambient database/provider/debug credentials and Docker redirects', () => {
  assert.deepEqual(
    isolatedEnvironment({
      PATH: 'safe',
      DATABASE_URL: sentinel,
      PGPASSWORD: sentinel,
      PGHOST: sentinel,
      DOCKER_HOST: sentinel,
      NODE_OPTIONS: sentinel,
      SECRET: sentinel,
    }),
    { PATH: 'safe' },
  );
});
test('only verified local Unix/Windows Docker endpoints and approved immutable cache identity pass', () => {
  assert.equal(verifyEndpoint(context), 'desktop-linux');
  assert.equal(
    verifyEndpoint({
      Name: 'default',
      Endpoints: { docker: { Host: 'unix:///var/run/docker.sock' } },
    }),
    'default',
  );
  for (const host of [
    'tcp://127.0.0.1:2375',
    'ssh://remote',
    'unix:///unverified.sock',
    sentinel,
  ])
    assert.throws(
      () =>
        verifyEndpoint({
          Name: 'default',
          Endpoints: { docker: { Host: host } },
        }),
      HarnessFailure,
    );
  assert.equal(verifyImage(image), img);
  for (const bad of [
    { ...image, RepoDigests: [] },
    { ...image, Architecture: 'arm64' },
    { ...image, Os: 'windows' },
    { ...image, Config: { Volumes: { '/existing-data': {} } } },
  ])
    assert.throws(() => verifyImage(bad), HarnessFailure);
});
test('insufficient host/daemon/disk resources deny without an automatic limit increase', () => {
  const info = {
    OSType: 'linux',
    MemTotal: 4 * 1024 ** 3,
    NCPU: 1,
    ServerVersion: '28.0.0',
  };
  verifyResources(info, '', 1024 ** 3, BigInt(1024 ** 3));
  for (const run of [
    () => verifyResources(info, '', 1, BigInt(1024 ** 3)),
    () => verifyResources(info, '3.5GiB / 4GiB', 1024 ** 3, BigInt(1024 ** 3)),
    () => verifyResources(info, '', 1024 ** 3, 1n),
    () => verifyResources(info, sentinel, 1024 ** 3, BigInt(1024 ** 3)),
  ])
    assert.throws(run, HarnessFailure);
});
test('foreign IDs/labels/mounts/shared networks/public ports and unexpected limits refuse ownership', () => {
  assert.deepEqual(verifyContainer(container(), owned, true), {
    port: 49152,
    address: '172.30.0.2',
  });
  const corruptions: ((v: ReturnType<typeof container>) => void)[] = [
    (v) => {
      v.Id = 'e'.repeat(64);
    },
    (v) => {
      v.Labels['bd.speedhost.currency-privilege-test.nonce'] = 'e'.repeat(32);
    },
    (v) => {
      v.Host.Privileged = true;
    },
    (v) => {
      v.Host.NetworkMode = 'bridge';
    },
    (v) => {
      v.Host.Memory *= 2;
    },
    (v) => {
      v.Host.Mounts[0].Type = 'volume';
    },
    (v) => {
      v.Host.Mounts[0].Target = '/existing-data';
    },
    (v) => {
      v.Ports['5432/tcp'][0].HostIp = '0.0.0.0';
    },
    (v) => {
      v.Ports['5432/tcp'][0].HostPort = '5432;rm';
    },
    (v) => {
      v.Host.PortBindings['5432/tcp'][0].HostIp = '0.0.0.0';
    },
  ];
  for (const corrupt of corruptions) {
    const v = container();
    corrupt(v);
    assert.throws(() => verifyContainer(v, owned, true), HarnessFailure);
  }
  verifyNetwork(network(false), owned, null);
  assert.throws(
    () => verifyNetwork(network(true), owned, null),
    HarnessFailure,
  );
  assert.throws(
    () => verifyNetwork({ ...network(false), Id: 'e'.repeat(64) }, owned, null),
    HarnessFailure,
  );
});
test('missing Docker/cache and inherited Docker redirection fail before any resource creation, without secret disclosure', async () => {
  for (const command of ['context show', 'image inspect']) {
    const f = fake();
    f.fail(command);
    await safeRefusal(
      () => withCurrencyPrivilegeHarness(async () => undefined, f.deps),
      'DOCKER',
    );
    assert.equal(
      f.calls.some((c) => c[1] === 'create'),
      false,
    );
  }
  const f = fake();
  f.deps.environment.DOCKER_HOST = sentinel;
  await safeRefusal(
    () => withCurrencyPrivilegeHarness(async () => undefined, f.deps),
    'PREFLIGHT',
  );
  assert.equal(f.calls.length, 0);
});
test('fresh-loopback target, private network/tmpfs and independent credentials are derived, never inherited', async () => {
  const f = fake();
  await withCurrencyPrivilegeHarness(async (h) => {
    await h.installLogins();
    await (await h.connect('business')).end();
  }, f.deps);
  assert.equal(
    f.calls.find((c) => c[0] === 'image' && c[1] === 'inspect')?.[2],
    approvedImage.digest,
  );
  const create = f.calls.find(
    (c) => c[0] === 'container' && c[1] === 'create',
  )!;
  assert.ok(create.includes('--pull=never'));
  assert.ok(create.includes('none'));
  assert.equal(create.includes('--log-opt'), false);
  assert.ok(create.includes(img));
  assert.ok(create.includes('127.0.0.1::5432'));
  assert.ok(
    create.includes(
      `type=tmpfs,destination=${approvedImage.dataTarget},tmpfs-size=${harnessLimits.data},tmpfs-mode=1777`,
    ),
  );
  assert.equal(
    create.some((v) => v.includes(sentinel)),
    false,
  );
  assert.ok(
    f.targets.every(
      (t) =>
        t.host === '127.0.0.1' &&
        t.port === 49152 &&
        t.database === `c106_${nonce}` &&
        t.ssl === false &&
        t.password !== sentinel,
    ),
  );
  assert.equal(
    f.environments.some(
      (e) =>
        e.DATABASE_URL || e.PGPASSWORD || e.OPENAI_API_KEY || e.NODE_OPTIONS,
    ),
    false,
  );
  const bootstrapPassword = f.targets.find((t) =>
    t.user.endsWith('_bootstrap'),
  )!.password;
  assert.equal(f.inputs.filter((v) => v !== undefined).length, 1);
  assert.ok(f.inputs.includes(bootstrapPassword));
  assert.equal(
    f.calls.flat().some((v) => v.includes(bootstrapPassword)),
    false,
  );
  assert.equal(
    JSON.stringify(f.environments).includes(bootstrapPassword),
    false,
  );
  assert.ok(create.includes('POSTGRES_PASSWORD_FILE'));
  assert.equal(create.includes('POSTGRES_PASSWORD'), false);
  assert.deepEqual(
    f.calls.filter((c) => c[1] === 'rm').map((c) => c.slice(0, 3)),
    [
      ['container', 'rm', '--force'],
      ['network', 'rm', nid],
    ],
  );
  assert.ok(f.ended > 0);
});
test('readiness and foreign server identity fail closed before migrations or role installation', async () => {
  const f = fake();
  f.deps.deadlines = { readinessMs: 25 };
  f.deps.open = async () => {
    throw new Error(sentinel);
  };
  await safeRefusal(
    () =>
      withCurrencyPrivilegeHarness(async () => {
        assert.fail('Must not reach acceptance');
      }, f.deps),
    'STARTUP',
  );
  assert.deepEqual(
    f.calls.filter((c) => c[1] === 'rm').map((c) => c.at(-1)),
    [cid, nid],
  );
  for (const field of [
    'database',
    'actor',
    'owner',
    'version',
    'data',
    'address',
    'port',
  ]) {
    const g = fake();
    const open = g.deps.open;
    g.deps.open = async (target) => {
      const client = await open(target);
      const query = client.query.bind(client);
      client.query = async (sql, values) => {
        const result = await query(sql, values);
        if (sql.includes('current_database() AS database'))
          result.rows[0]![field] = sentinel;
        return result;
      };
      return client;
    };
    await safeRefusal(
      () =>
        withCurrencyPrivilegeHarness(async () => {
          assert.fail('Must not reach acceptance');
        }, g.deps),
      'OWNERSHIP',
    );
    assert.deepEqual(
      g.calls.filter((c) => c[1] === 'rm').map((c) => c.at(-1)),
      [cid, nid],
    );
  }
});
test('startup, migration and acceptance failures close clients and clean only returned owned IDs', async () => {
  const startup = fake();
  startup.fail('container start');
  await safeRefusal(
    () => withCurrencyPrivilegeHarness(async () => undefined, startup.deps),
    'DOCKER',
  );
  assert.deepEqual(
    startup.calls.filter((c) => c[1] === 'rm').map((c) => c.at(-1)),
    [cid, nid],
  );
  for (const phase of ['migration', 'acceptance']) {
    const f = fake();
    await safeRefusal(
      () =>
        withCurrencyPrivilegeHarness(async (h) => {
          const c = await h.connect('bootstrap');
          await c.query(`SELECT '${phase}'`);
          throw new Error(sentinel);
        }, f.deps),
      'ACCEPTANCE',
    );
    assert.deepEqual(
      f.calls.filter((c) => c[1] === 'rm').map((c) => c.at(-1)),
      [cid, nid],
    );
  }
});
test('foreign database marker or changed cleanup manifest denies removal and reports only exact safe IDs', async () => {
  for (const changed of ['marker', 'container', 'network']) {
    const f = fake();
    await safeRefusal(
      () =>
        withCurrencyPrivilegeHarness(async () => {
          if (changed === 'marker') f.marker('foreign');
          if (changed === 'container')
            f.container((v) => {
              v.Labels['bd.speedhost.currency-privilege-test.nonce'] =
                'foreign';
            });
          if (changed === 'network')
            f.network((v) => {
              v.Labels['bd.speedhost.currency-privilege-test.nonce'] =
                'foreign';
            });
        }, f.deps),
      'CLEANUP',
    );
    assert.equal(
      f.calls.some((c) => c[1] === 'rm'),
      false,
    );
  }
});
test('whole-run deadline interrupts pending test/child work, releases owned resources and does not retry', async () => {
  for (const stage of ['body', 'child']) {
    const f = fake();
    f.deps.deadlines = { wholeRunMs: 25 };
    if (stage === 'child') f.hang('container start');
    await safeRefusal(
      () =>
        withCurrencyPrivilegeHarness(
          async () => new Promise<void>(() => undefined),
          f.deps,
        ),
      'DEADLINE',
    );
    assert.deepEqual(
      f.calls.filter((c) => c[1] === 'rm').map((c) => c.at(-1)),
      [cid, nid],
    );
    assert.equal(
      f.calls.filter((c) => c[0] === 'container' && c[1] === 'create').length,
      1,
    );
  }
});
test('interruption cleans the newly owned run; excessive deadline overrides and concurrent reuse deny', async () => {
  const f = fake();
  const stop = new AbortController();
  await safeRefusal(
    () =>
      withCurrencyPrivilegeHarness(
        async () => {
          stop.abort();
        },
        f.deps,
        stop.signal,
      ),
    'INTERRUPTED',
  );
  assert.deepEqual(
    f.calls.filter((c) => c[1] === 'rm').map((c) => c.at(-1)),
    [cid, nid],
  );
  const g = fake();
  g.deps.deadlines = { wholeRunMs: harnessLimits.wholeRunMs + 1 };
  await safeRefusal(
    () => withCurrencyPrivilegeHarness(async () => undefined, g.deps),
    'PREFLIGHT',
  );
  assert.equal(g.calls.length, 0);
  const h = fake();
  await withCurrencyPrivilegeHarness(async () => {
    await safeRefusal(
      () => withCurrencyPrivilegeHarness(async () => undefined, fake().deps),
      'PREFLIGHT',
    );
  }, h.deps);
});
test('cleanup command failure or hanging client closure fails the gate within its independent bound', async () => {
  const f = fake();
  f.fail('container rm');
  await safeRefusal(
    () => withCurrencyPrivilegeHarness(async () => undefined, f.deps),
    'CLEANUP',
  );
  assert.equal(
    f.calls.some((c) => c[0] === 'network' && c[1] === 'rm'),
    false,
  );
  const g = fake();
  g.deps.deadlines = { cleanupMs: 25 };
  await safeRefusal(
    () =>
      withCurrencyPrivilegeHarness(async (h) => {
        await h.connect('business');
        g.hangingClose();
      }, g.deps),
    'CLEANUP',
  );
  assert.equal(
    g.calls.some((c) => c[1] === 'rm'),
    false,
  );
});
test('a caught failed manual close remains a cleanup failure on repeated closure', async () => {
  const f = fake();
  const open = f.deps.open;
  f.deps.open = async (target) => {
    const c = await open(target);
    if (target.user.endsWith('_business'))
      c.end = async () => {
        throw new Error(sentinel);
      };
    return c;
  };
  await safeRefusal(
    () =>
      withCurrencyPrivilegeHarness(async (h) => {
        const client = await h.connect('business');
        await client.end().catch(() => undefined);
      }, f.deps),
    'CLEANUP',
  );
  assert.equal(
    f.calls.some((c) => c[1] === 'rm'),
    false,
  );
});
test('an unresolved or failed-close acquisition blocks resource removal within the cleanup deadline', async () => {
  const f = fake();
  f.deps.deadlines = { readinessMs: 25, cleanupMs: 25 };
  f.deps.open = async () => new Promise(() => undefined);
  await safeRefusal(
    () => withCurrencyPrivilegeHarness(async () => undefined, f.deps),
    'CLEANUP',
  );
  assert.equal(
    f.calls.some((c) => c[1] === 'rm'),
    false,
  );
  const g = fake();
  g.deps.deadlines = { readinessMs: 25, cleanupMs: 25 };
  g.deps.open = async () => {
    throw new HarnessFailure('CLEANUP');
  };
  await safeRefusal(
    () => withCurrencyPrivilegeHarness(async () => undefined, g.deps),
    'CLEANUP',
  );
  assert.equal(
    g.calls.some((c) => c[1] === 'rm'),
    false,
  );
});
test('SQL errors retain only validated SQLSTATE, never raw password SQL/URL or causes', () => {
  const error = new HarnessSqlFailure({
    code: '42501',
    message: sentinel,
    detail: sentinel,
    query: sentinel,
  });
  assert.equal(error.code, '42501');
  assert.equal(
    `${error.stack}${JSON.stringify(error)}`.includes(sentinel),
    false,
  );
  assert.equal(new HarnessSqlFailure({ code: sentinel }).code, 'SQL');
});
