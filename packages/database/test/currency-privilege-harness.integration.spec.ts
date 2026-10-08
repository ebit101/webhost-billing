import assert from 'node:assert/strict';
import { test } from 'node:test';
import { escapeIdentifier as ident } from 'pg';
import {
  HarnessSqlFailure,
  withCurrencyPrivilegeHarness,
  type TestConnection,
} from './currency-privilege-harness';
import {
  applyProductMigrations,
  installFictionalProbes,
  assertLoginManifest,
  loadPinnedMigrations,
  productSnapshot,
} from './currency-privilege-harness.fixtures';

async function preciseDenial(
  client: TestConnection,
  sql: string,
  code = '42501',
) {
  await assert.rejects(
    client.query(sql),
    (e) => e instanceof HarnessSqlFailure && e.code === code,
    'Expected the precise SQL permission/integrity refusal.',
  );
}

test(
  'mandatory fresh-cluster actual-login privilege acceptance (not production authority)',
  { timeout: 650000 },
  async (t) => {
    await withCurrencyPrivilegeHarness(async (h) => {
      const root = await h.connect('bootstrap');
      const q = `${ident(h.product)}.`;
      const p = `${ident(h.probe)}.`;
      const rawBefore = await applyProductMigrations(h, root);
      const empty = await productSnapshot(root, h.product);
      assert.ok(
        Object.values(empty.rows).every(
          (rows) => Array.isArray(rows) && rows.length === 0,
        ),
      );
      await root.query(`INSERT INTO ${q}currency_controls(id) VALUES(1)`);
      const control = (
        await root.query(
          `SELECT generation::text AS generation,selected_policy_revision,history_latched,base_code,base_metadata_version,base_minor_unit_exponent FROM ${q}currency_controls`,
        )
      ).rows;
      assert.deepEqual(control, [
        {
          generation: '0',
          selected_policy_revision: null,
          history_latched: null,
          base_code: null,
          base_metadata_version: null,
          base_minor_unit_exponent: null,
        },
      ]);
      await h.installLogins();
      await installFictionalProbes(h, root);
      const baseline = await productSnapshot(root, h.product);
      const privateFacts = (
        await root.query(`SELECT * FROM ${p}private_facts ORDER BY id`)
      ).rows;
      // Recheck trusted objects/facts and role/default/database ACLs after every denial,
      // not only at the end. Temporary decoys are deliberately outside these schemas.
      const privilegeSnapshot = async () => ({
        probe: await productSnapshot(root, h.probe),
        roles: (
          await root.query(
            `SELECT rolname,rolcanlogin,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolreplication,rolbypassrls,rolconnlimit FROM pg_catalog.pg_roles ORDER BY rolname`,
          )
        ).rows,
        memberships: (
          await root.query(
            `SELECT roleid::regrole::text AS owner,member::regrole::text AS member,admin_option,inherit_option,set_option FROM pg_catalog.pg_auth_members ORDER BY roleid,member`,
          )
        ).rows,
        defaults: (
          await root.query(
            `SELECT defaclrole::regrole::text AS owner,defaclnamespace,defaclobjtype,defaclacl::text FROM pg_catalog.pg_default_acl ORDER BY defaclrole,defaclnamespace,defaclobjtype`,
          )
        ).rows,
        database: (
          await root.query(
            `SELECT datacl::text FROM pg_catalog.pg_database WHERE datname=$1`,
            [h.database],
          )
        ).rows,
      });
      const privilegeBaseline = await privilegeSnapshot();
      const denied = async (
        client: TestConnection,
        sql: string,
        code = '42501',
      ) => {
        await preciseDenial(client, sql, code);
        assert.deepEqual(await productSnapshot(root, h.product), baseline);
        assert.deepEqual(await privilegeSnapshot(), privilegeBaseline);
      };
      const clients = new Map<string, TestConnection>();
      for (const duty of [
        'business',
        'issuer',
        'executor',
        'attacker',
      ] as const)
        clients.set(duty, await h.connect(duty));
      const business = clients.get('business')!;
      const issuer = clients.get('issuer')!;
      const executor = clients.get('executor')!;
      const attacker = clients.get('attacker')!;

      await t.test(
        'pinned migrations and authentic separate SCRAM logins with minimal owners',
        async () => {
          await assertLoginManifest(h, root);
          for (const duty of [
            'business',
            'issuer',
            'executor',
            'attacker',
          ] as const) {
            const result = (
              await clients
                .get(duty)!
                .query(
                  'SELECT session_user::text AS session,current_user::text AS actor',
                )
            ).rows;
            assert.deepEqual(result, [
              { session: h.roles[duty], actor: h.roles[duty] },
            ]);
            assert.equal(
              (
                await clients
                  .get(duty)!
                  .query(
                    `SELECT count(*)::text AS count FROM ${q}currency_controls`,
                  )
              ).rows[0]?.count,
              '1',
            );
          }
        },
      );
      await t.test(
        'authorized fictional probes succeed; private facts and cross-duty EXECUTE remain denied',
        async () => {
          assert.equal(
            (
              await issuer.query(
                `SELECT ${p}issuer_probe('fixture'::pg_catalog.text) AS fact`,
              )
            ).rows[0]?.fact,
            'Fictional private fact',
          );
          assert.equal(
            (await executor.query(`SELECT ${p}executor_probe() AS fact`))
              .rows[0]?.fact,
            'fictional private fact',
          );
          for (const client of clients.values()) {
            for (const sql of [
              `SELECT * FROM ${p}private_facts`,
              `INSERT INTO ${p}private_facts VALUES(2,'Rejected')`,
              `UPDATE ${p}private_facts SET marker=marker WHERE false`,
              `DELETE FROM ${p}private_facts WHERE false`,
              `TRUNCATE ${p}private_facts`,
            ])
              await denied(client, sql);
          }
          await denied(business, `SELECT ${p}issuer_probe('fixture'::text)`);
          await denied(business, `SELECT ${p}executor_probe()`);
          await denied(issuer, `SELECT ${p}executor_probe()`);
          await denied(executor, `SELECT ${p}issuer_probe('fixture'::text)`);
        },
      );
      await t.test(
        'protected product mutation is denied by ACL even for no-row, conflict and nested statements',
        async () => {
          for (const client of clients.values()) {
            for (const sql of [
              `INSERT INTO ${q}currency_controls(id) VALUES(1) ON CONFLICT DO NOTHING`,
              `INSERT INTO ${q}currency_controls(id) SELECT 1 WHERE false`,
              `UPDATE ${q}currency_controls SET generation=generation WHERE false`,
              `DELETE FROM ${q}currency_controls WHERE false`,
              `TRUNCATE ${q}currency_controls`,
              `INSERT INTO ${q}currency_controls(id) VALUES(1) ON CONFLICT(id) DO UPDATE SET generation=0`,
              `MERGE INTO ${q}currency_controls t USING(SELECT 1::smallint AS id) s ON t.id=s.id WHEN MATCHED THEN UPDATE SET generation=0`,
              `WITH changed AS(UPDATE ${q}currency_controls SET generation=0 WHERE false RETURNING id) SELECT id FROM changed`,
              `COPY ${q}currency_controls(id) FROM STDIN`,
              `UPDATE ${q}currency_unit_definitions SET provenance=provenance WHERE false`,
              `INSERT INTO ${q}currency_unit_definitions DEFAULT VALUES`,
              `DELETE FROM ${q}currency_unit_definitions WHERE false`,
              `TRUNCATE ${q}currency_unit_definitions`,
              `UPDATE ${q}currency_policy_revisions SET policy=policy WHERE false`,
              `INSERT INTO ${q}currency_policy_revisions DEFAULT VALUES`,
              `DELETE FROM ${q}currency_policy_revisions WHERE false`,
              `TRUNCATE ${q}currency_policy_revisions`,
            ])
              await denied(client, sql);
          }
        },
      );
      await t.test(
        'existing SQL integrity guards still deny operator no-ops separately from ACL refusal',
        async () => {
          for (const sql of [
            `UPDATE ${q}currency_controls SET generation=0 WHERE false`,
            `DELETE FROM ${q}currency_controls WHERE false`,
            `TRUNCATE ${q}currency_controls`,
            `UPDATE ${q}currency_unit_definitions SET provenance=provenance WHERE false`,
            `UPDATE ${q}currency_policy_revisions SET policy=policy WHERE false`,
          ])
            await denied(root, sql, '23514');
        },
      );
      await t.test(
        'no login can inherit/SET ROLE, create owners/objects or bypass original guards',
        async () => {
          for (const client of clients.values()) {
            for (const role of Object.values(h.roles)) {
              const own = (
                await client.query('SELECT current_user::text AS actor')
              ).rows[0]?.actor;
              if (role !== own) await denied(client, `SET ROLE ${ident(role)}`);
            }
            for (const sql of [
              `CREATE ROLE c106_rejected_owner SUPERUSER`,
              `ALTER ROLE ${ident(h.roles.business)} SUPERUSER`,
              `GRANT ${ident(h.roles.functions)} TO ${ident(h.roles.business)}`,
              `CREATE TABLE ${p}rejected(id integer)`,
              `CREATE SCHEMA c106_rejected`,
              `ALTER TABLE ${q}currency_controls DISABLE TRIGGER ALL`,
              `DROP TRIGGER currency_controls_no_update ON ${q}currency_controls`,
              `CREATE OR REPLACE FUNCTION ${q}deny_currency_control_mutation() RETURNS trigger LANGUAGE plpgsql AS 'BEGIN RETURN NULL; END'`,
              `CREATE TRIGGER rejected BEFORE UPDATE ON ${q}currency_controls FOR EACH STATEMENT EXECUTE FUNCTION ${q}deny_currency_control_mutation()`,
              `ALTER FUNCTION ${q}deny_currency_control_mutation() OWNER TO ${ident(h.roles.business)}`,
              `SET session_replication_role=replica`,
            ])
              await denied(client, sql);
          }
        },
      );
      await t.test(
        'PUBLIC and default function ACLs do not create an execution window',
        async () => {
          await assertLoginManifest(h, root);
          await root.query(
            `BEGIN; CREATE FUNCTION ${p}default_acl_probe() RETURNS text LANGUAGE sql AS 'SELECT ''Fictional default fact''';`,
          );
          try {
            assert.equal(
              (
                await root.query(
                  `SELECT pg_catalog.has_function_privilege($1,$2,'EXECUTE') AS allowed`,
                  [h.roles.business, `${h.probe}.default_acl_probe()`],
                )
              ).rows[0]?.allowed,
              false,
            );
          } finally {
            await root.query('ROLLBACK');
          }
        },
      );
      await t.test(
        'untrusted temporary/table/function-overload decoys cannot redirect a qualified definer probe',
        async () => {
          await attacker.query(`CREATE TEMP TABLE private_facts(id integer,marker text); INSERT INTO private_facts VALUES(1,'Decoy fact');
        CREATE FUNCTION pg_temp.issuer_probe(arg varchar) RETURNS text LANGUAGE sql AS 'SELECT ''Decoy function''';
        CREATE FUNCTION pg_temp.lower(arg text) RETURNS text LANGUAGE sql AS 'SELECT ''Decoy lower''';
        SET search_path=pg_temp,${ident(h.probe)},pg_catalog;`);
          assert.equal(
            (
              await attacker.query(
                `SELECT ${p}issuer_probe('fixture'::pg_catalog.text) AS fact`,
              )
            ).rows[0]?.fact,
            'Fictional private fact',
          );
          await denied(
            attacker,
            `CREATE FUNCTION ${p}issuer_probe(arg varchar) RETURNS text LANGUAGE sql AS 'SELECT ''Decoy function'''`,
          );
          await denied(attacker, `SELECT ${p}executor_probe()`);
          for (const client of [business, issuer, executor])
            await denied(client, 'CREATE TEMP TABLE rejected_temp(id integer)');
        },
      );
      await t.test(
        'restrictive RLS plus row_security=off refuses hidden rows rather than inventing emptiness',
        async () => {
          await denied(issuer, `SELECT ${p}rls_probe()`);
          assert.equal(
            (
              await root.query(
                `SELECT count(*)::text AS count FROM ${p}private_rls`,
              )
            ).rows[0]?.count,
            '1',
          );
        },
      );
      await t.test(
        'real statement deadline rejects slow SQL and releases the same login for subsequent work',
        async () => {
          await denied(business, 'SELECT pg_catalog.pg_sleep(3)', '57014');
          assert.equal(
            (await business.query('SELECT 1 AS ready')).rows[0]?.ready,
            1,
          );
        },
      );
      await t.test(
        'all product rows, original guards, probe facts, roles and migration bytes remain unchanged',
        async () => {
          assert.deepEqual(await productSnapshot(root, h.product), baseline);
          assert.deepEqual(
            (await root.query(`SELECT * FROM ${p}private_facts ORDER BY id`))
              .rows,
            privateFacts,
          );
          await assertLoginManifest(h, root);
          assert.deepEqual(
            loadPinnedMigrations().map((m) => ({
              name: m.name,
              rawHash: m.rawHash,
            })),
            rawBefore,
          );
          await h.verifyOwnership();
        },
      );
      for (const client of clients.values()) await client.end();
      await root.end();
    });
  },
);
