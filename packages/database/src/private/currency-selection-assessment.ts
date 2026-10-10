import { createHash } from 'node:crypto';
import { encodeCurrencySelectionIntent } from './currency-selection-intent';
import { encodeCurrencyPolicyContext } from './currency-policy-context';

// Technical syntax ceilings only, not operational policy or authority.
const limits = Object.freeze({
  input: 65_536,
  context: 24_576,
  control: 512,
  auth: 1_024,
  evidence: 224,
  entries: 32,
});
type Definition = [string, string, number, string, 'current' | 'historical'];
type Reference = [string, string];
type Context = [
  [
    string,
    Reference,
    Reference,
    Reference | null,
    [string, string, boolean, boolean, boolean][],
  ],
  Definition[],
];
type Control = [
  string,
  string | null,
  string | null,
  boolean | null,
  string | null,
  string | null,
  number | null,
  string | null,
];
type Auth = [
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  'totp' | 'recovery',
  string | null,
];
type Evidence = [string, string, string, string];
export type CurrencySelectionAssessmentResult =
  | Readonly<{ success: true; canonicalText: string; assessmentDigest: string }>
  | Readonly<{
      success: false;
      error: 'Invalid currency selection assessment';
    }>;
const invalidAssessment = Object.freeze({
  success: false as const,
  error: 'Invalid currency selection assessment' as const,
});
const uuid =
  /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$(?![\s\S])/;
