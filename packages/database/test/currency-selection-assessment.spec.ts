import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { encodeCurrencySelectionAssessment } from '../src/private/currency-selection-assessment';
import { encodeCurrencySelectionIntent } from '../src/private/currency-selection-intent';

const stableBase =
  '["currency-selection-request-v1",["10000000-0000-4000-8000-000000000001","10000000-0000-4000-8000-000000000002"],"initialize","20000000-0000-4000-8000-000000000001","20000000-0000-4000-8000-000000000003","a0b1c2d3-0000-4000-8000-abcd12345678",null,"0","fictional-v1"]';
const assessmentBase =
  '["currency-selection-assessment-v1","3f609e5934187609b5a5e679fa6f15fbb2d8e951653e21b672306e5fe1641426",["absent",null,null,null,null,null,null,null],[["fictional-v1",["BDT","fictional-units-v1"],["BDT","fictional-units-v1"],null,[["BDT","fictional-units-v1",true,true,true]]],[["BDT","fictional-units-v1",2,"Fictional source","current"]]],null,null,["20000000-0000-4000-8000-000000000005","10000000-0000-4000-8000-000000000002","20000000-0000-4000-8000-000000000001","20000000-0000-4000-8000-000000000002","20000000-0000-4000-8000-000000000003","1","20000000-0000-4000-8000-000000000004","1","totp",null],[["compatibility","30000000-0000-4000-8000-000000000001","currency-compatibility-v1","aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"],["history","30000000-0000-4000-8000-000000000002","currency-history-assessment-v1","bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"]]]';
type Fixture = { stable: unknown[]; assessment: unknown[] };
type Context = [
  [
    string,
    [string, string],
    [string, string],
    [string, string] | null,
    unknown[][],
  ],
  unknown[][],
];
const creation = '2026-01-01T00:00:00.000Z';
const failure = {
  success: false,
  error: 'Invalid currency selection assessment',
};
function bind(v: Fixture): Fixture {
  const result = encodeCurrencySelectionIntent(JSON.stringify(v.stable));
  assert.ok(result.success);
  v.assessment[1] = result.stableIntentDigest;
  return v;
}
function fixture(action = 'initialize', state = 'absent'): Fixture {
  const v: Fixture = {
    stable: JSON.parse(stableBase),
    assessment: JSON.parse(assessmentBase),
  };
  v.stable[2] = action;
  if (state === 'unassessed')
    v.assessment[2] = [
      'unassessed',
      '0',
      null,
      null,
      null,
      null,
      null,
      creation,
    ];
  if (state === 'selected') {
    v.stable[6] = 'fictional-v0';
    v.stable[7] = '9007199254740993';
    v.assessment[2] = [
      'selected',
      v.stable[7],
      v.stable[6],
      false,
      'BDT',
      'fictional-units-v1',
      2,
      creation,
    ];
    const prior = JSON.parse(JSON.stringify(v.assessment[3])) as Context;
    prior[0][0] = 'fictional-v0';
    v.assessment[4] = prior;
    v.assessment[5] = [...(prior[1][0] ?? [])];
  }
  if (action === 'adopt')
    (v.assessment[7] as unknown[][]).push([
      'adoption',
      '30000000-0000-4000-8000-000000000003',
      'currency-adoption-v1',
      'c'.repeat(64),
    ]);
  return bind(v);
}
function get(v: Fixture, path: number[]): unknown {
  let node: unknown = v.assessment;
  for (const index of path) node = (node as unknown[])[index];
  return node;
}
function set(v: Fixture, path: number[], value: unknown): void {
  let node = v.assessment;
  for (const index of path.slice(0, -1)) node = node[index] as unknown[];
  node[path.at(-1)!] = value;
}
function acceptText(stable: unknown, assessment: unknown) {
  const result = encodeCurrencySelectionAssessment(stable, assessment);
  assert.ok(result.success, 'Expected fictional syntax binding only');
  assert.ok(Object.isFrozen(result));
  assert.deepEqual(Object.keys(result).sort(), [
    'assessmentDigest',
    'canonicalText',
    'success',
  ]);
  assert.match(result.assessmentDigest, /^[a-f0-9]{64}$/);
  return result;
}
function accept(v: Fixture) {
  return acceptText(JSON.stringify(v.stable), JSON.stringify(v.assessment));
}
function denyText(stable: unknown, assessment: unknown) {
  const result = encodeCurrencySelectionAssessment(stable, assessment);
  assert.deepEqual(result, failure);
  assert.ok(Object.isFrozen(result));
  return result;
}
function deny(v: Fixture) {
  return denyText(JSON.stringify(v.stable), JSON.stringify(v.assessment));
}
function altered(path: number[], value: unknown, selected = false): Fixture {
  const v = selected ? fixture('replace', 'selected') : fixture();
  set(v, path, value);
  return v;
}

