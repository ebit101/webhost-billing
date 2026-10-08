/** Test-only. No application credentials, runtime export, selected state or shared cluster. */
import { execFile } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { freemem } from 'node:os';
import { statfsSync } from 'node:fs';
import { Client, escapeIdentifier, escapeLiteral } from 'pg';

export const approvedImage = {
  tag: 'postgres:18.6-bookworm',
  digest:
    'postgres@sha256:3725f4e2499eef5134592b3b4ab79a543ed7f8e533b05b5b637af926630f6650',
  dataTarget: '/var/lib/postgresql',
} as const;
const labelKey = 'bd.speedhost.currency-privilege-test';
const idPattern = /^[a-f0-9]{64}$/;
const GiB = 1024 ** 3;
const MiB = 1024 ** 2;
export const harnessLimits = {
  commandMs: 15000,
  readinessMs: 60000,
  wholeRunMs: 600000,
  cleanupMs: 30000,
  memory: 512 * MiB,
  data: 256 * MiB,
  shm: 64 * MiB,
  pids: 128,
} as const;

type FailureCode =
  | 'PREFLIGHT'
  | 'DOCKER'
  | 'OWNERSHIP'
  | 'STARTUP'
  | 'SQL'
  | 'ACCEPTANCE'
  | 'INTERRUPTED'
  | 'DEADLINE'
  | 'CLEANUP';
type HarnessPhase =
  | 'preflight'
  | 'Docker context'
  | 'image cache'
  | 'daemon resources'
  | 'network'
  | 'creation'
  | 'created manifest'
  | 'start'
  | 'running manifest'
  | 'published ports'
  | 'published mapping'
  | 'loopback target'
  | 'readiness'
  | 'server identity'
  | 'server database'
  | 'server user'
  | 'server version'
  | 'server data'
  | 'server address'
  | 'marker'
  | 'acceptance'
  | 'cleanup';
export class HarnessFailure extends Error {
  constructor(
    readonly code: FailureCode,
    readonly containerId?: string,
    readonly networkId?: string,
    readonly phase?: HarnessPhase,
  ) {
    // Never preserve an arbitrary error cause/output/configuration.
    super(
      `Isolated privilege acceptance failed (${code}${phase ? `; ${phase}` : ''}).${containerId && idPattern.test(containerId) ? ` Container: ${containerId}.` : ''}${networkId && idPattern.test(networkId) ? ` Network: ${networkId}.` : ''}`,
    );
    this.name = 'HarnessFailure';
  }
}
export class HarnessSqlFailure extends Error {
  readonly code: string;
  constructor(error: unknown) {
    super('Fictional SQL operation failed.');
    this.name = 'HarnessSqlFailure';
    const code =
      error && typeof error === 'object' && 'code' in error
        ? error.code
        : undefined;
    this.code =
      typeof code === 'string' && /^[A-Z0-9]{5}$/.test(code) ? code : 'SQL';
  }
}
export interface TestConnection {
  query(
    text: string,
    values?: unknown[],
  ): Promise<{ rows: Record<string, unknown>[]; rowCount: number | null }>;
  end(): Promise<void>;
}
export interface ConnectionTarget {
  host: '127.0.0.1';
  port: number;
  database: string;
  user: string;
  password: string;
  ssl: false;
  options: string;
  connectionTimeoutMillis: number;
  query_timeout: number;
  application_name: string;
}
export type DockerCommand = (
  args: string[],
  env: NodeJS.ProcessEnv,
  signal: AbortSignal,
  input?: string,
) => Promise<string>;
export interface HarnessDependencies {
  command: DockerCommand;
  open(target: ConnectionTarget): Promise<TestConnection>;
  freeMemory(): number;
  freeDisk(): bigint;
  nonce(): string;
  secret(): string;
  environment: NodeJS.ProcessEnv;
  // Injected shorter clocks only; production runner never supplies overrides.
  deadlines?: { readinessMs?: number; wholeRunMs?: number; cleanupMs?: number };
}
export type LoginDuty =
  'bootstrap' | 'business' | 'issuer' | 'executor' | 'attacker';