function isUuid(value: unknown): value is string {
  return typeof value === 'string' && value.length === 36 && uuid.test(value);
}
function isVersion(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length >= 1 &&
    value.length <= 64 &&
    /^[A-Za-z0-9][A-Za-z0-9._:-]*$(?![\s\S])/.test(value)
  );
}
function isCode(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Z]{3}$(?![\s\S])/.test(value);
}
function isPositiveCounter(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length <= 19 &&
    /^[1-9][0-9]*$(?![\s\S])/.test(value) &&
    BigInt(value) <= 9223372036854775807n
  );
}
function isTuple(value: unknown, arity: number): value is unknown[] {
  return Array.isArray(value) && value.length === arity;
}
function isList(value: unknown): value is unknown[] {
  return (
    Array.isArray(value) && value.length >= 1 && value.length <= limits.entries
  );
}
function withinBudget(
  value: unknown[],
  ceiling: number,
  encoder: TextEncoder,
): boolean {
  return encoder.encode(JSON.stringify(value)).byteLength <= ceiling;
}
function isUtc(value: unknown): value is string {
  // Supplied immutable creation time only: no clock read or synthesized timestamp.
  return (
    typeof value === 'string' &&
    value.length === 24 &&
    /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$(?![\s\S])/.test(
      value,
    ) &&
    new Date(value).toISOString() === value
  );
}
function copyControl(value: unknown, encoder: TextEncoder): Control | null {
  if (!isTuple(value, 8)) return null;
  let copy: Control;
  if (value[0] === 'absent') {
    if (value.slice(1).some((field) => field !== null)) return null;
    copy = ['absent', null, null, null, null, null, null, null];
  } else if (value[0] === 'unassessed') {
    if (
      value[1] !== '0' ||
      value.slice(2, 7).some((field) => field !== null) ||
      !isUtc(value[7])
    )
      return null;
    copy = ['unassessed', '0', null, null, null, null, null, value[7]];
  } else if (value[0] === 'selected') {
    const [, generation, revision, latch, code, version, exponent, createdAt] =
      value;
    if (
      !isPositiveCounter(generation) ||
      !isVersion(revision) ||
      typeof latch !== 'boolean' ||
      !isCode(code) ||
      !isVersion(version) ||
      typeof exponent !== 'number' ||
      !Number.isInteger(exponent) ||
      exponent < 0 ||
      exponent > 4 ||
      !isUtc(createdAt)
    )
      return null;
    copy = [
      'selected',
      generation,
      revision,
      latch,
      code,
      version,
      exponent,
      createdAt,
    ];
  } else return null;
  return withinBudget(copy, limits.control, encoder) ? copy : null;
}
function copyDefinition(value: unknown): Definition | null {
  if (!isTuple(value, 5)) return null;
  const [code, version, exponent, provenance, status] = value;
  if (
    !isCode(code) ||
    !isVersion(version) ||
    typeof exponent !== 'number' ||
    !Number.isInteger(exponent) ||
    exponent < 0 ||
    exponent > 4 ||
    typeof provenance !== 'string' ||
    provenance.length < 1 ||
    provenance.length > 256 ||
    !/^[\x21-\x7e](?:[\x20-\x7e]*[\x21-\x7e])?$(?![\s\S])/.test(provenance) ||
    (status !== 'current' && status !== 'historical')
  )
    return null;
  return [code, version, exponent, provenance, status];
}
function isReferenceShape(value: unknown): boolean {
  return (
    isTuple(value, 2) &&
    typeof value[0] === 'string' &&
    typeof value[1] === 'string'
  );
}
function copyContext(value: unknown, encoder: TextEncoder): Context | null {
  if (!isTuple(value, 2) || !isTuple(value[0], 5)) return null;
  const policy = value[0];
  const capabilities = policy[4];
  const units = value[1];
  // Both list bounds precede members. Reject all unprescribed depth/types before
  // serializing this bounded parse-owned component for the unchanged text codec.
  if (!isList(capabilities) || !isList(units)) return null;
  if (
    typeof policy[0] !== 'string' ||
    !isReferenceShape(policy[1]) ||
    !isReferenceShape(policy[2]) ||
    (policy[3] !== null && !isReferenceShape(policy[3]))
  )
    return null;
  for (const entry of capabilities) {
    if (
      !isTuple(entry, 5) ||
      typeof entry[0] !== 'string' ||
      typeof entry[1] !== 'string' ||
      typeof entry[2] !== 'boolean' ||
      typeof entry[3] !== 'boolean' ||
      typeof entry[4] !== 'boolean'
    )
      return null;
  }
  for (const unit of units) if (!copyDefinition(unit)) return null;
  const result = encodeCurrencyPolicyContext(JSON.stringify(value));
  if (
    !result.success ||
    encoder.encode(result.canonicalText).byteLength > limits.context
  )
    return null;
  // Successful canonical text contains fresh, dense prescribed arrays, never
  // the original input graph. Component facts are retained, not deduplicated.
  return JSON.parse(result.canonicalText) as Context;
}
function copyAuth(value: unknown, encoder: TextEncoder): Auth | null {
  if (!isTuple(value, 10)) return null;
  const [
    id,
    domain,
    actor,
    profile,
    session,
    epoch,
    credential,
    recoveryEpoch,
    kind,
    recovery,
  ] = value;
  if (
    !isUuid(id) ||
    !isUuid(domain) ||
    !isUuid(actor) ||
    !isUuid(profile) ||
    !isUuid(session) ||
    !isPositiveCounter(epoch) ||
    !isUuid(credential) ||
    !isPositiveCounter(recoveryEpoch)
  )
    return null;
  let factor: [Auth[8], Auth[9]];
  if (kind === 'totp' && recovery === null) factor = ['totp', null];
  else if (kind === 'recovery' && isUuid(recovery))
    factor = ['recovery', recovery];
  else return null;
  const copy: Auth = [
    id,
    domain,
    actor,
    profile,
    session,
    epoch,
    credential,
    recoveryEpoch,
    factor[0],
    factor[1],
  ];
  return withinBudget(copy, limits.auth, encoder) ? copy : null;
}
function asciiCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
function copyEvidence(
  value: unknown,
  action: unknown,
  encoder: TextEncoder,
): Evidence[] | null {
  if (!isList(value)) return null;
  const copies: Evidence[] = [];
  const identities = new Set<string>();
  const kinds = new Set<string>();
  for (const entry of value) {
    if (!isTuple(entry, 4)) return null;
    const [kind, id, version, digest] = entry;
    if (
      !(
        (kind === 'history' && version === 'currency-history-assessment-v1') ||
        (kind === 'compatibility' && version === 'currency-compatibility-v1') ||
        (kind === 'adoption' && version === 'currency-adoption-v1')
      ) ||
      !isUuid(id) ||
      typeof digest !== 'string' ||
      !/^[a-f0-9]{64}$(?![\s\S])/.test(digest)
    )
      return null;
    const key = `${kind}:${id}`;
    if (identities.has(key)) return null;
    const copy: Evidence = [kind, id, version, digest];
    if (!withinBudget(copy, limits.evidence, encoder)) return null;
    identities.add(key);
    kinds.add(kind);
    copies.push(copy);
  }
  if (
    !kinds.has('history') ||
    !kinds.has('compatibility') ||
    (action === 'adopt' && !kinds.has('adoption'))
  )
    return null;
  return copies.sort(
    (left, right) =>
      asciiCompare(left[0], right[0]) ||
      asciiCompare(left[2], right[2]) ||
      asciiCompare(left[1], right[1]),
  );
}
function baseDefinition(context: Context): Definition {
  const reference = context[0][1];
  // Exact-set Context validation established this membership.
  return context[1].find(
    (unit) => unit[0] === reference[0] && unit[1] === reference[1],
  )!;
}
function consistentDefinitions(
  proposed: Context,
  prior: Context | null,
  anchor: Definition | null,
): boolean {
  const byIdentity = new Map<string, Definition>();
  for (const unit of [
    ...proposed[1],
    ...(prior ? prior[1] : []),
    ...(anchor ? [anchor] : []),
  ]) {
    const key = `${unit[0]}:${unit[1]}`;
    const existing = byIdentity.get(key);
    if (existing && existing.some((field, index) => field !== unit[index]))
      return false;
    byIdentity.set(key, unit);
  }
  return true;
}