test('five prescribed A vectors reproduce exact bytes and hashes, checked independently', async () => {
  const base = fixture();
  const staged = fixture('initialize', 'unassessed');
  const auth = altered([6, 5], '2');
  const replacement = fixture('replace', 'selected');
  const latched = fixture('replace', 'selected');
  set(latched, [2, 3], true);
  set(latched, [7, 1, 3], 'c'.repeat(64));
  for (const [v, size, hash] of [
    [
      base,
      910,
      'de6f72e67de6d5ef8fdb0932e3aa79554bd38f41c171471e705d4b359ab48c75',
    ],
    [
      staged,
      935,
      '4a2569f124c682965193e639aa86d674641f362a1734e8c8c659bca1427f499c',
    ],
    [
      auth,
      910,
      '6f19bc3b2cd99f762be386f76b5ebe7d84ff3d1d4f28b0ddbc2af95f44303959',
    ],
    [
      replacement,
      1213,
      'e7c7affabac5e0f95ac8f1f8b68e0abaec5734cb358e31f98c95d26935bb6866',
    ],
    [
      latched,
      1212,
      '8f87247911a4bbb01cede22bef1dc6a52954aa2e1c59823c0d46baf7f69d911a',
    ],
  ] as const) {
    const expected = JSON.stringify(v.assessment);
    const result = accept(v);
    assert.equal(result.canonicalText, expected);
    const bytes = new TextEncoder().encode(expected);
    assert.equal(bytes.byteLength, size);
    assert.equal(result.assessmentDigest, hash);
    assert.equal(
      Buffer.from(await webcrypto.subtle.digest('SHA-256', bytes)).toString(
        'hex',
      ),
      hash,
    );
  }
  assert.equal(accept(base).canonicalText, assessmentBase);
  // These fixed expected vectors were also independently checked with .NET
  // UTF8/SHA256, not generated from this encoder's results.
});

test('legal action/control shapes stay distinct and unknown latch never means false', () => {
  for (const action of ['initialize', 'adopt'])
    for (const state of ['absent', 'unassessed'])
      accept(fixture(action, state));
  for (const latch of [false, true]) accept(altered([2, 3], latch, true));
  for (const state of ['assessed', 'assessed-unselected', '', null, true])
    deny(altered([2, 0], state));
  for (const path of [
    [2, 1],
    [2, 2],
    [2, 3],
    [2, 4],
    [2, 5],
    [2, 6],
    [2, 7],
  ])
    deny(altered(path, 'claimed'));
  for (const position of [2, 3, 4, 5, 6]) {
    const staged = fixture('initialize', 'unassessed');
    set(staged, [2, position], position === 3 ? false : 'claimed');
    deny(staged);
  }
  for (const position of [1, 2, 3, 4, 5, 6, 7])
    deny(altered([2, position], null, true));
  for (const action of ['initialize', 'adopt']) {
    const selected = fixture('replace', 'selected');
    selected.stable[2] = action;
    selected.stable[6] = null;
    selected.stable[7] = '0';
    deny(bind(selected));
  }
  const absentReplacement = fixture('replace', 'selected');
  absentReplacement.assessment[2] = fixture().assessment[2];
  deny(absentReplacement);
});

test('staging and first latch change A without incrementing or changing S', () => {
  const absent = fixture();
  const staged = fixture('initialize', 'unassessed');
  assert.deepEqual(absent.stable, staged.stable);
  assert.notEqual(
    accept(absent).assessmentDigest,
    accept(staged).assessmentDigest,
  );
  const before = fixture('replace', 'selected');
  const after = altered([2, 3], true, true);
  assert.deepEqual(before.stable, after.stable);
  assert.equal(get(before, [2, 1]), get(after, [2, 1]));
  assert.notEqual(
    accept(before).assessmentDigest,
    accept(after).assessmentDigest,
  );
});

