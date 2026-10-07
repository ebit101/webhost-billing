import type { Prisma, PrismaClient } from './generated/prisma/client';

export type CurrencyCoordinationClient = Pick<PrismaClient, '$transaction'>;
export type CurrencyCoordinationBody = (
  transaction: Prisma.TransactionClient,
) => Promise<void>;

// Frozen SQL contract: two-int key, independent of all existing single-bigint keys.
const namespaceKey = `pg_catalog.hashtext('webhost-billing.currency-coordination.v1:' || pg_catalog.current_database())`;
const schemaKey = 'pg_catalog.hashtext($1::text)';
const ceilings = {
  acquisitionMs: 2_000,
  lockMs: 500,
  statementMs: 2_000,
  transactionMs: 10_000,
} as const;
type Limits = { -readonly [K in keyof typeof ceilings]: number };
interface Input {
  schema: string;
  staffMutex: 'required' | 'not_required';
  limits: Limits;
}

export class CurrencyCoordinationError extends Error {
  constructor(readonly code: 'INVALID_INPUT' | 'COORDINATION_FAILED') {
    super(
      code === 'INVALID_INPUT'
        ? 'Invalid currency coordination input.'
        : 'Currency coordination failed. No successful result is available.',
    );
    this.name = 'CurrencyCoordinationError';
  }
}

function record(
  value: unknown,
  keys: readonly string[],
): Record<string, unknown> {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value)) ||
    Reflect.ownKeys(value).some(
      (key) => typeof key !== 'string' || !keys.includes(key),
    )
  )
    throw new Error('Invalid shape');
  return value as Record<string, unknown>;
}

function parse(value: unknown): Input {
  const input = record(value, ['schema', 'staffMutex', 'limits']);
  const { schema, staffMutex } = input;
  if (
    !Object.hasOwn(input, 'schema') ||
    typeof schema !== 'string' ||
    schema.length > 63 ||
    !/^[a-z_][a-z0-9_]*$/.test(schema) ||
    /[^a-z0-9_]/.test(schema) ||
    schema.startsWith('pg_') ||
    schema === 'information_schema' ||
    !Object.hasOwn(input, 'staffMutex') ||
    (staffMutex !== 'required' && staffMutex !== 'not_required')
  )
    throw new Error('Invalid context');
  const overrides =
    input.limits === undefined
      ? {}
      : record(input.limits, Object.keys(ceilings));
  const limits: Limits = { ...ceilings };
  for (const key of Object.keys(ceilings) as (keyof Limits)[]) {
    const limit = Object.hasOwn(overrides, key)
      ? overrides[key]
      : ceilings[key];
    if (
      typeof limit !== 'number' ||
      !Number.isInteger(limit) ||
      limit <= 0 ||
      limit > ceilings[key]
    )
      throw new Error('Invalid budget');
    limits[key] = limit;
  }
  return { schema, staffMutex, limits };
}

function milliseconds(value: unknown): bigint {
  if (typeof value !== 'string' || value.length > 16 || /[^0-9ms]/.test(value))
    throw new Error('Invalid deadline');
  const match = /^([0-9]+)(ms|s)?$/.exec(value);
  if (!match) throw new Error('Invalid deadline');
  return BigInt(match[1]!) * (match[2] === 's' ? 1_000n : 1n);
}

const stateSql = `SELECT
  pg_catalog.current_setting('transaction_isolation') AS isolation,
  pg_catalog.current_setting('transaction_read_only') AS "readOnly",
  pg_catalog.current_setting('search_path') AS "searchPath",
  pg_catalog.current_setting('row_security') AS "rowSecurity",
  pg_catalog.current_setting('lock_timeout') AS "lockTimeout",
  pg_catalog.current_setting('statement_timeout') AS "statementTimeout",
  pg_catalog.current_setting('transaction_timeout') AS "transactionTimeout",
  current_user::text AS actor,
  pg_catalog.pg_backend_pid()::text AS pid,
  (SELECT n.oid::text FROM pg_catalog.pg_namespace n WHERE n.nspname=$1
    AND pg_catalog.has_schema_privilege(n.oid, 'USAGE')) AS "schemaOid",
  EXISTS (SELECT 1 FROM pg_catalog.pg_locks l WHERE l.locktype='advisory'
    AND l.database=(SELECT d.oid FROM pg_catalog.pg_database d WHERE d.datname=pg_catalog.current_database())
    AND l.pid=pg_catalog.pg_backend_pid() AND l.granted AND l.mode='ExclusiveLock'
    AND l.classid=(${namespaceKey})::oid AND l.objid=(${schemaKey})::oid
    AND l.objsubid=2) AS "currencyHeld",
  EXISTS (SELECT 1 FROM pg_catalog.pg_locks l WHERE l.locktype='advisory'
    AND l.database=(SELECT d.oid FROM pg_catalog.pg_database d WHERE d.datname=pg_catalog.current_database())
    AND l.pid=pg_catalog.pg_backend_pid() AND l.granted AND l.mode='ExclusiveLock'
    AND l.classid=0::oid AND l.objid=920006::oid AND l.objsubid=1) AS "staffHeld"`;

