import type { PrismaClient } from './generated/prisma/client';

// Unused entry: injected client only, no connection/env/root/application consumer.
export type CurrencyAdoptionPreflightClient = Pick<
  PrismaClient,
  '$transaction'
>;
const tables = [
  'product_prices',
  'orders',
  'order_items',
  'services',
  'invoices',
  'invoice_items',
  'payments',
] as const;
type MoneyTable = (typeof tables)[number];
const sourceTables = [...tables, 'payment_events'];
const ceilings = {
  acquisitionMs: 2_000,
  lockMs: 500,
  statementMs: 2_000,
  transactionMs: 10_000,
} as const;
type Limits = { -readonly [K in keyof typeof ceilings]: number };

export interface CurrencyTableObservation {
  table: MoneyTable;
  category: 'configuration' | 'financial_history';
  rowCount: string;
  codeGroups: { code: string; rowCount: string }[];
  unresolvedCodeRowCount: string;
  omittedCodeRowCount: string;
  codeGroupsTruncated: boolean;
  legacyUnitAndPolicy: 'not_recorded_in_schema';
}

export interface CurrencyAdoptionObservation {
  observedAt: string;
  financialHistoryObserved: boolean;
  tables: CurrencyTableObservation[];
  gatewayEvidence: {
    rowCount: string;
    linkedRowCount: string;
    unlinkedRowCount: string;
    normalizedEvidenceRowCount: string;
  };
  limitations: string[];
}

