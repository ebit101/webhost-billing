import assert from 'node:assert/strict';
import { test } from 'node:test';
import { escapeIdentifier as ident } from 'pg';
import { encodeCurrencySelectionIntent } from '../src/private/currency-selection-intent';
import { encodeCurrencySelectionAssessment } from '../src/private/currency-selection-assessment';
import { encodeCurrencyPolicyContext } from '../src/private/currency-policy-context';
import {
  HarnessSqlFailure,
  withCurrencyPrivilegeHarness,
  type TestConnection,
} from './currency-privilege-harness';
import {
  applyProductMigrations,
  loadPinnedMigrations,
  productSnapshot,
} from './currency-privilege-harness.fixtures';
import {
  installParity,
  invalidBinding,
  verifyBinding,
} from './currency-canonical-parity.fixtures';
import {
  assessmentBase,
  stableBase,
  stableVectors,
  assessmentVectors,
  fixture,
  bind,
  canonical,
  positiveFixtures,
  negativeFixtures,
  largestFixture,
  set,
  get,
} from './currency-canonical-parity.vectors';

async function denial(client: TestConnection, sql: string, code = '42501') {
  await assert.rejects(
    client.query(sql),
    (e) => e instanceof HarnessSqlFailure && e.code === code,
    'Expected precise redacted SQLSTATE',
  );
}

