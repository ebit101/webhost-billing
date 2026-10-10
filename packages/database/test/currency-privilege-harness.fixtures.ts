/** Fictional permission probes only. Not a currency transition/proof/latch installer. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { escapeIdentifier as ident } from 'pg';
import type {
  PrivilegeHarness,
  TestConnection,
} from './currency-privilege-harness';
import { migrationPins } from './currency-privilege-harness.migrations';

const directory = resolve(__dirname, '../prisma/migrations');
function digest(value: Buffer | string): string {
  return createHash('sha256').update(value).digest('hex');
}
export function loadPinnedMigrations() {
  const names = readdirSync(directory, { withFileTypes: true })
    .filter((f) => f.isDirectory())
    .map((f) => f.name)
    .sort();
  assert.deepEqual(
    names,
    Object.keys(migrationPins).sort(),
    'Exactly the 25 baseline migrations and the inert identity migration are required.',
  );
  return names.map((name) => {
    const bytes = readFileSync(resolve(directory, name, 'migration.sql'));
    const sql = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    assert.equal(
      digest(sql.replaceAll('\r\n', '\n')),
      migrationPins[name],
      'Baseline migration content differs.',
    );
    return { name, sql, rawHash: digest(bytes) };
  });
}
export async function applyProductMigrations(
  h: PrivilegeHarness,
  admin: TestConnection,
) {
  await h.verifyOwnership();
  const migrations = loadPinnedMigrations();
  await admin.query(`CREATE SCHEMA ${ident(h.product)}`);
  await admin.query(`SET search_path = ${ident(h.product)}, pg_catalog`);
  for (const migration of migrations) await admin.query(migration.sql);
  const sql = migrations.map((m) => m.sql).join('\n');
  for (const [kind, query, regex] of [
    [
      'tables',
      `SELECT c.relname AS name FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1 AND c.relkind='r' ORDER BY c.relname`,
      /CREATE TABLE\s+"?([a-z_][a-z0-9_]*)"?\s*\(/g,
    ],
    [
      'functions',
      `SELECT p.proname AS name FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname=$1 ORDER BY p.proname`,
      /CREATE FUNCTION\s+"?([a-z_][a-z0-9_]*)"?\s*\(/g,
    ],
    [
      'triggers',
      `SELECT t.tgname AS name FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_class c ON c.oid=t.tgrelid JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1 AND NOT t.tgisinternal ORDER BY t.tgname`,
      /CREATE TRIGGER\s+"?([a-z_][a-z0-9_]*)"?/g,
    ],
  ] as const) {
    const expected = [...sql.matchAll(regex)].map((m) => m[1]).sort();
    assert.deepEqual(
      (await admin.query(query, [h.product])).rows.map((r) => r.name),
      expected,
      `Installed ${kind} differ from pinned migrations.`,
    );
  }
  for (const name of [
    'currency_unit_definitions',
    'currency_policy_revisions',
    'currency_controls',
    'currency_installations',
    'currency_execution_domains',
  ]) {
    assert.equal(
      (
        await admin.query(
          `SELECT count(*)::text AS count FROM ${ident(h.product)}.${ident(name)}`,
        )
      ).rows[0]?.count,
      '0',
    );
  }
  return migrations.map((m) => ({ name: m.name, rawHash: m.rawHash }));
}
export async function productSnapshot(admin: TestConnection, schema: string) {
  const tableResult = await admin.query(
    `SELECT c.relname AS name FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1 AND c.relkind='r' ORDER BY c.relname`,
    [schema],
  );
  const rows: Record<string, unknown> = {};
  for (const table of tableResult.rows) {
    assert.equal(typeof table.name, 'string');
    const name = table.name as string;
    rows[name] = (
      await admin.query(
        `SELECT pg_catalog.to_jsonb(t)::text AS row FROM ${ident(schema)}.${ident(name)} t ORDER BY pg_catalog.to_jsonb(t)::text`,
      )
    ).rows.map((r) => r.row);
  }
  const objects = await admin.query(
    `SELECT c.relname,c.relkind,c.relowner::regrole::text AS owner,c.relrowsecurity,c.relforcerowsecurity,c.relacl::text
    FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1 ORDER BY c.relname`,
    [schema],
  );
  const constraints = await admin.query(
    `SELECT c.conname,c.contype,c.convalidated,pg_catalog.pg_get_constraintdef(c.oid) AS definition
    FROM pg_catalog.pg_constraint c JOIN pg_catalog.pg_namespace n ON n.oid=c.connamespace WHERE n.nspname=$1 ORDER BY c.conname`,
    [schema],
  );
  const triggers = await admin.query(
    `SELECT t.tgname,t.tgenabled,pg_catalog.pg_get_triggerdef(t.oid) AS definition
    FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_class c ON c.oid=t.tgrelid JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1 AND NOT t.tgisinternal ORDER BY t.tgname`,
    [schema],
  );
  const functions = await admin.query(
    `SELECT p.proname,p.proowner::regrole::text AS owner,p.proacl::text,pg_catalog.pg_get_functiondef(p.oid) AS definition
    FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname=$1 ORDER BY p.proname`,
    [schema],
  );
  return {
    rows,
    objects: objects.rows,
    constraints: constraints.rows,
    triggers: triggers.rows,
    functions: functions.rows,
  };
}

export async function installFictionalProbes(
  h: PrivilegeHarness,
  admin: TestConnection,
): Promise<void> {
  await h.verifyOwnership();
  const probe = ident(h.probe);
  const owners = h.roles;
  // One atomic fixture install: no publicly executable definer window, no product shape changes.
  await admin.query('BEGIN');
  try {
    await admin.query(`CREATE SCHEMA ${probe} AUTHORIZATION ${ident(owners.objects)};
      REVOKE ALL ON SCHEMA ${probe} FROM PUBLIC;
      ALTER DEFAULT PRIVILEGES FOR ROLE ${ident(owners.bootstrap)} REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
      ALTER DEFAULT PRIVILEGES FOR ROLE ${ident(owners.functions)} REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
      ALTER DEFAULT PRIVILEGES FOR ROLE ${ident(owners.objects)} IN SCHEMA ${probe} REVOKE ALL ON TABLES FROM PUBLIC;
      CREATE TABLE ${probe}.private_facts(id integer PRIMARY KEY,marker text NOT NULL);
      CREATE TABLE ${probe}.private_rls(id integer PRIMARY KEY,marker text NOT NULL);
      INSERT INTO ${probe}.private_facts VALUES(1,'Fictional private fact');
      INSERT INTO ${probe}.private_rls VALUES(1,'Fictional hidden fact');
      ALTER TABLE ${probe}.private_facts OWNER TO ${ident(owners.objects)};
      ALTER TABLE ${probe}.private_rls OWNER TO ${ident(owners.objects)};
      ALTER TABLE ${probe}.private_rls ENABLE ROW LEVEL SECURITY;
      ALTER TABLE ${probe}.private_rls FORCE ROW LEVEL SECURITY;
      REVOKE ALL ON ALL TABLES IN SCHEMA ${probe} FROM PUBLIC;
      GRANT USAGE ON SCHEMA ${probe} TO ${ident(owners.functions)};
      GRANT SELECT(id,marker) ON ${probe}.private_facts,${probe}.private_rls TO ${ident(owners.functions)};
      CREATE FUNCTION ${probe}.issuer_probe(arg pg_catalog.text) RETURNS pg_catalog.text LANGUAGE sql VOLATILE SECURITY DEFINER
        SET search_path=pg_catalog,pg_temp SET row_security=off AS 'SELECT marker FROM ${probe}.private_facts WHERE id=1';
      CREATE FUNCTION ${probe}.executor_probe() RETURNS pg_catalog.text LANGUAGE sql VOLATILE SECURITY DEFINER
        SET search_path=pg_catalog,pg_temp SET row_security=off AS 'SELECT pg_catalog.lower(marker) FROM ${probe}.private_facts WHERE id=1';
      CREATE FUNCTION ${probe}.rls_probe() RETURNS pg_catalog.text LANGUAGE sql VOLATILE SECURITY DEFINER
        SET search_path=pg_catalog,pg_temp SET row_security=off AS 'SELECT marker FROM ${probe}.private_rls WHERE id=1';
      ALTER FUNCTION ${probe}.issuer_probe(pg_catalog.text) OWNER TO ${ident(owners.functions)};
      ALTER FUNCTION ${probe}.executor_probe() OWNER TO ${ident(owners.functions)};
      ALTER FUNCTION ${probe}.rls_probe() OWNER TO ${ident(owners.functions)};
      REVOKE ALL ON FUNCTION ${probe}.issuer_probe(pg_catalog.text),${probe}.executor_probe(),${probe}.rls_probe() FROM PUBLIC;
      GRANT EXECUTE ON FUNCTION ${probe}.issuer_probe(pg_catalog.text),${probe}.rls_probe() TO ${ident(owners.issuer)};
      GRANT EXECUTE ON FUNCTION ${probe}.executor_probe() TO ${ident(owners.executor)};
      GRANT EXECUTE ON FUNCTION ${probe}.issuer_probe(pg_catalog.text) TO ${ident(owners.attacker)};`);
    for (const duty of [
      'business',
      'issuer',
      'executor',
      'attacker',
    ] as const) {
      await admin.query(`GRANT USAGE ON SCHEMA ${ident(h.product)},${probe} TO ${ident(owners[duty])};
        GRANT SELECT ON ALL TABLES IN SCHEMA ${ident(h.product)} TO ${ident(owners[duty])}`);
    }
    await admin.query('COMMIT');
  } catch (error) {
    await admin.query('ROLLBACK');
    throw error;
  }
}

export async function assertLoginManifest(
  h: PrivilegeHarness,
  admin: TestConnection,
) {
  const names = Object.values(h.roles).filter((n) => n !== h.roles.bootstrap);
  const roles = (
    await admin.query(
      `SELECT r.rolname,r.rolcanlogin,r.rolsuper,r.rolinherit,r.rolcreaterole,r.rolcreatedb,r.rolreplication,r.rolbypassrls,
    CASE WHEN r.rolcanlogin THEN a.rolpassword LIKE 'SCRAM-SHA-256$%' ELSE a.rolpassword IS NULL END AS credential_valid
    FROM pg_catalog.pg_roles r JOIN pg_catalog.pg_authid a ON a.oid=r.oid WHERE r.rolname=ANY($1) ORDER BY r.rolname`,
      [names],
    )
  ).rows;
  assert.equal(roles.length, 6);
  for (const role of roles) {
    assert.equal(
      role.rolcanlogin,
      ![h.roles.objects, h.roles.functions].includes(role.rolname as string),
    );
    for (const flag of [
      'rolsuper',
      'rolinherit',
      'rolcreaterole',
      'rolcreatedb',
      'rolreplication',
      'rolbypassrls',
    ])
      assert.equal(role[flag], false);
    assert.equal(role.credential_valid, true);
  }
  assert.equal(
    (
      await admin.query(
        `SELECT count(*)::text AS count FROM pg_catalog.pg_auth_members m JOIN pg_catalog.pg_roles r ON r.oid=m.member WHERE r.rolname=ANY($1)`,
        [names],
      )
    ).rows[0]?.count,
    '0',
  );
  const owners = (
    await admin.query(
      `SELECT c.relname,c.relowner::regrole::text AS owner FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1 AND c.relkind='r' ORDER BY c.relname`,
      [h.probe],
    )
  ).rows;
  assert.ok(owners.length > 0);
  assert.ok(owners.every((r) => r.owner === h.roles.objects));
  const functions = (
    await admin.query(
      `SELECT p.proname,p.proowner::regrole::text AS owner,p.prosecdef,p.proconfig,
    EXISTS(SELECT 1 FROM pg_catalog.aclexplode(p.proacl) acl WHERE acl.grantee=0 AND acl.privilege_type='EXECUTE') AS public_execute
    FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname=$1 ORDER BY p.proname`,
      [h.probe],
    )
  ).rows;
  assert.equal(functions.length, 3);
  for (const f of functions) {
    assert.equal(f.owner, h.roles.functions);
    assert.equal(f.prosecdef, true);
    assert.equal(f.public_execute, false);
    assert.deepEqual(f.proconfig, [
      'search_path=pg_catalog, pg_temp',
      'row_security=off',
    ]);
  }
  const privileges = (
    await admin.query(
      `SELECT r.rolname,pg_catalog.has_schema_privilege(r.oid,$2,'CREATE') AS schema_create,
    pg_catalog.has_database_privilege(r.oid,$3,'CREATE') AS database_create,
    pg_catalog.has_database_privilege(r.oid,$3,'TEMP') AS temporary
    FROM pg_catalog.pg_roles r WHERE r.rolname=ANY($1) ORDER BY r.rolname`,
      [names, h.probe, h.database],
    )
  ).rows;
  for (const role of privileges) {
    assert.equal(role.schema_create, role.rolname === h.roles.objects);
    assert.equal(role.database_create, false);
    assert.equal(role.temporary, role.rolname === h.roles.attacker);
  }
  // Function owner gets only required column reads, no direct fixture writes or product powers.
  const least = (
    await admin.query(
      `SELECT pg_catalog.has_table_privilege($1,$2,'INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER') AS mutation,
    pg_catalog.has_column_privilege($1,$2,'marker','SELECT') AS marker_read,
    pg_catalog.has_table_privilege($1,$3,'SELECT,INSERT,UPDATE,DELETE') AS product_access`,
      [
        h.roles.functions,
        `${h.probe}.private_facts`,
        `${h.product}.currency_controls`,
      ],
    )
  ).rows[0];
  assert.equal(least?.mutation, false);
  assert.equal(least?.marker_read, true);
  assert.equal(least?.product_access, false);
}