export class CurrencyAdoptionPreflightError extends Error {
  constructor(readonly code: 'INVALID_INPUT' | 'OBSERVATION_FAILED') {
    super(
      code === 'INVALID_INPUT'
        ? 'Invalid currency adoption preflight input.'
        : 'Currency adoption observation unavailable. No assessment was completed.',
    );
    this.name = 'CurrencyAdoptionPreflightError';
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

function parseInput(value: unknown): { schema: string; limits: Limits } {
  const input = record(value, ['schema', 'limits']);
  const schema = input.schema;
  if (
    !Object.hasOwn(input, 'schema') ||
    typeof schema !== 'string' ||
    schema.length > 63 ||
    !/^[a-z_][a-z0-9_]*$/.test(schema) ||
    /[^a-z0-9_]/.test(schema) ||
    schema.startsWith('pg_') ||
    schema === 'information_schema'
  )
    throw new Error('Invalid schema');
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
  return { schema, limits };
}

function rows(value: unknown, maximum: number): unknown[] {
  if (!Array.isArray(value) || value.length > maximum)
    throw new Error('Invalid row budget');
  return value;
}

function one(value: unknown, keys: readonly string[]): Record<string, unknown> {
  const result = rows(value, 1);
  if (result.length !== 1) throw new Error('Missing observation');
  return record(result[0], keys);
}

function count(value: unknown): bigint {
  if (
    typeof value !== 'string' ||
    value.length > 19 ||
    !/^(0|[1-9][0-9]*)$/.test(value) ||
    /[^0-9]/.test(value)
  )
    throw new Error('Invalid count');
  const result = BigInt(value);
  if (result > 9_223_372_036_854_775_807n)
    throw new Error('Invalid PostgreSQL count');
  return result;
}

function timeout(value: unknown): bigint {
  if (typeof value !== 'string' || value.length > 16)
    throw new Error('Invalid timeout');
  const match = /^([0-9]+)(ms|s)?$/.exec(value);
  if (!match || /[^0-9ms]/.test(value)) throw new Error('Invalid timeout');
  return BigInt(match[1]!) * (match[2] === 's' ? 1_000n : 1n);
}

function tableObservation(
  table: MoneyTable,
  totalsValue: unknown,
  groupsValue: unknown,
): CurrencyTableObservation {
  const totals = one(totalsValue, ['rowCount', 'unresolvedCodeRowCount']);
  const total = count(totals.rowCount);
  const unresolved = count(totals.unresolvedCodeRowCount);
  const groups = rows(groupsValue, 33);
  const codeGroups: CurrencyTableObservation['codeGroups'] = [];
  let allFetched = 0n;
  let displayed = 0n;
  let previous = '';
  for (let index = 0; index < groups.length; index++) {
    const group = record(groups[index], ['code', 'rowCount']);
    if (
      typeof group.code !== 'string' ||
      group.code.length !== 3 ||
      /[^A-Z]/.test(group.code) ||
      group.code <= previous
    )
      throw new Error('Invalid code group');
    previous = group.code;
    const amount = count(group.rowCount);
    if (amount === 0n) throw new Error('Empty code group');
    allFetched += amount;
    if (index < 32) {
      displayed += amount;
      codeGroups.push({ code: group.code, rowCount: amount.toString() });
    }
  }
  const omitted = total - unresolved - displayed;
  if (
    unresolved > total ||
    allFetched + unresolved > total ||
    (groups.length <= 32 && omitted !== 0n) ||
    (groups.length === 33 && omitted <= 0n)
  )
    throw new Error('Inconsistent counts');
  return {
    table,
    category:
      table === 'product_prices' ? 'configuration' : 'financial_history',
    rowCount: total.toString(),
    codeGroups,
    unresolvedCodeRowCount: unresolved.toString(),
    omittedCodeRowCount: omitted.toString(),
    codeGroupsTruncated: groups.length === 33,
    legacyUnitAndPolicy: 'not_recorded_in_schema',
  };
}

/** Advisory observation, never initialization/adoption eligibility or a history latch.
 * COUNT/GROUP BY may scan entire tables: result limits do not bound scan cost.
 * Only transaction-local SET and fixed SELECT queries; no retry or partial success.
 * PostgreSQL 18 deadlines bound database work as well as the injected client's wait.
 */
export async function inspectCurrencyAdoption(
  client: CurrencyAdoptionPreflightClient,
  value: unknown,
): Promise<CurrencyAdoptionObservation> {
  let input: ReturnType<typeof parseInput>;
  try {
    input = parseInput(value);
  } catch {
    throw new CurrencyAdoptionPreflightError('INVALID_INPUT');
  }
  const { schema, limits } = input;
  try {
    return await client.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
        await tx.$executeRawUnsafe('SET LOCAL search_path = pg_catalog');
        await tx.$executeRawUnsafe('SET LOCAL row_security = off');
        // Interpolated identifiers/budgets are strictly bounded ASCII/integer values.
        for (const [setting, milliseconds] of [
          ['lock_timeout', limits.lockMs],
          ['statement_timeout', limits.statementMs],
          ['transaction_timeout', limits.transactionMs],
        ] as const)
          await tx.$executeRawUnsafe(
            `SET LOCAL ${setting} = '${milliseconds}ms'`,
          );
        const modes = one(
          await tx.$queryRawUnsafe<unknown>(`SELECT
            pg_catalog.current_setting('transaction_isolation') AS isolation,
            pg_catalog.current_setting('transaction_read_only') AS "readOnly",
            pg_catalog.current_setting('row_security') AS "rowSecurity",
            pg_catalog.current_setting('lock_timeout') AS "lockTimeout",
            pg_catalog.current_setting('statement_timeout') AS "statementTimeout",
            pg_catalog.current_setting('transaction_timeout') AS "transactionTimeout",
            pg_catalog.to_char(pg_catalog.clock_timestamp() AT TIME ZONE 'UTC',
              'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "observedAt"`),
          [
            'isolation',
            'readOnly',
            'rowSecurity',
            'lockTimeout',
            'statementTimeout',
            'transactionTimeout',
            'observedAt',
          ],
        );
        if (
          modes.isolation !== 'repeatable read' ||
          modes.readOnly !== 'on' ||
          modes.rowSecurity !== 'off' ||
          timeout(modes.lockTimeout) !== BigInt(limits.lockMs) ||
          timeout(modes.statementTimeout) !== BigInt(limits.statementMs) ||
          timeout(modes.transactionTimeout) !== BigInt(limits.transactionMs) ||
          typeof modes.observedAt !== 'string' ||
          !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(
            modes.observedAt,
          ) ||
          new Date(modes.observedAt).toISOString() !== modes.observedAt
        )
          throw new Error('Unverified transaction');
        const sources = rows(
          await tx.$queryRawUnsafe<unknown>(
            `SELECT c.relname::text AS name, c.relkind::text AS kind
            FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
            WHERE n.nspname=$1 AND c.relname=ANY($2::text[]) LIMIT 9`,
            schema,
            sourceTables,
          ),
          8,
        );
        const names = new Set<string>();
        for (const source of sources) {
          const row = record(source, ['name', 'kind']);
          if (
            typeof row.name !== 'string' ||
            !sourceTables.includes(row.name) ||
            row.kind !== 'r'
          )
            throw new Error('Invalid source table');
          names.add(row.name);
        }
        if (names.size !== 8 || sources.length !== 8)
          throw new Error('Missing source table');
        const observations: CurrencyTableObservation[] = [];
        const validCode = `currency::text ~ '^[A-Z]{3}$' AND pg_catalog.octet_length(currency::text)=3`;
        for (const table of tables) {
          const source = `"${schema}"."${table}"`;
          const totals = await tx.$queryRawUnsafe<unknown>(`SELECT
            pg_catalog.count(*)::text AS "rowCount",
            (pg_catalog.count(*) FILTER (WHERE currency IS NULL OR NOT (${validCode})))::text
              AS "unresolvedCodeRowCount" FROM ${source}`);
          const groups =
            await tx.$queryRawUnsafe<unknown>(`SELECT currency::text AS code,
            pg_catalog.count(*)::text AS "rowCount" FROM ${source} WHERE ${validCode}
            GROUP BY currency::text ORDER BY currency::text COLLATE pg_catalog."C" LIMIT 33`);
          observations.push(tableObservation(table, totals, groups));
        }
        const event = one(
          await tx.$queryRawUnsafe<unknown>(`SELECT pg_catalog.count(*)::text AS "rowCount",
            (pg_catalog.count(*) FILTER (WHERE payment_id IS NOT NULL))::text AS "linkedRowCount",
            (pg_catalog.count(*) FILTER (WHERE payment_id IS NULL))::text AS "unlinkedRowCount",
            (pg_catalog.count(*) FILTER (WHERE normalized_payload IS NOT NULL))::text
              AS "normalizedEvidenceRowCount" FROM "${schema}"."payment_events"`),
          [
            'rowCount',
            'linkedRowCount',
            'unlinkedRowCount',
            'normalizedEvidenceRowCount',
          ],
        );
        const total = count(event.rowCount);
        const linked = count(event.linkedRowCount);
        const unlinked = count(event.unlinkedRowCount);
        const normalized = count(event.normalizedEvidenceRowCount);
        if (linked + unlinked !== total || normalized > total)
          throw new Error('Inconsistent event counts');
        return {
          observedAt: modes.observedAt,
          financialHistoryObserved: observations.some(
            (row) =>
              row.category === 'financial_history' && row.rowCount !== '0',
          ),
          tables: observations,
          gatewayEvidence: {
            rowCount: total.toString(),
            linkedRowCount: linked.toString(),
            unlinkedRowCount: unlinked.toString(),
            normalizedEvidenceRowCount: normalized.toString(),
          },
          limitations: [
            'selection_authority_not_implemented',
            'writer_coverage_not_established',
            'adoption_assessment_not_established',
            'legacy_unit_and_policy_provenance_not_recorded',
            'gateway_payload_and_obligation_consistency_not_assessed',
            'observation_may_be_stale_immediately',
          ],
        };
      },
      {
        isolationLevel: 'RepeatableRead',
        maxWait: limits.acquisitionMs,
        timeout: limits.transactionMs,
      },
    );
  } catch {
    // Never expose SQL/connection details or retain raw errors as cause/metadata.
    throw new CurrencyAdoptionPreflightError('OBSERVATION_FAILED');
  }
}
