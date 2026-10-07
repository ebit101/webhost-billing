import { z } from 'zod';
import {
  currencyUnitContextSchema,
  currencyUnitDefinitionSchema,
  type CurrencyUnitDefinition,
} from './currency-arithmetic';

// Technical budgets only. There is no installed policy, registry or live default here.
export const CURRENCY_POLICY_LIMITS = Object.freeze({
  entries: 32,
  revisionLength: 64,
});

const revisionSchema = z
  .string()
  .max(CURRENCY_POLICY_LIMITS.revisionLength)
  .pipe(z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/));

export const currencyPolicyUnitReferenceSchema = currencyUnitDefinitionSchema
  .pick({ code: true, metadataVersion: true })
  .strict();
export type CurrencyPolicyUnitReference = z.infer<
  typeof currencyPolicyUnitReferenceSchema
>;

export const currencyCapabilitiesSchema = z
  .object({
    display: z.boolean(),
    newSales: z.boolean(),
    collection: z.boolean(),
  })
  .strict();
export type CurrencyCapabilities = z.infer<typeof currencyCapabilitiesSchema>;

export const currencyPolicyEntrySchema = z
  .object({
    unit: currencyPolicyUnitReferenceSchema,
    capabilities: currencyCapabilitiesSchema,
  })
  .strict();

const entriesSchema = z
  .custom<unknown[]>(
    (value) =>
      Array.isArray(value) &&
      value.length > 0 &&
      value.length <= CURRENCY_POLICY_LIMITS.entries,
    'Expected a bounded explicit capability list',
  )
  .pipe(z.array(currencyPolicyEntrySchema));

// Shape/identity checks only; unit/status validation also requires explicit context.
export const currencyPolicySchema = z
  .object({
    revision: revisionSchema,
    base: currencyPolicyUnitReferenceSchema,
    defaultBrowsing: currencyPolicyUnitReferenceSchema,
    preferredSecondary: currencyPolicyUnitReferenceSchema.optional(),
    currencies: entriesSchema,
  })
  .strict()
  .superRefine((policy, context) => {
    const codes = new Set<string>();
    policy.currencies.forEach((entry, index) => {
      if (codes.has(entry.unit.code)) {
        context.addIssue({
          code: 'custom',
          path: ['currencies', index, 'unit'],
          message: 'Duplicate or conflicting currency policy entry',
        });
      }
      codes.add(entry.unit.code);
    });
    if (policy.preferredSecondary?.code === policy.defaultBrowsing.code) {
      context.addIssue({
        code: 'custom',
        path: ['preferredSecondary'],
        message:
          'Secondary currency must differ from default browsing currency',
      });
    }
  });
export type CurrencyPolicy = z.infer<typeof currencyPolicySchema>;

function findUnit(
  definitions: CurrencyUnitDefinition[],
  reference: CurrencyPolicyUnitReference,
): CurrencyUnitDefinition | undefined {
  return definitions.find(
    (definition) =>
      definition.code === reference.code &&
      definition.metadataVersion === reference.metadataVersion,
  );
}

export const currencyPolicyContextSchema = z
  .object({
    policy: currencyPolicySchema,
    definitions: currencyUnitContextSchema,
  })
  .strict()
  .superRefine(({ policy, definitions }, context) => {
    policy.currencies.forEach((entry, index) => {
      const definition = findUnit(definitions, entry.unit);
      if (!definition) {
        context.addIssue({
          code: 'custom',
          path: ['policy', 'currencies', index, 'unit'],
          message: 'Policy unit is not in the explicit context',
        });
      } else if (
        definition.status === 'historical' &&
        (entry.capabilities.display || entry.capabilities.newSales)
      ) {
        context.addIssue({
          code: 'custom',
          path: ['policy', 'currencies', index, 'capabilities'],
          message: 'Historical units cannot enable new browsing or sales',
        });
      }
    });

    for (const field of [
      'base',
      'defaultBrowsing',
      'preferredSecondary',
    ] as const) {
      const reference = policy[field];
      if (!reference) continue;
      const entry = policy.currencies.find(
        (candidate) =>
          candidate.unit.code === reference.code &&
          candidate.unit.metadataVersion === reference.metadataVersion,
      );
      const definition = findUnit(definitions, reference);
      if (!entry || !definition) {
        context.addIssue({
          code: 'custom',
          path: ['policy', field],
          message:
            'Selected unit must match an explicit policy entry and definition',
        });
      } else if (
        field !== 'base' &&
        (!entry.capabilities.display || definition.status !== 'current')
      ) {
        context.addIssue({
          code: 'custom',
          path: ['policy', field],
          message: 'Browsing choice requires a current display-enabled unit',
        });
      }
    }
  });
export type CurrencyPolicyContext = z.infer<typeof currencyPolicyContextSchema>;

// These are policy flags, NOT proof of a payment route, quote, permission or settlement.
export function readCurrencyPolicyCapabilities(
  value: unknown,
  code: unknown,
): CurrencyCapabilities {
  const parsedCode = currencyPolicyUnitReferenceSchema.shape.code.parse(code);
  const { policy } = currencyPolicyContextSchema.parse(value);
  return (
    policy.currencies.find((entry) => entry.unit.code === parsedCode)
      ?.capabilities ?? { display: false, newSales: false, collection: false }
  );
}

// A disabled/omitted policy entry must never hide or reinterpret historical money.
export function resolveHistoricalCurrencyUnit(
  reference: unknown,
  explicitDefinitions: unknown,
): CurrencyUnitDefinition {
  const unit = currencyPolicyUnitReferenceSchema.parse(reference);
  const definitions = currencyUnitContextSchema.parse(explicitDefinitions);
  const definition = findUnit(definitions, unit);
  if (!definition) {
    throw new RangeError('Historical unit is not in the explicit context');
  }
  return definition;
}

// Shape only. The transition helper validates both policies against the same context.
export const currencyPolicyTransitionInputSchema = z
  .object({
    current: currencyPolicySchema,
    proposed: currencyPolicySchema,
    definitions: currencyUnitContextSchema,
    expectedRevision: revisionSchema,
    financialHistoryExists: z.boolean(),
  })
  .strict();

// Caller facts must come from a future authoritative server transaction, not a browser.
// This performs no storage, concurrency, authorization, confirmation or history query.
export function validateCurrencyPolicyTransition(
  value: unknown,
): CurrencyPolicyContext {
  const input = currencyPolicyTransitionInputSchema.parse(value);
  const current = currencyPolicyContextSchema.parse({
    policy: input.current,
    definitions: input.definitions,
  });
  const proposed = currencyPolicyContextSchema.parse({
    policy: input.proposed,
    definitions: input.definitions,
  });
  if (input.expectedRevision !== current.policy.revision) {
    throw new RangeError('Currency policy revision is stale');
  }
  if (proposed.policy.revision === current.policy.revision) {
    throw new RangeError(
      'Replacement revision must differ from current revision',
    );
  }
  if (
    input.financialHistoryExists &&
    proposed.policy.base.code !== current.policy.base.code
  ) {
    throw new RangeError(
      'Base currency is locked after financial history exists',
    );
  }
  return proposed;
}