test('companion S is recomputed and exact digest/revision/generation bindings deny mismatch', () => {
  for (const digest of [
    'a'.repeat(64),
    '3F' + '0'.repeat(62),
    '0'.repeat(63),
    '0'.repeat(64) + '\n',
    null,
    1,
    {},
  ])
    deny(altered([1], digest));
  for (const change of [
    [3, 0],
    [4, 0],
    [2, 1],
    [2, 2],
  ] as const) {
    const selected = fixture('replace', 'selected');
    set(selected, [...change], 'another');
    deny(selected);
  }
  for (const position of [2, 3, 4, 5, 8]) {
    const v = fixture();
    v.stable[position] = 'invalid';
    deny(v);
  }
  const changedKey = fixture();
  changedKey.stable[5] = String(changedKey.stable[5]).toUpperCase();
  deny(changedKey);
  assert.notEqual(
    accept(bind(changedKey)).assessmentDigest,
    accept(fixture()).assessmentDigest,
  );
});

test('positive control/auth epochs stay exact above Number precision and at BIGINT maximum', () => {
  for (const counter of [
    '1',
    '9007199254740992',
    '9007199254740993',
    '9223372036854775807',
  ]) {
    const v = fixture('replace', 'selected');
    v.stable[7] = counter;
    set(v, [2, 1], counter);
    set(v, [6, 5], counter);
    set(v, [6, 7], counter);
    const text = accept(bind(v)).canonicalText;
    assert.equal((JSON.parse(text) as unknown[][])[2]?.[1], counter);
    assert.ok(text.includes(`"${counter}"`));
  }
  for (const counter of [
    '0',
    '-1',
    '01',
    '+1',
    '1.0',
    '1e2',
    ' 1',
    '1 ',
    '1\n',
    '９',
    '9223372036854775808',
    '9'.repeat(20),
    1,
    9007199254740992,
    null,
    true,
  ])
    for (const path of [
      [2, 1],
      [6, 5],
      [6, 7],
    ])
      deny(altered(path, counter, true));
});

test('supplied UTC creation time validates real calendar and exact 24-character round trip', () => {
  for (const time of [
    '2024-02-29T23:59:59.999Z',
    '2000-02-29T00:00:00.000Z',
    '0000-01-01T00:00:00.000Z',
    '9999-12-31T23:59:59.999Z',
  ]) {
    const staged = fixture('initialize', 'unassessed');
    set(staged, [2, 7], time);
    accept(staged);
    accept(altered([2, 7], time, true));
  }
  for (const time of [
    '2023-02-29T00:00:00.000Z',
    '1900-02-29T00:00:00.000Z',
    '2024-02-30T00:00:00.000Z',
    '2026-04-31T00:00:00.000Z',
    '2026-00-01T00:00:00.000Z',
    '2026-13-01T00:00:00.000Z',
    '2026-01-00T00:00:00.000Z',
    '2026-01-01T24:00:00.000Z',
    '2026-01-01T00:60:00.000Z',
    '2026-01-01T00:00:60.000Z',
    '2026-01-01t00:00:00.000z',
    '2026-01-01T00:00:00Z',
    '2026-01-01T00:00:00.000+00:00',
    creation + '\n',
    creation.replace('2026', '２０２６'),
    null,
    0,
    {},
  ]) {
    const staged = fixture('initialize', 'unassessed');
    set(staged, [2, 7], time);
    deny(staged);
    deny(altered([2, 7], time, true));
  }
});

test('H retains lowercase UUIDs, factor kind and explicit recovery identity, without auth claims', () => {
  for (const position of [0, 1, 2, 3, 4, 6]) {
    for (const bad of [
      'ABCDEFAB-0000-4000-8000-000000000001',
      '20000000-0000-0000-8000-000000000001',
      '20000000-0000-4000-7000-000000000001',
      String(get(fixture(), [6, position])) + '\n',
      null,
      1,
      {},
    ])
      deny(altered([6, position], bad));
  }
  for (const path of [
    [6, 1],
    [6, 2],
    [6, 4],
  ])
    deny(altered(path, '20000000-0000-4000-8000-000000000009'));
  for (const kind of ['', 'TOTP', 'password', null])
    deny(altered([6, 8], kind));
  const recovery = altered([6, 8], 'recovery');
  deny(recovery);
  set(recovery, [6, 9], '20000000-0000-4000-8000-000000000006');
  accept(recovery);
  for (const value of [
    null,
    '',
    'ABCDEFAB-0000-4000-8000-000000000001',
    {},
    1,
  ]) {
    set(recovery, [6, 9], value);
    deny(recovery);
  }
  deny(altered([6, 9], '20000000-0000-4000-8000-000000000006'));
  for (const id of [
    '00000000-0000-0000-0000-000000000000',
    'ffffffff-ffff-ffff-ffff-ffffffffffff',
  ]) {
    const v = fixture();
    set(v, [6, 0], id);
    set(v, [6, 3], id);
    set(v, [6, 6], id);
    accept(v);
  }
});

