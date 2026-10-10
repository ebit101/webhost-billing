import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { before, after, test } from 'node:test';
import { Client, Query } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { createPrismaClient } from '../src/client';
import { appendCurrencyUnit } from '../src/currency-units';
import { appendCurrencyPolicyRevision } from '../src/currency-policies';
import {
  loadPinnedMigrations,
  productSnapshot,
} from './currency-privilege-harness.fixtures';
import {
  assertBrowserDatabaseScope,
  browserDatabaseUrl,
  validateBrowserDatabaseUrl,
} from '../../../apps/web/e2e/database-scope';

// Private test facts and qualification probes only. No exported acquisition/authority API.
const parentSchema = process.env.WEBHOST_BROWSER_E2E_SCHEMA ?? '';
const parentUrl = process.env.DATABASE_URL ?? '';
const migrations = loadPinnedMigrations();
const installationId = '10000000-0000-4000-8000-000000000001';
const domainId = '10000000-0000-4000-8000-000000000002';
const laterDomainId = '10000000-0000-4000-8000-000000000003';
const createdAt = new Date('2026-01-01T00:00:00.123Z');
const digest = 'a'.repeat(64);
const names = ['currency_installations', 'currency_execution_domains'] as const;
let parent: PrismaClient;
let parentRaw: Client;
let parentBaseline: Awaited<ReturnType<typeof productSnapshot>>;

function tracedModels(url: string, schema: string) {
  const queries: string[] = [];
  const models = new PrismaClient({
    adapter: new PrismaPg({ connectionString: url }, { schema }),
    log: [{ emit: 'event', level: 'query' }],
  });
  // In-memory SQL shape only. No parameter/event logging or runtime instrumentation.
  models.$on('query', (event) => queries.push(event.query));
  return { models, queries };
}
type Scope = Awaited<ReturnType<typeof bootstrap>>;
function q(scope: { schema: string }, name: string) {
  assert.match(name, /^[a-z_][a-z0-9_]*$/);
  return `"${scope.schema}"."${name}"`;
}
function connection(pg: Client) {
  return {
    query: async (text: string, values?: readonly unknown[]) => {
      const result = await pg.query<Record<string, unknown>>(
        text,
        values ? [...values] : [],
      );
      return { rows: result.rows, rowCount: result.rowCount };
    },
    end: async () => undefined,
  };
}
async function snapshot(scope: Scope) {
  await assertBrowserDatabaseScope(scope.models, scope.url, scope.schema);
  return productSnapshot(connection(scope.raw), scope.schema);
}
async function bootstrap(count = 26) {
  await assertBrowserDatabaseScope(parent, parentUrl, parentSchema);
  assert.equal(migrations.length, 26);
  const schema = `command26_e2e_${randomUUID().replaceAll('-', '')}`;
  const url = browserDatabaseUrl(parentUrl, schema);
  await parent.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  const raw = new Client({ connectionString: url });
  const traced = tracedModels(url, schema);
  // Before marking, any failure is preserved for owner inspection, never guessed cleanup.
  await raw.connect();
  assert.deepEqual(
    (
      await raw.query(
        "SELECT current_schema() AS schema,current_setting('search_path') AS path",
      )
    ).rows,
    [{ schema, path: schema }],
  );
  for (const migration of migrations.slice(0, count))
    await raw.query(migration.sql);
  await assertBrowserDatabaseScope(traced.models, url, schema, false);
  await raw.query(
    `CREATE TABLE "${schema}".__browser_e2e_scope(owner text NOT NULL)`,
  );
  await raw.query(`INSERT INTO "${schema}".__browser_e2e_scope VALUES($1)`, [
    schema,
  ]);
  await assertBrowserDatabaseScope(traced.models, url, schema);
  return { schema, url, raw, ...traced };
}
async function withScope(body: (scope: Scope) => Promise<void>, count = 26) {
  const scope = await bootstrap(count);
  try {
    await body(scope);
  } finally {
    await scope.raw.query('ROLLBACK');
    await assertBrowserDatabaseScope(scope.models, scope.url, scope.schema);
    await scope.models.$executeRawUnsafe(
      `DROP SCHEMA "${scope.schema}" CASCADE`,
    );
    await scope.raw.end();
    await scope.models.$disconnect();
  }
}
async function fixtures(scope: Scope) {
  await assertBrowserDatabaseScope(scope.models, scope.url, scope.schema);
  await scope.models.currencyInstallation.create({
    data: { id: 1, installationId, createdAt },
  });
  await scope.models.currencyExecutionDomain.create({
    data: {
      id: domainId,
      installationId,
      databaseName: 'fictional_database',
      schemaName: 'fictional_schema',
      placementManifestDigest: digest,
      createdAt,
    },
  });
}
async function denied(
  scope: Scope,
  operation: () => Promise<unknown>,
  code: string,
) {
  const baseline = await snapshot(scope);
  await assert.rejects(operation, (error: unknown) => {
    assert.ok(error instanceof Error);
    assert.equal(Reflect.get(error, 'code'), code);
    return true;
  });
  assert.deepEqual(await snapshot(scope), baseline);
}

