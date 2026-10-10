import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { parseCurrencySelectionRequest } from '../../shared/src/currency-selection-request';
import {
  CURRENCY_SELECTION_INTENT_LIMITS,
  encodeCurrencySelectionIntent,
} from '../src/private/currency-selection-intent';

const base =
  '["currency-selection-request-v1",["10000000-0000-4000-8000-000000000001","10000000-0000-4000-8000-000000000002"],"initialize","20000000-0000-4000-8000-000000000001","20000000-0000-4000-8000-000000000003","a0b1c2d3-0000-4000-8000-abcd12345678",null,"0","fictional-v1"]';
function fixture(action = 'initialize'): unknown[] {
  const tuple: unknown[] = JSON.parse(base);
  tuple[2] = action;
  if (action === 'replace') {
    tuple[6] = 'fictional-v0';
    tuple[7] = '9007199254740993';
  }
  return tuple;
}
function changed(position: number, value: unknown, action = 'initialize') {
  const tuple = fixture(action);
  tuple[position] = value;
  return tuple;
}
const failure = { success: false, error: 'Invalid currency selection intent' };
function deny(input: unknown) {
  const result = encodeCurrencySelectionIntent(input);
  assert.deepEqual(result, failure);
  assert.ok(Object.isFrozen(result));
  return result;
}
function denyTuple(input: unknown) {
  deny(JSON.stringify(input));
}
function accept(input: unknown) {
  const result = encodeCurrencySelectionIntent(input);
  if (!result.success)
    return assert.fail('Expected fictional tuple syntax only');
  assert.ok(Object.isFrozen(result));
  assert.deepEqual(Object.keys(result).sort(), [
    'canonicalText',
    'stableIntentDigest',
    'success',
  ]);
  assert.match(result.stableIntentDigest, /^[a-f0-9]{64}$/);
  return result;
}
function requestParity(tuple: unknown[]) {
  // Test-only bearer-shaped fixture for the existing decoder, never production
  // reuse or proof issuance. The stable tuple has no bearer field.
  const request = {
    action: tuple[2],
    requestKey: tuple[5],
    expectedRevision: tuple[6],
    expectedGeneration: tuple[7],
    proposedRevision: tuple[8],
    proofToken: 'x'.repeat(43),
  };
  assert.equal(
    encodeCurrencySelectionIntent(JSON.stringify(tuple)).success,
    parseCurrencySelectionRequest(JSON.stringify(request)).success,
    JSON.stringify(request),
  );
}

test('five literal persisted S vectors reproduce exact canonical bytes and SHA-256', () => {
  const vectors = [
    [
      base,
      267,
      '3f609e5934187609b5a5e679fa6f15fbb2d8e951653e21b672306e5fe1641426',
    ],
    [
      '["currency-selection-request-v1",["10000000-0000-4000-8000-000000000001","10000000-0000-4000-8000-000000000002"],"initialize","20000000-0000-4000-8000-000000000001","20000000-0000-4000-8000-000000000003","A0B1C2D3-0000-4000-8000-ABCD12345678",null,"0","fictional-v1"]',
      267,
      'bec8f8e1020a69348660b0f71a5c4f1fd0239114625bfceace6bf73720054491',
    ],
    [
      '["currency-selection-request-v1",["10000000-0000-4000-8000-000000000001","10000000-0000-4000-8000-000000000003"],"initialize","20000000-0000-4000-8000-000000000001","20000000-0000-4000-8000-000000000003","a0b1c2d3-0000-4000-8000-abcd12345678",null,"0","fictional-v1"]',
      267,
      '552681453a18ae4af7a62716d650aad40b6ebb5e1d25fc2528b9d42cdca23215',
    ],
    [
      '["currency-selection-request-v1",["10000000-0000-4000-8000-000000000001","10000000-0000-4000-8000-000000000002"],"replace","20000000-0000-4000-8000-000000000001","20000000-0000-4000-8000-000000000003","a0b1c2d3-0000-4000-8000-abcd12345678","fictional-v0","9007199254740993","fictional-v1"]',
      289,
      'e005a8316125fb52a2e0e9645376488d3208a260043791b334ba29cd72461acf',
    ],
    [
      '["currency-selection-request-v1",["10000000-0000-4000-8000-000000000001","10000000-0000-4000-8000-000000000002"],"replace","20000000-0000-4000-8000-000000000001","20000000-0000-4000-8000-000000000003","a0b1c2d3-0000-4000-8000-abcd12345678","fictional-v0","9223372036854775807","fictional-v1"]',
      292,
      'd7ee4ed0a9047d5967ccb34261e66eab9a9b62d739382d69eca129594d65ee11',
    ],
  ] as const;
  for (const [text, bytes, digest] of vectors) {
    const result = accept(text);
    assert.equal(result.canonicalText, text);
    assert.equal(
      new TextEncoder().encode(result.canonicalText).byteLength,
      bytes,
    );
    assert.equal(result.stableIntentDigest, digest);
  }
});