test('prior context and anchor are mandatory exactly for selected C', () => {
  const selected = fixture('replace', 'selected');
  for (const position of [4, 5]) {
    for (const invalid of [null, [], {}, true])
      deny(altered([position], invalid, true));
    const absent = fixture();
    absent.assessment[position] = selected.assessment[position];
    deny(absent);
    const staged = fixture('initialize', 'unassessed');
    staged.assessment[position] = selected.assessment[position];
    deny(staged);
  }
  for (const [position, value] of [
    [0, 'USD'],
    [1, 'Other-v1'],
    [2, 3],
    [3, 'Different'],
    [4, 'historical'],
  ] as const)
    deny(altered([5, position], value, true));
  for (const value of ['', ' BDT', 'bdt', 'BDT\n', 'BＤT'])
    deny(altered([2, 4], value, true));
  for (const value of ['', 'a'.repeat(65), 'a\n', 'a b', 'é'])
    deny(altered([2, 5], value, true));
  for (const value of [-1, 5, 1.5, '2', null])
    deny(altered([2, 6], value, true));
});

test('history latch locks code/exponent but does not turn metadata shape into compatibility approval', () => {
  for (const latch of [false, true]) {
    const v = fixture('replace', 'selected');
    set(v, [2, 3], latch);
    const proposed = get(v, [3]) as Context;
    proposed[0][1][1] = 'next-unit';
    proposed[0][2][1] = 'next-unit';
    proposed[0][4][0]![1] = 'next-unit';
    proposed[1][0]![1] = 'next-unit';
    accept(v); // Distinct metadata plus compatibility root is syntax only.
  }
  const changeBase = (latch: boolean, code: string, exponent: number) => {
    const v = fixture('replace', 'selected');
    set(v, [2, 3], latch);
    const proposed = get(v, [3]) as Context;
    proposed[0][1] = [code, 'next-unit'];
    proposed[0][2] = [code, 'next-unit'];
    proposed[0][4] = [[code, 'next-unit', true, true, true]];
    proposed[1] = [[code, 'next-unit', exponent, 'Fictional next', 'current']];
    return v;
  };
  accept(changeBase(false, 'USD', 3));
  deny(changeBase(true, 'USD', 2));
  deny(changeBase(true, 'BDT', 3));
  const priorChanged = fixture('replace', 'selected');
  set(priorChanged, [2, 3], true);
  const prior = get(priorChanged, [4]) as Context;
  prior[0][1][1] = 'prior-next';
  prior[0][2][1] = 'prior-next';
  prior[0][4][0]![1] = 'prior-next';
  prior[1][0]![1] = 'prior-next';
  accept(priorChanged);
  set(priorChanged, [4, 1, 0, 2], 3);
  deny(priorChanged);
});

test('repeated immutable unit identities cannot disagree across proposed/prior/anchor', () => {
  for (const [field, value] of [
    [2, 3],
    [3, 'Other provenance'],
    [4, 'historical'],
  ] as const) {
    const v = fixture('replace', 'selected');
    set(v, [2, 3], false);
    set(v, [3, 1, 0, field], value);
    if (field === 4) {
      // Make each Context independently valid: historical base plus a current
      // browsing unit. The cross-component identity conflict still must deny.
      const proposed = get(v, [3]) as Context;
      proposed[0][4][0]![2] = false;
      proposed[0][4][0]![3] = false;
      proposed[0][2] = ['USD', 'other'];
      proposed[0][4].push(['USD', 'other', true, true, true]);
      proposed[1].push(['USD', 'other', 2, 'Fictional', 'current']);
    }
    deny(v);
  }
  for (const latch of [false, true]) {
    const v = fixture('replace', 'selected');
    set(v, [2, 3], latch);
    set(v, [5, 3], 'Contradictory anchor');
    deny(v);
  }
});

test('E requires registered version pairs, unique kind/id and complete roots, not coverage', () => {
  for (const path of [
    [7, 0, 0],
    [7, 0, 2],
  ])
    for (const bad of ['', 'unknown', null, {}]) deny(altered(path, bad));
  for (const bad of [
    '30000000-0000-4000-7000-000000000001',
    'ABCDEFAB-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001\n',
    null,
  ])
    deny(altered([7, 0, 1], bad));
  for (const bad of [
    'A'.repeat(64),
    'g'.repeat(64),
    'a'.repeat(63),
    'a'.repeat(65),
    'a'.repeat(64) + '\n',
    {},
    null,
    1,
  ])
    deny(altered([7, 0, 3], bad));
  for (const index of [0, 1]) {
    const v = fixture();
    v.assessment[7] = [(get(v, [7]) as unknown[][])[index]];
    deny(v);
  }
  const adoption = fixture('adopt');
  (adoption.assessment[7] as unknown[][]).pop();
  deny(adoption);
  const duplicate = fixture();
  const roots = duplicate.assessment[7] as unknown[][];
  roots.push([...roots[0]!]);
  deny(duplicate);
  roots[2]![3] = 'c'.repeat(64);
  deny(duplicate);
  roots[2]![2] = 'currency-history-assessment-v1';
  deny(duplicate);
  const sameId = fixture();
  set(sameId, [7, 1, 1], get(sameId, [7, 0, 1]));
  accept(sameId);
});