// Refuse missing/view/partition/RLS/catalog/model/raw contexts, even when both counts
// would be zero. Captured model SQL proves exact qualified target shape, not deployment.
async function qualifiedFixtureRead(scope: Scope, traced = scope) {
  await assertBrowserDatabaseScope(traced.models, scope.url, scope.schema);
  return traced.models.$transaction(async (tx) => {
    await tx.$executeRawUnsafe('SET LOCAL row_security=off');
    const catalog = await tx.$queryRawUnsafe<
      {
        name: string;
        kind: string;
        rls: boolean;
        forced: boolean;
        columns: number;
        defaults: number;
        nullable: number;
      }[]
    >(
      `SELECT c.relname AS name,c.relkind::text AS kind,c.relrowsecurity AS rls,c.relforcerowsecurity AS forced,
      count(a.attnum)::int AS columns,count(d.oid)::int AS defaults,count(*) FILTER(WHERE NOT a.attnotnull)::int AS nullable
      FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
      JOIN pg_catalog.pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
      LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum
      WHERE n.nspname=$1 AND c.relname IN ('currency_installations','currency_execution_domains')
      GROUP BY c.oid ORDER BY c.relname`,
      scope.schema,
    );
    assert.deepEqual(catalog, [
      {
        name: 'currency_execution_domains',
        kind: 'r',
        rls: false,
        forced: false,
        columns: 6,
        defaults: 0,
        nullable: 0,
      },
      {
        name: 'currency_installations',
        kind: 'r',
        rls: false,
        forced: false,
        columns: 3,
        defaults: 0,
        nullable: 0,
      },
    ]);
    const guards = await tx.$queryRawUnsafe<
      {
        table: string;
        type: number;
        enabled: string;
        definer: boolean;
        config: string[];
        function: string;
      }[]
    >(
      `SELECT c.relname AS table,t.tgtype::int AS type,t.tgenabled::text AS enabled,
      p.prosecdef AS definer,p.proconfig AS config,p.proname AS function
      FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_class c ON c.oid=t.tgrelid
      JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace JOIN pg_catalog.pg_proc p ON p.oid=t.tgfoid
      WHERE n.nspname=$1 AND c.relname IN ('currency_installations','currency_execution_domains')
      AND NOT t.tgisinternal ORDER BY c.relname,t.tgtype`,
      scope.schema,
    );
    assert.deepEqual(
      guards,
      ['currency_execution_domains', 'currency_installations'].flatMap(
        (table) =>
          [10, 18, 34].map((type) => ({
            table,
            type,
            enabled: 'O',
            definer: false,
            config: ['search_path=pg_catalog'],
            function: 'deny_currency_identity_mutation',
          })),
      ),
    );
    const start = traced.queries.length;
    const installations = await tx.currencyInstallation.findMany({
      orderBy: { id: 'asc' },
    });
    const domains = await tx.currencyExecutionDomain.findMany({
      orderBy: { id: 'asc' },
    });
    for (const name of names)
      assert.ok(
        traced.queries
          .slice(start)
          .some((sql) => sql.includes(`FROM "${scope.schema}"."${name}"`)),
        'Model qualification must match the exact owned target even when empty.',
      );
    const rawInstallations = await tx.$queryRawUnsafe<
      { id: number; installationId: string; createdAt: Date }[]
    >(
      `SELECT id,installation_id AS "installationId",created_at AS "createdAt" FROM ${q(scope, names[0])} ORDER BY id`,
    );
    const rawDomains = await tx.$queryRawUnsafe<
      {
        id: string;
        installationId: string;
        databaseName: string;
        schemaName: string;
        placementManifestDigest: string;
        createdAt: Date;
      }[]
    >(`SELECT id,installation_id AS "installationId",database_name AS "databaseName",schema_name AS "schemaName",
      placement_manifest_digest AS "placementManifestDigest",created_at AS "createdAt" FROM ${q(scope, names[1])} ORDER BY id`);
    assert.deepEqual(installations, rawInstallations);
    assert.deepEqual(domains, rawDomains);
    return { installations, domains };
  });
}

