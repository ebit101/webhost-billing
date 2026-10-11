/** Fictional catalog-derived H probes. No installed product writes or runtime consumer. */
import assert from 'node:assert/strict';
import { escapeIdentifier as ident } from 'pg';
import type { TestConnection } from './currency-privilege-harness';
import { assessmentVectors } from './currency-canonical-parity.vectors';
export const evidenceTable = 'currency_authorization_evidence';
export const cloneTables = [
  'users',
  'admin_profiles',
  'auth_sessions',
  'admin_totp_credentials',
  'admin_recovery_codes',
  'currency_installations',
  'currency_execution_domains',
  evidenceTable,
] as const;
export const columns = [
  'id',
  'execution_domain_id',
  'actor_user_id',
  'admin_profile_id',
  'session_id',
  'auth_epoch',
  'credential_id',
  'recovery_set_epoch',
  'factor_kind',
  'recovery_code_id',
  'installation_id',
  'created_at',
] as const;
export const baseH = assessmentVectors()[0][0].assessment[6] as unknown[];
export const installation = '10000000-0000-4000-8000-000000000001';
export const missing = '90000000-0000-4000-8000-000000000099';
export const other = '20000000-0000-4000-8000-000000000099';
export function facts(h: unknown[] = baseH): unknown[] {
  assert.equal(h.length, 10);
  return [...h, installation, '2026-01-01T00:00:00.123Z'];
}
export function insertSql(schema: string) {
  return `INSERT INTO ${ident(schema)}.${ident(evidenceTable)} (${columns.map(ident).join(',')}) VALUES (${columns.map((_, i) => '$' + String(i + 1)).join(',')})`;
}
export async function storedH(c: TestConnection, schema: string) {
  const row = (
    await c.query(
      `SELECT id::text,execution_domain_id::text,actor_user_id::text,admin_profile_id::text,session_id::text,auth_epoch::text,credential_id::text,recovery_set_epoch::text,factor_kind,recovery_code_id::text FROM ${ident(schema)}.${ident(evidenceTable)} ORDER BY id`,
    )
  ).rows;
  return row.map((r) => columns.slice(0, 10).map((k) => r[k]));
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
    indexes: (
      await c.query(
        `SELECT ci.relname AS name,i.indisunique,i.indisprimary,i.indisvalid,pg_catalog.pg_get_indexdef(i.indexrelid) AS definition FROM pg_catalog.pg_index i JOIN pg_catalog.pg_class ci ON ci.oid=i.indexrelid WHERE i.indrelid=$1::regclass ORDER BY ci.relname`,
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
        // Deparser qualification is forced above. Only the eight prescribed parent/table
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
      const normalize = (
        rows: Record<string, unknown>[],
      ): Record<string, unknown>[] =>
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
      // LIKE preserves index semantics but gives standalone unique indexes generated
      // names (users_email_key becomes users_email_idx). Compare full deparsed bodies,
      // validity/uniqueness/primary flags, not generated physical index names.
      const indexManifest = (rows: Record<string, unknown>[]) =>
        normalize(rows)
          .map(({ name: _name, ...row }) => ({
            ...row,
            definition: String(row.definition).replace(
              /^CREATE( UNIQUE)? INDEX [^ ]+ ON /,
              'CREATE$1 INDEX copied_index ON ',
            ),
          }))
          .sort((a, b) =>
            a.definition < b.definition
              ? -1
              : a.definition > b.definition
                ? 1
                : 0,
          );
      assert.deepEqual(
        indexManifest(after.indexes),
        indexManifest(before.indexes),
        'Probe index semantics differ from installed definitions',
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

export async function probeParents(c: TestConnection, schema: string) {
  const q = ident(schema),
    h = baseH;
  for (const [id, email] of [
    [h[2], 'h-actor@example.test'],
    [other, 'h-other@example.test'],
  ]) {
    await c.query(
      `INSERT INTO ${q}.users(id,email,role,status,created_at,updated_at) VALUES($1,$2,'ADMIN','ACTIVE','2026-01-01Z','2026-01-01Z')`,
      [id, email],
    );
  }
  for (const [id, user] of [
    [h[3], h[2]],
    [other, other],
  ]) {
    await c.query(
      `INSERT INTO ${q}.admin_profiles(id,user_id,display_name,created_at,updated_at) VALUES($1,$2,'Fictional operator','2026-01-01Z','2026-01-01Z')`,
      [id, user],
    );
  }
  for (const [id, user, hash] of [
    [h[4], h[2], '1'.repeat(64)],
    [other, other, '2'.repeat(64)],
  ]) {
    await c.query(
      `INSERT INTO ${q}.auth_sessions(id,user_id,token_hash,expires_at,created_at,last_seen_at) VALUES($1,$2,$3,'2027-01-01Z','2026-01-01Z','2026-01-01Z')`,
      [id, user, hash],
    );
  }
  await c.query(
    `INSERT INTO ${q}.currency_installations VALUES(1,$1,'2026-01-01Z')`,
    [installation],
  );
  await c.query(
    `INSERT INTO ${q}.currency_execution_domains VALUES($1,$2,'fictional_database','fictional_schema',$3,'2026-01-01Z')`,
    [h[1], installation, 'a'.repeat(64)],
  );
  await c.query(
    `INSERT INTO ${q}.admin_totp_credentials(id,user_id,secret_ciphertext,key_version,created_at,updated_at) VALUES($1,$2,'Fictional opaque fixture, not a credential','fictional','2026-01-01Z','2026-01-01Z')`,
    [h[6], h[2]],
  );
  await c.query(
    `INSERT INTO ${q}.admin_recovery_codes(id,credential_id,code_hash,created_at) VALUES($1,$2,$3,'2026-01-01Z')`,
    [other, h[6], '3'.repeat(64)],
  );
}
