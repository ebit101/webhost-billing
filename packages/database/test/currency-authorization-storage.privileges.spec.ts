import assert from 'node:assert/strict';
import { test } from 'node:test';
import { escapeIdentifier as ident } from 'pg';
import {
  withCurrencyPrivilegeHarness,
  HarnessSqlFailure,
  type TestConnection,
} from './currency-privilege-harness';
import {
  applyProductMigrations,
  productSnapshot,
  loadPinnedMigrations,
} from './currency-privilege-harness.fixtures';
import {
  catalogProbe,
  probeParents,
  facts,
  storedH,
  insertSql,
  columns,
  evidenceTable,
  baseH,
  other,
  missing,
  installation,
} from './currency-authorization-storage.fixtures';
import { assessmentVectors } from './currency-canonical-parity.vectors';
import { encodeCurrencySelectionAssessment } from '../src/private/currency-selection-assessment';

test(
  'mandatory isolated closed H storage, historical identities and actual duty refusals',
  { timeout: 650000 },
  async (t) => {
    await withCurrencyPrivilegeHarness(async (h) => {
      const admin = await h.connect('bootstrap'),
        p = ident(h.product),
        q = ident(h.probe),
        table = `${p}.${evidenceTable}`;
      const pins = await applyProductMigrations(h, admin);
      await h.installLogins();
      const duties = ['business', 'issuer', 'executor', 'attacker'] as const;
      await admin.query(
        `GRANT USAGE ON SCHEMA ${p} TO ${duties.map((d) => ident(h.roles[d])).join(',')}`,
      );
      const product = await productSnapshot(admin, h.product);
      const securitySnapshot = async () => ({
        roles: (
          await admin.query(
            'SELECT rolname,rolcanlogin,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolreplication,rolbypassrls,rolconnlimit FROM pg_catalog.pg_roles ORDER BY rolname',
          )
        ).rows,
        memberships: (
          await admin.query(
            'SELECT roleid,member,admin_option,inherit_option,set_option FROM pg_catalog.pg_auth_members ORDER BY roleid,member',
          )
        ).rows,
        defaults: (
          await admin.query(
            'SELECT defaclrole,defaclnamespace,defaclobjtype,defaclacl::text FROM pg_catalog.pg_default_acl ORDER BY defaclrole,defaclnamespace,defaclobjtype',
          )
        ).rows,
      });
      const security = await securitySnapshot();
      const unchanged = async (expected = product) => {
        await admin.query(`SET search_path=${p},pg_catalog`);
        assert.deepEqual(await productSnapshot(admin, h.product), expected);
        assert.deepEqual(await securitySnapshot(), security);
        assert.deepEqual(
          loadPinnedMigrations().map((m) => ({
            name: m.name,
            rawHash: m.rawHash,
          })),
          pins,
        );
        await h.verifyOwnership();
      };
      const probeSnapshot = async () => {
        await admin.query(`SET search_path=${p},pg_catalog`);
        return productSnapshot(admin, h.probe);
      };
      async function deny(
        c: TestConnection,
        sql: string,
        values: unknown[] = [],
        code = '23514',
        expected = product,
      ) {
        const before = await probeSnapshot();
        await assert.rejects(
          c.query(sql, values),
          (e) => {
            assert.ok(e instanceof HarnessSqlFailure);
            assert.equal(e.code, code, 'Exact redacted SQLSTATE');
            return true;
          },
          `Expected exact SQLSTATE ${code}`,
        );
        assert.deepEqual(await probeSnapshot(), before);
        await unchanged(expected);
      }
      await t.test(
        'installed catalog has exactly H plus provenance, five restrictive FKs and four fixed invoker guards',
        async () => {
          assert.equal(pins.length, 28);
          assert.ok(
            Object.values(product.rows).every(
              (r) => Array.isArray(r) && r.length === 0,
            ),
          );
          const cols = (
            await admin.query(
              'SELECT column_name,data_type,is_nullable,column_default,collation_name FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2 ORDER BY ordinal_position',
              [h.product, evidenceTable],
            )
          ).rows;
          assert.deepEqual(
            cols.map((c) => c.column_name),
            columns,
          );
          assert.deepEqual(
            cols
              .filter((c) => c.is_nullable === 'YES')
              .map((c) => c.column_name),
            ['recovery_code_id'],
          );
          assert.ok(cols.every((c) => c.column_default === null));
          assert.deepEqual(
            cols
              .filter((c) => c.collation_name !== null)
              .map((c) => [c.column_name, c.collation_name]),
            [['factor_kind', 'C']],
          );
          const fks = (
            await admin.query(
              "SELECT confdeltype,confupdtype,convalidated,pg_catalog.pg_get_constraintdef(oid) AS definition FROM pg_catalog.pg_constraint WHERE conrelid=$1::regclass AND contype='f' ORDER BY conname",
              [table],
            )
          ).rows;
          assert.equal(fks.length, 5);
          assert.ok(
            fks.every(
              (f) =>
                f.confdeltype === 'r' &&
                f.confupdtype === 'r' &&
                f.convalidated,
            ),
          );
          for (const owner of [
            'admin_profiles(id, user_id)',
            'auth_sessions(id, user_id)',
            'currency_execution_domains(installation_id, id)',
          ])
            assert.ok(fks.some((f) => String(f.definition).includes(owner)));
          assert.ok(
            fks.every(
              (f) =>
                !/admin_totp_credentials|admin_recovery_codes/.test(
                  String(f.definition),
                ),
            ),
          );
          const guards = (
            await admin.query(
              'SELECT t.tgtype::int AS type,t.tgenabled,p.prosecdef,p.proconfig,p.proname FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_proc p ON p.oid=t.tgfoid WHERE t.tgrelid=$1::regclass AND NOT t.tgisinternal ORDER BY t.tgname',
              [table],
            )
          ).rows;
          assert.deepEqual(
            guards.map((g) => g.type).sort((a, b) => Number(a) - Number(b)),
            [6, 10, 18, 34],
          );
          assert.ok(
            guards.every(
              (g) =>
                g.tgenabled === 'O' &&
                !g.prosecdef &&
                g.proname === 'deny_currency_authorization_evidence_mutation' &&
                JSON.stringify(g.proconfig) ===
                  '["search_path=pg_catalog, pg_temp"]',
            ),
          );
          for (const [catalog, oid] of [
            ['pg_class', table],
            ['pg_proc', `${p}.deny_currency_authorization_evidence_mutation()`],
          ] as const) {
            const col = catalog === 'pg_class' ? 'relacl' : 'proacl',
              cast = catalog === 'pg_class' ? 'regclass' : 'regprocedure';
            assert.equal(
              (
                await admin.query(
                  `SELECT count(*)::text AS count FROM pg_catalog.${catalog} c CROSS JOIN LATERAL pg_catalog.aclexplode(c.${col}) a WHERE c.oid=$1::${cast} AND a.grantee=0`,
                  [oid],
                )
              ).rows[0]?.count,
              '0',
            );
          }
          for (const sql of [
            `INSERT INTO ${table} DEFAULT VALUES`,
            `INSERT INTO ${table} SELECT * FROM ${table} WHERE false`,
            `UPDATE ${table} SET factor_kind=factor_kind WHERE false`,
            `DELETE FROM ${table} WHERE false`,
            `TRUNCATE ${table}`,
          ])
            await deny(admin, sql);
        },
      );
      await t.test(
        'fictional probe copies installed columns, checks, keys and allowed parent FKs only',
        async () => {
          await catalogProbe(admin, h.product, h.probe);
          await probeParents(admin, h.probe);
          await unchanged();
        },
      );
      const insert = insertSql(h.probe);
      await t.test(
        'five unchanged literal A vectors reconstruct H from typed probe columns exactly',
        async () => {
          for (const [v, bytes, hash] of assessmentVectors()) {
            const a = JSON.stringify(v.assessment),
              s = JSON.stringify(v.stable);
            await admin.query('BEGIN');
            try {
              await admin.query(insert, facts(v.assessment[6] as unknown[]));
              const rows = await storedH(admin, h.probe);
              assert.deepEqual(rows, [v.assessment[6]]);
              const reconstructed = [...v.assessment];
              reconstructed[6] = rows[0];
              const encoded = encodeCurrencySelectionAssessment(
                s,
                JSON.stringify(reconstructed),
              );
              assert.ok(encoded.success);
              assert.equal(encoded.canonicalText, a);
              assert.equal(Buffer.byteLength(encoded.canonicalText), bytes);
              assert.equal(encoded.assessmentDigest, hash);
            } finally {
              await admin.query('ROLLBACK');
            }
            await unchanged();
          }
        },
      );
      await t.test(
        'both factors, exact large epochs and all accepted UUID forms retain typed lowercase output',
        async () => {
          const uuids = [
            '00000000-0000-0000-0000-000000000000',
            'ffffffff-ffff-ffff-ffff-ffffffffffff',
            ...'12345678'
              .split('')
              .flatMap((v) =>
                '89ab'
                  .split('')
                  .map((b) => `a0b1c2d3-0000-${v}000-${b}000-abcd12345678`),
              ),
          ];
          const samples: unknown[][] = [];
          for (const epoch of [
            '1',
            '9007199254740992',
            '9007199254740993',
            '9223372036854775807',
          ]) {
            for (const factor of ['totp', 'recovery']) {
              const row = facts();
              row[5] = epoch;
              row[7] = epoch;
              row[8] = factor;
              row[9] = factor === 'recovery' ? other : null;
              samples.push(row);
            }
          }
          for (const uuid of uuids) {
            const row = facts();
            row[0] = uuid.toUpperCase();
            row[6] = uuid;
            row[8] = 'recovery';
            row[9] = uuid;
            samples.push(row);
          }
          // Every bound UUID position accepts the same grammar, not only the three
          // unreferenced identities. Re-key fictional parents before H exists; rollback
          // leaves both complete probe and installed product catalogs/rows unchanged.
          for (const uuid of uuids) {
            const before = await probeSnapshot();
            await admin.query('BEGIN');
            try {
              await admin.query(`UPDATE ${q}.users SET id=$1 WHERE id=$2`, [
                uuid,
                baseH[2],
              ]);
              await admin.query(
                `UPDATE ${q}.admin_profiles SET id=$1 WHERE user_id=$1`,
                [uuid],
              );
              await admin.query(
                `UPDATE ${q}.auth_sessions SET id=$1 WHERE user_id=$1`,
                [uuid],
              );
              await admin.query(`DELETE FROM ${q}.currency_execution_domains`);
              await admin.query(
                `UPDATE ${q}.currency_installations SET installation_id=$1`,
                [uuid],
              );
              await admin.query(
                `INSERT INTO ${q}.currency_execution_domains VALUES($1,$1,'fictional_database','fictional_schema',$2,'2026-01-01Z')`,
                [uuid, 'a'.repeat(64)],
              );
              const row = facts();
              for (const slot of [0, 1, 2, 3, 4, 6, 9, 10])
                row[slot] = uuid.toUpperCase();
              row[8] = 'recovery';
              await admin.query(insert, row);
              const expected = row.slice(0, 10);
              for (const slot of [0, 1, 2, 3, 4, 6, 9]) expected[slot] = uuid;
              assert.deepEqual(await storedH(admin, h.probe), [expected]);
            } finally {
              await admin.query('ROLLBACK');
            }
            assert.deepEqual(await probeSnapshot(), before);
            await unchanged();
          }
          for (const row of samples) {
            await admin.query('BEGIN');
            try {
              await admin.query(insert, row);
              const expected = row.slice(0, 10);
              expected[0] = String(expected[0]).toLowerCase();
              assert.deepEqual(await storedH(admin, h.probe), [expected]);
            } finally {
              await admin.query('ROLLBACK');
            }
            await unchanged();
          }
        },
      );
      await t.test(
        'malformed, null, overflow, factor mismatch, absent and wrong-owner parents deny without effects',
        async () => {
          const base = facts();
          for (let i = 0; i < columns.length; i++) {
            if (i === 9) continue;
            const row = [...base];
            row[i] = null;
            await deny(admin, insert, row, '23502');
          }
          const uuidSlots = [0, 1, 2, 3, 4, 6, 9, 10];
          for (const i of uuidSlots) {
            for (const [value, code] of [
              ['not-a-uuid', '22P02'],
              ['10000000-0000-0000-8000-000000000001', '23514'],
              ['10000000-0000-9000-8000-000000000001', '23514'],
              ['10000000-0000-4000-7000-000000000001', '23514'],
            ] as const) {
              const row = [...base];
              if (i === 9) row[8] = 'recovery';
              row[i] = value;
              await deny(admin, insert, row, code);
            }
          }
          for (const i of [5, 7])
            for (const [value, code] of [
              ['0', '23514'],
              ['-1', '23514'],
              ['9223372036854775808', '22003'],
              ['2.0', '22P02'],
              ['1e0', '22P02'],
            ] as const) {
              const row = [...base];
              row[i] = value;
              await deny(admin, insert, row, code);
            }
          for (const [i, value, code] of [
            [8, 'TOTP', '23514'],
            [8, 'recovery', '23514'],
            [8, 'unknown', '23514'],
            [8, 'totp\n', '23514'],
            [8, 'x'.repeat(9), '22001'],
            [9, other, '23514'],
            [11, 'infinity', '23514'],
            [11, '-infinity', '23514'],
            [11, 'bad time', '22007'],
          ] as const) {
            const row = [...base];
            row[i] = value;
            await deny(admin, insert, row, code);
          }
          for (const [i, value] of [
            [10, missing],
            [1, missing],
            [2, missing],
            [3, missing],
            [4, missing],
            [3, other],
            [4, other],
          ] as const) {
            const row = [...base];
            row[i] = value;
            await deny(admin, insert, row, '23503');
          }
          // A domain exists, but belongs to the retained installation, not the proposed one.
          await deny(
            admin,
            `UPDATE ${q}.currency_execution_domains SET installation_id=$1 WHERE id=$2`,
            [missing, baseH[1]],
            '23503',
          );
          await deny(
            admin,
            `INSERT INTO ${q}.${evidenceTable} (${columns.map(ident).join(',')},unexpected) VALUES (${columns.map((_, i) => '$' + String(i + 1)).join(',')},1)`,
            base,
            '42703',
          );
          await deny(admin, insert, [...base, 'extra'], '08P01');
        },
      );
      await t.test(
        'one immutable evidence slot restricts owner keys but allows non-key security updates and secret replacement',
        async () => {
          const row = facts();
          row[8] = 'recovery';
          row[9] = other;
          await admin.query(insert, row);
          await deny(admin, insert, row, '23505');
          for (const parent of [
            'users',
            'admin_profiles',
            'auth_sessions',
            'currency_execution_domains',
            'currency_installations',
          ]) {
            const field =
              parent === 'currency_installations' ? 'installation_id' : 'id';
            const id =
              parent === 'users'
                ? baseH[2]
                : parent === 'admin_profiles'
                  ? baseH[3]
                  : parent === 'auth_sessions'
                    ? baseH[4]
                    : parent === 'currency_execution_domains'
                      ? baseH[1]
                      : installation;
            await deny(
              admin,
              `DELETE FROM ${q}.${parent} WHERE ${field}=$1`,
              [id],
              '23001',
            );
            await deny(
              admin,
              `UPDATE ${q}.${parent} SET ${field}=$1 WHERE ${field}=$2`,
              [missing, id],
              '23001',
            );
          }
          // Existing second profile already occupies other's unique user slot.
          // Use an independently existing user with no profile, so the historical
          // compound FK refusal is tested rather than a prior unique-key collision.
          await admin.query(
            `INSERT INTO ${q}.users(id,email,role,updated_at) VALUES($1,'h-unassigned@example.test','ADMIN','2026-01-01Z')`,
            [missing],
          );
          for (const parent of ['admin_profiles', 'auth_sessions'])
            await deny(
              admin,
              `UPDATE ${q}.${parent} SET user_id=$1 WHERE id=$2`,
              [
                parent === 'admin_profiles' ? missing : other,
                parent === 'admin_profiles' ? baseH[3] : baseH[4],
              ],
              '23001',
            );
          await admin.query(
            `UPDATE ${q}.users SET status='DISABLED',password_hash='Fictional replacement',email_verified_at=NULL WHERE id=$1`,
            [baseH[2]],
          );
          await admin.query(
            `UPDATE ${q}.admin_profiles SET staff_role='SUPPORT_OPERATOR',is_super_admin=false WHERE id=$1`,
            [baseH[3]],
          );
          await admin.query(
            `UPDATE ${q}.auth_sessions SET revoked_at='2026-02-01Z',revoked_reason='Fictional',two_factor_verified_at=NULL WHERE id=$1`,
            [baseH[4]],
          );
          const historical = await storedH(admin, h.probe);
          // Recovery regeneration deletes/replaces secrets, without touching copied historical IDs.
          await admin.query(
            `DELETE FROM ${q}.admin_recovery_codes WHERE credential_id=$1`,
            [baseH[6]],
          );
          await admin.query(
            `INSERT INTO ${q}.admin_recovery_codes(id,credential_id,code_hash) VALUES($1,$2,$3)`,
            [missing, baseH[6], '4'.repeat(64)],
          );
          assert.deepEqual(await storedH(admin, h.probe), historical);
          // MFA disable cascades secret recovery rows; re-enrollment uses a new public credential UUID.
          await admin.query(
            `DELETE FROM ${q}.admin_totp_credentials WHERE id=$1`,
            [baseH[6]],
          );
          assert.equal(
            (
              await admin.query(
                `SELECT count(*)::text AS count FROM ${q}.admin_recovery_codes`,
              )
            ).rows[0]?.count,
            '0',
          );
          await admin.query(
            `INSERT INTO ${q}.admin_totp_credentials(id,user_id,secret_ciphertext,key_version,updated_at) VALUES($1,$2,'Fictional replacement','fictional','2026-02-01Z')`,
            [missing, baseH[2]],
          );
          await admin.query(
            `INSERT INTO ${q}.admin_recovery_codes(id,credential_id,code_hash) VALUES($1,$2,$3)`,
            [missing, missing, '5'.repeat(64)],
          );
          assert.deepEqual(await storedH(admin, h.probe), historical);
          await unchanged();
        },
      );
      const statements = [
        `INSERT INTO ${table} DEFAULT VALUES`,
        `INSERT INTO ${table} SELECT * FROM ${table} WHERE false ON CONFLICT DO NOTHING`,
        `UPDATE ${table} SET factor_kind=factor_kind WHERE false`,
        `DELETE FROM ${table} WHERE false`,
        `TRUNCATE ${table}`,
        `COPY ${table} FROM STDIN`,
        `MERGE INTO ${table} d USING (SELECT * FROM ${table} WHERE false) s ON d.id=s.id WHEN MATCHED THEN DELETE`,
      ];
      await t.test(
        'distinct business, issuer, executor and attacker logins cannot write or escalate',
        async () => {
          for (const duty of duties) {
            const c = await h.connect(duty);
            for (const sql of [
              ...statements,
              `SELECT ${p}.deny_currency_authorization_evidence_mutation()`,
              `ALTER TABLE ${table} DISABLE TRIGGER ALL`,
              `DROP TABLE ${table}`,
              `ALTER TABLE ${table} OWNER TO ${ident(h.roles[duty])}`,
              `ALTER FUNCTION ${p}.deny_currency_authorization_evidence_mutation() SECURITY DEFINER`,
              `CREATE TABLE ${p}.unapproved(id integer)`,
              `SET ROLE ${ident(h.roles.bootstrap)}`,
              `SET ROLE ${ident(h.roles.functions)}`,
              `SET session_replication_role=replica`,
            ])
              await deny(c, sql, [], '42501');
            await c.end();
          }
        },
      );
      await t.test(
        'narrow fixture grants still deny conflict, MERGE, nested and no-op paths with complete snapshots after each denial',
        async () => {
          await admin.query(
            `GRANT SELECT,INSERT,UPDATE,DELETE,TRUNCATE ON TABLE ${table} TO ${duties.map((d) => ident(h.roles[d])).join(',')}`,
          );
          const granted = await productSnapshot(admin, h.product);
          for (const duty of duties) {
            const c = await h.connect(duty);
            for (const sql of [
              ...statements,
              `INSERT INTO ${table} SELECT * FROM ${table} WHERE false ON CONFLICT (id) DO UPDATE SET factor_kind=EXCLUDED.factor_kind`,
              `WITH attempted AS (DELETE FROM ${table} WHERE false RETURNING *) SELECT * FROM attempted`,
            ])
              await deny(c, sql, [], '23514', granted);
            await c.end();
          }
          await admin.query(
            `REVOKE ALL ON TABLE ${table} FROM ${duties.map((d) => ident(h.roles[d])).join(',')}`,
          );
          await unchanged();
        },
      );
      await unchanged();
      await admin.end();
    });
  },
);