before(async () => {
  validateBrowserDatabaseUrl(parentUrl, parentSchema);
  parent = createPrismaClient(parentUrl);
  parentRaw = new Client({ connectionString: parentUrl });
  await parentRaw.connect();
  await assertBrowserDatabaseScope(parent, parentUrl, parentSchema);
  parentBaseline = await productSnapshot(connection(parentRaw), parentSchema);
  assert.equal(await parent.currencyInstallation.count(), 0);
  assert.equal(await parent.currencyExecutionDomain.count(), 0);
});
after(async () => {
  if (parent && parentRaw) {
    try {
      await assertBrowserDatabaseScope(parent, parentUrl, parentSchema);
      assert.deepEqual(
        await productSnapshot(connection(parentRaw), parentSchema),
        parentBaseline,
      );
      assert.equal(await parent.currencyInstallation.count(), 0);
      assert.equal(await parent.currencyExecutionDomain.count(), 0);
    } finally {
      await parentRaw.end();
      await parent.$disconnect();
    }
  }
});

test('fresh migration is empty, has no other authority stores and explicit model/raw facts retain multiple domains and UTC', async () => {
  await withScope(async (scope) => {
    assert.deepEqual(await qualifiedFixtureRead(scope), {
      installations: [],
      domains: [],
    });
    assert.ok(
      !(await snapshot(scope)).objects.some((row) =>
        /currency_(?:selection|transition|authorization|authority|proof)/.test(
          String(row.relname),
        ),
      ),
    );
    await fixtures(scope);
    await scope.raw.query(
      `INSERT INTO ${q(scope, names[1])} VALUES($1,$2,$3,$4,$5,$6)`,
      [
        laterDomainId,
        installationId,
        '_',
        'a'.repeat(63),
        '0123456789abcdef'.repeat(4),
        '2026-01-01T06:00:00.123+06:00',
      ],
    );
    const read = await qualifiedFixtureRead(scope);
    assert.equal(read.installations.length, 1);
    assert.equal(read.domains.length, 2);
    assert.equal(
      read.installations[0]?.createdAt.toISOString(),
      createdAt.toISOString(),
    );
    assert.ok(
      read.domains.every(
        (row) => row.createdAt.toISOString() === createdAt.toISOString(),
      ),
    );
    assert.equal(read.domains[1]?.schemaName.length, 63);
    assert.equal(read.domains[1]?.databaseName, '_');
    const relation = await scope.models.currencyInstallation.findUnique({
      where: { id: 1 },
      include: { domains: true },
    });
    assert.equal(relation?.domains.length, 2);
    assert.ok(
      !('active' in read.domains[0]!) && !('current' in read.domains[0]!),
    );
    assert.equal(await scope.models.currencyControl.count(), 0);
  });
});

