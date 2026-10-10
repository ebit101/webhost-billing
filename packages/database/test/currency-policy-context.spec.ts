import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { currencyPolicyContextSchema } from '@webhost-billing/shared/currency-policy';
import { currencyUnitDefinitionSchema } from '@webhost-billing/shared/currency-arithmetic';
import {
  CURRENCY_POLICY_CONTEXT_LIMITS,
  encodeCurrencyPolicyContext,
} from '../src/private/currency-policy-context';

const base =
  '[["fictional-v1",["BDT","fictional-units-v1"],["BDT","fictional-units-v1"],null,[["BDT","fictional-units-v1",true,true,true]]],[["BDT","fictional-units-v1",2,"Fictional source","current"]]]';
type Fixture = [
  [unknown, unknown[], unknown[], unknown[] | null, unknown[][]],
  unknown[][],
];
function fixture(): Fixture {
  return JSON.parse(base) as Fixture;
}
function many(count: number): Fixture {
  const entries: unknown[][] = [];
  const units: unknown[][] = [];
  for (let index = 0; index < count; index++) {
    const code = `A${String.fromCharCode(65 + Math.floor(index / 26))}${String.fromCharCode(65 + (index % 26))}`;
    entries.push([code, 'fictional-v1', true, false, false]);
    units.push([
      code,
      'fictional-v1',
      index % 5,
      'Fictional source',
      'current',
    ]);
  }
  return [
    [
      'fictional-v1',
      ['AAA', 'fictional-v1'],
      ['AAA', 'fictional-v1'],
      null,
      entries,
    ],
    units,
  ];
}
function accept(text: string) {
  const result = encodeCurrencyPolicyContext(text);
  assert.equal(result.success, true);
  if (!result.success) throw new Error('Expected fictional codec success');
  assert.ok(Object.isFrozen(result));
  assert.deepEqual(Object.keys(result).sort(), ['canonicalText', 'success']);
  return result;
}
function deny(value: unknown) {
  const result = encodeCurrencyPolicyContext(value);
  assert.deepEqual(result, {
    success: false,
    error: 'Invalid currency policy context',
  });
  assert.ok(Object.isFrozen(result));
  return result;
}
function denyTuple(value: unknown) {
  return deny(JSON.stringify(value));
}
function objectContext([policy, units]: Fixture) {
  const ref = (value: unknown[]) => ({
    code: value[0],
    metadataVersion: value[1],
  });
  return {
    policy: {
      revision: policy[0],
      base: ref(policy[1]),
      defaultBrowsing: ref(policy[2]),
      ...(policy[3] === null ? {} : { preferredSecondary: ref(policy[3]) }),
      currencies: policy[4].map(
        ([code, metadataVersion, display, newSales, collection]) => ({
          unit: { code, metadataVersion },
          capabilities: { display, newSales, collection },
        }),
      ),
    },
    definitions: units.map(
      ([code, metadataVersion, minorUnitExponent, provenance, status]) => ({
        code,
        metadataVersion,
        minorUnitExponent,
        provenance,
        status,
      }),
    ),
  };
}
function parity(value: Fixture, expected: boolean) {
  assert.equal(
    currencyPolicyContextSchema.safeParse(objectContext(value)).success,
    expected,
  );
  assert.equal(
    encodeCurrencyPolicyContext(JSON.stringify(value)).success,
    expected,
  );
}

test('literal A-base and replacement prior Context retain exactly 189 bytes, without a hash', () => {
  assert.equal(accept(base).canonicalText, base);
  assert.equal(new TextEncoder().encode(base).byteLength, 189);
  const prior = base.replace('fictional-v1', 'fictional-v0');
  assert.equal(accept(prior).canonicalText, prior);
  assert.notEqual(accept(prior).canonicalText, accept(base).canonicalText);
  assert.equal(accept(base).canonicalText.endsWith('\n'), false);
});