test('E 0/1/32/33 budgets are checked before indexed members and copies', () => {
  const v = fixture();
  const roots = v.assessment[7] as unknown[][];
  for (let i = 2; i < 32; i++)
    roots.push([
      'history',
      `30000000-0000-4000-8000-${String(i + 3).padStart(12, '0')}`,
      'currency-history-assessment-v1',
      'd'.repeat(64),
    ]);
  accept(v);
  roots.push([
    'history',
    '30000000-0000-4000-8000-000000000032',
    'currency-history-assessment-v1',
    'd'.repeat(64),
  ]);
  deny(v);
  deny(altered([7], []));
  deny(altered([7], [fixture().assessment[7]]));
  let visits = 0;
  const oversized = new Array(33);
  Object.defineProperty(oversized, 0, {
    get() {
      visits++;
      throw new Error('Fictional member trap');
    },
  });
  const parsed = fixture().assessment;
  parsed[7] = oversized;
  const parse = JSON.parse;
  try {
    JSON.parse = (text: string) =>
      text === assessmentBase ? parsed : (parse(text) as unknown);
    denyText(stableBase, assessmentBase);
    assert.equal(visits, 0);
  } finally {
    JSON.parse = parse;
  }
});

function manyContext(count: number, revision: string): Context {
  const capabilities: unknown[][] = [],
    units: unknown[][] = [];
  for (let i = 0; i < count; i++) {
    const code = `A${String.fromCharCode(65 + Math.floor(i / 26))}${String.fromCharCode(65 + (i % 26))}`;
    capabilities.push([code, 'v1', true, false, false]);
    units.push([code, 'v1', 2, 'Fictional', 'current']);
  }
  return [[revision, ['AAA', 'v1'], ['AAA', 'v1'], null, capabilities], units];
}
test('both Context list budgets and retained semantics apply independently', () => {
  const v = fixture('replace', 'selected');
  v.assessment[3] = manyContext(32, 'fictional-v1');
  v.assessment[4] = manyContext(32, 'fictional-v0');
  v.assessment[5] = ['AAA', 'v1', 2, 'Fictional', 'current'];
  set(v, [2, 4], 'AAA');
  set(v, [2, 5], 'v1');
  accept(v);
  for (const context of [3, 4])
    for (const path of [
      [context, 0, 4],
      [context, 1],
    ]) {
      const old = get(v, path);
      for (const size of [0, 33]) {
        set(v, path, Array(size).fill(null));
        deny(v);
      }
      set(v, path, old);
    }
  for (const context of [3, 4]) {
    for (const path of [
      [context, 0, 1, 1],
      [context, 0, 2, 0],
      [context, 0, 4, 0, 2],
      [context, 1, 0, 2],
      [context, 1, 0, 3],
      [context, 1, 0, 4],
    ]) {
      const old = get(v, path);
      set(v, path, 'invalid');
      deny(v);
      set(v, path, old);
    }
  }
  const parse = JSON.parse;
  let visits = 0;
  try {
    for (const context of [3, 4])
      for (const path of [
        [context, 0, 4],
        [context, 1],
      ]) {
        const parsed = fixture('replace', 'selected');
        const raw = JSON.stringify(parsed.assessment);
        const oversized = new Array(33);
        Object.defineProperty(oversized, 0, {
          get() {
            visits++;
            throw new Error('Fictional context trap');
          },
        });
        set(parsed, path, oversized);
        JSON.parse = (text: string) =>
          text === raw ? parsed.assessment : (parse(text) as unknown);
        denyText(JSON.stringify(parsed.stable), raw);
      }
    assert.equal(visits, 0);
  } finally {
    JSON.parse = parse;
  }
});