test('catalog confirms exact types, no defaults, unique keys, restrictive FK and six fixed invoker guards', async () => {
  await withScope(async (scope) => {
    const columns = (
      await scope.raw.query(
        `SELECT table_name,column_name,data_type,is_nullable,column_default,
            character_maximum_length,datetime_precision,collation_name FROM information_schema.columns
      WHERE table_schema=$1 AND table_name=ANY($2::text[]) ORDER BY table_name,ordinal_position`,
        [scope.schema, [...names]],
      )
    ).rows;
    assert.deepEqual(
      columns.map((r: Record<string, unknown>) => [
        r.table_name,
        r.column_name,
        r.data_type,
        r.character_maximum_length,
        r.datetime_precision,
      ]),
      [
        [names[1], 'id', 'uuid', null, null],
        [names[1], 'installation_id', 'uuid', null, null],
        [names[1], 'database_name', 'character varying', 63, null],
        [names[1], 'schema_name', 'character varying', 63, null],
        [names[1], 'placement_manifest_digest', 'character varying', 64, null],
        [names[1], 'created_at', 'timestamp with time zone', null, 3],
        [names[0], 'id', 'smallint', null, null],
        [names[0], 'installation_id', 'uuid', null, null],
        [names[0], 'created_at', 'timestamp with time zone', null, 3],
      ],
    );
    assert.ok(
      columns.every(
        (r: Record<string, unknown>) =>
          r.is_nullable === 'NO' && r.column_default === null,
      ),
    );
    assert.ok(
      columns
        .filter(
          (r: Record<string, unknown>) => r.data_type === 'character varying',
        )
        .every((r: Record<string, unknown>) => r.collation_name === 'C'),
    );
    const constraints = (
      await scope.raw.query(
        `SELECT c.conname,c.contype,c.confdeltype,c.confupdtype,c.convalidated,
            pn.nspname||'.'||pc.relname AS referenced,pg_catalog.pg_get_constraintdef(c.oid) AS definition
            FROM pg_catalog.pg_constraint c JOIN pg_catalog.pg_namespace n ON n.oid=c.connamespace
            LEFT JOIN pg_catalog.pg_class pc ON pc.oid=c.confrelid
            LEFT JOIN pg_catalog.pg_namespace pn ON pn.oid=pc.relnamespace
      WHERE n.nspname=$1 AND c.conrelid=ANY($2::regclass[]) ORDER BY c.conname`,
        [scope.schema, names.map((name) => q(scope, name))],
      )
    ).rows;
    assert.ok(
      constraints.every((r: Record<string, unknown>) => r.convalidated),
    );
    const foreign = constraints.filter(
      (r: Record<string, unknown>) => r.contype === 'f',
    );
    assert.equal(foreign.length, 1);
    assert.equal(foreign[0]?.confdeltype, 'r');
    assert.equal(foreign[0]?.confupdtype, 'r');
    assert.equal(
      foreign[0]?.referenced,
      `${scope.schema}.currency_installations`,
    );
    assert.ok(
      constraints.some(
        (r: Record<string, unknown>) =>
          r.definition === 'UNIQUE (installation_id, id)',
      ),
    );
    assert.ok(
      constraints.some(
        (r: Record<string, unknown>) =>
          r.definition === 'UNIQUE (installation_id)',
      ),
    );
    const guards = (
      await scope.raw.query(
        `SELECT t.tgname,t.tgtype::int AS type,t.tgenabled,p.prosecdef,p.proconfig,p.proname,
      EXISTS(SELECT 1 FROM pg_catalog.aclexplode(p.proacl) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE') AS public_execute
      FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_proc p ON p.oid=t.tgfoid
      WHERE t.tgrelid=ANY($1::regclass[]) AND NOT t.tgisinternal ORDER BY t.tgname`,
        [names.map((name) => q(scope, name))],
      )
    ).rows;
    assert.equal(guards.length, 6);
    assert.deepEqual(
      guards.map((r: Record<string, unknown>) => r.type).sort(),
      [10, 10, 18, 18, 34, 34],
    );
    assert.ok(
      guards.every(
        (r: Record<string, unknown>) =>
          r.tgenabled === 'O' &&
          r.prosecdef === false &&
          r.proname === 'deny_currency_identity_mutation' &&
          JSON.stringify(r.proconfig) === '["search_path=pg_catalog"]' &&
          r.public_execute === false,
      ),
    );
    assert.equal(
      (
        await scope.raw.query(
          `SELECT count(*)::int AS count FROM pg_catalog.pg_class c
      CROSS JOIN LATERAL pg_catalog.aclexplode(c.relacl) a WHERE c.oid=ANY($1::regclass[]) AND a.grantee=0`,
          [names.map((name) => q(scope, name))],
        )
      ).rows[0]?.count,
      0,
    );
  });
});

test('explicit NOT NULL, UUID and singleton boundaries deny without changing any trusted row or guard', async () => {
  await withScope(async (scope) => {
    const table = q(scope, names[0]);
    const base: unknown[] = [1, installationId, createdAt];
    for (const [index, bad, code] of [
      [0, null, '23502'],
      [1, null, '23502'],
      [2, null, '23502'],
      [0, 0, '23514'],
      [0, 2, '23514'],
      [0, 32768, '22003'],
      [1, 'not-a-uuid', '22P02'],
      [2, 'infinity', '23514'],
      [2, '-infinity', '23514'],
    ] as const) {
      const values = [...base];
      values[index] = bad;
      await denied(
        scope,
        () => scope.raw.query(`INSERT INTO ${table} VALUES($1,$2,$3)`, values),
        code,
      );
    }
    await denied(
      scope,
      () => scope.raw.query(`INSERT INTO ${table} DEFAULT VALUES`),
      '23502',
    );
    await fixtures(scope);
    await denied(
      scope,
      () => scope.raw.query(`INSERT INTO ${table} VALUES($1,$2,$3)`, base),
      '23505',
    );
    // Standard PostgreSQL UUID aliases identify the existing SQL key, not a new authority.
    await denied(
      scope,
      () =>
        scope.raw.query(
          `INSERT INTO ${q(scope, names[1])} VALUES($1,$2,$3,$4,$5,$6)`,
          [
            domainId.replaceAll('-', ''),
            installationId,
            'fictional',
            'fictional',
            digest,
            createdAt,
          ],
        ),
      '23505',
    );
  });
});

