// Private syntax component only: no registry, stored-origin or authority claim.
export const CURRENCY_POLICY_CONTEXT_LIMITS = Object.freeze({
  inputBytes: 65_536,
  canonicalBytes: 24_576,
  entries: 32,
});

export type CurrencyPolicyContextResult =
  | Readonly<{ success: true; canonicalText: string }>
  | Readonly<{ success: false; error: 'Invalid currency policy context' }>;

type Reference = [string, string];
type Capability = [string, string, boolean, boolean, boolean];
type Definition = [string, string, number, string, 'current' | 'historical'];

const invalidContext = Object.freeze({
  success: false as const,
  error: 'Invalid currency policy context' as const,
});

function isTuple(value: unknown, arity: number): value is unknown[] {
  return Array.isArray(value) && value.length === arity;
}

function isList(value: unknown): value is unknown[] {
  return (
    Array.isArray(value) &&
    value.length >= 1 &&
    value.length <= CURRENCY_POLICY_CONTEXT_LIMITS.entries
  );
}

function isCode(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Z]{3}$(?![\s\S])/.test(value);
}

function isVersion(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length >= 1 &&
    value.length <= 64 &&
    /^[A-Za-z0-9][A-Za-z0-9._:-]*$(?![\s\S])/.test(value)
  );
}

function isProvenance(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length >= 1 &&
    value.length <= 256 &&
    /^[\x21-\x7e](?:[\x20-\x7e]*[\x21-\x7e])?$(?![\s\S])/.test(value)
  );
}

function copyReference(value: unknown): Reference | null {
  if (!isTuple(value, 2)) return null;
  if (!isCode(value[0]) || !isVersion(value[1])) return null;
  return [value[0], value[1]];
}

function asciiCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/** Canonical facts are restricted material: never log/expose them as approval. */
export function encodeCurrencyPolicyContext(
  text: unknown,
): CurrencyPolicyContextResult {
  // No caller object traversal/coercion; bound allocation before actual UTF-8
  // measurement, and bound bytes before parsing primitive text.
  if (
    typeof text !== 'string' ||
    text.length > CURRENCY_POLICY_CONTEXT_LIMITS.inputBytes
  )
    return invalidContext;
  try {
    const encoder = new TextEncoder();
    if (
      encoder.encode(text).byteLength >
      CURRENCY_POLICY_CONTEXT_LIMITS.inputBytes
    )
      return invalidContext;
    const input: unknown = JSON.parse(text);
    if (!isTuple(input, 2)) return invalidContext;
    const policy = input[0];
    const units = input[1];
    if (!isTuple(policy, 5)) return invalidContext;
    const entries = policy[4];
    // Both independent budgets precede indexed member traversal/copy/sort.
    if (!isList(entries) || !isList(units)) return invalidContext;
    if (!isVersion(policy[0])) return invalidContext;
    const base = copyReference(policy[1]);
    const browsing = copyReference(policy[2]);
    const secondary = policy[3] === null ? null : copyReference(policy[3]);
    if (!base || !browsing || (policy[3] !== null && !secondary))
      return invalidContext;
    if (secondary && secondary[0] === browsing[0]) return invalidContext;

    const capabilities: Capability[] = [];
    const byCode = new Map<string, Capability>();
    for (const entry of entries) {
      if (!isTuple(entry, 5)) return invalidContext;
      const [code, version, display, newSales, collection] = entry;
      if (
        !isCode(code) ||
        !isVersion(version) ||
        typeof display !== 'boolean' ||
        typeof newSales !== 'boolean' ||
        typeof collection !== 'boolean' ||
        byCode.has(code)
      )
        return invalidContext;
      const copy: Capability = [code, version, display, newSales, collection];
      byCode.set(code, copy);
      capabilities.push(copy);
    }
    const definitions: Definition[] = [];
    const byUnit = new Map<string, Definition>();
    for (const unit of units) {
      if (!isTuple(unit, 5)) return invalidContext;
      const [code, version, exponent, provenance, status] = unit;
      if (
        !isCode(code) ||
        !isVersion(version) ||
        typeof exponent !== 'number' ||
        !Number.isInteger(exponent) ||
        exponent < 0 ||
        exponent > 4 ||
        !isProvenance(provenance) ||
        (status !== 'current' && status !== 'historical')
      )
        return invalidContext;
      const key = `${code}:${version}`;
      if (byUnit.has(key)) return invalidContext;
      const copy: Definition = [code, version, exponent, provenance, status];
      byUnit.set(key, copy);
      definitions.push(copy);
    }
    // Unique lists and exact coverage: no extra/alternate definitions, even
    // with the same exponent. Independent flags are not provider capabilities.
    if (definitions.length !== capabilities.length) return invalidContext;
    for (const entry of capabilities) {
      const unit = byUnit.get(`${entry[0]}:${entry[1]}`);
      if (!unit || (unit[4] === 'historical' && (entry[2] || entry[3])))
        return invalidContext;
    }
    for (const reference of [base, browsing, secondary]) {
      if (reference === null) continue;
      const entry = byCode.get(reference[0]);
      const unit = byUnit.get(`${reference[0]}:${reference[1]}`);
      if (!entry || entry[1] !== reference[1] || !unit) return invalidContext;
      if (reference !== base && (!entry[2] || unit[4] !== 'current'))
        return invalidContext;
    }
    capabilities.sort((left, right) => asciiCompare(left[0], right[0]));
    definitions.sort(
      (left, right) =>
        asciiCompare(left[0], right[0]) || asciiCompare(left[1], right[1]),
    );
    const canonicalText = JSON.stringify([
      [policy[0], base, browsing, secondary, capabilities],
      definitions,
    ]);
    if (
      encoder.encode(canonicalText).byteLength >
      CURRENCY_POLICY_CONTEXT_LIMITS.canonicalBytes
    )
      return invalidContext;
    return Object.freeze({ success: true as const, canonicalText });
  } catch {
    return invalidContext;
  }
}
