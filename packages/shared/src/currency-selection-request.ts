import { z } from 'zod';
import { currencyPolicySchema } from './currency-policy';

// Technical syntax budgets only. No actor, proof, policy or history is authorized here.
export const CURRENCY_SELECTION_REQUEST_LIMITS = Object.freeze({
  jsonBytes: 4096,
  generationDigits: 19,
  generationMaximum: '9223372036854775807',
  proofTokenLength: 43,
});

const revisionSchema = currencyPolicySchema.shape.revision.pipe(
  // Preserve the existing ASCII grammar, but require the entire input to match.
  z.string().refine((value) => !/[^A-Za-z0-9._:-]/.test(value)),
);
const generationSchema = z
  .string()
  .max(CURRENCY_SELECTION_REQUEST_LIMITS.generationDigits)
  .pipe(z.string().regex(/^(?:0|[1-9][0-9]*)$(?![\s\S])/))
  .pipe(
    z
      .string()
      .refine(
        (value) =>
          BigInt(value) <=
          BigInt(CURRENCY_SELECTION_REQUEST_LIMITS.generationMaximum),
      ),
  );
const commonFields = {
  proposedRevision: revisionSchema,
  requestKey: z.string().length(36).pipe(z.uuid()),
  proofToken: z
    .string()
    .length(CURRENCY_SELECTION_REQUEST_LIMITS.proofTokenLength)
    .regex(/^[A-Za-z0-9_-]{43}$/),
};
const requestSchema = z
  .discriminatedUnion('action', [
    z
      .object({
        ...commonFields,
        action: z.literal('initialize'),
        expectedRevision: z.null(),
        expectedGeneration: z.literal('0'),
      })
      .strict(),
    z
      .object({
        ...commonFields,
        action: z.literal('adopt'),
        expectedRevision: z.null(),
        expectedGeneration: z.literal('0'),
      })
      .strict(),
    z
      .object({
        ...commonFields,
        action: z.literal('replace'),
        expectedRevision: revisionSchema,
        expectedGeneration: generationSchema.refine((value) => value !== '0'),
      })
      .strict(),
  ])
  .refine(
    (request) =>
      request.action !== 'replace' ||
      request.proposedRevision !== request.expectedRevision,
  );

export type CurrencySelectionRequest = Readonly<z.infer<typeof requestSchema>>;
export type CurrencySelectionRequestResult =
  | Readonly<{ success: true; request: CurrencySelectionRequest }>
  | Readonly<{ success: false; error: 'Invalid currency selection request' }>;

const invalidRequest = Object.freeze({
  success: false as const,
  error: 'Invalid currency selection request' as const,
});

// JSON.parse has already established valid JSON and the schema has established a
// flat six-field object. Walk quoted tokens to reject keys JSON.parse would overwrite,
// including differently escaped spellings. This is not a replacement JSON parser.
function hasDistinctKeys(text: string): boolean {
  const keys = new Set<string>();
  let cursor = 0;
  while (cursor < text.length) {
    if (text[cursor] !== '"') {
      cursor += 1;
      continue;
    }
    const start = cursor;
    cursor += 1;
    while (cursor < text.length && text[cursor] !== '"') {
      cursor += text[cursor] === '\\' ? 2 : 1;
    }
    if (cursor >= text.length) return false;
    cursor += 1;
    const end = cursor;
    while (cursor < text.length && /[\t\n\r ]/.test(text[cursor] ?? '')) {
      cursor += 1;
    }
    if (text[cursor] !== ':') continue;
    const key: unknown = JSON.parse(text.slice(start, end));
    if (typeof key !== 'string' || keys.has(key)) return false;
    keys.add(key);
  }
  return keys.size === 6;
}

/**
 * Decode syntax only, from bounded JSON text. Success does not establish proof
 * validity, authorization, history, eligibility, selection or replay. The returned
 * request contains an opaque bearer-shaped value and must never be logged.
 */
export function parseCurrencySelectionRequest(
  text: unknown,
): CurrencySelectionRequestResult {
  // UTF-8 uses at least as many bytes as UTF-16 code units. Check this first so a
  // huge primitive string cannot cause an unbounded encoder allocation.
  if (
    typeof text !== 'string' ||
    text.length > CURRENCY_SELECTION_REQUEST_LIMITS.jsonBytes
  ) {
    return invalidRequest;
  }
  if (
    new TextEncoder().encode(text).byteLength >
    CURRENCY_SELECTION_REQUEST_LIMITS.jsonBytes
  ) {
    return invalidRequest;
  }
  try {
    const input: unknown = JSON.parse(text);
    const parsed = requestSchema.safeParse(input);
    if (!parsed.success || !hasDistinctKeys(text)) return invalidRequest;
    return Object.freeze({
      success: true as const,
      request: Object.freeze({ ...parsed.data }),
    });
  } catch {
    // Neither JSON syntax errors nor validation details may expose input/bearers.
    return invalidRequest;
  }
}
