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
  canonicalArgs,
  insertSql,
  columns,
  intentTable,
  canonicalSignature,
  fictional,
} from './currency-intent-storage.fixtures';
import { stableVectors, stableBase } from './currency-canonical-parity.vectors';
import { encodeCurrencySelectionIntent } from '../src/private/currency-selection-intent';

test(
  'mandatory isolated closed intent storage, independent bindings and actual duty refusals',
  { timeout: 650000 },
  async (t) => {
    await withCurrencyPrivilegeHarness(async (h) => {
      const admin = await h.connect('bootstrap');
      const p = ident(h.product),
        q = ident(h.probe),
        table = `${p}.${intentTable}`;
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
      assert.ok(
        Object.values(product.rows).every(
          (rows) => Array.isArray(rows) && rows.length === 0,
        ),
      );
      const unchangedProduct = async (expected = product) => {
        await admin.query(`SET search_path=${p},pg_catalog`);
        assert.deepEqual(await productSnapshot(admin, h.product), expected);
        assert.deepEqual(
          loadPinnedMigrations().map((m) => ({
            name: m.name,
            rawHash: m.rawHash,
          })),
          pins,
        );
        await h.verifyOwnership();
        assert.deepEqual(await securitySnapshot(), security);
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
      ) {
        const before = await probeSnapshot();
        await assert.rejects(
          c.query(sql, values),
          (e) => {
            assert.ok(e instanceof HarnessSqlFailure);
            assert.equal(
              e.code,
              code,
              'Exact SQLSTATE for fictional rejection',
            );
            return true;
          },
          'Expected exact redacted SQLSTATE',
        );
        assert.deepEqual(await probeSnapshot(), before);
        await unchangedProduct();
      }
      await t.test(
        'installed catalog is exact, empty, private and unconditionally closed',
        async () => {
          assert.equal(pins.length, 28);
          const cols = (
            await admin.query(
              `SELECT column_name,data_type,is_nullable,column_default,collation_name FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2 ORDER BY ordinal_position`,
              [h.product, intentTable],
            )
          ).rows;
          assert.deepEqual(
            cols.map((c) => c.column_name),
            columns,
          );
          assert.equal(cols.filter((c) => c.is_nullable === 'YES').length, 1);
          assert.equal(
            cols.find((c) => c.is_nullable === 'YES')?.column_name,
            'expected_revision',
          );
          assert.ok(cols.every((c) => c.column_default === null));
          assert.deepEqual(
            cols
              .filter((c) => c.collation_name !== null)
              .map((c) => c.collation_name),
            Array(6).fill('C'),
          );
          const foreign = (
            await admin.query(
              `SELECT conname,confdeltype,confupdtype,convalidated,pg_catalog.pg_get_constraintdef(oid) AS definition FROM pg_catalog.pg_constraint WHERE conrelid=$1::regclass AND contype='f' ORDER BY conname`,
              [table],
            )
          ).rows;
          assert.equal(foreign.length, 6);
          assert.ok(
            foreign.every(
              (c) =>
                c.confdeltype === 'r' &&
                c.confupdtype === 'r' &&
                c.convalidated,
            ),
          );
          assert.ok(
            foreign.some(
              (c) =>
                String(c.definition).includes(
                  'FOREIGN KEY (session_id, actor_user_id)',
                ) &&
                String(c.definition).includes('auth_sessions(id, user_id)'),
            ),
          );
          const guards = (
            await admin.query(
              `SELECT t.tgtype::int AS type,t.tgenabled,p.prosecdef,p.proconfig,p.proname FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_proc p ON p.oid=t.tgfoid WHERE t.tgrelid=$1::regclass AND NOT t.tgisinternal ORDER BY t.tgname`,
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
                g.prosecdef === false &&
                g.proname === 'deny_currency_selection_intent_mutation' &&
                JSON.stringify(g.proconfig) ===
                  '["search_path=pg_catalog, pg_temp"]',
            ),
          );
          assert.equal(
            (
              await admin.query(
                `SELECT count(*)::text AS count FROM pg_catalog.pg_proc p CROSS JOIN LATERAL pg_catalog.aclexplode(p.proacl) a WHERE p.oid=ANY($1::regprocedure[]) AND a.grantee=0`,
                [
                  [
                    `${p}.${canonicalSignature}`,
                    `${p}.deny_currency_selection_intent_mutation()`,
                  ],
                ],
              )
            ).rows[0]?.count,
            '0',
          );
          assert.equal(
            (
              await admin.query(
                `SELECT count(*)::text AS count FROM pg_catalog.pg_class c CROSS JOIN LATERAL pg_catalog.aclexplode(c.relacl) a WHERE c.oid=$1::regclass AND a.grantee=0`,
                [table],
              )
            ).rows[0]?.count,
            '0',
          );
          for (const sql of [
            `INSERT INTO ${table} DEFAULT VALUES`,
            `INSERT INTO ${table} SELECT * FROM ${table} WHERE false`,
            `UPDATE ${table} SET action=action WHERE false`,
            `DELETE FROM ${table} WHERE false`,
            `TRUNCATE ${table}`,
          ])
            await deny(admin, sql);
        },
      );
      await t.test(
        'probe copies installed columns, CHECKs, indexes and exact FKs without product opening',
        async () => {
          await catalogProbe(admin, h.product, h.probe);
          await probeParents(admin, h.probe);
          await unchangedProduct();
        },
      );
      const insert = insertSql(h.probe);
      await t.test(
        'five literal S byte/hash vectors independently bind SQL scalars and exact stored text',
        async () => {
          for (const [text, bytes, hash] of stableVectors) {
            const row = facts(text);
            const node = encodeCurrencySelectionIntent(text);
            assert.ok(node.success);
            assert.equal(node.stableIntentDigest, hash);
            assert.equal(Buffer.byteLength(text), bytes);
            const sql = (
              await admin.query(
                `SELECT ${p}.currency_selection_intent_canonical($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::text,$7::text,$8::bigint,$9::text) AS value`,
                canonicalArgs(row),
              )
            ).rows[0]?.value;
            assert.equal(sql, text);
            await admin.query('BEGIN');
            try {
              await admin.query(insert, row);
              const stored = (
                await admin.query(
                  `SELECT request_key_text,request_key_uuid::text,expected_generation::text,canonical_text,stable_intent_digest FROM ${q}.${intentTable}`,
                )
              ).rows;
              assert.deepEqual(stored, [
                {
                  request_key_text: row[5],
                  request_key_uuid: String(row[5]).toLowerCase(),
                  expected_generation: row[8],
                  canonical_text: text,
                  stable_intent_digest: hash,
                },
              ]);
            } finally {
              await admin.query('ROLLBACK');
            }
            await unchangedProduct();
          }
        },
      );
      await t.test(
        'primitive boundaries, nulls, aliases, mismatched scalars/digests and missing owners deny',
        async () => {
          const base = facts(stableBase);
          for (let i = 0; i < columns.length; i++) {
            if (i === 7) continue;
            const row = [...base];
            row[i] = null;
            await deny(admin, insert, row, '23502');
          }
          const bad: [number, unknown, string][] = [
            [0, 'not-a-uuid', '22P02'],
            [1, 'not-a-uuid', '22P02'],
            [8, '9223372036854775808', '22003'],
            [8, '2.0', '22P02'],
            [8, '-1', '23514'],
            [8, '1', '23514'],
            [6, 'unknown', '23514'],
            [6, 'replace', '23514'],
            [7, 'fictional-v0', '23514'],
            [5, 'A0B1C2D3-0000-0000-8000-ABCD12345678', '23514'],
            [5, 'FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF', '23514'],
            [5, String(base[5]) + '\n', '23514'],
            [5, 'x'.repeat(1025), '23514'],
            [5, 'é'.repeat(36), '23514'],
            [9, 'bad\n', '23514'],
            [9, 'bad"', '23514'],
            [9, 'x'.repeat(65), '22001'],
            [10, String(base[10]) + '\n', '23514'],
            [10, ' '.repeat(1024), '23514'],
            [10, ' '.repeat(1025), '23514'],
            [10, String(base[10]).replace('"0"', '0'), '23514'],
            ...['00', '-0', '0.0', '1e0'].map(
              (alias): [number, unknown, string] => [
                10,
                String(base[10]).replace('"0"', `"${alias}"`),
                '23514',
              ],
            ),
            [
              10,
              String(base[10]).replace('initialize', '\\u0069nitialize'),
              '23514',
            ],
            [10, JSON.stringify(JSON.parse(stableBase), null, 2), '23514'],
            [11, 'a'.repeat(64), '23514'],
            [11, String(base[11]).toUpperCase(), '23514'],
            [11, 'a'.repeat(63) + '\n', '23514'],
          ];
          for (const [i, value, code] of bad) {
            const row = [...base];
            row[i] = value;
            await deny(admin, insert, row, code);
          }
          for (const [index, value] of [
            [0, fictional.otherInstallation],
            [2, fictional.foreignDomain],
            [3, fictional.otherActor],
            [4, fictional.otherSession],
            [3, '20000000-0000-4000-8000-000000000099'],
            [4, '20000000-0000-4000-8000-000000000099'],
            [9, 'missing-v1'],
          ] as const) {
            const row = [...base];
            row[index] = value;
            // New canonical bytes/digest are genuine Node syntax, not stale mismatches.
            const tuple = JSON.parse(stableBase) as unknown[];
            if (index === 0) (tuple[1] as unknown[])[0] = value;
            else if (index === 2) (tuple[1] as unknown[])[1] = value;
            else tuple[index === 3 ? 3 : index === 4 ? 4 : 8] = value;
            const encoded = encodeCurrencySelectionIntent(
              JSON.stringify(tuple),
            );
            assert.ok(encoded.success);
            row[10] = encoded.canonicalText;
            row[11] = encoded.stableIntentDigest;
            await deny(admin, insert, row, '23503');
          }
          const replace = facts(stableVectors[3][0]);
          const missingPrior = JSON.parse(stableVectors[3][0]) as unknown[];
          missingPrior[6] = 'missing-v0';
          await deny(
            admin,
            insert,
            facts(JSON.stringify(missingPrior)),
            '23503',
          );
          for (const [index, value] of [
            [7, null],
            [7, 'fictional-v1'],
            [8, '0'],
            [8, '-1'],
          ] as const) {
            const row = [...replace];
            row[index] = value;
            await deny(admin, insert, row);
          }
        },
      );
      await t.test(
        'legal actions, UUID variants/nil/max, maximal fields and canonical raw aliases remain exact',
        async () => {
          const tuples: unknown[][] = [];
          for (const action of ['initialize', 'adopt']) {
            const s = JSON.parse(stableBase) as unknown[];
            s[2] = action;
            tuples.push(s);
          }
          for (const key of [
            '00000000-0000-0000-0000-000000000000',
            'ffffffff-ffff-ffff-ffff-ffffffffffff',
            ...'12345678'
              .split('')
              .map((v) => `a0b1c2d3-0000-${v}000-8000-abcd12345678`),
          ]) {
            const s = JSON.parse(stableBase) as unknown[];
            s[5] = key;
            tuples.push(s);
          }
          for (const generation of [
            '1',
            '9007199254740992',
            '9007199254740993',
            '9223372036854775807',
          ]) {
            const s = JSON.parse(stableVectors[3][0]) as unknown[];
            s[7] = generation;
            tuples.push(s);
          }
          const longest = JSON.parse(stableVectors[3][0]) as unknown[];
          longest[8] = 'v'.repeat(64);
          tuples.push(longest);
          for (const s of tuples) {
            const row = facts(JSON.stringify(s));
            await admin.query('BEGIN');
            try {
              await admin.query(insert, row);
            } finally {
              await admin.query('ROLLBACK');
            }
            await unchangedProduct();
          }
          // Canonical helpers must never turn an unsupported typed UUID into valid S.
          const row = facts(stableBase);
          row[0] = '10000000-0000-0000-8000-000000000001';
          assert.equal(
            (
              await admin.query(
                `SELECT ${p}.currency_selection_intent_canonical($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::text,$7::text,$8::bigint,$9::text) AS value`,
                canonicalArgs(row),
              )
            ).rows[0]?.value,
            null,
          );
        },
      );
      await t.test(
        'UUID request aliases and different bodies/domains/actors/sessions share one immutable slot',
        async () => {
          await admin.query(insert, facts(stableBase));
          for (const changed of [
            stableVectors[1][0],
            stableVectors[2][0],
            stableVectors[3][0],
            stableBase.replace('initialize', 'adopt'),
            stableBase.replace('fictional-v1', 'fictional-v2'),
            stableBase
              .replace(fictional.actor, fictional.otherActor)
              .replace(fictional.session, fictional.otherSession),
          ])
            await deny(admin, insert, facts(changed), '23505');
          for (const [sql, code] of [
            [`DELETE FROM ${q}.users WHERE id='${fictional.actor}'`, '23001'],
            [
              `DELETE FROM ${q}.auth_sessions WHERE id='${fictional.session}'`,
              '23001',
            ],
            // PostgreSQL 18 RESTRICT parent DELETE/UPDATE reports restrict_violation, unlike a
            // missing reference INSERT's foreign_key_violation.
            [
              `UPDATE ${q}.auth_sessions SET user_id='${fictional.otherActor}' WHERE id='${fictional.session}'`,
              '23001',
            ],
            [
              `DELETE FROM ${q}.currency_policy_revisions WHERE revision='fictional-v1'`,
              '23001',
            ],
            [
              `DELETE FROM ${q}.currency_execution_domains WHERE id='${fictional.domain}'`,
              '23001',
            ],
          ] as const)
            await deny(admin, sql, [], code);
          // Non-identity security updates remain permitted; evidence does not claim live auth.
          await admin.query(
            `UPDATE ${q}.auth_sessions SET revoked_at='2026-02-01T00:00:00.000Z',revoked_reason='Fictional' WHERE id='${fictional.session}'`,
          );
          await admin.query(
            `UPDATE ${q}.users SET status='DISABLED' WHERE id='${fictional.actor}'`,
          );
          await unchangedProduct();
        },
      );
      await t.test(
        'actual distinct duties deny DML/helper use and cannot disable/escalate new guards',
        async () => {
          const statements = [
            `INSERT INTO ${table} DEFAULT VALUES`,
            `INSERT INTO ${table} SELECT * FROM ${table} WHERE false ON CONFLICT DO NOTHING`,
            `UPDATE ${table} SET action=action WHERE false`,
            `DELETE FROM ${table} WHERE false`,
            `TRUNCATE ${table}`,
            `COPY ${table} FROM STDIN`,
            `MERGE INTO ${table} AS d USING (SELECT * FROM ${table} WHERE false) AS s ON d.installation_id=s.installation_id WHEN MATCHED THEN DELETE`,
          ];
          for (const duty of duties) {
            const c = await h.connect(duty);
            for (const sql of [
              ...statements,
              `SELECT ${p}.currency_selection_intent_canonical(NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL)`,
              `SELECT ${p}.deny_currency_selection_intent_mutation()`,
              `ALTER TABLE ${table} DISABLE TRIGGER ALL`,
              `ALTER FUNCTION ${p}.${canonicalSignature} SECURITY DEFINER`,
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
        'narrow new-table fixture grants still deny every ordinary and no-op statement',
        async () => {
          await admin.query(
            `GRANT SELECT,INSERT,UPDATE,DELETE,TRUNCATE ON TABLE ${table} TO ${duties.map((d) => ident(h.roles[d])).join(',')}`,
          );
          const granted = await productSnapshot(admin, h.product);
          for (const duty of duties) {
            const c = await h.connect(duty);
            for (const sql of [
              `INSERT INTO ${table} DEFAULT VALUES`,
              `INSERT INTO ${table} SELECT * FROM ${table} WHERE false`,
              `INSERT INTO ${table} SELECT * FROM ${table} WHERE false ON CONFLICT (installation_id,request_key_uuid) DO UPDATE SET action=EXCLUDED.action`,
              `UPDATE ${table} SET action=action WHERE false`,
              `DELETE FROM ${table} WHERE false`,
              `TRUNCATE ${table}`,
              `WITH attempted AS (DELETE FROM ${table} WHERE false RETURNING *) SELECT * FROM attempted`,
              `MERGE INTO ${table} AS d USING (SELECT * FROM ${table} WHERE false) AS s ON d.installation_id=s.installation_id WHEN MATCHED THEN DELETE`,
            ]) {
              const probeBefore = await probeSnapshot();
              await assert.rejects(
                c.query(sql),
                (e) => e instanceof HarnessSqlFailure && e.code === '23514',
              );
              assert.deepEqual(await probeSnapshot(), probeBefore);
              await unchangedProduct(granted);
            }
            await c.end();
          }
          await admin.query(
            `REVOKE ALL ON TABLE ${table} FROM ${duties.map((d) => ident(h.roles[d])).join(',')}`,
          );
          await unchangedProduct();
        },
      );
      await unchangedProduct();
      await admin.end();
    });
  },
);
