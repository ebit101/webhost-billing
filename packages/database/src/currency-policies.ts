import {
  currencyPolicySchema,
  currencyPolicyContextSchema,
  type CurrencyPolicy,
  type CurrencyPolicyContext,
} from '@webhost-billing/shared/currency-policy';
import {
  readExactCurrencyUnits,
  type CurrencyUnitStoreClient,
} from './currency-units';
import type { Prisma } from './generated/prisma/client';

// No runtime client import, connection, default policy or selection authority.
export type CurrencyPolicyStoreClient = CurrencyUnitStoreClient &
  Pick<Prisma.TransactionClient, 'currencyPolicyRevision'>;

function parseRevision(value: unknown): string {
  const revision = currencyPolicySchema.shape.revision.parse(value);
  if (/[^A-Za-z0-9._:-]/.test(revision))
    throw new Error('Invalid currency policy revision');
  return revision;
}

function canonicalPolicy(value: unknown): CurrencyPolicy {
  const policy = currencyPolicySchema.parse(value);
  parseRevision(policy.revision);
  for (const reference of [
    policy.base,
    policy.defaultBrowsing,
    ...(policy.preferredSecondary ? [policy.preferredSecondary] : []),
    ...policy.currencies.map((entry) => entry.unit),
  ]) {
    if (
      /[^A-Z]/.test(reference.code) ||
      /[^A-Za-z0-9._:-]/.test(reference.metadataVersion)
    )
      throw new Error('Invalid currency policy unit reference');
  }
  // Entry order is not a browsing preference. Explicit selected fields are.
  // Schema parsing copied the input; sort only our copy, independent of locale.
  policy.currencies.sort((a, b) =>
    a.unit.code < b.unit.code ? -1 : a.unit.code > b.unit.code ? 1 : 0,
  );
  return {
    revision: policy.revision,
    base: policy.base,
    defaultBrowsing: policy.defaultBrowsing,
    ...(policy.preferredSecondary
      ? { preferredSecondary: policy.preferredSecondary }
      : {}),
    currencies: policy.currencies,
  };
}

async function context(
  client: CurrencyUnitStoreClient,
  value: unknown,
): Promise<CurrencyPolicyContext> {
  const policy = canonicalPolicy(value);
  const definitions = await readExactCurrencyUnits(
    client,
    policy.currencies.map((entry) => entry.unit),
  );
  return currencyPolicyContextSchema.parse({ policy, definitions });
}

// Compare facts, not caller property order or optional undefined properties.
function facts(policy: CurrencyPolicy): string {
  const reference = (r: CurrencyPolicy['base']) => [r.code, r.metadataVersion];
  return JSON.stringify([
    policy.revision,
    reference(policy.base),
    reference(policy.defaultBrowsing),
    policy.preferredSecondary ? reference(policy.preferredSecondary) : null,
    policy.currencies.map((e) => [
      reference(e.unit),
      e.capabilities.display,
      e.capabilities.newSales,
      e.capabilities.collection,
    ]),
  ]);
}

/** Complete immutable evidence only. Read Committed duplicate-safe INSERT then
 * SELECT sees the winning snapshot. Stronger isolation requires caller-owned
 * whole-transaction retry. Propagate conflicts out of compound writes to roll back.
 * Never swallow an aborted SQL statement, overwrite a revision or select a policy.
 */
export async function appendCurrencyPolicyRevision(
  client: CurrencyPolicyStoreClient,
  value: unknown,
): Promise<CurrencyPolicyContext> {
  const input = await context(client, value);
  await client.currencyPolicyRevision.createMany({
    data: [{ revision: input.policy.revision, policy: input.policy }],
    skipDuplicates: true,
  });
  const row = await client.currencyPolicyRevision.findUnique({
    where: { revision: input.policy.revision },
    select: { revision: true, policy: true },
  });
  if (!row)
    throw new Error(
      'Currency policy append must be retried as a whole transaction',
    );
  const result = await context(client, row.policy);
  if (
    row.revision !== result.policy.revision ||
    facts(input.policy) !== facts(result.policy)
  )
    throw new Error('Conflicting immutable currency policy facts');
  return result;
}

export async function readExactCurrencyPolicyRevision(
  client: CurrencyPolicyStoreClient,
  value: unknown,
): Promise<CurrencyPolicyContext> {
  const revision = parseRevision(value);
  const row = await client.currencyPolicyRevision.findUnique({
    where: { revision },
    select: { revision: true, policy: true },
  });
  if (!row) throw new Error('Exact currency policy revision is unavailable');
  const result = await context(client, row.policy);
  if (row.revision !== revision || result.policy.revision !== revision)
    throw new Error('Invalid stored currency policy revision');
  return result;
}
