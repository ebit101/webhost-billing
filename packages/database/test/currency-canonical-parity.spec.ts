import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { paritySql, signatures } from './currency-canonical-parity.fixtures';
import {
  assessmentVectors,
  stableVectors,
  canonical,
  positiveFixtures,
  negativeFixtures,
  largestFixture,
} from './currency-canonical-parity.vectors';
import { encodeCurrencySelectionAssessment } from '../src/private/currency-selection-assessment';

test('test-only fixed SQL grammar is qualified, invoker-only and non-stateful', () => {
  assert.equal((paritySql.match(/CREATE FUNCTION/g) ?? []).length, 3);
  assert.equal(
    (paritySql.match(/IMMUTABLE SECURITY INVOKER/g) ?? []).length,
    3,
  );
  assert.equal(
    (paritySql.match(/SET search_path = pg_catalog, pg_temp/g) ?? []).length,
    3,
  );
  assert.doesNotMatch(
    paritySql,
    /SECURITY DEFINER|\bEXECUTE\b|\b(?:INSERT|UPDATE|DELETE|CREATE TABLE|CREATE EXTENSION|CREATE LANGUAGE)\b|\b(?:now|clock_timestamp|random|gen_random_uuid)\s*\(/i,
  );
  assert.doesNotMatch(paritySql, /jsonb::text|WHEN OTHERS|query_canceled/i);
  assert.match(
    paritySql,
    /pg_catalog\.encode\(pg_catalog\.sha256\(pg_catalog\.convert_to\(st,'UTF8'\)\),'hex'\)/,
  );
  assert.ok(
    paritySql.indexOf('octet_length(s_text) > 1024') <
      paritySql.indexOf('s_text::pg_catalog.jsonb'),
  );
  for (const limit of [
    '65536',
    '24576',
    '1024',
    '512',
    '224',
    '32',
    '9223372036854775807',
  ])
    assert.ok(paritySql.includes(limit));
  assert.deepEqual(signatures, [
    'atom(jsonb,text)',
    'piece(text,jsonb)',
    'verify(text,text)',
  ]);
});
test('mandatory append wiring preserves every old gate and serial isolated infrastructure', () => {
  const pkg = JSON.parse(
    readFileSync(resolve(__dirname, '../package.json'), 'utf8'),
  ) as { scripts: Record<string, string> };
  assert.ok(
    pkg.scripts['test:unit']!.endsWith(
      'test/currency-selection-assessment.spec.ts test/currency-canonical-parity.spec.ts test/currency-intent-storage.spec.ts',
    ),
  );
  assert.equal(
    pkg.scripts['test:privileges'],
    'tsx --test --test-concurrency=1 test/currency-privilege-harness.integration.spec.ts && tsx --test --test-concurrency=1 test/currency-canonical-parity.integration.spec.ts && tsx --test --test-concurrency=1 test/currency-intent-storage.privileges.spec.ts',
  );
  assert.equal(
    pkg.scripts.test,
    'pnpm test:unit && pnpm test:privileges && pnpm --filter @webhost-billing/web exec tsx e2e/run-database-tests.ts',
  );
  const integration = readFileSync(
    resolve(__dirname, 'currency-canonical-parity.integration.spec.ts'),
    'utf8',
  );
  assert.equal(
    (integration.match(/await withCurrencyPrivilegeHarness\(/g) ?? []).length,
    1,
  );
  assert.match(integration, /applyProductMigrations\(h,\s*admin\)/);
  assert.doesNotMatch(
    integration,
    /process\.env|\.skip\(|installFictionalProbes|INSERT INTO|docker.*pull/,
  );
});
test('golden vectors and independent Node canonical domain remain unchanged', () => {
  for (const [s, bytes, hash] of stableVectors) {
    assert.equal(Buffer.byteLength(s), bytes);
    assert.match(hash, /^[a-f0-9]{64}$/);
  }
  for (const [v, bytes, hash] of assessmentVectors()) {
    const r = canonical(v);
    assert.equal(Buffer.byteLength(r.canonicalText), bytes);
    assert.equal(r.assessmentDigest, hash);
  }
  for (const v of positiveFixtures()) canonical(v);
  for (const v of negativeFixtures())
    assert.equal(
      encodeCurrencySelectionAssessment(
        JSON.stringify(v.stable),
        JSON.stringify(v.assessment),
      ).success,
      false,
    );
  const max = canonical(largestFixture());
  assert.ok(Buffer.byteLength(max.canonicalText) > 45000);
});

test('field-derived component ceilings are unreachable without widening valid fields', () => {
  const bytes = (value: unknown) => Buffer.byteLength(JSON.stringify(value));
  const id = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
  const version = 'v'.repeat(64);
  const unit = ['AAA', version, 4, '\\'.repeat(256), 'historical'];
  const cap = ['AAA', version, false, false, false];
  const ref = ['AAA', version];
  // Conservative byte upper bounds, not valid duplicate-identity fixtures.
  // Maximal lengths need not be simultaneously reachable under membership rules.
  const context = [
    [version, ref, ref, ref, Array(32).fill(cap)],
    Array(32).fill(unit),
  ];
  const control = [
    'selected',
    '9223372036854775807',
    version,
    false,
    'AAA',
    version,
    4,
    '9999-12-31T23:59:59.999Z',
  ];
  const auth = [
    id,
    id,
    id,
    id,
    id,
    '9223372036854775807',
    id,
    '9223372036854775807',
    'recovery',
    id,
  ];
  const evidence = [
    'compatibility',
    id,
    'currency-compatibility-v1',
    'f'.repeat(64),
  ];
  assert.deepEqual(
    [bytes(unit), bytes(context), bytes(control), bytes(auth), bytes(evidence)],
    [604, 22635, 209, 329, 151],
  );
  const assessment = [
    'currency-selection-assessment-v1',
    'f'.repeat(64),
    control,
    context,
    context,
    unit,
    auth,
    Array(32).fill(evidence),
  ];
  assert.equal(bytes(assessment), 51386);
  // Production ceilings are defensive. Tests exercise maximal fields and outer
  // text boundaries, never a production override or fabricated accepted oversized fact.
  for (const [size, ceiling] of [
    [396, 1024],
    [22635, 24576],
    [209, 512],
    [329, 1024],
    [151, 224],
    [51386, 65536],
  ])
    assert.ok(size! < ceiling!);
});
