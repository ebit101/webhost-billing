import {
  CURRENCY_ARITHMETIC_LIMITS,
  currencyUnitDefinitionSchema,
  type CurrencyUnitDefinition,
} from '@webhost-billing/shared/currency-arithmetic';
import type { Prisma } from './generated/prisma/client';

// Caller supplies a client or transaction. This module opens no connections.
export type CurrencyUnitStoreClient = Pick<
  Prisma.TransactionClient,
  'currencyUnitDefinition'
>;

const referenceSchema = currencyUnitDefinitionSchema.pick({
  code: true,
  metadataVersion: true,
});
const select = {
  code: true,
  metadataVersion: true,
  minorUnitExponent: true,
  provenance: true,
  status: true,
} as const;

function parseReference(value: unknown) {
  const reference = referenceSchema.parse(value);
  // Full-string ASCII check also excludes a final newline accepted by JS `$`.
  if (/[^A-Za-z0-9._:-]/.test(reference.metadataVersion)) {
    throw new Error('Invalid currency unit reference');
  }
  return reference;
}

function parseDefinition(value: unknown): CurrencyUnitDefinition {
  const definition = currencyUnitDefinitionSchema.parse(value);
  parseReference({
    code: definition.code,
    metadataVersion: definition.metadataVersion,
  });
  if (/[^\x20-\x7e]/.test(definition.provenance)) {
    throw new Error('Invalid currency unit provenance');
  }
  return definition;
}

/** At Read Committed, duplicate-safe INSERT then a new SELECT snapshot sees the
 * winner. Never catch a unique violation inside an aborted PostgreSQL transaction.
 * At stronger isolation the caller must retry the whole transaction on failure.
 * Propagate a conflicting-facts error to roll back any caller-owned compound write.
 */
export async function appendCurrencyUnit(
  client: CurrencyUnitStoreClient,
  value: unknown,
): Promise<CurrencyUnitDefinition> {
  const definition = parseDefinition(value);
  await client.currencyUnitDefinition.createMany({
    data: [definition],
    skipDuplicates: true,
  });
  const stored = await client.currencyUnitDefinition.findUnique({
    where: {
      code_metadataVersion: {
        code: definition.code,
        metadataVersion: definition.metadataVersion,
      },
    },
    select,
  });
  if (!stored)
    throw new Error(
      'Currency unit append must be retried as a whole transaction',
    );
  const result = parseDefinition(stored);
  if (
    result.minorUnitExponent !== definition.minorUnitExponent ||
    result.provenance !== definition.provenance ||
    result.status !== definition.status
  )
    throw new Error('Conflicting immutable currency unit facts');
  return result;
}

export async function readExactCurrencyUnits(
  client: CurrencyUnitStoreClient,
  value: unknown,
): Promise<CurrencyUnitDefinition[]> {
  if (
    !Array.isArray(value) ||
    value.length < 1 ||
    value.length > CURRENCY_ARITHMETIC_LIMITS.definitions
  ) {
    throw new Error('Expected 1–32 exact currency unit references');
  }
  const references = Array.from({ length: value.length }, (_, index) =>
    parseReference(value[index]),
  );
  const identities = new Set(
    references.map((r) => `${r.code}:${r.metadataVersion}`),
  );
  if (identities.size !== references.length)
    throw new Error('Duplicate currency unit reference');
  const rows = await client.currencyUnitDefinition.findMany({
    where: { OR: references },
    select,
  });
  const definitions = rows.map(parseDefinition);
  const byIdentity = new Map(
    definitions.map((d) => [`${d.code}:${d.metadataVersion}`, d]),
  );
  if (
    definitions.length !== references.length ||
    byIdentity.size !== references.length
  ) {
    throw new Error('Exact currency unit context is unavailable');
  }
  return references.map((reference) => {
    const definition = byIdentity.get(
      `${reference.code}:${reference.metadataVersion}`,
    );
    if (!definition)
      throw new Error('Exact currency unit context is unavailable');
    return definition;
  });
}
