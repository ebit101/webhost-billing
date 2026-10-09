import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CURRENCY_SELECTION_REQUEST_LIMITS,
  parseCurrencySelectionRequest,
} from '../src/currency-selection-request';

// Fictional shape fixtures only; no token is minted, issued, stored or authorized.
function fixture(action: 'initialize' | 'adopt' | 'replace' = 'initialize') {
  return {
    action,
    proposedRevision: 'Fictional.policy-v2:BDT',
    expectedRevision: action === 'replace' ? 'fictional-policy-v1' : null,
    expectedGeneration: action === 'replace' ? '1' : '0',
    requestKey: 'a0b1c2d3-0000-4000-8000-abcd12345678',
    proofToken: 'x'.repeat(43),
  };
}
const failure = {
  success: false,
  error: 'Invalid currency selection request',
};
function deny(input: unknown) {
  const result = parseCurrencySelectionRequest(input);
  assert.deepEqual(result, failure);
  assert.ok(Object.isFrozen(result));
}
function denyObject(input: unknown) {
  deny(JSON.stringify(input));
}

describe('unused currency selection request syntax', () => {
  for (const action of ['initialize', 'adopt', 'replace'] as const) {
    it(`copies the six explicit ${action} fields without authority`, () => {
      const input = fixture(action);
      const result = parseCurrencySelectionRequest(JSON.stringify(input));
      assert.equal(result.success, true);
      if (!result.success)
        return assert.fail('Expected valid fictional syntax');
      assert.deepEqual(result.request, input);
      assert.deepEqual(Object.keys(result).sort(), ['request', 'success']);
      assert.equal(Object.keys(result.request).length, 6);
      assert.notEqual(result.request, input);
      assert.ok(Object.isFrozen(result));
      assert.ok(Object.isFrozen(result.request));
      input.proposedRevision = 'changed-fixture';
      assert.equal(result.request.proposedRevision, 'Fictional.policy-v2:BDT');
    });
  }

  it('has fixed frozen technical budgets, not live policy defaults', () => {
    assert.deepEqual(CURRENCY_SELECTION_REQUEST_LIMITS, {
      jsonBytes: 4096,
      generationDigits: 19,
      generationMaximum: '9223372036854775807',
      proofTokenLength: 43,
    });
    assert.ok(Object.isFrozen(CURRENCY_SELECTION_REQUEST_LIMITS));
  });

  it('preserves exact case and the existing UUID grammar without normalization', () => {
    for (const requestKey of [
      fixture().requestKey,
      fixture().requestKey.toUpperCase(),
      '00000000-0000-0000-0000-000000000000',
      'ffffffff-ffff-ffff-ffff-ffffffffffff',
    ]) {
      const result = parseCurrencySelectionRequest(
        JSON.stringify({ ...fixture(), requestKey }),
      );
      assert.equal(result.success, true);
      if (!result.success) return assert.fail('Expected UUID syntax only');
      assert.equal(result.request.requestKey, requestKey);
      assert.equal(result.request.proposedRevision, fixture().proposedRevision);
    }
    for (const requestKey of [
      '',
      'not-a-uuid',
      ` ${fixture().requestKey}`,
      `${fixture().requestKey}\n`,
      'a0b1c2d3-0000-4000-7000-abcd12345678',
      fixture().requestKey.replaceAll('-', ''),
      null,
      1,
    ]) {
      denyObject({ ...fixture(), requestKey });
    }
  });

  it('reuses bounded revision grammar and requires a full input match', () => {
    for (const proposedRevision of ['a', 'A'.repeat(64), 'A.b_c-d:09']) {
      assert.equal(
        parseCurrencySelectionRequest(
          JSON.stringify({ ...fixture(), proposedRevision }),
        ).success,
        true,
      );
    }
    for (const revision of [
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
      null,
      42,
    ]) {
      denyObject({ ...fixture(), proposedRevision: revision });
      denyObject({ ...fixture('replace'), expectedRevision: revision });
    }
  });

  it('retains large generations exactly, including maximum syntax without increment', () => {
    for (const expectedGeneration of [
      '1',
      '9007199254740991',
      '9007199254740992',
      '9007199254740993',
      '9223372036854775807',
    ]) {
      const result = parseCurrencySelectionRequest(
        JSON.stringify({ ...fixture('replace'), expectedGeneration }),
      );
      assert.equal(result.success, true);
      if (!result.success)
        return assert.fail('Expected exact generation syntax');
      assert.equal(result.request.expectedGeneration, expectedGeneration);
    }
  });

  it('rejects noncanonical, numeric and oversized generations before coercion', () => {
    for (const expectedGeneration of [
      '',
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
      denyObject({ ...fixture('replace'), expectedGeneration });
    }
  });

  it('requires consistent action/expected-state pairs without guessing state', () => {
    for (const action of ['initialize', 'adopt'] as const) {
      for (const expectedRevision of ['', 'fictional-policy-v1']) {
        denyObject({ ...fixture(action), expectedRevision });
      }
      for (const expectedGeneration of ['1', '00', 0, null]) {
        denyObject({ ...fixture(action), expectedGeneration });
      }
    }
    denyObject({ ...fixture('replace'), expectedRevision: null });
    denyObject({ ...fixture('replace'), expectedGeneration: '0' });
    denyObject({
      ...fixture('replace'),
      expectedRevision: fixture().proposedRevision,
    });
    // Case-sensitive revision identity is not silently folded.
    assert.equal(
      parseCurrencySelectionRequest(
        JSON.stringify({
          ...fixture('replace'),
          expectedRevision: fixture().proposedRevision.toLowerCase(),
        }),
      ).success,
      true,
    );
  });

  it('requires all six fields, including explicit null and an opaque token', () => {
    for (const action of ['initialize', 'adopt', 'replace'] as const) {
      for (const key of Object.keys(fixture(action))) {
        const input: Record<string, unknown> = { ...fixture(action) };
        delete input[key];
        denyObject(input);
      }
    }
  });

  it('rejects unknown actions and does not trim, default or coerce', () => {
    for (const action of [
      '',
      'Initialize',
      'initialize ',
      'select',
      'stage',
      null,
      0,
      true,
    ]) {
      denyObject({ ...fixture(), action });
    }
  });

  it('accepts only 43-character base64url token shape, not proof validity', () => {
    for (const proofToken of ['x'.repeat(43), 'Ab09_-'.repeat(7) + 'Z']) {
      const result = parseCurrencySelectionRequest(
        JSON.stringify({ ...fixture(), proofToken }),
      );
      assert.equal(result.success, true);
      if (!result.success)
        return assert.fail('Expected opaque token shape only');
      assert.equal(result.request.proofToken, proofToken);
    }
    for (const proofToken of [
      '',
      'x'.repeat(42),
      'x'.repeat(44),
      'x'.repeat(42) + '=',
      'x'.repeat(42) + '/',
      'x'.repeat(42) + '+',
      'x'.repeat(42) + '\n',
      'x'.repeat(42) + ' ',
      'x'.repeat(42) + 'é',
      null,
      1,
    ]) {
      denyObject({ ...fixture(), proofToken });
    }
  });

  it('rejects caller authority and extra fields, including prototype-like keys', () => {
    for (const key of [
      'actor',
      'actorId',
      'session',
      'sessionId',
      'schema',
      'schemaKey',
      'installation',
      'history',
      'historyLatch',
      'anchor',
      'base',
      'evidence',
      'evidenceIds',
      'approved',
      'definitions',
      'policy',
      'receipt',
      'proofHash',
      'generation',
      'currency',
      'amount',
      'transaction',
      '__proto__',
      'constructor',
    ]) {
      denyObject({ ...fixture(), [key]: 'fictional-claim' });
    }
  });

  it('rejects nested fields, arrays and non-object JSON without partial facts', () => {
    for (const key of Object.keys(fixture())) {
      denyObject({ ...fixture(), [key]: { value: 'fictional-claim' } });
      denyObject({ ...fixture(), [key]: ['fictional-claim'] });
    }
    for (const value of [null, true, 1, 'text', [], [fixture()], {}])
      denyObject(value);
  });

  it('refuses arbitrary object graphs without invoking caller getters or coercion', () => {
    let visited = false;
    const hostile = new Proxy(
      {},
      {
        get() {
          visited = true;
          throw new Error('Fictional getter');
        },
        ownKeys() {
          visited = true;
          throw new Error('Fictional enumeration');
        },
      },
    );
    for (const input of [
      hostile,
      fixture(),
      new String('{}'),
      undefined,
      null,
      Symbol('fictional'),
      () => '{}',
    ]) {
      deny(input);
    }
    assert.equal(visited, false);
  });

  it('rejects malformed JSON and duplicate keys, including escaped aliases', () => {
    for (const text of [
      '',
      '{',
      '{"action":',
      '{"action":"initialize",}',
      '/*fictional*/{}',
    ])
      deny(text);
    const text = JSON.stringify(fixture());
    deny(text.replace('{', '{"action":"initialize",'));
    deny(text.replace('{', '{"act\\u0069on":"initialize",'));
    deny(text.replace('{', '{"proofToken":"' + 'y'.repeat(43) + '",'));
    // Valid escaped member names retain the same six-field identity.
    assert.equal(
      parseCurrencySelectionRequest(text.replace('"action"', '"act\\u0069on"'))
        .success,
      true,
    );
  });

  it('checks 4 KiB UTF-8 before JSON parsing and bounds encoder allocation', () => {
    const text = JSON.stringify(fixture());
    assert.equal(
      parseCurrencySelectionRequest(text.padEnd(4096, ' ')).success,
      true,
    );
    const originalParse = JSON.parse;
    let calls = 0;
    JSON.parse = (value: string) => {
      calls += 1;
      return originalParse(value) as unknown;
    };
    try {
      deny(text.padEnd(4097, ' '));
      deny(' '.repeat(100_000));
      const unicode = JSON.stringify({
        ...fixture(),
        proposedRevision: '€'.repeat(1000),
      });
      const unicodeBytes = new TextEncoder().encode(unicode).byteLength;
      assert.ok(unicode.length < 4096);
      assert.ok(unicodeBytes < 4096);
      deny(unicode.padEnd(unicode.length + 4097 - unicodeBytes, ' '));
      assert.equal(calls, 0);
      // Exactly the byte ceiling reaches validation (and fails revision grammar).
      deny(unicode.padEnd(unicode.length + 4096 - unicodeBytes, ' '));
      assert.ok(calls > 0);
      calls = 0;
      const astral = JSON.stringify({
        ...fixture(),
        proposedRevision: '💡'.repeat(1000),
      });
      assert.ok(astral.length < 4096);
      deny(astral);
      assert.equal(calls, 0);
    } finally {
      JSON.parse = originalParse;
    }
  });

  it('returns independently copied successes and fixed redacted failures', () => {
    const text = JSON.stringify(fixture());
    const first = parseCurrencySelectionRequest(text);
    const second = parseCurrencySelectionRequest(text);
    assert.equal(first.success, true);
    assert.equal(second.success, true);
    if (!first.success || !second.success)
      return assert.fail('Expected syntax only');
    assert.notEqual(first, second);
    assert.notEqual(first.request, second.request);
    const invalid = parseCurrencySelectionRequest(
      text.replace('"initialize"', '"invalid"'),
    );
    assert.deepEqual(invalid, failure);
    assert.equal(JSON.stringify(invalid).includes(fixture().proofToken), false);
    assert.deepEqual(Object.keys(invalid).sort(), ['error', 'success']);
    assert.equal(parseCurrencySelectionRequest('{'), invalid);
  });
});