test('whitespace and JSON escapes canonicalize equivalently, copied lists sort by ASCII code', () => {
  assert.equal(accept(JSON.stringify(fixture(), null, 2)).canonicalText, base);
  assert.equal(accept(base.replace('BDT', '\\u0042DT')).canonicalText, base);
  const value = many(32);
  const expected = accept(JSON.stringify(value));
  value[0][4].reverse();
  value[1].reverse();
  assert.deepEqual(accept(JSON.stringify(value)), expected);
  const canonical = JSON.parse(expected.canonicalText) as Fixture;
  assert.deepEqual(
    canonical[0][4].map((entry) => entry[0]),
    value[0][4].map((entry) => entry[0]).reverse(),
  );
  assert.deepEqual(
    canonical[1].map((unit) => unit[0]),
    canonical[0][4].map((entry) => entry[0]),
  );
  assert.equal(value[0][4][0]?.[0], 'ABF');
});

test('every retained fact changes bytes; metadata case and provenance quoting are exact', () => {
  const changes: Array<(value: Fixture) => void> = [
    (v) => {
      v[0][0] = 'Fictional-v1';
    },
    (v) => {
      for (const ref of [v[0][1], v[0][2], ...v[0][4], ...v[1]])
        ref[1] = 'Fictional-units-v1';
    },
    (v) => {
      for (const ref of [v[0][1], v[0][2], ...v[0][4], ...v[1]]) ref[0] = 'USD';
    },
    (v) => {
      v[1][0]![2] = 4;
    },
    (v) => {
      v[1][0]![3] = 'Exact "quote" \\ provenance';
    },
    (v) => {
      v[0][4][0]![3] = false;
    },
    (v) => {
      v[0][4][0]![4] = false;
    },
  ];
  for (const change of changes) {
    const value = fixture();
    change(value);
    parity(value, true);
    assert.notEqual(accept(JSON.stringify(value)).canonicalText, base);
  }
  const value = many(3);
  const original = accept(JSON.stringify(value)).canonicalText;
  const variants: Array<(v: Fixture) => void> = [
    (v) => {
      v[0][1] = [...v[0][4][1]!.slice(0, 2)];
    },
    (v) => {
      v[0][2] = [...v[0][4][1]!.slice(0, 2)];
    },
    (v) => {
      v[0][3] = [...v[0][4][1]!.slice(0, 2)];
    },
    (v) => {
      v[0][4][2]![2] = false;
    },
    (v) => {
      v[0][4][2]![2] = false;
      v[1][2]![4] = 'historical';
    },
  ];
  for (const change of variants) {
    const v = many(3);
    change(v);
    parity(v, true);
    assert.notEqual(accept(JSON.stringify(v)).canonicalText, original);
  }
  const quoted = fixture();
  quoted[1][0]![3] = 'Exact "quote" \\ provenance';
  assert.equal(
    (
      JSON.parse(accept(JSON.stringify(quoted)).canonicalText) as Fixture
    )[1][0]![3],
    quoted[1][0]![3],
  );
});

test('all independent capability combinations retain Command 97 semantics', () => {
  for (const display of [false, true])
    for (const newSales of [false, true])
      for (const collection of [false, true]) {
        const value = many(2);
        value[0][4][1] = ['AAB', 'fictional-v1', display, newSales, collection];
        parity(value, true); // New sales need not imply display; collection need not imply either.
        value[1][1]![4] = 'historical';
        parity(value, !display && !newSales); // Historical collection may stay enabled.
      }
});

test('base can be historical; browsing requires exact current display-enabled membership', () => {
  const value = many(3);
  value[0][1] = ['AAC', 'fictional-v1'];
  value[0][3] = ['AAB', 'fictional-v1'];
  value[0][4][2]![2] = false;
  value[0][4][2]![4] = true;
  value[1][2]![4] = 'historical';
  parity(value, true);
  for (const field of [1, 2, 3] as const)
    for (const ref of [
      ['ZZZ', 'fictional-v1'],
      ['AAA', 'wrong-version'],
    ]) {
      const v = many(3);
      v[0][field] = ref;
      parity(v, false);
    }
  for (const field of [2, 3] as const) {
    const v = many(3);
    v[0][field] = ['AAB', 'fictional-v1'];
    v[0][4][1]![2] = false;
    parity(v, false);
    v[1][1]![4] = 'historical';
    parity(v, false);
  }
  const duplicate = many(2);
  duplicate[0][3] = ['AAA', 'fictional-v1'];
  parity(duplicate, false);
  duplicate[0][3] = ['AAA', 'other-version'];
  parity(duplicate, false);
});

