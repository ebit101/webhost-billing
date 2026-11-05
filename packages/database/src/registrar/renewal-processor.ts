import { randomUUID } from 'node:crypto';
import {
  domainRenewalReferenceSchema,
  registrarDomainFactsSchema,
  domainRenewalTermsSchema,
  existingDomainLinkEvidenceSchema,
  resellbizCredentialSchema,
  registrarConnectionIdentitySchema,
  resellbizConfigurationSchema,
  type BackgroundJobData,
  type RegistrarDomainFacts,
} from '@webhost-billing/shared';
import type { Prisma, PrismaClient, DomainRenewalOperation } from '../index';
import { domainFactsSource, domainRenewalContext } from '../domain-renewals';
import { lockDomainInvoice, verifiedDomainInvoice } from './processor';
import {
  FakeDomainRegistrar,
  type DomainRegistrar,
  type RegistrarRenewalIntent,
} from './provider';
import { RegistrarCipher, credentialBinding } from './cipher';
import { ResellbizLiveRegistrar } from './resellbiz-live';

export async function paidDomainRenewal(
  tx: Prisma.TransactionClient,
  renewalId: string,
): Promise<boolean> {
  const renewal = await tx.domainRenewalInvoice.findUnique({
    where: { id: renewalId },
  });
  if (
    !renewal ||
    !(await verifiedDomainInvoice(tx, renewal.invoiceId, renewal.customerId))
  )
    return false;
  const invoice = await tx.invoice.findUniqueOrThrow({
    where: { id: renewal.invoiceId },
    include: { items: true, payments: true },
  });
  const snapshot = renewal.termsSnapshot;
  const parsed = domainRenewalTermsSchema.safeParse(
    snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot)
      ? Object.fromEntries(
          [
            'schemaVersion',
            'years',
            'currency',
            'amount',
            'catalogueRevision',
            'bindingHash',
          ].map((key) => [key, snapshot[key]]),
        )
      : null,
  );
  return (
    parsed.success &&
    invoice.total === BigInt(parsed.data.amount) &&
    invoice.items.length === 1 &&
    invoice.items[0]?.serviceId === null &&
    invoice.items[0]?.lineTotal === invoice.total &&
    invoice.items[0]?.servicePeriodStart?.getTime() ===
      renewal.termStart.getTime() &&
    invoice.items[0]?.servicePeriodEnd?.getTime() ===
      renewal.termEnd.getTime() &&
    !invoice.payments.some((p) => p.kind !== 'CHARGE' && p.status !== 'FAILED')
  );
}