/** Pure syntax binding only. Restricted canonical material must never be logged
 * or exposed as approval; no stored origin/current auth/history is established. */
export function encodeCurrencySelectionAssessment(
  stableIntentText: unknown,
  assessmentText: unknown,
): CurrencySelectionAssessmentResult {
  // Check both primitive/code-unit bounds before allocation or any parse.
  if (
    typeof stableIntentText !== 'string' ||
    typeof assessmentText !== 'string' ||
    stableIntentText.length > limits.input ||
    assessmentText.length > limits.input
  )
    return invalidAssessment;
  try {
    const encoder = new TextEncoder();
    if (
      encoder.encode(stableIntentText).byteLength > limits.input ||
      encoder.encode(assessmentText).byteLength > limits.input
    )
      return invalidAssessment;
    const intent = encodeCurrencySelectionIntent(stableIntentText);
    if (!intent.success) return invalidAssessment;
    const stable = JSON.parse(intent.canonicalText) as unknown[];
    const input: unknown = JSON.parse(assessmentText);
    if (
      !isTuple(input, 8) ||
      input[0] !== 'currency-selection-assessment-v1' ||
      typeof input[1] !== 'string' ||
      !/^[a-f0-9]{64}$(?![\s\S])/.test(input[1]) ||
      input[1] !== intent.stableIntentDigest
    )
      return invalidAssessment;
    const control = copyControl(input[2], encoder);
    if (!control) return invalidAssessment;
    const selected = control[0] === 'selected';
    if (
      selected
        ? stable[2] !== 'replace' ||
          control[1] !== stable[7] ||
          control[2] !== stable[6]
        : (stable[2] !== 'initialize' && stable[2] !== 'adopt') ||
          stable[6] !== null ||
          stable[7] !== '0'
    )
      return invalidAssessment;
    if (!selected && (input[4] !== null || input[5] !== null))
      return invalidAssessment;
    const proposed = copyContext(input[3], encoder);
    const prior = selected ? copyContext(input[4], encoder) : null;
    const anchor = selected ? copyDefinition(input[5]) : null;
    if (
      !proposed ||
      proposed[0][0] !== stable[8] ||
      (selected && (!prior || !anchor))
    )
      return invalidAssessment;
    if (prior && anchor) {
      if (
        prior[0][0] !== control[2] ||
        anchor[0] !== control[4] ||
        anchor[1] !== control[5] ||
        anchor[2] !== control[6]
      )
        return invalidAssessment;
      const priorBase = baseDefinition(prior);
      if (control[3] === false) {
        if (priorBase.some((field, index) => field !== anchor[index]))
          return invalidAssessment;
      } else {
        const proposedBase = baseDefinition(proposed);
        if (
          priorBase[0] !== anchor[0] ||
          priorBase[2] !== anchor[2] ||
          proposedBase[0] !== anchor[0] ||
          proposedBase[2] !== anchor[2]
        )
          return invalidAssessment;
      }
    }
    if (!consistentDefinitions(proposed, prior, anchor))
      return invalidAssessment;
    const auth = copyAuth(input[6], encoder);
    const evidence = copyEvidence(input[7], stable[2], encoder);
    if (
      !auth ||
      !evidence ||
      auth[1] !== (stable[1] as unknown[])[1] ||
      auth[2] !== stable[3] ||
      auth[4] !== stable[4]
    )
      return invalidAssessment;
    const canonicalText = JSON.stringify([
      'currency-selection-assessment-v1',
      intent.stableIntentDigest,
      control,
      proposed,
      prior,
      anchor,
      auth,
      evidence,
    ]);
    const bytes = encoder.encode(canonicalText);
    if (bytes.byteLength > limits.input) return invalidAssessment;
    const assessmentDigest = createHash('sha256').update(bytes).digest('hex');
    return Object.freeze({
      success: true as const,
      canonicalText,
      assessmentDigest,
    });
  } catch {
    return invalidAssessment;
  }
}