test(
  'mandatory isolated canonical SQL parity, real duties and unchanged product authority',
  { timeout: 650000 },
  async (t) => {
    await withCurrencyPrivilegeHarness(async (h) => {
      const admin = await h.connect('bootstrap');
      const q = ident(h.probe);
      const product = ident(h.product);
      const migrations = await applyProductMigrations(h, admin);
      const empty = await productSnapshot(admin, h.product);
      assert.ok(
        Object.values(empty.rows).every(
          (rows) => Array.isArray(rows) && rows.length === 0,
        ),
      );
      await h.installLogins();
      try {
        await installParity(h, admin);
      } catch (error) {
        t.diagnostic(
          `Atomic parity installation failed: ${error instanceof HarnessSqlFailure ? error.code : 'redacted'}`,
        );
        throw error;
      }
      // USAGE alone distinguishes precise function refusal from schema refusal.
      await admin.query(
        `GRANT USAGE ON SCHEMA ${q} TO ${ident(h.roles.business)},${ident(h.roles.issuer)},${ident(h.roles.attacker)}`,
      );
      const executor = await h.connect('executor');
      const snapshot = async () => {
        // Catalog deparsers qualify names according to the caller's search path.
        // Keep comparison presentation identical, without changing any guard/object.
        await admin.query(`SET search_path=${product},pg_catalog`);
        return {
          product: await productSnapshot(admin, h.product),
          probe: await productSnapshot(admin, h.probe),
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
          schemas: (
            await admin.query(
              'SELECT nspname,nspowner,nspacl::text FROM pg_catalog.pg_namespace WHERE nspname=$1 OR nspname=$2 ORDER BY nspname',
              [h.probe, h.product],
            )
          ).rows,
          database: (
            await admin.query(
              'SELECT datname,datdba,datacl::text FROM pg_catalog.pg_database WHERE datname=$1',
              [h.database],
            )
          ).rows,
        };
      };
      const baseline = await snapshot();
      const unchanged = async () => {
        assert.deepEqual(await snapshot(), baseline);
        assert.deepEqual(await productSnapshot(admin, h.product), empty);
        assert.deepEqual(
          loadPinnedMigrations().map(({ name, rawHash }) => ({
            name,
            rawHash,
          })),
          migrations,
        );
        await h.verifyOwnership();
      };
      for (const client of [admin, executor]) {
        assert.equal(
          (await client.query('SHOW server_encoding')).rows[0]?.server_encoding,
          'UTF8',
        );
        assert.equal(
          (await client.query('SHOW client_encoding')).rows[0]?.client_encoding,
          'UTF8',
        );
      }
      const manifest = (
        await admin.query(
          `SELECT p.proname,p.prosecdef,p.provolatile,p.proconfig,r.rolname AS owner,p.proacl::text,
      pg_catalog.has_function_privilege($2,p.oid,'EXECUTE') AS executor,
      pg_catalog.has_function_privilege($3,p.oid,'EXECUTE') AS other
      FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
      JOIN pg_catalog.pg_roles r ON r.oid=p.proowner WHERE n.nspname=$1 ORDER BY p.proname`,
          [h.probe, h.roles.executor, h.roles.business],
        )
      ).rows;
      assert.equal(manifest.length, 3);
      for (const row of manifest) {
        assert.equal(row.prosecdef, false);
        assert.equal(row.provolatile, 'i');
        assert.equal(row.owner, h.roles.functions);
        assert.deepEqual(row.proconfig, ['search_path=pg_catalog, pg_temp']);
        assert.equal(row.executor, true);
        assert.equal(row.other, false);
        assert.ok(typeof row.proacl === 'string' && !row.proacl.includes('{='));
      }
      assert.deepEqual(
        (
          await admin.query(
            `SELECT p.proname FROM pg_catalog.pg_proc p
        JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace,
        LATERAL pg_catalog.aclexplode(p.proacl) acl WHERE n.nspname=$1 AND acl.grantee=0`,
            [h.probe],
          )
        ).rows,
        [],
      );
      assert.deepEqual(
        (
          await admin.query(
            `SELECT rolcanlogin,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolreplication,rolbypassrls
        FROM pg_catalog.pg_roles WHERE rolname=$1`,
            [h.roles.functions],
          )
        ).rows,
        [
          {
            rolcanlogin: false,
            rolsuper: false,
            rolinherit: false,
            rolcreaterole: false,
            rolcreatedb: false,
            rolreplication: false,
            rolbypassrls: false,
          },
        ],
      );
      assert.equal(baseline.defaults.length, 2);
      assert.deepEqual(
        (
          await admin.query(`SELECT d.defaclrole FROM pg_catalog.pg_default_acl d,
        LATERAL pg_catalog.aclexplode(d.defaclacl) acl WHERE acl.grantee=0 AND d.defaclobjtype='f'`)
        ).rows,
        [],
      );
      async function readOnly<T>(body: () => Promise<T>): Promise<T> {
        await executor.query('BEGIN READ ONLY');
        try {
          assert.equal(
            (await executor.query('SHOW transaction_read_only')).rows[0]
              ?.transaction_read_only,
            'on',
          );
          return await body();
        } finally {
          await executor.query('ROLLBACK');
        }
      }
      async function accept(
        v: ReturnType<typeof fixture>,
        rawS?: string,
        rawA?: string,
      ) {
        const expected = canonical(v, rawS, rawA);
        return readOnly(async () => {
          const actual = await verifyBinding(
            executor,
            h.probe,
            expected.stableCanonicalText,
            expected.canonicalText,
          );
          assert.deepEqual(
            actual,
            expected,
            'Independent SQL canonical bytes/hash mismatch',
          );
          for (const index of [3, 4]) {
            if (v.assessment[index] === null) continue;
            const node = encodeCurrencyPolicyContext(
              JSON.stringify(v.assessment[index]),
            );
            assert.ok(node.success);
            const sql = (
              await executor.query(
                `SELECT ${q}.piece('Context',$1::jsonb) AS value`,
                [JSON.stringify(v.assessment[index])],
              )
            ).rows[0]?.value;
            assert.equal(sql, node.canonicalText);
          }
          return expected;
        });
      }
      async function denyText(s: string | null, a: string | null) {
        await readOnly(async () => {
          assert.deepEqual(
            await verifyBinding(executor, h.probe, s, a),
            invalidBinding,
            'Invalid input must return no partial digest or detail',
          );
        });
      }
      await t.test(
        'five literal S and five prescribed A vectors, canonical Contexts',
        async () => {
          for (const [s, bytes, hash] of stableVectors) {
            assert.equal(Buffer.byteLength(s), bytes);
            const v = s.includes('"replace"')
              ? fixture('replace', 'selected')
              : fixture();
            v.stable = JSON.parse(s);
            set(v, [6, 1], get(v, [1, 1], true));
            if (v.stable[2] === 'replace') set(v, [2, 1], v.stable[7]);
            const result = await accept(bind(v));
            assert.equal(result.stableCanonicalText, s);
            assert.equal(result.stableIntentDigest, hash);
          }
          for (const [v, bytes, hash] of assessmentVectors()) {
            const result = await accept(v);
            assert.equal(Buffer.byteLength(result.canonicalText), bytes);
            assert.equal(result.assessmentDigest, hash);
          }
          assert.equal((await accept(fixture())).canonicalText, assessmentBase);
        },
      );
      await t.test(
        'all legal shapes, retained facts, calendars, UUIDs, capabilities and escaped maxima',
        async () => {
          for (const v of positiveFixtures()) await accept(v);
          // Every syntactically retained independent primitive also survives changed bytes.
          for (const path of [
            [6, 0],
            [6, 3],
            [6, 6],
            [7, 0, 1],
            [7, 1, 1],
          ]) {
            const v = fixture();
            set(v, path, '40000000-0000-4000-8000-000000000009');
            await accept(v);
          }
          for (const path of [
            [7, 0, 3],
            [7, 1, 3],
          ]) {
            const v = fixture();
            set(v, path, 'd'.repeat(64));
            await accept(v);
          }
          const rootId = fixture();
          set(rootId, [7, 1, 1], get(rootId, [7, 0, 1]));
          await accept(rootId); // Same ID across kinds is legal.
          const max = largestFixture();
          const r = await accept(max);
          assert.ok(
            Buffer.byteLength(r.canonicalText) > 45000 &&
              Buffer.byteLength(r.canonicalText) < 65536,
          );
        },
      );
      await t.test(
        'raw Node aliases normalize first; SQL canonical-only aliases deny',
        async () => {
          const v = largestFixture();
          (get(v, [3, 0, 4]) as unknown[]).reverse();
          (get(v, [3, 1]) as unknown[]).reverse();
          (get(v, [4, 0, 4]) as unknown[]).reverse();
          (get(v, [4, 1]) as unknown[]).reverse();
          (get(v, [7]) as unknown[]).reverse();
          await accept(v);
          await accept(
            fixture(),
            JSON.stringify(fixture().stable, null, 2),
            JSON.stringify(fixture().assessment, null, 2),
          );
          for (const token of [
            '2.0',
            '2e0',
            '2.00000000000000001',
            '-0',
            '1e-9999',
          ]) {
            const f = fixture();
            const raw = JSON.stringify(f.assessment).replace(
              ',2,"Fictional source"',
              `,${token},"Fictional source"`,
            );
            const expected = await accept(f, stableBase, raw);
            await denyText(stableBase, raw); // Numeric aliases are not canonical SQL inputs.
            assert.match(
              expected.canonicalText,
              token === '-0' || token === '1e-9999'
                ? /,0,"Fictional source"/
                : /,2,"Fictional source"/,
            );
          }
          for (const [s, a] of [
            [stableBase + '\n', assessmentBase],
            [stableBase, assessmentBase + '\n'],
            [
              stableBase.replace('BDT', '\\u0042DT'),
              assessmentBase.replace('BDT', '\\u0042DT'),
            ],
            [JSON.stringify(fixture().stable, null, 2), assessmentBase],
            [stableBase, JSON.stringify(v.assessment)],
          ])
            await denyText(s, a);
          const escapedS = stableBase.replace('initialize', '\\u0069nitialize');
          await accept(fixture(), escapedS, assessmentBase);
          await denyText(escapedS, assessmentBase);
        },
      );
      await t.test(
        'canonical semantic corruption, exact shapes, membership, roots, bounds and fixed redaction',
        async () => {
          for (const v of negativeFixtures()) {
            const s = JSON.stringify(v.stable),
              a = JSON.stringify(v.assessment);
            assert.equal(
              encodeCurrencySelectionAssessment(s, a).success,
              false,
              'Negative fixture must independently fail Node',
            );
            await denyText(s, a);
          }
          for (const value of [
            null,
            '',
            'null',
            '{}',
            '[]',
            '[',
            '[1e1000000]',
            ' '.repeat(1024),
            ' '.repeat(1025),
            'é'.repeat(513),
          ])
            await denyText(value, assessmentBase);
          for (const value of [
            null,
            '',
            'null',
            '{}',
            '[]',
            '[',
            '[1e1000000]',
            ' '.repeat(65536),
            ' '.repeat(65537),
            'é'.repeat(32769),
            '['.repeat(300) + ']'.repeat(300),
          ])
            await denyText(stableBase, value);
          for (const extra of [false, true]) {
            const v = fixture();
            if (extra) v.stable.push(null);
            else v.stable.pop();
            await denyText(JSON.stringify(v.stable), assessmentBase);
          }
          for (const path of [
            [0],
            [1],
            [1, 0],
            [1, 1],
            [2],
            [3],
            [4],
            [5],
            [6],
            [7],
            [8],
          ])
            for (const value of [null, {}, [], true, 1, '', 'x\n']) {
              const v = fixture();
              set(v, path, value, true);
              const s = JSON.stringify(v.stable);
              if (!encodeCurrencySelectionIntent(s).success)
                await denyText(s, assessmentBase);
            }
          for (const value of [
            '9223372036854775808',
            '00',
            '01',
            '0',
            '9'.repeat(20),
            '1\n',
          ]) {
            const v = fixture('replace', 'selected');
            v.stable[7] = value;
            await denyText(
              JSON.stringify(v.stable),
              JSON.stringify(v.assessment),
            );
          }
          for (const value of [
            'A0B1C2D3-0000-0000-8000-ABCD12345678',
            'FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF',
            'a0b1c2d3-0000-4000-7000-abcd12345678',
            'a0b1c2d3-0000-4000-8000-abcd12345678\n',
          ]) {
            const v = fixture();
            v.stable[5] = value;
            await denyText(JSON.stringify(v.stable), assessmentBase);
          }
        },
      );
      await unchanged();
      await t.test(
        'actual duties, PUBLIC/helper ACLs, product SELECT and DDL/escalation refusals',
        async () => {
          for (const duty of ['business', 'issuer', 'attacker'] as const) {
            const client = await h.connect(duty);
            for (const sql of [
              `SELECT ${q}.verify(NULL,NULL)`,
              `SELECT ${q}.atom('null'::jsonb,'null')`,
              `SELECT ${q}.piece('S','[]'::jsonb)`,
              `SELECT * FROM ${product}.currency_controls`,
              `SET ROLE ${ident(h.roles.functions)}`,
              `SET ROLE ${ident(h.roles.executor)}`,
              `ALTER FUNCTION ${q}.verify(text,text) IMMUTABLE`,
              `CREATE FUNCTION ${q}.overload(text,text) RETURNS text LANGUAGE SQL AS 'SELECT NULL::text'`,
            ]) {
              await denial(client, sql);
              await unchanged();
            }
            await client.end();
          }
          for (const sql of [
            `SELECT * FROM ${product}.currency_controls`,
            `CREATE TABLE ${q}.forbidden(id integer)`,
            `ALTER FUNCTION ${q}.verify(text,text) IMMUTABLE`,
            `SET ROLE ${ident(h.roles.functions)}`,
            `CREATE ROLE forbidden_role`,
            `CREATE TEMP TABLE forbidden_temp(id integer)`,
          ]) {
            await denial(executor, sql);
            await unchanged();
          }
          // Even the minimal non-login function owner has no schema CREATE/product read.
          await admin.query(`SET ROLE ${ident(h.roles.functions)}`);
          await denial(admin, `CREATE TABLE ${q}.forbidden_owner(id integer)`);
          await denial(admin, `SELECT * FROM ${product}.currency_controls`);
          await admin.query('RESET ROLE');
          await unchanged();
        },
      );
      await t.test(
        'TEMP/search-path overloads cannot replace fully qualified invoker helpers',
        async () => {
          const attacker = await h.connect('attacker');
          await attacker.query(
            `CREATE FUNCTION pg_temp.verify(text,text) RETURNS jsonb LANGUAGE SQL AS 'SELECT ''{"poison":true}''::jsonb'; SET search_path=pg_temp,${q},public`,
          );
          await denial(attacker, `SELECT ${q}.verify(NULL,NULL)`);
          await unchanged();
          await attacker.end();
          await admin.query(`CREATE FUNCTION pg_temp.atom(jsonb,text) RETURNS text LANGUAGE SQL AS 'SELECT ''poison''::text';
        CREATE FUNCTION pg_temp.piece(text,jsonb) RETURNS text LANGUAGE SQL AS 'SELECT ''poison''::text';
        CREATE FUNCTION pg_temp.verify(text,text) RETURNS jsonb LANGUAGE SQL AS 'SELECT ''{"poison":true}''::jsonb';
        SET ROLE ${ident(h.roles.executor)}; SET search_path=pg_temp,${q},public; BEGIN READ ONLY`);
          const expected = canonical(fixture());
          assert.deepEqual(
            await verifyBinding(
              admin,
              h.probe,
              expected.stableCanonicalText,
              expected.canonicalText,
            ),
            expected,
          );
          await admin.query('ROLLBACK; RESET ROLE; RESET search_path');
          await unchanged();
        },
      );
      await t.test(
        'SQL representation errors redact; transport and deadlines remain failures',
        async () => {
          await denyText(
            stableBase,
            assessmentBase.replace('Fictional source', '\\u0000'),
          );
          await denyText(
            stableBase,
            assessmentBase.replace('Fictional source', '\\ud800'),
          );
          // PostgreSQL cannot transport an actual NUL text parameter. It must throw,
          // not be reported as an ordinary completed validation or expose input details.
          await executor.query('BEGIN READ ONLY');
          await assert.rejects(
            verifyBinding(executor, h.probe, stableBase, '\u0000'),
            (e) => e instanceof HarnessSqlFailure && e.code === '22021',
          );
          await executor.query('ROLLBACK');
          await executor.query(
            'BEGIN READ ONLY; SET LOCAL statement_timeout=1',
          );
          await denial(executor, 'SELECT pg_catalog.pg_sleep(1)', '57014');
          await executor.query('ROLLBACK');
          const maximal = canonical(largestFixture());
          await executor.query(
            'BEGIN READ ONLY; SET LOCAL statement_timeout=1',
          );
          await assert.rejects(
            verifyBinding(
              executor,
              h.probe,
              maximal.stableCanonicalText,
              maximal.canonicalText,
            ),
            (e) => e instanceof HarnessSqlFailure && e.code === '57014',
          );
          await executor.query('ROLLBACK');
          await unchanged();
        },
      );
      await unchanged();
      await executor.end();
      await admin.end();
    });
  },
);