export interface PrivilegeHarness {
  nonce: string;
  database: string;
  product: string;
  probe: string;
  roles: Record<LoginDuty | 'objects' | 'functions', string>;
  installLogins(): Promise<void>;
  connect(duty: LoginDuty): Promise<TestConnection>;
  verifyOwnership(): Promise<void>;
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new HarnessFailure('OWNERSHIP');
  return value as Record<string, unknown>;
}
function oneJson(value: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(value);
  return object(
    Array.isArray(parsed) && parsed.length === 1 ? parsed[0] : parsed,
  );
}
function exactKeys(value: Record<string, unknown>, keys: string[]): void {
  if (
    JSON.stringify(Object.keys(value).sort()) !==
    JSON.stringify([...keys].sort())
  )
    throw new HarnessFailure('OWNERSHIP');
}
export function isolatedEnvironment(
  ambient: NodeJS.ProcessEnv,
): NodeJS.ProcessEnv {
  const result: NodeJS.ProcessEnv = {};
  // Explicitly omit PG*, DATABASE_URL, DOCKER_HOST/CONTEXT/TLS overrides, NODE_OPTIONS,
  // application/provider credentials and all unlisted variables. No dotenv load.
  for (const key of [
    'PATH',
    'Path',
    'SystemRoot',
    'SYSTEMROOT',
    'ComSpec',
    'COMSPEC',
    'TEMP',
    'TMP',
    'TMPDIR',
    'USERPROFILE',
    'HOME',
    'APPDATA',
    'LOCALAPPDATA',
    'LANG',
    'LC_ALL',
  ]) {
    const value = ambient[key];
    if (typeof value === 'string') result[key] = value;
  }
  return result;
}
export function verifyEndpoint(context: unknown): string {
  const c = object(context);
  const name = c.Name;
  const host = object(object(c.Endpoints).docker).Host;
  if (
    typeof name !== 'string' ||
    !/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,63}$/.test(name) ||
    typeof host !== 'string' ||
    !/^(?:unix:\/\/\/(?:var\/run\/docker\.sock|run\/user\/\d+\/docker\.sock)|npipe:\/\/\/\/\.\/pipe\/(?:docker_engine|dockerDesktopLinuxEngine))$/.test(
      host,
    )
  )
    throw new HarnessFailure('PREFLIGHT');
  return name;
}
export function verifyImage(value: unknown): string {
  const image = object(value);
  const volumes = object(object(image.Config).Volumes);
  if (
    typeof image.Id !== 'string' ||
    !/^sha256:[a-f0-9]{64}$/.test(image.Id) ||
    image.Os !== 'linux' ||
    image.Architecture !== 'amd64' ||
    !Array.isArray(image.RepoDigests) ||
    !image.RepoDigests.includes(approvedImage.digest)
  )
    throw new HarnessFailure('PREFLIGHT');
  exactKeys(volumes, [approvedImage.dataTarget]);
  return image.Id;
}
function usedMemory(text: string): number {
  let sum = 0;
  for (const line of text.trim().split('\n').filter(Boolean)) {
    const match =
      /^(\d+(?:\.\d+)?)\s*(B|KiB|MiB|GiB) \/ \d+(?:\.\d+)?\s*(?:B|KiB|MiB|GiB)$/.exec(
        line.trim(),
      );
    if (!match) throw new HarnessFailure('PREFLIGHT');
    const powers: Record<string, number> = { B: 1, KiB: 1024, MiB, GiB };
    sum += Number(match[1]) * powers[match[2]];
  }
  return sum;
}
export function verifyResources(
  info: unknown,
  stats: string,
  hostFree: number,
  diskFree: bigint,
): void {
  const value = object(info);
  if (
    value.OSType !== 'linux' ||
    typeof value.ServerVersion !== 'string' ||
    !/^\d+\.\d+\.\d+(?:[-+].*)?$/.test(value.ServerVersion) ||
    Number(value.ServerVersion.split('.')[0]) < 28 ||
    typeof value.MemTotal !== 'number' ||
    !Number.isSafeInteger(value.MemTotal) ||
    typeof value.NCPU !== 'number' ||
    value.NCPU < 1 ||
    !Number.isFinite(hostFree) ||
    hostFree < 768 * MiB ||
    value.MemTotal - usedMemory(stats) < 768 * MiB ||
    diskFree < BigInt(512 * MiB)
  )
    throw new HarnessFailure('PREFLIGHT');
}
interface OwnedResources {
  nonce: string;
  name: string;
  image: string;
  networkName: string;
  networkId: string;
  containerId: string;
}
export function verifyNetwork(
  value: unknown,
  owned: Omit<OwnedResources, 'containerId'>,
  attached: string | null,
): void {
  const network = object(value);
  const labels = object(network.Labels);
  if (
    network.Id !== owned.networkId ||
    network.Name !== owned.networkName ||
    network.Driver !== 'bridge' ||
    network.Internal !== false ||
    object(network.Options)[
      'com.docker.network.bridge.enable_ip_masquerade'
    ] !== 'false' ||
    object(network.Options)['com.docker.network.bridge.host_binding_ipv4'] !==
      '127.0.0.1' ||
    labels[labelKey] !== '106' ||
    labels[`${labelKey}.nonce`] !== owned.nonce
  )
    throw new HarnessFailure('OWNERSHIP');
  const containers = object(network.Containers ?? {});
  exactKeys(containers, attached ? [attached] : []);
}
export function verifyContainer(
  value: unknown,
  owned: OwnedResources,
  running: boolean,
): { port: number; address: string } | null {
  const c = object(value);
  const labels = object(c.Labels);
  const host = object(c.Host);
  if (
    c.Id !== owned.containerId ||
    c.Name !== `/${owned.name}` ||
    c.Image !== owned.image ||
    labels[labelKey] !== '106' ||
    labels[`${labelKey}.nonce`] !== owned.nonce ||
    host.Privileged !== false ||
    host.NetworkMode !== owned.networkName ||
    host.Memory !== harnessLimits.memory ||
    host.MemorySwap !== harnessLimits.memory ||
    host.NanoCpus !== 1e9 ||
    host.ShmSize !== harnessLimits.shm ||
    host.PidsLimit !== harnessLimits.pids ||
    object(host.RestartPolicy).Name !== 'no' ||
    object(host.LogConfig).Type !== 'none' ||
    Object.keys(object(object(host.LogConfig).Config)).length !== 0 ||
    !Array.isArray(host.SecurityOpt) ||
    !host.SecurityOpt.includes('no-new-privileges:true') ||
    (host.Binds !== null &&
      (!Array.isArray(host.Binds) || host.Binds.length !== 0))
  )
    throw new HarnessFailure('OWNERSHIP');
  const declared = host.Mounts;
  if (!Array.isArray(declared) || declared.length !== 1)
    throw new HarnessFailure('OWNERSHIP');
  const mount = object(declared[0]);
  if (
    mount.Type !== 'tmpfs' ||
    mount.Target !== approvedImage.dataTarget ||
    object(mount.TmpfsOptions).SizeBytes !== harnessLimits.data
  )
    throw new HarnessFailure('OWNERSHIP');
  const mounts = c.Mounts;
  // Docker may list tmpfs only in HostConfig.Mounts; any actual persistent mount denies.
  if (
    !Array.isArray(mounts) ||
    mounts.some((m) => {
      const v = object(m);
      return v.Type !== 'tmpfs' || v.Destination !== approvedImage.dataTarget;
    })
  )
    throw new HarnessFailure('OWNERSHIP');
  const bindings = object(host.PortBindings);
  exactKeys(bindings, ['5432/tcp']);
  const binding = bindings['5432/tcp'];
  if (
    !Array.isArray(binding) ||
    binding.length !== 1 ||
    object(binding[0]).HostIp !== '127.0.0.1'
  )
    throw new HarnessFailure('OWNERSHIP');
  const networks = object(c.Networks);
  exactKeys(networks, [owned.networkName]);
  if (!running) return null;
  if (c.Status !== 'running') throw new HarnessFailure('STARTUP');
  if (!c.Ports || typeof c.Ports !== 'object' || Array.isArray(c.Ports))
    throw new HarnessFailure(
      'OWNERSHIP',
      undefined,
      undefined,
      'published ports',
    );
  const ports = object(c.Ports);
  exactKeys(ports, ['5432/tcp']);
  const published = ports['5432/tcp'];
  if (!Array.isArray(published) || published.length !== 1)
    throw new HarnessFailure(
      'OWNERSHIP',
      undefined,
      undefined,
      'published mapping',
    );
  const mapping = object(published[0]);
  const port =
    typeof mapping.HostPort === 'string' ? Number(mapping.HostPort) : 0;
  const address = object(networks[owned.networkName]).IPAddress;
  if (
    mapping.HostIp !== '127.0.0.1' ||
    !Number.isInteger(port) ||
    port < 1024 ||
    port > 65535 ||
    typeof address !== 'string' ||
    !/^\d{1,3}(?:\.\d{1,3}){3}$/.test(address)
  )
    throw new HarnessFailure(
      'OWNERSHIP',
      undefined,
      undefined,
      'loopback target',
    );
  return { port, address };
}

