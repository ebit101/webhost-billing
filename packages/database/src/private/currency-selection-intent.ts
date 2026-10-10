import { createHash } from 'node:crypto';

// Private technical budgets, not policy defaults or authority. No package entry
// exports this module and no ordinary runtime consumer calls it.
export const CURRENCY_SELECTION_INTENT_LIMITS = Object.freeze({
  inputBytes: 65_536,
  canonicalBytes: 1_024,
  generationDigits: 19,
  generationMaximum: '9223372036854775807',
});

export type CurrencySelectionIntentResult =
  | Readonly<{
      success: true;
      canonicalText: string;
      stableIntentDigest: string;
    }>
  | Readonly<{ success: false; error: 'Invalid currency selection intent' }>;

const invalidIntent = Object.freeze({
  success: false as const,
  error: 'Invalid currency selection intent' as const,
});

// Match Command 108's installed UUID grammar, including its exact nil/max
// alternatives. Only request keys admit the mixed-case ordinary spelling.
const requestUuid =
  /^(?:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$(?![\s\S])/;
const serverUuid =
  /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$(?![\s\S])/;

function isUuid(value: unknown, grammar: RegExp): value is string {
  return (
    typeof value === 'string' && value.length === 36 && grammar.test(value)
  );
}

function isRevision(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length >= 1 &&
    value.length <= 64 &&
    /^[A-Za-z0-9][A-Za-z0-9._:-]*$(?![\s\S])/.test(value)
  );
}

function isGeneration(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length <= CURRENCY_SELECTION_INTENT_LIMITS.generationDigits &&
    /^(?:0|[1-9][0-9]*)$(?![\s\S])/.test(value) &&
    BigInt(value) <= BigInt(CURRENCY_SELECTION_INTENT_LIMITS.generationMaximum)
  );
}

function isTuple(value: unknown, arity: number): value is unknown[] {
  return Array.isArray(value) && value.length === arity;
}

/**
 * Encode syntax only, never actor/domain ownership, pin, approval or selection.
 * Canonical text includes restricted identities: do not log or expose it.
 */
export function encodeCurrencySelectionIntent(
  text: unknown,
): CurrencySelectionIntentResult {
  // Reject object graphs before any traversal/coercion. Bound encoder allocation
  // by UTF-16 length, then bound actual UTF-8 bytes before parsing primitive JSON.
  if (
    typeof text !== 'string' ||
    text.length > CURRENCY_SELECTION_INTENT_LIMITS.inputBytes
  ) {
    return invalidIntent;
  }
  const encoder = new TextEncoder();
  if (
    encoder.encode(text).byteLength >
    CURRENCY_SELECTION_INTENT_LIMITS.inputBytes
  )
    return invalidIntent;
  try {
    const input: unknown = JSON.parse(text);
    if (!isTuple(input, 9) || input[0] !== 'currency-selection-request-v1')
      return invalidIntent;
    const identity = input[1];
    if (!isTuple(identity, 2)) return invalidIntent;
    const [installationId, executionDomainId] = identity;
    const [
      ,
      ,
      action,
      actorUserId,
      sessionId,
      requestKeyText,
      expectedRevision,
      expectedGeneration,
      proposedRevision,
    ] = input;
    if (
      !isUuid(installationId, serverUuid) ||
      !isUuid(executionDomainId, serverUuid) ||
      !isUuid(actorUserId, serverUuid) ||
      !isUuid(sessionId, serverUuid) ||
      !isUuid(requestKeyText, requestUuid) ||
      !isRevision(proposedRevision) ||
      !isGeneration(expectedGeneration)
    )
      return invalidIntent;
    if (action === 'initialize' || action === 'adopt') {
      if (expectedRevision !== null || expectedGeneration !== '0')
        return invalidIntent;
    } else if (action === 'replace') {
      if (
        !isRevision(expectedRevision) ||
        expectedGeneration === '0' ||
        expectedRevision === proposedRevision
      )
        return invalidIntent;
    } else return invalidIntent;

    // All positions are validated primitives; construct a fresh dense tuple,
    // never stringify a caller graph or the raw parsed array.
    const canonicalText = JSON.stringify([
      'currency-selection-request-v1',
      [installationId, executionDomainId],
      action,
      actorUserId,
      sessionId,
      requestKeyText,
      expectedRevision,
      expectedGeneration,
      proposedRevision,
    ]);
    const bytes = encoder.encode(canonicalText);
    if (bytes.byteLength > CURRENCY_SELECTION_INTENT_LIMITS.canonicalBytes)
      return invalidIntent;
    const stableIntentDigest = createHash('sha256').update(bytes).digest('hex');
    return Object.freeze({
      success: true as const,
      canonicalText,
      stableIntentDigest,
    });
  } catch {
    // No syntax/validation detail, raw input, identity or partial hash escapes.
    return invalidIntent;
  }
}