test('placement/digest full-value boundaries, duplicate keys and wrong-installation FK deny with per-denial catalog preservation', async () => {
  await withScope(async (scope) => {
    await fixtures(scope);
    const base: unknown[] = [
      laterDomainId,
      installationId,
      'fictional_database',
      'fictional_schema',
      digest,
      createdAt,
    ];
    const insert = (values: unknown[]) =>
      scope.raw.query(
        `INSERT INTO ${q(scope, names[1])} VALUES($1,$2,$3,$4,$5,$6)`,
        values,
      );
    for (let index = 0; index < base.length; index++) {
      const values = [...base];
      values[index] = null;
      await denied(scope, () => insert(values), '23502');
    }
    for (const index of [0, 1]) {
      const values = [...base];
      values[index] = 'not-a-uuid';
      await denied(scope, () => insert(values), '22P02');
    }
    for (const index of [2, 3]) {
      for (const bad of [
        '',
        'A',
        '1name',
        'pg_name',
        'information_schema',
        'a-b',
        'a b',
        'é',
        'a\n',
        '\na',
        'a\r',
        'a\t',
        'a'.repeat(64),
      ]) {
        const values = [...base];
        values[index] = bad;
        await denied(
          scope,
          () => insert(values),
          bad.length === 64 ? '22001' : '23514',
        );
      }
    }
    for (const bad of [
      '',
      'a'.repeat(63),
      'a'.repeat(65),
      'A'.repeat(64),
      'g'.repeat(64),
      'a'.repeat(63) + '\n',
      'a'.repeat(63) + 'é',
    ]) {
      const values = [...base];
      values[4] = bad;
      await denied(
        scope,
        () => insert(values),
        bad.length === 65 ? '22001' : '23514',
      );
    }
    const wrong = [...base];
    wrong[1] = '10000000-0000-4000-8000-000000000099';
    await denied(scope, () => insert(wrong), '23503');
    const infinite = [...base];
    infinite[5] = 'infinity';
    await denied(scope, () => insert(infinite), '23514');
    await denied(
      scope,
      () => scope.raw.query(`INSERT INTO ${q(scope, names[1])} DEFAULT VALUES`),
      '23502',
    );
  });
});

test('owner statement guards deny empty/identical/nested/conflict/MERGE/delete/truncate independently of ACLs', async () => {
  await withScope(async (scope) => {
    for (const phase of ['empty', 'populated']) {
      if (phase === 'populated') await fixtures(scope);
      for (const name of names) {
        const table = q(scope, name);
        const id = name === names[0] ? '1::smallint' : `'${domainId}'::uuid`;
        for (const sql of [
          `UPDATE ${table} SET created_at=created_at`,
          `UPDATE ${table} SET created_at=created_at WHERE false`,
          `DELETE FROM ${table}`,
          `DELETE FROM ${table} WHERE false`,
          `TRUNCATE ${table}`,
          `TRUNCATE ${table} CASCADE`,
          `INSERT INTO ${table} SELECT * FROM ${table} WHERE false ON CONFLICT(id) DO UPDATE SET created_at=EXCLUDED.created_at`,
          `INSERT INTO ${table} SELECT * FROM ${table} ON CONFLICT(id) DO UPDATE SET created_at=EXCLUDED.created_at WHERE false`,
          `MERGE INTO ${table} t USING(SELECT ${id} AS id WHERE false) s ON t.id=s.id WHEN MATCHED THEN UPDATE SET created_at=t.created_at`,
          `MERGE INTO ${table} t USING(SELECT ${id} AS id) s ON t.id=s.id WHEN MATCHED THEN DELETE`,
          `WITH changed AS(UPDATE ${table} SET created_at=created_at WHERE false RETURNING id) SELECT * FROM changed`,
        ]) {
          // PostgreSQL refuses a referenced-table-only TRUNCATE before triggers,
          // even if empty. CASCADE reaches the immutable statement guard instead.
          const code =
            name === names[0] && sql === `TRUNCATE ${table}`
              ? '0A000'
              : '23514';
          await denied(scope, () => scope.raw.query(sql), code);
        }
        await denied(
          scope,
          () =>
            scope.raw.query(
              `TRUNCATE ${q(scope, names[0])},${q(scope, names[1])}`,
            ),
          '23514',
        );
      }
    }
    for (const name of names) {
      const baseline = await snapshot(scope);
      await scope.raw.query(
        `INSERT INTO ${q(scope, name)} SELECT * FROM ${q(scope, name)} ON CONFLICT DO NOTHING`,
      );
      assert.deepEqual(await snapshot(scope), baseline);
    }
  });
});