const containerFormat =
  '{"Id":{{json .Id}},"Name":{{json .Name}},"Image":{{json .Image}},"Labels":{{json .Config.Labels}},"Host":{{json .HostConfig}},"Mounts":{{json .Mounts}},"Ports":{{json .NetworkSettings.Ports}},"Networks":{{json .NetworkSettings.Networks}},"Status":{{json .State.Status}}}';
const networkFormat =
  '{"Id":{{json .Id}},"Name":{{json .Name}},"Labels":{{json .Labels}},"Driver":{{json .Driver}},"Internal":{{json .Internal}},"Options":{{json .Options}},"Containers":{{json .Containers}}}';
const imageFormat =
  '{"Id":{{json .Id}},"RepoDigests":{{json .RepoDigests}},"Os":{{json .Os}},"Architecture":{{json .Architecture}},"Config":{"Volumes":{{json .Config.Volumes}}}}';

export const boundedDockerCommand: DockerCommand = (args, env, signal, input) =>
  new Promise((resolve, reject) => {
    // No shell, inherited stdio or raw error output. An override cannot change this deadline.
    const child = execFile(
      'docker',
      args,
      {
        env,
        signal,
        timeout: harnessLimits.commandMs,
        maxBuffer: 256 * 1024,
        encoding: 'utf8',
        windowsHide: true,
        killSignal: 'SIGKILL',
      },
      (error, stdout) => {
        if (error) reject(new HarnessFailure('DOCKER'));
        else resolve(stdout.trim());
      },
    );
    child.stdin?.on('error', () => reject(new HarnessFailure('DOCKER')));
    child.stdin?.end(input);
  });
