/** Catalog-derived fictional constraints only. Never opens installed product writes. */
import assert from 'node:assert/strict';
import { escapeIdentifier as ident } from 'pg';
import type { TestConnection } from './currency-privilege-harness';
import { encodeCurrencySelectionIntent } from '../src/private/currency-selection-intent';

export const intentTable = 'currency_selection_intents';
export const canonicalSignature =
  'currency_selection_intent_canonical(uuid,uuid,uuid,uuid,text,text,text,bigint,text)';
export const cloneTables = [
  'users',
  'auth_sessions',
  'currency_installations',
  'currency_execution_domains',
  'currency_policy_revisions',
  intentTable,
] as const;
export const columns = [
  'installation_id',
  'request_key_uuid',
  'execution_domain_id',
  'actor_user_id',
  'session_id',
  'request_key_text',
  'action',
  'expected_revision',
  'expected_generation',
  'proposed_revision',
  'canonical_text',
  'stable_intent_digest',
] as const;
export const fictional = {
  installation: '10000000-0000-4000-8000-000000000001',
  domain: '10000000-0000-4000-8000-000000000002',
  otherDomain: '10000000-0000-4000-8000-000000000003',
  actor: '20000000-0000-4000-8000-000000000001',
  otherActor: '20000000-0000-4000-8000-000000000002',
  session: '20000000-0000-4000-8000-000000000003',
  otherSession: '20000000-0000-4000-8000-000000000004',
  otherInstallation: '10000000-0000-4000-8000-000000000004',
  foreignDomain: '10000000-0000-4000-8000-000000000005',
} as const;

export function facts(s: string): unknown[] {
  const r = encodeCurrencySelectionIntent(s);
  assert.ok(r.success);
  const tuple = JSON.parse(r.canonicalText) as [
    string,
    [string, string],
    string,
    string,
    string,
    string,
    string | null,
    string,
    string,
  ];
  return [
    tuple[1][0],
    tuple[5],
    tuple[1][1],
    tuple[3],
    tuple[4],
    tuple[5],
    tuple[2],
    tuple[6],
    tuple[7],
    tuple[8],
    r.canonicalText,
    r.stableIntentDigest,
  ];
}
export function insertSql(schema: string) {
  return `INSERT INTO ${ident(schema)}.${ident(intentTable)} (${columns.map(ident).join(',')}) VALUES (${columns.map((_, i) => '$' + String(i + 1)).join(',')})`;
}
export function canonicalArgs(values: unknown[]) {
  return [
    values[0],
    values[2],
    values[3],
    values[4],
    values[5],
    values[6],
    values[7],
    values[8],
    values[9],
  ];
}

async function manifest(c: TestConnection, schema: string, table: string) {
  const q = `${ident(schema)}.${ident(table)}`;
  return {
    columns: (
      await c.query(
        `SELECT a.attname,pg_catalog.format_type(a.atttypid,a.atttypmod) AS type,a.attnotnull,
      a.attidentity,a.attgenerated,co.collname,pg_catalog.pg_get_expr(d.adbin,d.adrelid) AS default_expr
      FROM pg_catalog.pg_attribute a JOIN pg_catalog.pg_class t ON t.oid=a.attrelid
      LEFT JOIN pg_catalog.pg_collation co ON co.oid=a.attcollation
      LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
      WHERE t.oid=$1::regclass AND a.attnum>0 AND NOT a.attisdropped ORDER BY a.attnum`,
        [q],
      )
    ).rows,
    constraints: (
      await c.query(
        `SELECT c.conname,c.contype,c.convalidated,c.confdeltype,c.confupdtype,
      pg_catalog.pg_get_constraintdef(c.oid) AS definition FROM pg_catalog.pg_constraint c
      WHERE c.conrelid=$1::regclass ORDER BY c.conname`,
        [q],
      )
    ).rows,
  };
}