class CopyFixture extends Query<Record<string, unknown>, []> {
  constructor(
    sql: string,
    private readonly data: string,
  ) {
    super(sql);
  }
  handleCopyInResponse(c: {
    sendCopyFromChunk(b: Buffer): void;
    endCopyFrom(): void;
  }) {
    c.sendCopyFromChunk(Buffer.from(this.data));
    c.endCopyFrom();
  }
}
function copy(scope: Scope, data: string) {
  return new Promise<void>((resolve, reject) => {
    const query = new CopyFixture(
      `COPY ${q(scope, names[1])} FROM STDIN`,
      data,
    );
    query.once('error', reject);
    query.once('end', () => resolve());
    scope.raw.query(query);
  });
}
test('COPY follows owner INSERT constraints; failed COPY and transactions leave no partial identity facts', async () => {
  await withScope(async (scope) => {
    const empty = await snapshot(scope);
    await scope.raw.query('BEGIN');
    await scope.raw.query(`INSERT INTO ${q(scope, names[0])} VALUES(1,$1,$2)`, [
      installationId,
      createdAt,
    ]);
    await assert.rejects(
      scope.raw.query(
        `INSERT INTO ${q(scope, names[1])} VALUES($1,$2,'fictional','fictional',$3,$4)`,
        [domainId, laterDomainId, digest, createdAt],
      ),
      (error: unknown) =>
        error instanceof Error && Reflect.get(error, 'code') === '23503',
    );
    await scope.raw.query('ROLLBACK');
    assert.deepEqual(await snapshot(scope), empty);
    await fixtures(scope);
    const row = `${laterDomainId}\t${installationId}\tfictional\tfictional\t${digest}\t2026-01-01T00:00:00.123Z\n`;
    await denied(
      scope,
      () =>
        copy(
          scope,
          row +
            row
              .replaceAll(laterDomainId, '10000000-0000-4000-8000-000000000004')
              .replace('fictional\tfictional', 'Bad\tfictional'),
        ),
      '23514',
    );
    await copy(scope, row);
    assert.equal((await qualifiedFixtureRead(scope)).domains.length, 2);
  });
});

test('empty wrong model/raw contexts and missing/view/partition/RLS/catalog contexts refuse rather than approve absence', async () => {
  await withScope(async (scope) => {
    await withScope(async (other) => {
      const wrongModel = tracedModels(scope.url, other.schema);
      const wrongRaw = tracedModels(other.url, scope.schema);
      try {
        await assert.rejects(
          qualifiedFixtureRead(scope, { ...scope, ...wrongModel }),
        );
        await assert.rejects(
          qualifiedFixtureRead(scope, { ...scope, ...wrongRaw }),
        );
        assert.deepEqual(await qualifiedFixtureRead(scope), {
          installations: [],
          domains: [],
        });
        assert.deepEqual(await qualifiedFixtureRead(other), {
          installations: [],
          domains: [],
        });
      } finally {
        await wrongModel.models.$disconnect();
        await wrongRaw.models.$disconnect();
      }
    });
  });
  for (const name of names)
    for (const kind of ['missing', 'view', 'partition', 'rls', 'column']) {
      await withScope(async (scope) => {
        const table = q(scope, name);
        if (kind === 'rls') {
          await fixtures(scope);
          await scope.raw.query(
            `ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY; ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`,
          );
        } else if (kind === 'column')
          await scope.raw.query(
            `ALTER TABLE ${table} ADD COLUMN unsupported text`,
          );
        else {
          await scope.raw.query(
            `ALTER TABLE ${table} RENAME TO __identity_original`,
          );
          if (kind === 'view')
            await scope.raw.query(
              `CREATE VIEW ${table} AS SELECT * FROM ${q(scope, '__identity_original')}`,
            );
          if (kind === 'partition')
            await scope.raw.query(
              `CREATE TABLE ${table}(id integer) PARTITION BY RANGE(id)`,
            );
        }
        const baseline = await snapshot(scope);
        await assert.rejects(qualifiedFixtureRead(scope));
        assert.deepEqual(await snapshot(scope), baseline);
      });
    }
});