async function openPg(target: ConnectionTarget): Promise<TestConnection> {
  const client = new Client(target);
  // Fatal asynchronous errors never reach console or uncaught listeners.
  let failed = false;
  client.on('error', () => {
    failed = true;
  });
  try {
    await client.connect();
  } catch {
    try {
      await abortable(client.end(), AbortSignal.timeout(3000));
    } catch {
      throw new HarnessFailure('CLEANUP');
    }
    throw new HarnessFailure('SQL');
  }
  return {
    async query(text, values) {
      if (failed) throw new HarnessFailure('SQL');
      try {
        const raw: unknown = await client.query<Record<string, unknown>>(
          text,
          values,
        );
        const r = object(Array.isArray(raw) ? raw.at(-1) : raw);
        if (
          !Array.isArray(r.rows) ||
          (r.rowCount !== null && typeof r.rowCount !== 'number')
        )
          throw new HarnessFailure('SQL');
        return {
          rows: r.rows.map(object),
          rowCount: r.rowCount as number | null,
        };
      } catch (error) {
        throw new HarnessSqlFailure(error);
      }
    },
    async end() {
      await client.end();
    },
  };
}
function defaults(): HarnessDependencies {
  return {
    command: boundedDockerCommand,
    open: openPg,
    freeMemory: freemem,
    freeDisk: () => {
      const s = statfsSync(process.cwd(), { bigint: true });
      return s.bavail * s.bsize;
    },
    nonce: () => randomUUID().replaceAll('-', ''),
    secret: () => randomBytes(32).toString('base64url'),
    environment: process.env,
  };
}
function deadline(value: number | undefined, max: number): number {
  if (value === undefined) return max;
  if (!Number.isInteger(value) || value <= 0 || value > max)
    throw new HarnessFailure('PREFLIGHT');
  return value;
}
function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new HarnessFailure('INTERRUPTED'));
      return;
    }
    const abort = () => {
      clearTimeout(timer);
      reject(new HarnessFailure('INTERRUPTED'));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', abort);
      resolve();
    }, ms);
    signal.addEventListener('abort', abort, { once: true });
  });
}
let active = false;

function abortable<T>(task: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(new HarnessFailure('INTERRUPTED'));
    if (signal.aborted) {
      task.catch(() => undefined);
      abort();
      return;
    }
    signal.addEventListener('abort', abort, { once: true });
    task
      .then(resolve, reject)
      .finally(() => signal.removeEventListener('abort', abort))
      .catch(() => undefined);
  });
}