test('reordered roots/definitions/capabilities and JSON escapes produce identical bytes', () => {
  const v = fixture();
  const context = get(v, [3]) as Context;
  context[0][3] = ['USD', 'v2'];
  context[0][4].push(['USD', 'v2', true, false, true]);
  context[1].push(['USD', 'v2', 2, 'Quoted "source" \\ path', 'current']);
  const expected = accept(v);
  context[0][4].reverse();
  context[1].reverse();
  (v.assessment[7] as unknown[][]).reverse();
  assert.deepEqual(accept(v), expected);
  assert.deepEqual(
    acceptText(
      JSON.stringify(v.stable, null, 2),
      JSON.stringify(v.assessment, null, 2).replace(
        'fictional-v1',
        '\\u0066ictional-v1',
      ),
    ),
    expected,
  );
  assert.equal(expected.canonicalText.endsWith('\n'), false);
  assert.equal(expected.canonicalText.startsWith('\ufeff'), false);
});

test('every retained independent control/auth/evidence/context fact affects A', () => {
  const baseline = accept(fixture('replace', 'selected')).assessmentDigest;
  for (const [path, value] of [
    [[2, 3], true],
    [[2, 7], '2026-01-02T00:00:00.000Z'],
    [[6, 0], '20000000-0000-4000-8000-000000000009'],
    [[6, 3], '20000000-0000-4000-8000-000000000009'],
    [[6, 5], '2'],
    [[6, 6], '20000000-0000-4000-8000-000000000009'],
    [[6, 7], '2'],
    [[7, 0, 1], '30000000-0000-4000-8000-000000000009'],
    [[7, 0, 3], 'd'.repeat(64)],
    [[7, 1, 1], '30000000-0000-4000-8000-000000000009'],
    [[7, 1, 3], 'd'.repeat(64)],
    [[3, 0, 4, 0, 3], false],
    [[3, 0, 4, 0, 4], false],
    [[4, 0, 4, 0, 3], false],
    [[4, 0, 4, 0, 4], false],
  ] as const)
    assert.notEqual(
      accept(altered([...path], value, true)).assessmentDigest,
      baseline,
    );
  const provenance = fixture('replace', 'selected');
  for (const path of [
    [3, 1, 0, 3],
    [4, 1, 0, 3],
    [5, 3],
  ])
    set(provenance, path, 'Fictional changed');
  assert.notEqual(accept(provenance).assessmentDigest, baseline);
});

test('all prescribed tuple positions/types/arities/depth and extra authority fields deny', () => {
  function walk(
    value: unknown,
    path: number[],
    leaves: number[][],
    arrays: number[][],
  ) {
    if (!Array.isArray(value)) {
      leaves.push(path);
      return;
    }
    arrays.push(path);
    value.forEach((entry, index) =>
      walk(entry, [...path, index], leaves, arrays),
    );
  }
  for (const selected of [false, true]) {
    const source = selected ? fixture('replace', 'selected') : fixture();
    const leaves: number[][] = [],
      arrays: number[][] = [];
    walk(source.assessment, [], leaves, arrays);
    for (const path of leaves)
      for (const invalid of [{ value: get(source, path) }, [get(source, path)]])
        deny(altered(path, invalid, selected));
    for (const path of arrays) {
      const value = get(source, path) as unknown[];
      for (const invalid of [
        { tuple: value },
        [...value, { approved: true }],
        [],
        ...value.map((_, omitted) =>
          value.filter((__, index) => index !== omitted),
        ),
      ]) {
        if (path.length) deny(altered(path, invalid, selected));
        else denyText(JSON.stringify(source.stable), JSON.stringify(invalid));
      }
    }
  }
  for (const v of [
    null,
    true,
    1,
    'text',
    {},
    [],
    [fixture().assessment],
    { assessment: fixture().assessment },
  ])
    denyText(stableBase, JSON.stringify(v));
  for (const key of [
    'proofToken',
    'proofHash',
    'approved',
    'authority',
    'createdAt',
    'history',
    'session',
  ]) {
    const v = fixture();
    v.assessment.push({ [key]: 'fictional' });
    deny(v);
  }
});

test('caller graphs/boxed strings/proxies/getters/coercion/iterators are never visited', () => {
  let visits = 0;
  const trap = () => {
    visits++;
    throw new Error('Fictional caller trap');
  };
  const proxy = new Proxy(
    {},
    { get: trap, ownKeys: trap, getPrototypeOf: trap },
  );
  const revoked = Proxy.revocable({}, {});
  revoked.revoke();
  const graph = {
    get data() {
      return trap();
    },
    toJSON: trap,
    toString: trap,
    [Symbol.toPrimitive]: trap,
    [Symbol.iterator]: trap,
  };
  for (const value of [
    proxy,
    revoked.proxy,
    graph,
    fixture().assessment,
    new String(assessmentBase),
    undefined,
    null,
    Symbol('fixture'),
    1n,
    () => assessmentBase,
  ]) {
    denyText(stableBase, value);
    denyText(value, assessmentBase);
  }
  assert.equal(visits, 0);
});