test('qualified private reads ignore temporary/search-path identity decoys and reject an unsupported raw path', async () => {
  await withScope(async (scope) => {
    await fixtures(scope);
    const expected = await qualifiedFixtureRead(scope);
    await scope.raw
      .query(`CREATE TEMP TABLE currency_installations(id smallint); INSERT INTO currency_installations VALUES(99);
      CREATE TEMP TABLE currency_execution_domains(id uuid); SET search_path=pg_temp,"${scope.schema}",pg_catalog`);
    assert.equal(
      (await scope.raw.query('SELECT id FROM currency_installations')).rows[0]
        ?.id,
      99,
    );
    assert.deepEqual(await qualifiedFixtureRead(scope), expected);
    assert.equal(
      (
        await scope.raw.query(
          `SELECT installation_id::text AS id FROM ${q(scope, names[0])}`,
        )
      ).rows[0]?.id,
      installationId,
    );
    await scope.raw.query(`SET search_path="${scope.schema}"`);
    const wrongUrl = new URL(scope.url);
    wrongUrl.searchParams.set(
      'options',
      `-csearch_path=pg_temp,${scope.schema}`,
    );
    const wrong = tracedModels(wrongUrl.toString(), scope.schema);
    try {
      await assert.rejects(qualifiedFixtureRead(scope, { ...scope, ...wrong }));
    } finally {
      await wrong.models.$disconnect();
    }
  });
});

