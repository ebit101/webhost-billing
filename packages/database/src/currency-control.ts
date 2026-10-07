import type { Prisma } from './generated/prisma/client';
import {
  withCurrencyCoordination,
  type CurrencyCoordinationClient,
} from './currency-coordination';

/** Unused facts, never an assessment, selected policy or permission. */
export type CurrencyControlObservation =
  | { state: 'absent' }
  | {
      state: 'unassessed';
      generation: '0';
      selectedPolicyRevision: null;
      historyLatched: null;
      baseCode: null;
      baseMetadataVersion: null;
      baseMinorUnitExponent: null;
      createdAt: string;
    };

export class CurrencyControlError extends Error {
  constructor(readonly code: 'INVALID_INPUT' | 'CONTROL_UNAVAILABLE') {
    super(
      code === 'INVALID_INPUT'
        ? 'Invalid currency control input.'
        : 'Currency control is unavailable. No successful result is available.',
    );
    this.name = 'CurrencyControlError';
  }
}

const ceilings = {
  acquisitionMs: 2000,
  lockMs: 500,
  statementMs: 2000,
  transactionMs: 10000,
} as const;
function record(
  value: unknown,
  allowed: readonly string[],
): Record<string, unknown> {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value)) ||
    Reflect.ownKeys(value).some(
      (k) => typeof k !== 'string' || !allowed.includes(k),
    )
  )
    throw new Error();
  return value as Record<string, unknown>;
}
function parse(value: unknown) {
  const r = record(value, ['schema', 'staffMutex', 'limits']);
  const schema = r.schema;
  const staffMutex = r.staffMutex;
  if (
    !Object.hasOwn(r, 'schema') ||
    typeof schema !== 'string' ||
    schema.length > 63 ||
    !/^[a-z_][a-z0-9_]*$/.test(schema) ||
    /[^a-z0-9_]/.test(schema) ||
    schema.startsWith('pg_') ||
    schema === 'information_schema' ||
    !Object.hasOwn(r, 'staffMutex') ||
    (staffMutex !== 'required' && staffMutex !== 'not_required')
  )
    throw new Error();
  const limits: Record<string, number> = {};
  if (r.limits !== undefined) {
    const raw = record(r.limits, Object.keys(ceilings));
    for (const key of Object.keys(ceilings) as (keyof typeof ceilings)[]) {
      if (!Object.hasOwn(raw, key)) continue;
      const n = raw[key];
      if (
        typeof n !== 'number' ||
        !Number.isInteger(n) ||
        n <= 0 ||
        n > ceilings[key]
      )
        throw new Error();
      limits[key] = n;
    }
  }
  return { schema, staffMutex, limits };
}

const select = {
  id: true,
  generation: true,
  selectedPolicyRevision: true,
  historyLatched: true,
  baseCode: true,
  baseMetadataVersion: true,
  baseMinorUnitExponent: true,
  createdAt: true,
} as const;
const fields = Object.keys(select);
function observation(rows: unknown, raw: boolean): CurrencyControlObservation {
  if (!Array.isArray(rows) || rows.length > 1) throw new Error();
  if (rows.length === 0) return { state: 'absent' };
  const row = record(rows[0], fields);
  if (
    Reflect.ownKeys(row).length !== fields.length ||
    row.id !== 1 ||
    row.generation !== (raw ? '0' : 0n) ||
    [
      'selectedPolicyRevision',
      'historyLatched',
      'baseCode',
      'baseMetadataVersion',
      'baseMinorUnitExponent',
    ].some((k) => row[k] !== null) ||
    !(row.createdAt instanceof Date) ||
    !Number.isFinite(row.createdAt.getTime())
  )
    throw new Error();
  const createdAt = row.createdAt.toISOString();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(createdAt))
    throw new Error();
  return {
    state: 'unassessed',
    generation: '0',
    selectedPolicyRevision: null,
    historyLatched: null,
    baseCode: null,
    baseMetadataVersion: null,
    baseMinorUnitExponent: null,
    createdAt,
  };
}