test('initialize/adopt/replace retain all explicit facts and existing action/state rules', () => {
  for (const action of ['initialize', 'adopt', 'replace']) {
    const tuple = fixture(action);
    const text = JSON.stringify(tuple);
    assert.equal(accept(text).canonicalText, text);
    requestParity(tuple);
    for (const position of [2, 5, 6, 7, 8]) {
      for (const value of [null, true, 1, [], {}, ''])
        requestParity(changed(position, value, action));
    }
  }
  for (const action of ['initialize', 'adopt']) {
    for (const revision of ['', 'fictional-v0'])
      denyTuple(changed(6, revision, action));
    for (const generation of ['1', '00', 0, null])
      denyTuple(changed(7, generation, action));
  }
  denyTuple(changed(6, null, 'replace'));
  denyTuple(changed(7, '0', 'replace'));
  denyTuple(changed(6, 'fictional-v1', 'replace'));
  for (const action of [
    'Initialize',
    'initialize ',
    'select',
    'stage',
    'replace\n',
  ]) {
    denyTuple(fixture(action));
    requestParity(fixture(action));
  }
});

test('request UUID grammar exactly matches versions/variants/nil/max without folding case', () => {
  const keys = [
    'a0b1c2d3-0000-4000-8000-abcd12345678',
    'A0B1C2D3-0000-4000-8000-ABCD12345678',
    '00000000-0000-0000-0000-000000000000',
    'ffffffff-ffff-ffff-ffff-ffffffffffff',
  ];
  for (let version = 0; version <= 9; version++) {
    for (const variant of '0123456789abcdefABCDEF')
      requestParity(
        changed(5, `a0b1c2d3-0000-${version}000-${variant}000-abcd12345678`),
      );
  }
  for (const key of keys) {
    const tuple = changed(5, key);
    requestParity(tuple);
    assert.equal(
      (JSON.parse(accept(JSON.stringify(tuple)).canonicalText) as unknown[])[5],
      key,
    );
  }
  for (const key of [
    'FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF',
    keys[0]!.replaceAll('-', ''),
    `{${keys[0]}}`,
    ` ${keys[0]}`,
    `${keys[0]}\n`,
    'a0b1c2d3-0000-4000-7000-abcd12345678',
  ]) {
    denyTuple(changed(5, key));
    requestParity(changed(5, key));
  }
});

test('all four server identity positions require exact lowercase standard UUID spelling', () => {
  const valid = [
    'a0b1c2d3-0000-4000-8000-abcd12345678',
    '00000000-0000-0000-0000-000000000000',
    'ffffffff-ffff-ffff-ffff-ffffffffffff',
  ];
  const invalid = [
    'A0B1C2D3-0000-4000-8000-ABCD12345678',
    'FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF',
    'a0b1c2d3000040008000abcd12345678',
    '{a0b1c2d3-0000-4000-8000-abcd12345678}',
    'a0b1c2d3-0000-9000-8000-abcd12345678',
    'a0b1c2d3-0000-4000-7000-abcd12345678',
    'a0b1c2d3-0000-4000-8000-abcd12345678\n',
    null,
    [],
    {},
  ];
  for (let position = 0; position < 4; position++) {
    for (const value of [...valid, ...invalid]) {
      const tuple = fixture();
      if (position < 2) {
        const identity = tuple[1] as unknown[];
        identity[position] = value;
      } else tuple[position + 1] = value;
      assert.equal(
        encodeCurrencySelectionIntent(JSON.stringify(tuple)).success,
        valid.includes(value as string),
      );
    }
  }
});