type Options = {
  simulationAllowed: boolean;
  liveAllowed: boolean;
  liveReadAllowed: boolean;
};
export class DomainRenewalProcessor {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly secret: string,
    private readonly options: Options,
    private readonly provider?: DomainRegistrar,
  ) {}
  async process(data: BackgroundJobData): Promise<void> {
    const event = await this.prisma.outboxEvent.findUnique({
      where: { id: data.outboxEventId },
    });
    if (
      !event ||
      event.status !== 'PUBLISHED' ||
      event.aggregateType !== 'DOMAIN_RENEWAL_OPERATION' ||
      event.aggregateId !== data.aggregateId ||
      event.eventType !== data.eventType ||
      !['DOMAIN_RENEWAL_REQUESTED', 'DOMAIN_RENEWAL_RECONCILE'].includes(
        event.eventType,
      )
    )
      throw new Error('Renewal job reference is invalid.');
    const locator = await this.prisma.domainRenewalOperation.findUnique({
      where: { id: data.aggregateId },
    });
    if (!locator) throw new Error('Renewal operation is unavailable.');
    const reference = domainRenewalReferenceSchema.parse(locator.reference);
    const token = randomUUID();
    const now = new Date(Date.now());
    const claimed = await this.prisma.$transaction(async (tx) => {
      await this.lock(tx, locator);
      const op = await tx.domainRenewalOperation.findUniqueOrThrow({
        where: { id: locator.id },
      });
      if (['SUCCEEDED', 'REJECTED'].includes(op.status)) return null;
      if (op.leaseUntil && op.leaseUntil > now) return null;
      if (op.readCount >= 10) {
        await tx.domainRenewalOperation.update({
          where: { id: op.id },
          data: {
            status: 'NEEDS_RECONCILIATION',
            code: 'READ_BUDGET_EXHAUSTED',
          },
        });
        return null;
      }
      const dispatch =
        op.status === 'QUEUED' &&
        event.eventType === 'DOMAIN_RENEWAL_REQUESTED';
      if (op.status === 'QUEUED' && !dispatch) return null;
      await tx.domainRenewalOperation.update({
        where: { id: op.id },
        data: {
          status: dispatch ? 'RUNNING' : 'NEEDS_RECONCILIATION',
          leaseToken: token,
          leaseUntil: new Date(now.getTime() + 120_000),
          readCount: { increment: 1 },
        },
      });
      await this.audit(tx, op, dispatch ? 'CLAIMED' : 'READ_RESERVED');
      return { op, dispatch };
    });
    if (!claimed) return;
    let provider: DomainRegistrar;
    let simulated = false;
    try {
      const source = await domainFactsSource(this.prisma, locator.domainId);
      if (!source || !this.identity(source, reference))
        throw new Error('Identity unavailable.');
      if (
        !source.account.enabled ||
        (source.account.mode === 'FAKE'
          ? !this.options.simulationAllowed
          : !this.options.liveReadAllowed)
      )
        throw new Error('Registrar reads disabled.');
      simulated = source.account.mode === 'FAKE';
      provider = this.provider ?? (await this.loadProvider(locator, source));
      if (!provider.readDomainFacts)
        throw new Error('Observation unsupported.');
    } catch {
      await this.finish(locator, token, 'PROVIDER_UNAVAILABLE');
      return;
    }
    if (claimed.dispatch) {
      const ready = await this.prisma.$transaction((tx) =>
        this.ready(tx, locator),
      );
      if (ready) {
        await this.finish(locator, token, ready);
        return;
      }
      try {
        const facts = await this.read(provider, reference, simulated);
        if (
          !facts ||
          facts.status !== 'ACTIVE' ||
          facts.expiresAt !== reference.previousExpiry ||
          facts.renewalEligibility !== 'ELIGIBLE' ||
          facts.registrarAutoRenew !== false
        ) {
          await this.finish(locator, token, 'PREFLIGHT_REQUIRES_REVIEW');
          return;
        }
        if (!provider.renewalQuote || !provider.renewDomain) {
          await this.finish(locator, token, 'UNSUPPORTED_PROVIDER');
          return;
        }
        const quote = await this.bounded(provider.renewalQuote(reference));
        if (
          quote.rejectionCode ||
          quote.balance !== 'SUFFICIENT' ||
          quote.costCurrency !== 'USD' ||
          quote.costAmount <= 0n ||
          quote.costAmount > locator.costCeiling
        ) {
          await this.finish(
            locator,
            token,
            quote.rejectionCode ??
              (quote.balance === 'INSUFFICIENT'
                ? 'INSUFFICIENT_PROVIDER_BALANCE'
                : quote.balance === 'UNKNOWN'
                  ? 'BALANCE_UNCONFIRMED'
                  : 'COST_LIMIT_EXCEEDED'),
          );
          return;
        }
        const intent: RegistrarRenewalIntent = {
          ...reference,
          operationId: locator.id,
          costCeiling: locator.costCeiling,
          costCurrency: 'USD',
        };
        await this.bounded(
          provider.renewDomain(intent, async () => {
            await this.prisma.$transaction(async (tx) => {
              await this.lock(tx, locator);
              const current = await tx.domainRenewalOperation.findUniqueOrThrow(
                { where: { id: locator.id } },
              );
              if (
                current.status !== 'RUNNING' ||
                current.leaseToken !== token ||
                current.submittedAt ||
                !current.leaseUntil ||
                current.leaseUntil <= new Date(Date.now()) ||
                (await this.ready(tx, locator))
              )
                throw new Error('The dispatch claim is no longer eligible.');
              await tx.domainRenewalOperation.update({
                where: { id: locator.id },
                data: { submittedAt: new Date(Date.now()) },
              });
              await this.audit(tx, locator, 'SUBMITTED');
            });
          }),
        );
      } catch {
        // A submitted request is never repeated, including a lost provider reply.
      }
    }
    let facts: RegistrarDomainFacts | null = null;
    try {
      facts = await this.read(provider, reference, simulated);
    } catch {
      /* Keep only a safe outcome code. */
    }
    const current = await this.prisma.domainRenewalOperation.findUniqueOrThrow({
      where: { id: locator.id },
    });
    if (
      !current.submittedAt ||
      !facts ||
      facts.status !== 'ACTIVE' ||
      facts.expiresAt !== reference.targetExpiry
    ) {
      await this.finish(
        locator,
        token,
        current.submittedAt ? 'RENEWAL_OUTCOME_UNCONFIRMED' : 'NOT_SUBMITTED',
      );
      return;
    }
    await this.prisma.$transaction(async (tx) => {
      await this.lock(tx, locator);
      const op = await tx.domainRenewalOperation.findUniqueOrThrow({
        where: { id: locator.id },
      });
      if (
        op.leaseToken !== token ||
        ['SUCCEEDED', 'REJECTED'].includes(op.status) ||
        !op.submittedAt
      )
        return;
      const source = await domainFactsSource(tx, locator.domainId);
      if (!source || !this.identity(source, reference)) return;
      const financialReviewRequired = !(await paidDomainRenewal(
        tx,
        locator.renewalInvoiceId,
      ));
      const at = new Date(Date.now());
      await tx.domain.update({
        where: { id: locator.domainId },
        data: { expiresAt: new Date(facts!.expiresAt) },
      });
      await tx.domainFactSync.create({
        data: {
          id: randomUUID(),
          domainId: source.domain.id,
          customerId: source.domain.customerId,
          accountId: source.account.id,
          providerOrderId: reference.providerOrderId,
          bindingHash: source.hash,
          previousExpiresAt: source.domain.expiresAt,
          status: 'SUCCEEDED',
          code:
            facts!.renewalEligibility === 'UNKNOWN'
              ? 'RENEWAL_UNCONFIRMED'
              : null,
          facts: facts!,
          startedAt: at,
          finishedAt: at,
          appliedAt: at,
        },
      });
      await tx.domainRenewalOperation.update({
        where: { id: op.id },
        data: {
          status: 'SUCCEEDED',
          code: financialReviewRequired ? 'FINANCIAL_REVIEW_REQUIRED' : null,
          financialReviewRequired,
          completedAt: at,
          expiryAfter: new Date(facts!.expiresAt),
          leaseUntil: at,
        },
      });
      await tx.domainRenewalPreference.updateMany({
        where: { domainId: op.domainId },
        data: {
          reviewCode: financialReviewRequired
            ? 'FINANCIAL_REVIEW_REQUIRED'
            : null,
        },
      });
      await this.audit(tx, op, 'CONFIRMED', {
        expiryAfter: facts!.expiresAt,
        financialReviewRequired,
      });
    });
  }
  private async ready(
    tx: Prisma.TransactionClient,
    op: DomainRenewalOperation,
  ): Promise<string | null> {
    const ctx = await domainRenewalContext(
      tx,
      op.domainId,
      new Date(Date.now()),
    );
    const ref = domainRenewalReferenceSchema.parse(op.reference);
    if (
      !ctx ||
      !this.identity(ctx, ref) ||
      ctx.hash !== op.bindingHash ||
      ctx.domain.expiresAt?.toISOString() !== ref.previousExpiry
    )
      return 'BINDING_CHANGED';
    if (!ctx.preference?.enabled || ctx.factCode)
      return 'PREFLIGHT_REQUIRES_REVIEW';
    if (
      ctx.account.mode === 'FAKE'
        ? !this.options.simulationAllowed
        : !this.options.liveAllowed
    )
      return 'DISPATCH_DISABLED';
    const actor = await tx.user.findUnique({
      where: { id: op.approvedByUserId },
      include: { adminProfile: true, adminTotpCredential: true },
    });
    const customer = await tx.customer.findUniqueOrThrow({
      where: { id: op.customerId },
      include: { user: true },
    });
    if (
      !actor ||
      actor.role !== 'ADMIN' ||
      actor.status !== 'ACTIVE' ||
      actor.deletedAt ||
      actor.adminProfile?.staffRole !== 'FULL_ADMINISTRATOR' ||
      !actor.adminTotpCredential?.enabledAt ||
      customer.status !== 'ACTIVE' ||
      customer.deletedAt ||
      customer.user.status !== 'ACTIVE' ||
      customer.user.deletedAt ||
      !customer.user.emailVerifiedAt
    )
      return 'ACTOR_REQUIRES_REVIEW';
    if (!(await paidDomainRenewal(tx, op.renewalInvoiceId)))
      return 'PAYMENT_REQUIRES_REVIEW';
    if (
      (await tx.domainRenewalOperation.count({
        where: {
          accountId: op.accountId,
          id: { not: op.id },
          submittedAt: { not: null },
          status: { in: ['RUNNING', 'NEEDS_RECONCILIATION'] },
        },
      })) ||
      (await tx.domainAction.count({
        where: {
          accountId: op.accountId,
          claimedAt: { not: null },
          state: { notIn: ['SUCCEEDED', 'REJECTED', 'FAILED', 'CANCELLED'] },
        },
      }))
    )
      return 'ACCOUNT_RECONCILIATION_REQUIRED';
    return null;
  }
  private identity(
    source: NonNullable<Awaited<ReturnType<typeof domainFactsSource>>>,
    ref: ReturnType<typeof domainRenewalReferenceSchema.parse>,
  ) {
    return (
      source.domain.state === 'REGISTERED' &&
      source.account.id === ref.accountId &&
      source.domain.customerId === ref.customerId &&
      source.domain.domainName === ref.domainName &&
      source.domain.providerOrderId === ref.providerOrderId
    );
  }
  private async read(
    provider: DomainRegistrar,
    ref: ReturnType<typeof domainRenewalReferenceSchema.parse>,
    simulated: boolean,
  ) {
    const parsed = registrarDomainFactsSchema.safeParse(
      await this.bounded(provider.readDomainFacts!(ref)),
    );
    if (!parsed.success) return null;
    const facts = parsed.data;
    const age = Date.now() - Date.parse(facts.observedAt);
    if (
      facts.simulated !== simulated ||
      facts.accountId !== ref.accountId ||
      facts.customerId !== ref.customerId ||
      facts.domainName !== ref.domainName ||
      facts.providerOrderId !== ref.providerOrderId ||
      age < -30_000 ||
      age > 300_000
    )
      return null;
    return facts;
  }
  private async finish(
    op: DomainRenewalOperation,
    token: string,
    code: string,
  ) {
    await this.prisma.$transaction(async (tx) => {
      await this.lock(tx, op);
      const current = await tx.domainRenewalOperation.findUniqueOrThrow({
        where: { id: op.id },
      });
      if (
        current.leaseToken !== token ||
        ['SUCCEEDED', 'REJECTED'].includes(current.status)
      )
        return;
      const status = current.submittedAt ? 'NEEDS_RECONCILIATION' : 'REJECTED';
      await tx.domainRenewalOperation.update({
        where: { id: op.id },
        data: {
          status,
          code,
          leaseUntil: new Date(Date.now() + 30_000),
          ...(status === 'REJECTED'
            ? { completedAt: new Date(Date.now()) }
            : {}),
        },
      });
      await this.audit(tx, op, status, { code });
    });
  }
  private async lock(tx: Prisma.TransactionClient, op: DomainRenewalOperation) {
    const billing = await tx.domainRenewalInvoice.findUniqueOrThrow({
      where: { id: op.renewalInvoiceId },
    });
    await lockDomainInvoice(tx, billing.invoiceId);
    await tx.$queryRaw`SELECT id FROM domains WHERE id=${op.domainId}::uuid FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM domain_renewal_operations WHERE id=${op.id}::uuid FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM registrar_accounts WHERE id=${op.accountId}::uuid FOR UPDATE`;
  }
  private audit(
    tx: Prisma.TransactionClient,
    op: DomainRenewalOperation,
    suffix: string,
    extra: Prisma.InputJsonObject = {},
  ) {
    return tx.activityLog.create({
      data: {
        actorUserId: op.approvedByUserId,
        action: `DOMAIN_RENEWAL_${suffix}`,
        entityType: 'DOMAIN',
        entityId: op.domainId,
        metadata: {
          operationId: op.id,
          renewalInvoiceId: op.renewalInvoiceId,
          ...extra,
        },
      },
    });
  }
  private async bounded<T>(work: Promise<T>): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        work,
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error('Registrar deadline exceeded.')),
            12_000,
          );
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
  private async loadProvider(
    op: DomainRenewalOperation,
    source: NonNullable<Awaited<ReturnType<typeof domainFactsSource>>>,
  ): Promise<DomainRegistrar> {
    if (source.account.mode === 'FAKE')
      return new FakeDomainRegistrar(this.prisma);
    const credential = await this.prisma.registrarCredential.findUniqueOrThrow({
      where: { id: op.credentialId },
    });
    if (credential.accountId !== source.account.id)
      throw new Error('Credential identity changed.');
    const cipher = new RegistrarCipher(this.secret);
    const payload = resellbizCredentialSchema.parse(
      cipher.decrypt(
        credentialBinding(source.account.id, credential.version, 'LIVE'),
        credential.ciphertext,
      ),
    );
    const modern = registrarConnectionIdentitySchema.safeParse(
      source.account.configuration,
    );
    const config = modern.success
      ? modern.data
      : resellbizConfigurationSchema.parse(source.account.configuration);
    const profile = await this.prisma.registrarProfile.findUnique({
      where: { accountId: source.account.id },
    });
    if (
      payload.resellerId !== config.resellerId ||
      (modern.success && !profile?.nativeCostConfirmed)
    )
      throw new Error('Registrar native costs are unconfirmed.');
    let remoteCustomerId: string;
    let remoteContactId: string;
    if (source.domain.origin === 'EXISTING') {
      const proof = existingDomainLinkEvidenceSchema.parse(
        cipher.decrypt(
          `resellbiz:existing-link:${source.domain.id}`,
          source.domain.linkEvidenceCiphertext!,
        ),
      );
      remoteCustomerId = proof.remoteCustomerId;
      remoteContactId = proof.remoteContactId;
    } else {
      const quote = await this.prisma.domainQuote.findUniqueOrThrow({
        where: { id: source.domain.quoteId! },
      });
      const mapping = await this.prisma.registrarMapping.findUniqueOrThrow({
        where: {
          accountId_customerId_fingerprint: {
            accountId: source.account.id,
            customerId: source.domain.customerId,
            fingerprint:
              source.operation?.selectionFingerprint ?? quote.fingerprint,
          },
        },
      });
      remoteCustomerId = mapping.remoteCustomerId;
      remoteContactId = mapping.remoteContactId;
    }
    return new ResellbizLiveRegistrar(payload, undefined, {
      accountId: source.account.id,
      localCustomerId: source.domain.customerId,
      remoteCustomerId,
      remoteContactId,
    });
  }
}