test('both input code-unit and actual UTF-8 bounds precede allocation/parse', () => {
  const expected = accept(fixture());
  assert.deepEqual(
    acceptText(stableBase.padEnd(65_536), assessmentBase.padEnd(65_536)),
    expected,
  );
  const parse = JSON.parse,
    encode = TextEncoder.prototype.encode;
  let parses = 0,
    encodes = 0;
  JSON.parse = (text: string) => {
    parses++;
    return parse(text) as unknown;
  };
  TextEncoder.prototype.encode = function (text?: string) {
    encodes++;
    return encode.call(this, text);
  };
  try {
    for (const argument of [0, 1]) {
      const inputs = [stableBase, assessmentBase];
      inputs[argument] = inputs[argument]!.padEnd(65_537);
      denyText(inputs[0], inputs[1]);
      assert.equal(parses, 0);
      assert.equal(encodes, 0);
    }
    for (const argument of [0, 1])
      for (const char of ['€', '💡', '\ud800']) {
        const text = (argument ? assessmentBase : stableBase) + ` "${char}"`;
        const byteCount = encode.call(new TextEncoder(), text).byteLength;
        const overflow = text.padEnd(text.length + 65_537 - byteCount);
        assert.ok(overflow.length <= 65_536);
        const inputs = [stableBase, assessmentBase];
        inputs[argument] = overflow;
        denyText(inputs[0], inputs[1]);
        assert.equal(parses, 0);
        inputs[argument] = text.padEnd(text.length + 65_536 - byteCount);
        denyText(inputs[0], inputs[1]);
        assert.ok(parses > 0);
        parses = 0;
      }
  } finally {
    JSON.parse = parse;
    TextEncoder.prototype.encode = encode;
  }
});

test('component and A post-escape ceilings deny before assessment hashing', () => {
  // Defensive platform fault injection: valid fields cannot reach these ceilings.
  // Target exact canonical component text, not arbitrary call-number assumptions.
  const selected = fixture('replace', 'selected');
  const canonical = accept(selected).canonicalText;
  const cases: [string, number][] = [
    [JSON.stringify(selected.assessment[2]), 512],
    [JSON.stringify(selected.assessment[6]), 1_024],
    [JSON.stringify((selected.assessment[7] as unknown[][])[0]), 224],
    [JSON.stringify(selected.assessment[3]), 24_576],
    [JSON.stringify(selected.assessment[4]), 24_576],
    [canonical, 65_536],
  ];
  const encode = TextEncoder.prototype.encode;
  try {
    for (const [target, ceiling] of cases)
      for (const size of [ceiling, ceiling + 1]) {
        let hits = 0;
        TextEncoder.prototype.encode = function (text?: string) {
          // Raw A equals canonical A in this fixture; do not poison pre-parse input
          // measurement when testing the final output ceiling.
          if (text === target && (target !== canonical || ++hits > 1))
            return new Uint8Array(size);
          return encode.call(this, text);
        };
        const result = encodeCurrencySelectionAssessment(
          JSON.stringify(selected.stable),
          JSON.stringify(selected.assessment),
        );
        assert.equal(
          result.success,
          size === ceiling,
          `Defensive ceiling ${ceiling}/${size}`,
        );
      }
  } finally {
    TextEncoder.prototype.encode = encode;
  }
});

test('largest escaped two-context fixture stays under input/output ceilings without wider field rules', () => {
  const v = fixture('replace', 'selected');
  for (const position of [3, 4]) {
    const context = manyContext(
      32,
      position === 3 ? 'fictional-v1' : 'fictional-v0',
    );
    const version = 'V'.repeat(64);
    context[0][1][1] = version;
    context[0][2][1] = version;
    for (let i = 0; i < 32; i++) {
      context[0][4][i]![1] = version;
      context[1][i]![1] = version;
      context[1][i]![3] = '\\'.repeat(256);
    }
    v.assessment[position] = context;
  }
  v.assessment[5] = ['AAA', 'V'.repeat(64), 2, '\\'.repeat(256), 'current'];
  set(v, [2, 4], 'AAA');
  set(v, [2, 5], 'V'.repeat(64));
  const canonical = accept(v).canonicalText;
  assert.ok(Buffer.byteLength(canonical) > 44_000);
  assert.ok(Buffer.byteLength(canonical) < 65_536);
  for (const position of [3, 4]) {
    const changed = JSON.parse(JSON.stringify(v)) as Fixture;
    set(changed, [position, 1, 0, 3], '\\'.repeat(257));
    deny(changed);
  }
});