test('both revisions preserve exact full-input ASCII grammar, bounds and case', () => {
  for (const position of [6, 8]) {
    for (const value of ['a', 'A'.repeat(64), 'A.b_c-d:09']) {
      const tuple = changed(position, value, 'replace');
      requestParity(tuple);
      assert.equal(
        (JSON.parse(accept(JSON.stringify(tuple)).canonicalText) as unknown[])[
          position
        ],
        value,
      );
    }
    for (const value of [
      '',
      'A'.repeat(65),
      '.leading',
      ' leading',
      'trailing ',
      'trailing\n',
      'trailing\r\n',
      'embedded\u0000',
      'not/allowed',
      'বাংলা',
      'é',
      '💡',
      '\ud800',
      '\udfff',
      null,
      42,
    ]) {
      denyTuple(changed(position, value, 'replace'));
      requestParity(changed(position, value, 'replace'));
    }
  }
  accept(JSON.stringify(changed(6, 'FICTIONAL-v1', 'replace')));
});

test('generation remains exact above Number precision and at BIGINT maximum', () => {
  for (const value of [
    '1',
    '9007199254740991',
    '9007199254740992',
    '9007199254740993',
    '9223372036854775807',
  ]) {
    const tuple = changed(7, value, 'replace');
    requestParity(tuple);
    assert.equal(
      (JSON.parse(accept(JSON.stringify(tuple)).canonicalText) as unknown[])[7],
      value,
    );
  }
  for (const value of [
    '',
    '0',
    '00',
    '01',
    '-0',
    '-1',
    '+1',
    '1.0',
    '1e3',
    ' 1',
    '1 ',
    '1\n',
    '1\r\n',
    '1\u0000',
    'NaN',
    'Infinity',
    '１',
    '9223372036854775808',
    '9'.repeat(20),
    '9'.repeat(2000),
    0,
    1,
    9007199254740992,
    null,
    true,
  ]) {
    denyTuple(changed(7, value, 'replace'));
    requestParity(changed(7, value, 'replace'));
  }
});

test('every S fact contributes to exact intent identity, including action and case', () => {
  const original = accept(base);
  for (const position of [0, 1]) {
    const tuple = fixture();
    (tuple[1] as unknown[])[position] = '10000000-0000-4000-8000-000000000009';
    assert.notEqual(
      accept(JSON.stringify(tuple)).stableIntentDigest,
      original.stableIntentDigest,
    );
  }
  for (const [position, value] of [
    [2, 'adopt'],
    [3, '20000000-0000-4000-8000-000000000009'],
    [4, '20000000-0000-4000-8000-000000000009'],
    [5, 'A0B1C2D3-0000-4000-8000-ABCD12345678'],
    [5, 'a0b1c2d3-0000-4000-8000-abcd12345679'],
    [8, 'Fictional-v1'],
  ] as const)
    assert.notEqual(
      accept(JSON.stringify(changed(position, value))).stableIntentDigest,
      original.stableIntentDigest,
    );
  const replacement = accept(JSON.stringify(fixture('replace')));
  for (const [position, value] of [
    [6, 'Fictional-v0'],
    [7, '9007199254740992'],
    [8, 'Fictional-v1'],
  ] as const)
    assert.notEqual(
      accept(JSON.stringify(changed(position, value, 'replace')))
        .stableIntentDigest,
      replacement.stableIntentDigest,
    );
});

test('JSON whitespace and escape-equivalent input have identical canonical text and digest', () => {
  const expected = accept(base);
  for (const text of [
    `\n\t${base}\r\n `,
    JSON.stringify(fixture(), null, 2),
    base.replace('fictional-v1', '\\u0066ictional-v1'),
    base.replace('initialize', '\\u0069nitialize'),
    base.replace('a0b1c2d3', '\\u00610b1c2d3'),
  ])
    assert.deepEqual(accept(text), expected);
  assert.equal(expected.canonicalText.startsWith('\ufeff'), false);
  assert.equal(expected.canonicalText.endsWith('\n'), false);
  deny(`\ufeff${base}`);
});