async function verify(
  tx: Prisma.TransactionClient,
  input: Input,
  locked: boolean,
  expected?: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const raw = await tx.$queryRawUnsafe<unknown>(stateSql, input.schema);
  if (!Array.isArray(raw) || raw.length !== 1) throw new Error('Missing state');
  const state = record(raw[0], [
    'isolation',
    'readOnly',
    'searchPath',
    'rowSecurity',
    'lockTimeout',
    'statementTimeout',
    'transactionTimeout',
    'actor',
    'pid',
    'schemaOid',
    'currencyHeld',
    'staffHeld',
  ]);
  if (
    state.isolation !== 'read committed' ||
    state.readOnly !== 'off' ||
    state.searchPath !== 'pg_catalog' ||
    state.rowSecurity !== 'off' ||
    milliseconds(state.lockTimeout) !== BigInt(input.limits.lockMs) ||
    milliseconds(state.statementTimeout) !== BigInt(input.limits.statementMs) ||
    milliseconds(state.transactionTimeout) !==
      BigInt(input.limits.transactionMs) ||
    typeof state.actor !== 'string' ||
    state.actor.length < 1 ||
    state.actor.length > 63 ||
    !['pid', 'schemaOid'].every(
      (key) =>
        typeof state[key] === 'string' &&
        /^[1-9][0-9]{0,9}$/.test(state[key] as string) &&
        !/[^0-9]/.test(state[key] as string),
    ) ||
    state.currencyHeld !== locked ||
    state.staffHeld !== (locked && input.staffMutex === 'required') ||
    (expected &&
      ['actor', 'pid', 'schemaOid'].some((key) => state[key] !== expected[key]))
  )
    throw new Error('Unverified state');
  return state;
}

/** Cooperative unused infrastructure, not currency or actor authorization.
 * Trusted body: database-only, no transaction/session control, external effects,
 * detached work, authority return or retries. This does not sandbox JavaScript.
 * Deadlines abort database work, not arbitrary JavaScript/external side effects.
 */
export async function withCurrencyCoordination(
  client: CurrencyCoordinationClient,
  value: unknown,
  body: CurrencyCoordinationBody,
): Promise<void> {
  let input: Input;
  try {
    input = parse(value);
    if (typeof body !== 'function') throw new Error('Invalid body');
  } catch {
    throw new CurrencyCoordinationError('INVALID_INPUT');
  }
  try {
    await client.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe('SET TRANSACTION READ WRITE');
        await tx.$executeRawUnsafe('SET LOCAL search_path = pg_catalog');
        await tx.$executeRawUnsafe('SET LOCAL row_security = off');
        for (const [setting, value] of [
          ['lock_timeout', input.limits.lockMs],
          ['statement_timeout', input.limits.statementMs],
          ['transaction_timeout', input.limits.transactionMs],
        ] as const)
          await tx.$executeRawUnsafe(`SET LOCAL ${setting} = '${value}ms'`);
        const initial = await verify(tx, input, false);
        if (input.staffMutex === 'required')
          await tx.$queryRawUnsafe(
            'SELECT 1 FROM pg_catalog.pg_advisory_xact_lock(920006::bigint)',
          );
        await tx.$queryRawUnsafe(
          `SELECT 1 FROM pg_catalog.pg_advisory_xact_lock(${namespaceKey}, ${schemaKey})`,
          input.schema,
        );
        await verify(tx, input, true, initial);
        // No pre-wait policy/history facts; body queries start after acquisition.
        const result: unknown = await body(tx);
        if (result !== undefined)
          throw new Error('Body must not return a handle or receipt');
        await verify(tx, input, true, initial);
      },
      {
        isolationLevel: 'ReadCommitted',
        maxWait: input.limits.acquisitionMs,
        timeout: input.limits.transactionMs,
      },
    );
  } catch {
    // No raw SQL/body/connection error cause, metadata or automatic retry.
    throw new CurrencyCoordinationError('COORDINATION_FAILED');
  }
}