test('1 and 32 entries pass; each zero/33 list denies independently before members', () => {
  parity(fixture(), true);
  parity(many(32), true);
  for (const count of [0, 33]) {
    const cap = many(count);
    cap[1] = fixture()[1];
    denyTuple(cap);
    const units = fixture();
    units[1] = many(count)[1];
    denyTuple(units);
  }
});

test('duplicate codes/units, missing, extra and alternate-version definitions deny', () => {
  const duplicateCode = many(2);
  duplicateCode[0][4][1]![0] = 'AAA';
  parity(duplicateCode, false);
  const duplicateUnit = many(2);
  duplicateUnit[1][1] = [...duplicateUnit[1][0]!];
  parity(duplicateUnit, false);
  const missing = many(2);
  missing[1].pop();
  parity(missing, false);
  const wrong = many(2);
  wrong[1][1]![1] = 'fictional-v2';
  parity(wrong, false);
  for (const unit of [
    ['USD', 'fictional-v1', 2, 'Fictional source', 'current'],
    ['BDT', 'fictional-units-v2', 2, 'Fictional source', 'current'],
  ]) {
    const extra = fixture();
    extra[1].push(unit);
    // Existing schema permits extra context; the codec's exact-set boundary is intentionally stricter.
    assert.equal(
      currencyPolicyContextSchema.safeParse(objectContext(extra)).success,
      true,
    );
    denyTuple(extra);
  }
});

test('revision/version/code full-input ASCII grammar rejects newline, Unicode and normalization', () => {
  const invalid = [
    '',
    ' ',
    ' v1',
    'v1 ',
    '-v1',
    '.v1',
    'v1\n',
    'v1\r\n',
    'v1\t',
    'v\u2028',
    'é',
    'Ａ',
    'A'.repeat(65),
    null,
    1,
    false,
    true,
    ['v1'],
  ];
  for (const token of invalid) {
    const revision = fixture();
    revision[0][0] = token;
    denyTuple(revision);
    for (const refIndex of [1, 2] as const) {
      const v = fixture();
      v[0][refIndex][1] = token;
      denyTuple(v);
    }
    for (const index of [0, 1] as const) {
      const v = fixture();
      (index === 0 ? v[0][4] : v[1])[0]![1] = token;
      denyTuple(v);
    }
  }
  for (const code of ['bdt', 'Bdt', 'BD', 'BDTT', 'BDT\n', 'ＢDT', 1, null]) {
    const value = fixture();
    for (const ref of [value[0][1], value[0][2], ...value[0][4], ...value[1]])
      ref[0] = code;
    denyTuple(value);
  }
  const valid = fixture();
  valid[0][0] = 'A.a:B-1_0';
  parity(valid, true);
  const newline = fixture();
  newline[0][0] = 'v1\n';
  assert.equal(
    currencyPolicyContextSchema.safeParse(objectContext(newline)).success,
    false,
  );
  denyTuple(newline); // Do not change the existing schema's regex behavior.
});

test('provenance retains printable ASCII and rejects space ends, control/Unicode/overlength', () => {
  for (const token of ['!', 'X Y', '"', '\\', 'X'.repeat(256)]) {
    const v = fixture();
    v[1][0]![3] = token;
    parity(v, true);
  }
  for (const token of [
    '',
    ' ',
    ' X',
    'X ',
    'X\n',
    'X\r',
    'X\tY',
    'X\u007f',
    'é',
    'X'.repeat(257),
    null,
    1,
  ]) {
    const v = fixture();
    v[1][0]![3] = token;
    denyTuple(v);
  }
  assert.equal(
    currencyUnitDefinitionSchema.safeParse({
      code: 'BDT',
      metadataVersion: 'v1',
      minorUnitExponent: 2,
      provenance: 'X\n',
      status: 'current',
    }).success,
    false,
  );
});