test('wrong version/arity/nesting and any object replacement or extra fact deny', () => {
  for (const value of [
    null,
    true,
    1,
    'text',
    [],
    {},
    [fixture()],
    { tuple: fixture() },
  ])
    denyTuple(value);
  for (const version of [
    'currency-selection-request-v2',
    'currency-selection-assessment-v1',
    '',
    null,
  ])
    denyTuple(changed(0, version));
  const tuple = fixture();
  for (let index = 0; index < 9; index++) {
    denyTuple(tuple.filter((_, i) => i !== index));
    denyTuple(changed(index, { value: tuple[index] }));
    denyTuple(changed(index, [tuple[index]]));
  }
  for (const identity of [
    [],
    [tuple[3]],
    [tuple[3], tuple[4], tuple[5]],
    { installationId: tuple[3], executionDomainId: tuple[4] },
  ])
    denyTuple(changed(1, identity));
  for (const key of [
    'token',
    'proofToken',
    'proofHash',
    'authEpoch',
    'adminProfileId',
    'approved',
    'historyLatch',
    'assessment',
    'createdAt',
  ]) {
    denyTuple([...tuple, { [key]: 'fictional-claim' }]);
    denyTuple({ ...tuple, [key]: 'fictional-claim' });
  }
});

test('caller graphs, getters, proxies, iterators, coercion and boxed strings are never invoked', () => {
  let visits = 0;
  const visit = () => {
    visits++;
    throw new Error('Fictional trap');
  };
  const hostile = new Proxy(
    {},
    { get: visit, ownKeys: visit, getPrototypeOf: visit },
  );
  const revoked = Proxy.revocable({}, {});
  revoked.revoke();
  const graph = {
    get tuple() {
      return visit();
    },
    toJSON: visit,
    toString: visit,
    [Symbol.toPrimitive]: visit,
    [Symbol.iterator]: visit,
  };
  for (const value of [
    hostile,
    revoked.proxy,
    graph,
    fixture(),
    new String(base),
    undefined,
    null,
    Symbol('fictional'),
    1n,
    () => base,
  ])
    deny(value);
  assert.equal(visits, 0);
});

test('65,536/65,537 ASCII and UTF-8 bounds apply before parse and encoder allocation', () => {
  assert.deepEqual(CURRENCY_SELECTION_INTENT_LIMITS, {
    inputBytes: 65_536,
    canonicalBytes: 1_024,
    generationDigits: 19,
    generationMaximum: '9223372036854775807',
  });
  assert.ok(Object.isFrozen(CURRENCY_SELECTION_INTENT_LIMITS));
  assert.deepEqual(accept(base.padEnd(65_536, ' ')), accept(base));
  // Build fixtures before instrumenting JSON.parse: fixture construction is
  // not a codec parse and must not pollute the pre-parse counter.
  const unicodeTexts = ['€', '💡', '\ud800'].map((character) =>
    JSON.stringify(changed(8, character)).replace('\\ud800', '\ud800'),
  );
  const parse = JSON.parse;
  const encode = TextEncoder.prototype.encode;
  let parseCalls = 0;
  let encodeCalls = 0;
  JSON.parse = (value: string) => {
    parseCalls++;
    return parse(value) as unknown;
  };
  TextEncoder.prototype.encode = function (value?: string) {
    encodeCalls++;
    return encode.call(this, value);
  };
  try {
    deny(base.padEnd(65_537, ' '));
    deny(' '.repeat(100_000));
    assert.equal(encodeCalls, 0);
    assert.equal(parseCalls, 0);
    for (const unicode of unicodeTexts) {
      const bytes = encode.call(new TextEncoder(), unicode).byteLength;
      const overflow = unicode.padEnd(unicode.length + 65_537 - bytes, ' ');
      assert.ok(overflow.length <= 65_536);
      deny(overflow);
      assert.equal(parseCalls, 0);
      const boundary = unicode.padEnd(unicode.length + 65_536 - bytes, ' ');
      deny(boundary);
      assert.equal(parseCalls, 1);
      parseCalls = 0;
    }
  } finally {
    JSON.parse = parse;
    TextEncoder.prototype.encode = encode;
  }
});

test('maximum valid S stays under the canonical budget without loosening field rules', () => {
  const tuple = fixture('replace');
  tuple[6] = 'A'.repeat(64);
  tuple[8] = 'B'.repeat(64);
  tuple[7] = '9223372036854775807';
  const result = accept(JSON.stringify(tuple));
  assert.equal(new TextEncoder().encode(result.canonicalText).byteLength, 396);
  assert.ok(new TextEncoder().encode(result.canonicalText).byteLength < 1_024);
  denyTuple(changed(8, 'A'.repeat(1024)));
});

