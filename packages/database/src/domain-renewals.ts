import { createHash } from 'node:crypto';
import {
  domainExtension,
  domainRenewalTermsSchema,
  registrarDomainFactsSchema,
} from '@webhost-billing/shared';
import type { Prisma } from './index';

export type DomainFactsDb = Pick<
  Prisma.TransactionClient,
  'domain' | 'registrarAccount' | 'registrarCredential' | 'registrarOperation'
>;
export async function domainFactsSource(
  db: DomainFactsDb,
  id: string,
  customerId?: string,
) {
  const domain = await db.domain.findFirst({
    where: { id, ...(customerId ? { customerId } : {}) },
  });
  if (!domain) return null;
  const account = await db.registrarAccount.findUniqueOrThrow({
    where: { id: domain.executionAccountId ?? domain.accountId },
  });
  const credential = await db.registrarCredential.findFirst({
    where: { accountId: account.id },
    orderBy: { version: 'desc' },
    select: { id: true },
  });
  const operation = await db.registrarOperation.findUnique({
    where: { domainId: id },
  });
  // Shared with the API synchronization writer: expiry is compared separately.
  const hash = createHash('sha256')
    .update(
      JSON.stringify({
        domainId: id,
        customerId: domain.customerId,
        accountId: domain.accountId,
        executionAccountId: domain.executionAccountId,
        name: domain.domainName,
        providerOrderId: domain.providerOrderId,
        state: domain.state,
        origin: domain.origin,
        ownershipVerifiedAt: domain.ownershipVerifiedAt,
        linkCredentialId: domain.linkCredentialId,
        linkEvidence: domain.linkEvidenceCiphertext,
        quoteId: domain.quoteId,
        account: {
          id: account.id,
          mode: account.mode,
          enabled: account.enabled,
          configuration: account.configuration,
        },
        credentialId: credential?.id,
        operation: operation
          ? { ...operation, costCeiling: operation.costCeiling.toString() }
          : null,
      }),
    )
    .digest('hex');
  return { domain, account, operation, hash };
}

export async function domainRenewalContext(
  db: Prisma.TransactionClient,
  id: string,
  now: Date,
) {
  const source = await domainFactsSource(db, id);
  if (!source) return null;
  const preference = await db.domainRenewalPreference.findUnique({
    where: { domainId: id },
  });
  const catalogue = await db.domainCatalogueTld.findUnique({
    where: { tld: domainExtension(source.domain.domainName) },
  });
  const latest = await db.domainFactSync.findFirst({
    where: { domainId: id },
    orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
  });
  const parsed = registrarDomainFactsSchema.safeParse(latest?.facts);
  const terms = domainRenewalTermsSchema.safeParse(preference?.terms);
  const facts = parsed.success ? parsed.data : null;
  let factCode: string | null = null;
  if (
    source.domain.state !== 'REGISTERED' ||
    !source.domain.providerOrderId ||
    (source.domain.origin === 'EXISTING'
      ? !source.domain.ownershipVerifiedAt ||
        !source.domain.linkEvidenceCiphertext
      : !source.operation || !source.domain.quoteId)
  )
    factCode = 'OWNERSHIP_UNCONFIRMED';
  else if (!source.account.enabled) factCode = 'ACCOUNT_DISABLED';
  else if (!source.domain.expiresAt) factCode = 'EXPIRY_UNKNOWN';
  else if (source.domain.expiresAt <= now) factCode = 'EXPIRY_REQUIRES_REVIEW';
  else if (
    !latest ||
    latest.status !== 'SUCCEEDED' ||
    !latest.appliedAt ||
    latest.code ||
    latest.bindingHash !== source.hash ||
    !facts ||
    facts.accountId !== source.account.id ||
    facts.customerId !== source.domain.customerId ||
    facts.domainName !== source.domain.domainName ||
    facts.providerOrderId !== source.domain.providerOrderId ||
    facts.simulated !== (source.account.mode === 'FAKE') ||
    Date.parse(facts.expiresAt) !== source.domain.expiresAt.getTime()
  )
    factCode = 'FACTS_REQUIRE_REVIEW';
  else if (
    now.getTime() - Date.parse(facts.observedAt) > 3_600_000 ||
    Date.parse(facts.observedAt) - now.getTime() > 30_000
  )
    factCode = 'FACTS_STALE';
  else if (facts.status !== 'ACTIVE' || facts.renewalEligibility !== 'ELIGIBLE')
    factCode = 'ELIGIBILITY_UNCONFIRMED';
  else if (facts.registrarAutoRenew !== false)
    factCode = 'RENEWAL_RESPONSIBILITY_UNCONFIRMED';
  else if (
    !catalogue?.renewalAmount ||
    catalogue.renewalAmount > 999999999999999n
  )
    factCode = 'RENEWAL_PRICE_UNAVAILABLE';
  const pendingAction = await db.domainAction.count({
    where: {
      domainId: id,
      kind: 'RENEW',
      state: { notIn: ['SUCCEEDED', 'CANCELLED', 'FAILED'] },
    },
  });
  if (!factCode && pendingAction) factCode = 'MANUAL_RENEWAL_PENDING';
  let code = factCode;
  if (!code && !terms.success) code = 'TERMS_UNCONFIRMED';
  if (
    !code &&
    terms.success &&
    (terms.data.bindingHash !== source.hash ||
      terms.data.amount !== catalogue?.renewalAmount?.toString() ||
      terms.data.catalogueRevision !== catalogue?.revision)
  )
    code = 'TERMS_CHANGED';
  return {
    ...source,
    preference,
    catalogue,
    latest,
    facts,
    terms: terms.success ? terms.data : null,
    factCode,
    code,
  };
}