test('the additive 26th migration preserves every prior-25 row, currency/auth/settings/money/audit/event facts and guard manifest', async () => {
  await withScope(async (scope) => {
    const models = scope.models;
    const user = await models.user.create({
      data: {
        email: 'identity-history@example.test',
        role: 'CUSTOMER',
        customer: {
          create: {
            customerNumber: 'FICTIONAL-110',
            firstName: 'Fictional',
            lastName: 'History',
            addressLine1: '1 Fictional Road',
            city: 'Dhaka',
            countryCode: 'BD',
          },
        },
      },
      include: { customer: true },
    });
    const customerId = user.customer!.id;
    const admin = await models.user.create({
      data: {
        email: 'identity-admin@example.test',
        role: 'ADMIN',
        adminProfile: { create: { displayName: 'Fictional operator' } },
      },
    });
    await models.authSession.create({
      data: {
        userId: admin.id,
        tokenHash: '1'.repeat(64),
        expiresAt: new Date('2099-01-01Z'),
      },
    });
    await models.adminTotpCredential.create({
      data: {
        userId: admin.id,
        secretCiphertext: 'Fictional opaque fixture, not a credential',
        keyVersion: 'fictional',
        recoveryCodes: { create: { codeHash: '2'.repeat(64) } },
      },
    });
    const product = await models.product.create({
      data: {
        slug: 'fictional-110',
        name: 'Fictional hosting',
        provisioningAdapter: 'fake-panel',
      },
    });
    const price = await models.productPrice.create({
      data: {
        productId: product.id,
        billingPeriod: 'ANNUAL',
        currency: 'USD',
        amount: 100n,
      },
    });
    const order = await models.order.create({
      data: {
        orderNumber: 'FICTIONAL-ORDER-110',
        submissionKey: randomUUID(),
        customerId,
        currency: 'USD',
        subtotal: 100n,
        total: 100n,
        customerEmailSnapshot: user.email,
        items: {
          create: {
            productId: product.id,
            productPriceId: price.id,
            productNameSnapshot: product.name,
            billingPeriod: 'ANNUAL',
            currency: 'USD',
            unitAmount: 100n,
            lineTotal: 100n,
          },
        },
      },
    });
    const server = await models.server.create({
      data: {
        name: 'Fictional server',
        hostname: 'identity.example.test',
        adapterKey: 'fake-panel',
      },
    });
    await models.service.create({
      data: {
        customerId,
        productId: product.id,
        productPriceId: price.id,
        serverId: server.id,
        productNameSnapshot: product.name,
        billingPeriod: 'ANNUAL',
        recurringAmount: 100n,
        currency: 'USD',
        startedAt: new Date('2026-01-01Z'),
        nextDueAt: new Date('2027-01-01Z'),
      },
    });
    const invoice = await models.invoice.create({
      data: {
        invoiceNumber: 'FICTIONAL-INV-110',
        submissionKey: randomUUID(),
        customerId,
        orderId: order.id,
        currency: 'USD',
        subtotal: 100n,
        total: 100n,
        balanceDue: 100n,
        customerNameSnapshot: 'Fictional History',
        customerEmailSnapshot: user.email,
        customerAddressSnapshot: { city: 'Dhaka' },
        businessIdentitySnapshot: { name: 'Fictional business' },
        dueAt: new Date('2026-11-01Z'),
        items: {
          create: {
            linePosition: 1,
            descriptionSnapshot: 'Fictional hosting',
            currency: 'USD',
            unitAmount: 100n,
            lineTotal: 100n,
          },
        },
      },
    });
    await models.payment.create({
      data: {
        invoiceId: invoice.id,
        provider: 'fake',
        idempotencyKey: 'fictional-payment-110',
        amount: 100n,
        currency: 'USD',
      },
    });
    await models.setting.create({
      data: {
        key: 'business.localization',
        category: 'BUSINESS',
        value: { currency: 'BDT', timezone: 'Asia/Dhaka' },
      },
    });
    await models.activityLog.create({
      data: {
        actorUserId: admin.id,
        action: 'fictional.identity-history',
        entityType: 'Invoice',
        entityId: invoice.id,
        metadata: { fictional: true },
      },
    });
    await models.outboxEvent.create({
      data: {
        aggregateType: 'Invoice',
        aggregateId: invoice.id,
        eventType: 'fictional.identity-history',
        idempotencyKey: 'fictional-identity-history',
        payload: { fictional: true },
      },
    });
    await models.paymentEvent.create({
      data: {
        provider: 'fake',
        providerEventId: 'fictional-event-110',
        idempotencyKey: 'fictional-event-110',
        eventType: 'fictional',
        payloadHash: '0'.repeat(64),
        normalizedPayload: { fictional: true },
      },
    });
    const unit = {
      code: 'XAA',
      metadataVersion: 'identity-history-v1',
      minorUnitExponent: 2,
      provenance: 'Authored fictional identity history metadata',
      status: 'current',
    } as const;
    await appendCurrencyUnit(models, unit);
    const ref = { code: unit.code, metadataVersion: unit.metadataVersion };
    await appendCurrencyPolicyRevision(models, {
      revision: 'identity-history-v1',
      base: ref,
      defaultBrowsing: ref,
      currencies: [
        {
          unit: ref,
          capabilities: { display: true, newSales: false, collection: false },
        },
      ],
    });
    await models.currencyControl.create({ data: { id: 1 } });
    const prior = await snapshot(scope);
    for (const table of [
      'users',
      'admin_profiles',
      'auth_sessions',
      'admin_totp_credentials',
      'admin_recovery_codes',
      'customers',
      'products',
      'product_prices',
      'orders',
      'order_items',
      'services',
      'invoices',
      'invoice_items',
      'payments',
      'settings',
      'activity_logs',
      'outbox_events',
      'payment_events',
      'currency_unit_definitions',
      'currency_policy_revisions',
      'currency_controls',
    ])
      assert.ok(
        Array.isArray(prior.rows[table]) &&
          (prior.rows[table] as unknown[]).length > 0,
        `Missing fictional preservation fact: ${table}`,
      );
    assert.equal(
      migrations[25]?.name,
      '20261010090000_inert_currency_identity',
    );
    await scope.raw.query(migrations[25]!.sql);
    const current = await snapshot(scope);
    for (const [name, rows] of Object.entries(prior.rows))
      assert.deepEqual(current.rows[name], rows);
    for (const key of [
      'objects',
      'constraints',
      'triggers',
      'functions',
    ] as const) {
      const before = prior[key];
      const after = current[key];
      const identity =
        key === 'objects'
          ? 'relname'
          : key === 'constraints'
            ? 'conname'
            : key === 'triggers'
              ? 'tgname'
              : 'proname';
      const oldNames = new Set(before.map((row) => row[identity]));
      assert.deepEqual(
        after.filter((row) => oldNames.has(row[identity])),
        before,
      );
    }
    assert.deepEqual(await qualifiedFixtureRead(scope), {
      installations: [],
      domains: [],
    });
    assert.equal(await models.currencyControl.count(), 1);
    assert.deepEqual(
      loadPinnedMigrations().map((m) => m.rawHash),
      migrations.map((m) => m.rawHash),
    );
  }, 25);
});