test('success is independently frozen/copied and every failure is one fixed redacted result', () => {
  const v = fixture();
  const text = JSON.stringify(v.assessment);
  const first = accept(v),
    second = accept(v);
  assert.notEqual(first, second);
  assert.deepEqual(first, second);
  set(v, [6, 0], 'changed');
  set(v, [3, 1, 0, 3], 'changed');
  assert.equal(first.canonicalText, text);
  assert.throws(
    () => Object.assign(first, { canonicalText: 'changed' }),
    TypeError,
  );
  const fixed = denyText(stableBase, '{"fictional-sensitive-handle":');
  for (const bad of [
    '',
    '{',
    '[1,]',
    '\ufeff' + assessmentBase,
    assessmentBase + ' extra',
    '/*fixture*/[]',
  ])
    assert.equal(denyText(stableBase, bad), fixed);
  assert.deepEqual(Object.keys(fixed).sort(), ['error', 'success']);
  const parse = JSON.parse;
  try {
    JSON.parse = () => {
      throw new Error('Fictional sensitive raw error');
    };
    assert.equal(denyText(stableBase, assessmentBase), fixed);
  } finally {
    JSON.parse = parse;
  }
});

test('final A contains fresh dense component arrays, not the parse-owned input graph', () => {
  const v = fixture('replace', 'selected');
  const text = JSON.stringify(v.assessment);
  const parse = JSON.parse,
    stringify = JSON.stringify;
  let final: unknown[] | undefined;
  JSON.parse = (input: string) =>
    input === text ? v.assessment : (parse(input) as unknown);
  JSON.stringify = (value: unknown) => {
    if (Array.isArray(value) && value[0] === 'currency-selection-assessment-v1')
      final = value;
    return stringify(value);
  };
  try {
    acceptText(stringify(v.stable), text);
  } finally {
    JSON.parse = parse;
    JSON.stringify = stringify;
  }
  assert.ok(final);
  assert.notEqual(final, v.assessment);
  assert.deepEqual(final, v.assessment);
  function distinct(left: unknown[], right: unknown[]) {
    assert.notEqual(left, right);
    assert.equal(Object.keys(left).length, left.length);
    for (let index = 0; index < left.length; index++)
      if (Array.isArray(left[index]))
        distinct(left[index] as unknown[], right[index] as unknown[]);
  }
  distinct(final, v.assessment);
});

test('assessment imports only reviewed private codecs/crypto and has no entry, side effect or ordinary consumer', () => {
  const db = resolve(__dirname, '..'),
    root = resolve(db, '../..');
  const sourcePath = resolve(
    db,
    'src/private/currency-selection-assessment.ts',
  );
  const source = readFileSync(sourcePath, 'utf8');
  assert.deepEqual(
    [...source.matchAll(/from ['"]([^'"]+)['"]/g)].map((m) => m[1]),
    ['node:crypto', './currency-selection-intent', './currency-policy-context'],
  );
  assert.doesNotMatch(
    source,
    /\b(?:require|import)\s*\(|\b(?:process|console|Prisma|Math|fetch|localeCompare)\b|\b(?:setTimeout|randomUUID)\s*\(|Date\.(?:now|UTC)|new Date\(\s*\)/,
  );
  assert.equal(
    [...source.matchAll(/new Date\(([^)]*)\)/g)].map((m) => m[1]).join(','),
    'value',
  );
  assert.ok(
    source.indexOf('stableIntentText.length >') <
      source.indexOf('encoder.encode(stableIntentText)'),
  );
  assert.ok(
    source.indexOf('encoder.encode(assessmentText)') <
      source.indexOf('JSON.parse(assessmentText)'),
  );
  assert.ok(
    source.indexOf('bytes.byteLength >') <
      source.indexOf("createHash('sha256')"),
  );
  const pkg = JSON.parse(readFileSync(resolve(db, 'package.json'), 'utf8'));
  assert.ok(
    pkg.scripts['test:unit'].endsWith(
      'test/currency-policy-context.spec.ts test/currency-selection-assessment.spec.ts',
    ),
  );
  assert.doesNotMatch(JSON.stringify(pkg.exports), /assessment|private/);
  const forbidden =
    /currency-selection-assessment|encodeCurrencySelectionAssessment|CurrencySelectionAssessmentResult/;
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