test('flags are exact booleans; exponent is only integer 0–4; status has no coercion/default', () => {
  for (const exponent of [0, 1, 2, 3, 4]) {
    const v = fixture();
    v[1][0]![2] = exponent;
    parity(v, true);
  }
  for (const exponent of [
    -1,
    5,
    0.5,
    1.1,
    '2',
    '0',
    true,
    false,
    null,
    [],
    {},
  ]) {
    const v = fixture();
    v[1][0]![2] = exponent;
    parity(v, false);
  }
  for (const flag of [0, 1, 'true', 'false', null, [], {}])
    for (const index of [2, 3, 4]) {
      const v = fixture();
      v[0][4][0]![index] = flag;
      parity(v, false);
    }
  for (const status of [
    'Current',
    'HISTORICAL',
    'current\n',
    'unknown',
    '',
    null,
    true,
    1,
  ]) {
    const v = fixture();
    v[1][0]![4] = status;
    parity(v, false);
  }
});

test('every tuple position, arity, object-shaped member, nesting and authority claim denies', () => {
  for (const invalid of [null, [], {}, [fixture()], [...fixture(), null]])
    denyTuple(invalid);
  const paths: Array<(v: Fixture) => unknown[]> = [
    (v) => v,
    (v) => v[0],
    (v) => v[0][1],
    (v) => v[0][2],
    (v) => v[0][4][0]!,
    (v) => v[1][0]!,
  ];
  for (const path of paths) {
    const length = path(fixture()).length;
    for (let index = 0; index < length; index++) {
      const missing = fixture();
      path(missing).splice(index, 1);
      denyTuple(missing);
      const nested = fixture();
      const tuple = path(nested);
      tuple[index] = [tuple[index]];
      denyTuple(nested);
      const object = fixture();
      const objTuple = path(object);
      objTuple[index] = { value: objTuple[index] };
      denyTuple(object);
    }
    const extra = fixture();
    path(extra).push('extra');
    denyTuple(extra);
  }
  for (const secondary of [
    [],
    ['USD'],
    ['USD', 'v1', true],
    {},
    false,
    '',
    { code: 'USD', metadataVersion: 'v1' },
  ]) {
    const v = fixture();
    (v[0] as unknown[])[3] = secondary;
    denyTuple(v);
  }
  for (const list of [{}, 'entries', null, false, [[[[['AAA']]]]]]) {
    const v = fixture();
    (v[0] as unknown[])[4] = list;
    denyTuple(v);
    denyTuple([fixture()[0], list]);
  }
  for (const key of [
    'approved',
    'historyLatch',
    'proofToken',
    'digest',
    'authEpoch',
    'assessment',
    'installationId',
  ]) {
    denyTuple([...fixture(), { [key]: true }]);
    denyTuple({ ...fixture(), [key]: true });
  }
});