export async function catalogProbe(
  c: TestConnection,
  product: string,
  probe: string,
) {
  for (const schema of [product, probe])
    assert.match(schema, /^[a-z][a-z0-9_]{1,62}$/);
  // Trusted catalog SQL comes solely from exact pinned migrations in this owned scope.
  // LIKE copies columns/CHECKs/PK/unique indexes/defaults, but not FKs or triggers.
  await c.query('BEGIN');
  try {
    await c.query('SET LOCAL search_path=pg_catalog');
    await c.query(
      `CREATE SCHEMA ${ident(probe)}; REVOKE ALL ON SCHEMA ${ident(probe)} FROM PUBLIC`,
    );
    for (const table of cloneTables) {
      await c.query(
        `CREATE TABLE ${ident(probe)}.${ident(table)} (LIKE ${ident(product)}.${ident(table)} INCLUDING ALL)`,
      );
      const before = await manifest(c, product, table);
      for (const row of before.constraints.filter((r) => r.contype === 'f')) {
        assert.equal(typeof row.conname, 'string');
        assert.equal(typeof row.definition, 'string');
        // Deparser qualification is forced above. Only the six prescribed parent/table
        // targets may be redirected, never a helper/function or an untrusted identifier.
        let definition = row.definition as string;
        let replaced = 0;
        for (const parent of cloneTables) {
          const target = `REFERENCES ${product}.${parent}(`;
          if (definition.includes(target)) {
            definition = definition.replace(
              target,
              `REFERENCES ${ident(probe)}.${ident(parent)}(`,
            );
            replaced++;
          }
        }
        assert.equal(replaced, 1, 'Unexpected catalog-derived foreign target');
        await c.query(
          `ALTER TABLE ${ident(probe)}.${ident(table)} ADD CONSTRAINT ${ident(row.conname as string)} ${definition}`,
        );
      }
      const after = await manifest(c, probe, table);
      assert.deepEqual(
        after.columns,
        before.columns,
        'Probe columns differ from installed table',
      );
      const normalize = (rows: Record<string, unknown>[]) =>
        rows.map((row) => ({
          ...row,
          // FK namespaces differ intentionally; fixed canonical helper OID stays product-owned.
          definition: String(row.definition)
            .replaceAll(`${probe}.`, `${product}.`)
            .replaceAll(`${ident(probe)}.`, `${product}.`)
            .replaceAll('"', ''),
        }));
      assert.deepEqual(
        normalize(after.constraints),
        normalize(before.constraints),
        'Probe constraints differ from installed definitions',
      );
      assert.equal(
        (
          await c.query(
            'SELECT count(*)::text AS count FROM pg_catalog.pg_trigger WHERE tgrelid=$1::regclass AND NOT tgisinternal',
            [`${ident(probe)}.${ident(table)}`],
          )
        ).rows[0]?.count,
        '0',
      );
      await c.query(
        `REVOKE ALL ON TABLE ${ident(probe)}.${ident(table)} FROM PUBLIC`,
      );
    }
    await c.query('COMMIT');
  } catch (error) {
    await c.query('ROLLBACK');
    throw error;
  }
}

export async function probeParents(c: TestConnection, probe: string) {
  const q = ident(probe);
  const f = fictional;
  for (const [id, email] of [
    [f.actor, 'intent-actor@example.test'],
    [f.otherActor, 'intent-other@example.test'],
  ])
    await c.query(
      `INSERT INTO ${q}.users(id,email,role,updated_at) VALUES($1,$2,'ADMIN','2026-01-01T00:00:00.000Z')`,
      [id, email],
    );
  for (const [id, user, hash] of [
    [f.session, f.actor, '1'.repeat(64)],
    [f.otherSession, f.otherActor, '2'.repeat(64)],
  ])
    await c.query(
      `INSERT INTO ${q}.auth_sessions(id,user_id,token_hash,expires_at,created_at,last_seen_at) VALUES($1,$2,$3,'2027-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z')`,
      [id, user, hash],
    );
  await c.query(
    `INSERT INTO ${q}.currency_installations VALUES(1,$1,'2026-01-01T00:00:00.000Z')`,
    [f.installation],
  );
  for (const id of [f.domain, f.otherDomain])
    await c.query(
      `INSERT INTO ${q}.currency_execution_domains VALUES($1,$2,'fictional_database','fictional_schema',$3,'2026-01-01T00:00:00.000Z')`,
      [id, f.installation, 'a'.repeat(64)],
    );
  for (const revision of [
    'fictional-v0',
    'fictional-v1',
    'fictional-v2',
    'v'.repeat(64),
  ]) {
    const ref = { code: 'BDT', metadataVersion: 'fictional-v1' };
    const policy = {
      revision,
      base: ref,
      defaultBrowsing: ref,
      currencies: [
        {
          unit: ref,
          capabilities: { display: true, newSales: true, collection: false },
        },
      ],
    };
    await c.query(
      `INSERT INTO ${q}.currency_policy_revisions(revision,policy,created_at) VALUES($1,$2::jsonb,'2026-01-01T00:00:00.000Z')`,
      [revision, JSON.stringify(policy)],
    );
  }
}