export async function withCurrencyPrivilegeHarness(
  body: (harness: PrivilegeHarness) => Promise<void>,
  injected?: HarnessDependencies,
  interruption?: AbortSignal,
): Promise<void> {
  if (active || typeof body !== 'function')
    throw new HarnessFailure('PREFLIGHT');
  active = true;
  const deps = injected ?? defaults();
  let owned: OwnedResources | undefined;
  let networkId: string | undefined;
  let networkName = '';
  let image = '';
  let nonce = '';
  let markerReady = false;
  let unsafe = false;
  let failure: FailureCode | undefined;
  let context = '';
  let phase: HarnessPhase = 'preflight';
  let target: { port: number; address: string } | null = null;
  const clients = new Set<TestConnection>();
  const pendingConnections = new Set<Promise<TestConnection>>();
  let acquisitionCloseFailed = false;
  const controller = new AbortController();
  const stop = () => controller.abort();
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  interruption?.addEventListener('abort', stop, { once: true });
  if (interruption?.aborted) stop();
  let timer: NodeJS.Timeout | undefined;
  const env = isolatedEnvironment(deps.environment);
  const sqlClose = async () => {
    // Acquisition can settle after a watchdog interrupts its caller. Wait for its
    // bounded close before removing the cluster; an unresolved acquisition fails cleanup.
    const acquisitions = await Promise.allSettled([...pendingConnections]);
    if (
      acquisitionCloseFailed ||
      acquisitions.some(
        (r) =>
          r.status === 'rejected' &&
          r.reason instanceof HarnessFailure &&
          r.reason.code === 'CLEANUP',
      )
    )
      throw new HarnessFailure('CLEANUP');
    const results = await Promise.allSettled([...clients].map((c) => c.end()));
    clients.clear();
    if (results.some((r) => r.status === 'rejected'))
      throw new HarnessFailure('CLEANUP');
  };
  const command = async (
    args: string[],
    signal = controller.signal,
    suppliedEnv = env,
    input?: string,
  ) => {
    if (signal.aborted) throw new HarnessFailure('INTERRUPTED');
    try {
      return await abortable(
        deps.command(
          context ? ['--context', context, ...args] : args,
          suppliedEnv,
          signal,
          input,
        ),
        signal,
      );
    } catch {
      throw new HarnessFailure(signal.aborted ? 'INTERRUPTED' : 'DOCKER');
    }
  };
  const inspectNetwork = async (
    signal: AbortSignal,
    attached: string | null,
  ) => {
    if (!networkId) throw new HarnessFailure('OWNERSHIP');
    const value = oneJson(
      await command(
        ['network', 'inspect', networkId, '--format', networkFormat],
        signal,
      ),
    );
    verifyNetwork(
      value,
      { nonce, name: `c106-${nonce}`, image, networkName, networkId },
      attached,
    );
  };
  const inspectContainer = async (signal: AbortSignal, running: boolean) => {
    if (!owned) throw new HarnessFailure('OWNERSHIP');
    return verifyContainer(
      oneJson(
        await command(
          [
            'container',
            'inspect',
            owned.containerId,
            '--format',
            containerFormat,
          ],
          signal,
        ),
      ),
      owned,
      running,
    );
  };
  let database = '';
  let roles: PrivilegeHarness['roles'];
  const secrets = new Map<LoginDuty, string>();
  const connect = async (
    duty: LoginDuty,
    signal = controller.signal,
  ): Promise<TestConnection> => {
    if (signal.aborted || !target || !roles || !secrets.has(duty))
      throw new HarnessFailure('SQL');
    const opening = deps
      .open({
        host: '127.0.0.1',
        port: target.port,
        database,
        user: roles[duty],
        password: secrets.get(duty)!,
        ssl: false,
        options:
          '-c search_path=pg_catalog -c lock_timeout=500ms -c statement_timeout=2000ms -c transaction_timeout=10000ms',
        connectionTimeoutMillis: 2000,
        query_timeout: 3000,
        application_name: `c106_${nonce}`,
      })
      .then(async (c) => {
        if (signal.aborted) {
          try {
            await abortable(c.end(), AbortSignal.timeout(3000));
          } catch {
            throw new HarnessFailure('CLEANUP');
          }
          throw new HarnessFailure('INTERRUPTED');
        }
        return c;
      })
      .catch((error: unknown) => {
        if (error instanceof HarnessFailure && error.code === 'CLEANUP')
          acquisitionCloseFailed = true;
        throw error;
      });
    pendingConnections.add(opening);
    void opening
      .finally(() => pendingConnections.delete(opening))
      .catch(() => undefined);
    const client = await abortable(opening, signal);
    clients.add(client);
    if (signal.aborted) {
      await client.end();
      clients.delete(client);
      throw new HarnessFailure('INTERRUPTED');
    }
    const originalEnd = client.end.bind(client);
    let closing: Promise<void> | undefined;
    client.end = () => {
      closing ??= abortable(originalEnd(), AbortSignal.timeout(3000)).then(
        () => {
          clients.delete(client);
        },
      );
      // Preserve a failed close even if a callback catches it; cleanup must not
      // reinterpret a second end() as successful closure of the same client.
      return closing;
    };
    return client;
  };
  const serverIdentity = async (client: TestConnection) => {
    const result =
      await client.query(`SELECT pg_catalog.current_database() AS database, session_user::text AS actor,
      pg_catalog.current_setting('server_version_num') AS version, pg_catalog.current_setting('data_directory') AS data,
      pg_catalog.host(pg_catalog.inet_server_addr()) AS address, pg_catalog.inet_server_port() AS port,
      (SELECT r.rolname FROM pg_catalog.pg_database d JOIN pg_catalog.pg_roles r ON r.oid=d.datdba WHERE d.datname=pg_catalog.current_database()) AS owner`);
    const row = result.rows[0];
    if (result.rows.length !== 1 || !row || row.database !== database)
      throw new HarnessFailure(
        'OWNERSHIP',
        undefined,
        undefined,
        'server database',
      );
    if (row.actor !== roles.bootstrap || row.owner !== roles.bootstrap)
      throw new HarnessFailure(
        'OWNERSHIP',
        undefined,
        undefined,
        'server user',
      );
    if (row.version !== '180006')
      throw new HarnessFailure(
        'OWNERSHIP',
        undefined,
        undefined,
        'server version',
      );
    if (row.data !== `${approvedImage.dataTarget}/18/docker`)
      throw new HarnessFailure(
        'OWNERSHIP',
        undefined,
        undefined,
        'server data',
      );
    if (row.address !== target?.address || row.port !== 5432)
      throw new HarnessFailure(
        'OWNERSHIP',
        undefined,
        undefined,
        'server address',
      );
  };
  const verifyMarker = async (signal = controller.signal) => {
    await inspectContainer(signal, true);
    await inspectNetwork(signal, owned!.containerId);
    const admin = await connect('bootstrap', signal);
    try {
      await serverIdentity(admin);
      const result = await admin.query(
        `SELECT owner FROM ${escapeIdentifier(`harness_${nonce}`)}.ownership`,
      );
      const description = await admin.query(
        `SELECT pg_catalog.shobj_description(oid,'pg_database') AS marker FROM pg_catalog.pg_database WHERE datname=$1`,
        [database],
      );
      if (
        result.rows.length !== 1 ||
        result.rows[0]?.owner !== nonce ||
        description.rows.length !== 1 ||
        description.rows[0]?.marker !== `c106:${nonce}`
      )
        throw new HarnessFailure('OWNERSHIP');
    } finally {
      await admin.end();
    }
  };
  try {
    const whole = deadline(
      deps.deadlines?.wholeRunMs,
      harnessLimits.wholeRunMs,
    );
    const readiness = deadline(
      deps.deadlines?.readinessMs,
      harnessLimits.readinessMs,
    );
    deadline(deps.deadlines?.cleanupMs, harnessLimits.cleanupMs);
    timer = setTimeout(() => {
      failure = 'DEADLINE';
      stop();
    }, whole);
    nonce = deps.nonce();
    if (!/^[a-f0-9]{32}$/.test(nonce)) throw new HarnessFailure('PREFLIGHT');
    // Forbid ambient Docker redirect/config credentials rather than silently selecting another daemon.
    if (
      [
        'DOCKER_HOST',
        'DOCKER_CONTEXT',
        'DOCKER_CONFIG',
        'DOCKER_CERT_PATH',
        'DOCKER_TLS_VERIFY',
      ].some((k) => deps.environment[k])
    )
      throw new HarnessFailure('PREFLIGHT');
    phase = 'Docker context';
    const current = (await command(['context', 'show'])).trim();
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,63}$/.test(current))
      throw new HarnessFailure('PREFLIGHT');
    const contextRecord = oneJson(
      await command(['context', 'inspect', current]),
    );
    context = verifyEndpoint(contextRecord);
    if (context !== current) throw new HarnessFailure('PREFLIGHT');
    phase = 'image cache';
    image = verifyImage(
      oneJson(
        await command([
          'image',
          'inspect',
          approvedImage.digest,
          '--format',
          imageFormat,
        ]),
      ),
    );
    phase = 'daemon resources';
    const info = oneJson(
      await command([
        'info',
        '--format',
        '{"OSType":{{json .OSType}},"MemTotal":{{json .MemTotal}},"NCPU":{{json .NCPU}},"ServerVersion":{{json .ServerVersion}}}',
      ]),
    );
    verifyResources(
      info,
      await command(['stats', '--no-stream', '--format', '{{.MemUsage}}']),
      deps.freeMemory(),
      deps.freeDisk(),
    );
    database = `c106_${nonce}`;
    roles = Object.fromEntries(
      [
        'bootstrap',
        'business',
        'issuer',
        'executor',
        'attacker',
        'objects',
        'functions',
      ].map((d) => [d, `c106_${nonce}_${d}`]),
    ) as PrivilegeHarness['roles'];
    Object.freeze(roles);
    for (const duty of [
      'bootstrap',
      'business',
      'issuer',
      'executor',
      'attacker',
    ] as const) {
      const password = deps.secret();
      if (
        !/^[a-zA-Z0-9_-]{43}$/.test(password) ||
        [...secrets.values()].includes(password)
      )
        throw new HarnessFailure('PREFLIGHT');
      secrets.set(duty, password);
    }
    networkName = `c106-net-${nonce}`;
    phase = 'network';
    networkId = (
      await command([
        'network',
        'create',
        '--driver',
        'bridge',
        '--opt',
        'com.docker.network.bridge.enable_ip_masquerade=false',
        '--opt',
        'com.docker.network.bridge.host_binding_ipv4=127.0.0.1',
        '--label',
        `${labelKey}=106`,
        '--label',
        `${labelKey}.nonce=${nonce}`,
        networkName,
      ])
    ).trim();
    if (!idPattern.test(networkId)) {
      networkId = undefined;
      throw new HarnessFailure('OWNERSHIP');
    }
    await inspectNetwork(controller.signal, null);
    phase = 'creation';
    const created = (
      await command(
        [
          'container',
          'create',
          '--pull=never',
          '--name',
          `c106-${nonce}`,
          '--label',
          `${labelKey}=106`,
          '--label',
          `${labelKey}.nonce=${nonce}`,
          '--network',
          networkName,
          '--publish',
          '127.0.0.1::5432',
          '--memory',
          String(harnessLimits.memory),
          '--memory-swap',
          String(harnessLimits.memory),
          '--cpus',
          '1',
          '--pids-limit',
          String(harnessLimits.pids),
          '--shm-size',
          String(harnessLimits.shm),
          '--restart',
          'no',
          '--security-opt',
          'no-new-privileges:true',
          '--log-driver',
          'none',
          '--mount',
          `type=tmpfs,destination=${approvedImage.dataTarget},tmpfs-size=${harnessLimits.data},tmpfs-mode=1777`,
          '--env',
          'POSTGRES_USER',
          '--env',
          'POSTGRES_PASSWORD_FILE',
          '--env',
          'POSTGRES_DB',
          '--env',
          'POSTGRES_INITDB_ARGS',
          '--env',
          'PGDATA',
          '--entrypoint',
          'sh',
          image,
          '-c',
          'while [ ! -s /var/lib/postgresql/bootstrap.password ]; do sleep 0.1; done; exec /usr/local/bin/docker-entrypoint.sh "$@"',
          'bootstrap',
          'postgres',
          '-c',
          'shared_buffers=32MB',
          '-c',
          'max_connections=16',
          '-c',
          'log_statement=none',
          '-c',
          'log_min_error_statement=panic',
          '-c',
          'log_connections=off',
        ],
        controller.signal,
        {
          ...env,
          POSTGRES_USER: roles.bootstrap,
          POSTGRES_PASSWORD_FILE: `${approvedImage.dataTarget}/bootstrap.password`,
          POSTGRES_DB: database,
          POSTGRES_INITDB_ARGS:
            '--auth-host=scram-sha-256 --auth-local=scram-sha-256',
          PGDATA: `${approvedImage.dataTarget}/18/docker`,
        },
      )
    ).trim();
    if (!idPattern.test(created)) throw new HarnessFailure('OWNERSHIP');
    owned = {
      nonce,
      name: `c106-${nonce}`,
      image,
      networkName,
      networkId,
      containerId: created,
    };
    phase = 'created manifest';
    await inspectContainer(controller.signal, false);
    phase = 'start';
    await command(['container', 'start', created]);
    phase = 'running manifest';
    target = await inspectContainer(controller.signal, true);
    await inspectNetwork(controller.signal, created);
    // Credential bytes travel only through captured child stdin into this verified
    // memory-only mount, never container Config.Env/CLI arguments or host files.
    await command(
      [
        'container',
        'exec',
        '--interactive',
        created,
        'sh',
        '-c',
        'umask 077; head -c 43 > /var/lib/postgresql/bootstrap.password',
      ],
      controller.signal,
      env,
      secrets.get('bootstrap'),
    );
    const until = Date.now() + readiness;
    const readySignal = AbortSignal.any([
      controller.signal,
      AbortSignal.timeout(readiness),
    ]);
    phase = 'readiness';
    let admin: TestConnection | undefined;
    while (!admin && Date.now() < until && !readySignal.aborted) {
      try {
        admin = await connect('bootstrap', readySignal);
      } catch {
        if (acquisitionCloseFailed) throw new HarnessFailure('CLEANUP');
        if (!readySignal.aborted) {
          try {
            await wait(
              Math.min(200, Math.max(1, until - Date.now())),
              readySignal,
            );
          } catch {
            // Readiness expiration is startup failure; whole-run interruption is distinct.
          }
        }
      }
    }
    if (!admin)
      throw new HarnessFailure(
        controller.signal.aborted ? 'INTERRUPTED' : 'STARTUP',
      );
    try {
      phase = 'server identity';
      await serverIdentity(admin);
      phase = 'marker';
      await admin.query(
        `COMMENT ON DATABASE ${escapeIdentifier(database)} IS ${escapeLiteral(`c106:${nonce}`)}`,
      );
      await admin.query(
        `CREATE SCHEMA ${escapeIdentifier(`harness_${nonce}`)}; CREATE TABLE ${escapeIdentifier(`harness_${nonce}`)}.ownership(owner text NOT NULL)`,
      );
      await admin.query(
        `INSERT INTO ${escapeIdentifier(`harness_${nonce}`)}.ownership(owner) VALUES($1)`,
        [nonce],
      );
      await admin.query(
        `REVOKE ALL ON DATABASE ${escapeIdentifier(database)} FROM PUBLIC; REVOKE CREATE ON SCHEMA public FROM PUBLIC`,
      );
      markerReady = true;
    } finally {
      await admin.end();
    }
    await verifyMarker();
    let installed = false;
    const harness: PrivilegeHarness = {
      nonce,
      database,
      product: `product_${nonce}`,
      probe: `probe_${nonce}`,
      roles,
      connect,
      verifyOwnership: () => verifyMarker(),
      async installLogins() {
        if (installed) throw new HarnessFailure('ACCEPTANCE');
        await verifyMarker();
        const root = await connect('bootstrap');
        try {
          await root.query('BEGIN');
          for (const duty of [
            'business',
            'issuer',
            'executor',
            'attacker',
          ] as const) {
            await root.query(
              `CREATE ROLE ${escapeIdentifier(roles[duty])} LOGIN NOINHERIT NOSUPERUSER NOCREATEROLE NOCREATEDB NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 2 PASSWORD ${escapeLiteral(secrets.get(duty)!)}`,
            );
            await root.query(
              `GRANT CONNECT ON DATABASE ${escapeIdentifier(database)} TO ${escapeIdentifier(roles[duty])}`,
            );
          }
          for (const duty of ['objects', 'functions'] as const)
            await root.query(
              `CREATE ROLE ${escapeIdentifier(roles[duty])} NOLOGIN NOINHERIT NOSUPERUSER NOCREATEROLE NOCREATEDB NOREPLICATION NOBYPASSRLS`,
            );
          await root.query(
            `GRANT TEMPORARY ON DATABASE ${escapeIdentifier(database)} TO ${escapeIdentifier(roles.attacker)}`,
          );
          await root.query('COMMIT');
          installed = true;
        } finally {
          await root.end();
        }
      },
    };
    Object.freeze(harness);
    const task = Promise.resolve().then(() => body(harness));
    phase = 'acceptance';
    const interrupted = new Promise<never>((_, reject) => {
      if (controller.signal.aborted) reject(new HarnessFailure('INTERRUPTED'));
      else
        controller.signal.addEventListener(
          'abort',
          () => reject(new HarnessFailure('INTERRUPTED')),
          { once: true },
        );
    });
    await Promise.race([task, interrupted]);
    // Only trusted test callbacks are accepted; a timeout cannot sandbox detached JS.
    if (controller.signal.aborted) throw new HarnessFailure('INTERRUPTED');
    await verifyMarker();
  } catch (error) {
    const code = error instanceof HarnessFailure ? error.code : 'ACCEPTANCE';
    if (error instanceof HarnessFailure && error.phase) phase = error.phase;
    failure ??= code;
    if (code === 'OWNERSHIP' && markerReady) unsafe = true;
  } finally {
    if (timer) clearTimeout(timer);
    process.removeListener('SIGINT', stop);
    process.removeListener('SIGTERM', stop);
    interruption?.removeEventListener('abort', stop);
    const cleanup = new AbortController();
    const cleanupTimer = setTimeout(
      () => cleanup.abort(),
      deps.deadlines?.cleanupMs ?? harnessLimits.cleanupMs,
    );
    try {
      await abortable(sqlClose(), cleanup.signal);
      if (unsafe) throw new HarnessFailure('CLEANUP');
      if (owned) {
        await inspectContainer(cleanup.signal, false);
        if (markerReady) await verifyMarker(cleanup.signal);
        await abortable(sqlClose(), cleanup.signal);
        await command(
          ['container', 'rm', '--force', owned.containerId],
          cleanup.signal,
        );
      }
      if (networkId) {
        await inspectNetwork(cleanup.signal, null);
        await command(['network', 'rm', networkId], cleanup.signal);
      }
    } catch {
      failure = 'CLEANUP';
      phase = 'cleanup';
    } finally {
      clearTimeout(cleanupTimer);
      secrets.clear();
      active = false;
    }
  }
  if (failure)
    throw new HarnessFailure(failure, owned?.containerId, networkId, phase);
}