async function context(
  tx: Prisma.TransactionClient,
  schema: string,
  staging: boolean,
): Promise<string> {
  const rows = await tx.$queryRawUnsafe<unknown>(
    `SELECT c.oid::text AS oid FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname=$1 AND c.relname='currency_controls' AND c.relkind='r' AND NOT c.relispartition
    AND pg_catalog.has_schema_privilege(n.oid,'USAGE') AND pg_catalog.has_table_privilege(c.oid,'SELECT')
    AND (NOT $2 OR pg_catalog.has_table_privilege(c.oid,'INSERT'))
    AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_inherits i WHERE i.inhrelid=c.oid OR i.inhparent=c.oid)`,
    schema,
    staging,
  );
  if (!Array.isArray(rows) || rows.length !== 1) throw new Error();
  const row = record(rows[0], ['oid']);
  if (
    Reflect.ownKeys(row).length !== 1 ||
    typeof row.oid !== 'string' ||
    !/^[1-9][0-9]{0,9}$/.test(row.oid)
  )
    throw new Error();
  return row.oid;
}

async function read(
  tx: Prisma.TransactionClient,
  schema: string,
  oid: string,
): Promise<CurrencyControlObservation> {
  // The real model query acquires a relation lock even when the table is empty.
  // Compare its server-side target, not merely equal rows in two empty schemas.
  const model = observation(
    await tx.currencyControl.findMany({ take: 2, select }),
    false,
  );
  const locks =
    await tx.$queryRawUnsafe<unknown>(`SELECT c.oid::text AS oid,n.nspname::text AS schema FROM pg_catalog.pg_locks l
    JOIN pg_catalog.pg_class c ON c.oid=l.relation JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    WHERE l.pid=pg_catalog.pg_backend_pid() AND l.database=(SELECT oid FROM pg_catalog.pg_database WHERE datname=pg_catalog.current_database())
    AND l.locktype='relation' AND l.granted AND l.mode='AccessShareLock' AND c.relname='currency_controls'`);
  if (!Array.isArray(locks) || locks.length !== 1) throw new Error();
  const lock = record(locks[0], ['oid', 'schema']);
  if (
    Reflect.ownKeys(lock).length !== 2 ||
    lock.oid !== oid ||
    lock.schema !== schema
  )
    throw new Error();
  const actual = observation(
    await tx.$queryRawUnsafe<unknown>(`SELECT id,generation::text AS generation,
    selected_policy_revision AS "selectedPolicyRevision",history_latched AS "historyLatched",
    base_code AS "baseCode",base_metadata_version AS "baseMetadataVersion",base_minor_unit_exponent AS "baseMinorUnitExponent",created_at AS "createdAt"
    FROM "${schema}"."currency_controls" ORDER BY id LIMIT 2`),
    true,
  );
  if (JSON.stringify(model) !== JSON.stringify(actual)) throw new Error();
  return actual;
}

async function operate(
  client: CurrencyCoordinationClient,
  value: unknown,
  staging: boolean,
): Promise<CurrencyControlObservation> {
  let input: ReturnType<typeof parse>;
  try {
    input = parse(value);
  } catch {
    throw new CurrencyControlError('INVALID_INPUT');
  }
  let result: CurrencyControlObservation | undefined;
  try {
    await withCurrencyCoordination(client, input, async (tx) => {
      const oid = await context(tx, input.schema, staging);
      result = await read(tx, input.schema, oid);
      if (staging) {
        const inserted = await tx.currencyControl.createMany({
          data: [
            {
              id: 1,
              generation: 0n,
              selectedPolicyRevision: null,
              historyLatched: null,
              baseCode: null,
              baseMetadataVersion: null,
              baseMinorUnitExponent: null,
            },
          ],
          skipDuplicates: true,
        });
        if (inserted.count !== 0 && inserted.count !== 1) throw new Error();
        if ((await context(tx, input.schema, true)) !== oid) throw new Error();
        result = await read(tx, input.schema, oid);
        if (result.state !== 'unassessed') throw new Error();
      }
    });
    if (!result) throw new Error();
    return { ...result };
  } catch {
    throw new CurrencyControlError('CONTROL_UNAVAILABLE');
  }
}

/** Own coordination; reads never stage or manufacture history/eligibility. */
export function readCurrencyControl(
  client: CurrencyCoordinationClient,
  input: unknown,
): Promise<CurrencyControlObservation> {
  return operate(client, input, false);
}
/** Explicit constant staging only; no supplied authority or automatic selection. */
export function stageCurrencyControl(
  client: CurrencyCoordinationClient,
  input: unknown,
): Promise<CurrencyControlObservation> {
  return operate(client, input, true);
}