test('canonical ceiling is checked before hashing even if the platform encoder fails', () => {
  // Defensive fault injection only: no valid S can reach 1,025 under field bounds.
  const encode = TextEncoder.prototype.encode;
  let calls = 0;
  TextEncoder.prototype.encode = function (value?: string) {
    calls++;
    return calls === 2 ? new Uint8Array(1_025) : encode.call(this, value);
  };
  try {
    deny(base);
    assert.equal(calls, 2);
  } finally {
    TextEncoder.prototype.encode = encode;
  }
});

test('successes are independently copied/frozen; failures are fixed without input or partial hashes', () => {
  const tuple = fixture();
  const text = JSON.stringify(tuple);
  const first = accept(text);
  const second = accept(text);
  assert.notEqual(first, second);
  assert.deepEqual(first, second);
  tuple[8] = 'changed-fixture';
  (tuple[1] as unknown[])[0] = 'changed-fixture';
  assert.equal(first.canonicalText, base);
  assert.throws(
    () => Object.assign(first, { canonicalText: 'changed' }),
    TypeError,
  );
  const denied = deny('{"fictional-sensitive-identity":');
  for (const invalid of [
    '',
    '{',
    '/*fictional*/[]',
    '[1,]',
    base + ' extra',
    base.replace('null', 'NaN'),
  ])
    assert.equal(deny(invalid), denied);
  assert.deepEqual(Object.keys(denied).sort(), ['error', 'success']);
  assert.equal(
    JSON.stringify(denied).includes('fictional-sensitive-identity'),
    false,
  );
});

test('private codec has only built-in crypto import, no export entry or ordinary consumer, and mandatory wiring', () => {
  const db = resolve(__dirname, '..');
  const root = resolve(db, '../..');
  const sourcePath = resolve(db, 'src/private/currency-selection-intent.ts');
  const source = readFileSync(sourcePath, 'utf8');
  assert.deepEqual(
    [...source.matchAll(/from ['"]([^'"]+)['"]/g)].map((m) => m[1]),
    ['node:crypto'],
  );
  assert.doesNotMatch(
    source,
    /\b(?:require|import)\s*\(|\b(?:process|console|Prisma|Date|Math|fetch)\b|\b(?:setTimeout|randomUUID)\s*\(/,
  );
  assert.ok(
    source.indexOf('text.length >') < source.indexOf('encoder.encode(text)'),
  );
  assert.ok(
    source.indexOf('encoder.encode(text)') < source.indexOf('JSON.parse(text)'),
  );
  assert.ok(
    source.indexOf('bytes.byteLength >') <
      source.indexOf("createHash('sha256')"),
  );
  const pkg = JSON.parse(readFileSync(resolve(db, 'package.json'), 'utf8'));
  assert.deepEqual(Object.keys(pkg.exports), [
    '.',
    './currency-adoption-preflight',
    './currency-coordination',
    './currency-coordination-guards',
    './currency-control',
    './currency-policies',
    './currency-units',
  ]);
  assert.ok(
    pkg.scripts['test:unit'].endsWith(
      'test/currency-identity.spec.ts test/currency-selection-intent.spec.ts',
    ),
  );
  assert.equal(
    pkg.scripts.test,
    'pnpm test:unit && pnpm test:privileges && pnpm --filter @webhost-billing/web exec tsx e2e/run-database-tests.ts',
  );
  const forbidden =
    /currency-selection-intent|encodeCurrencySelectionIntent|CURRENCY_SELECTION_INTENT_LIMITS/;
  function visit(directory: string) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (/\.(?:ts|tsx|json)$/.test(entry.name) && path !== sourcePath)
        assert.doesNotMatch(readFileSync(path, 'utf8'), forbidden, path);
    }
  }
  for (const directory of [
    'apps/api/src',
    'apps/web/src',
    'apps/worker/src',
    'packages/shared/src',
    'packages/database/src',
  ])
    visit(resolve(root, directory));
  assert.doesNotMatch(
    readFileSync(resolve(db, 'prisma/seed.ts'), 'utf8'),
    forbidden,
  );
});