test('caller graphs, proxies/getters/iterators/coercion and boxed strings are never invoked', () => {
  let visits = 0;
  const trap = () => {
    visits++;
    throw new Error('Fictional trap');
  };
  const revoked = Proxy.revocable({}, {});
  revoked.revoke();
  const hostile = new Proxy(
    {},
    { get: trap, ownKeys: trap, getPrototypeOf: trap },
  );
  const graph = {
    get value() {
      return trap();
    },
    toJSON: trap,
    toString: trap,
    [Symbol.toPrimitive]: trap,
    [Symbol.iterator]: trap,
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

test('65,536/65,537 actual-byte limits precede parsing and code-unit allocation guard', () => {
  assert.deepEqual(CURRENCY_POLICY_CONTEXT_LIMITS, {
    inputBytes: 65_536,
    canonicalBytes: 24_576,
    entries: 32,
  });
  assert.ok(Object.isFrozen(CURRENCY_POLICY_CONTEXT_LIMITS));
  assert.deepEqual(accept(base.padEnd(65_536, ' ')), accept(base));
  const unicodeTexts = ['€', '💡', '\ud800'].map((character) => {
    const v = fixture();
    v[1][0]![3] = character;
    return JSON.stringify(v).replace('\\ud800', '\ud800');
  });
  const parse = JSON.parse;
  const encode = TextEncoder.prototype.encode;
  let parses = 0;
  let encodes = 0;
  JSON.parse = (value: string) => {
    parses++;
    return parse(value) as unknown;
  };
  TextEncoder.prototype.encode = function (value?: string) {
    encodes++;
    return encode.call(this, value);
  };
  try {
    deny(base.padEnd(65_537, ' '));
    deny(' '.repeat(100_000));
    assert.equal(encodes, 0);
    assert.equal(parses, 0);
    for (const text of unicodeTexts) {
      const bytes = encode.call(new TextEncoder(), text).byteLength;
      const overflow = text.padEnd(text.length + 65_537 - bytes, ' ');
      assert.ok(overflow.length <= 65_536);
      deny(overflow);
      assert.equal(parses, 0);
      deny(text.padEnd(text.length + 65_536 - bytes, ' '));
      assert.equal(parses, 1);
      parses = 0;
    }
  } finally {
    JSON.parse = parse;
    TextEncoder.prototype.encode = encode;
  }
});

test('both list ceilings precede member traversal/copy/sort, even with parsed-data fault injection', () => {
  const parse = JSON.parse;
  let visits = 0;
  const trap = () => {
    visits++;
    throw new Error('Fictional parsed-data trap');
  };
  try {
    for (const list of [0, 1] as const) {
      const v = fixture();
      const oversized = new Array(33);
      Object.defineProperty(oversized, 0, { get: trap });
      if (list === 0) v[0][4] = oversized;
      else v[1] = oversized;
      JSON.parse = () => v;
      deny(base);
    }
    assert.equal(visits, 0);
  } finally {
    JSON.parse = parse;
  }
});

test('maximum escaped valid Context stays below canonical budget without relaxed field rules', () => {
  const v = many(32);
  const version = 'V'.repeat(64);
  v[0][0] = 'R'.repeat(64);
  v[0][1] = ['AAC', version];
  v[0][2] = ['AAA', version];
  v[0][3] = ['AAB', version];
  for (let i = 0; i < 32; i++) {
    v[0][4][i]![1] = version;
    v[0][4][i]![2] = i < 2;
    v[1][i]![1] = version;
    v[1][i]![3] = '\\'.repeat(256);
    v[1][i]![4] = i < 2 ? 'current' : 'historical';
  }
  parity(v, true);
  const canonical = accept(JSON.stringify(v)).canonicalText;
  // Independently count ASCII punctuation/tokens and doubled escaped provenance.
  const expectedBytes =
    3 +
    (2 + 66 + 3 * 74 + 4 + (2 + 32 * 92 - 2 + 31)) +
    (2 + 32 * 604 - 2 * 3 + 31);
  assert.equal(new TextEncoder().encode(canonical).byteLength, expectedBytes);
  assert.ok(expectedBytes < 24_576);
  const overlong = fixture();
  overlong[1][0]![3] = '\\'.repeat(257);
  denyTuple(overlong);
});

test('canonical 24,576/24,577-byte ceiling is still enforced after escaped expansion', () => {
  // Defensive platform fault injection: valid field bounds cannot reach this ceiling.
  const encode = TextEncoder.prototype.encode;
  try {
    for (const size of [24_576, 24_577]) {
      let calls = 0;
      TextEncoder.prototype.encode = function (value?: string) {
        calls++;
        return calls === 2 ? new Uint8Array(size) : encode.call(this, value);
      };
      assert.equal(encodeCurrencyPolicyContext(base).success, size === 24_576);
      assert.equal(calls, 2);
    }
  } finally {
    TextEncoder.prototype.encode = encode;
  }
});

test('fresh dense canonical tuples are not parsed graphs; success is independent and frozen', () => {
  const parsed = fixture();
  const parse = JSON.parse;
  const stringify = JSON.stringify;
  let captured: unknown;
  JSON.parse = () => parsed;
  JSON.stringify = (value: unknown) => {
    captured = value;
    return stringify(value);
  };
  let first: ReturnType<typeof accept>;
  try {
    first = accept(base);
  } finally {
    JSON.parse = parse;
    JSON.stringify = stringify;
  }
  const arrays = captured as Fixture;
  assert.notEqual(arrays, parsed);
  assert.notEqual(arrays[0], parsed[0]);
  for (const field of [1, 2, 4] as const)
    assert.notEqual(arrays[0][field], parsed[0][field]);
  assert.notEqual(arrays[0][4][0], parsed[0][4][0]);
  assert.notEqual(arrays[1][0], parsed[1][0]);
  assert.deepEqual(arrays, parsed);
  const second = accept(base);
  assert.notEqual(first, second);
  assert.deepEqual(first, second);
  parsed[1][0]![3] = 'Changed';
  assert.equal(first.canonicalText, base);
  assert.throws(
    () => Object.assign(first, { canonicalText: 'Changed' }),
    TypeError,
  );
});

test('all failures are fixed/redacted, including malformed JSON and platform failure', () => {
  const fixed = deny('{"fictional-sensitive-material":');
  for (const text of [
    '',
    '{',
    '/*fictional*/[]',
    '[1,]',
    base + ' extra',
    '\ufeff' + base,
    base.replace('null', 'NaN'),
  ])
    assert.equal(deny(text), fixed);
  assert.deepEqual(Object.keys(fixed).sort(), ['error', 'success']);
  assert.equal(
    JSON.stringify(fixed).includes('fictional-sensitive-material'),
    false,
  );
  const parse = JSON.parse;
  try {
    JSON.parse = () => {
      throw new Error('Fictional sensitive exception');
    };
    assert.equal(deny(base), fixed);
  } finally {
    JSON.parse = parse;
  }
});

test('private codec has zero imports/hash/side effects/ordinary consumers and appended mandatory wiring', () => {
  const db = resolve(__dirname, '..');
  const root = resolve(db, '../..');
  const sourcePath = resolve(db, 'src/private/currency-policy-context.ts');
  const source = readFileSync(sourcePath, 'utf8'); // Includes new/untracked source, not only git grep.
  assert.doesNotMatch(
    source,
    /\b(?:import|require|process|console|Prisma|Date|Math|fetch|createHash|localeCompare)\b|\b(?:setTimeout|randomUUID)\s*\(/,
  );
  assert.ok(
    source.indexOf('text.length >') < source.indexOf('encoder.encode(text)'),
  );
  assert.ok(
    source.indexOf('encoder.encode(text)') < source.indexOf('JSON.parse(text)'),
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
  assert.equal(
    pkg.scripts['test:unit'],
    'tsx --test --test-concurrency=1 test/currency-units.spec.ts test/currency-policies.spec.ts test/currency-adoption-preflight.spec.ts test/currency-coordination.spec.ts test/currency-coordination-guards.spec.ts test/currency-control.spec.ts test/currency-privilege-harness.spec.ts test/currency-identity.spec.ts test/currency-selection-intent.spec.ts test/currency-policy-context.spec.ts',
  );
  assert.equal(
    pkg.scripts.test,
    'pnpm test:unit && pnpm test:privileges && pnpm --filter @webhost-billing/web exec tsx e2e/run-database-tests.ts',
  );
  const forbidden =
    /currency-policy-context|encodeCurrencyPolicyContext|CURRENCY_POLICY_CONTEXT_LIMITS/;
  function visit(directory: string) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (
        /\.(?:ts|tsx|js|mjs|cjs|json)$/.test(entry.name) &&
        path !== sourcePath
      )
        assert.doesNotMatch(readFileSync(path, 'utf8'), forbidden, path);
    }
  }
  for (const directory of [
    'apps/api/src',
    'apps/web/src',
    'apps/worker/src',
    'packages/shared/src',
    'packages/database/src',
    'packages/queue/src',
    'scripts',
  ])
    visit(resolve(root, directory));
  assert.doesNotMatch(
    readFileSync(resolve(db, 'prisma/seed.ts'), 'utf8'),
    forbidden,
  );
});
