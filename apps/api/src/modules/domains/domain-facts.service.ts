import { createHash } from 'node:crypto';
import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { ApiEnvironment } from '@webhost-billing/config';
import { Prisma, type PrismaClient } from '@webhost-billing/database';
import {
  FakeDomainRegistrar,
  type DomainRegistrar,
} from '@webhost-billing/database/registrar';
import {
  domainExtension,
  domainFactSyncSchema,
  registrarDomainFactsSchema,
  type RegistrarDomainFacts,
} from '@webhost-billing/shared';
import { API_ENVIRONMENT } from '../../infrastructure/environment/environment.module';
import { PRISMA_CLIENT } from '../../infrastructure/database/database.module';
import { ApplicationException } from '../../common/errors/application.exception';
import type { AuthRequestContext } from '../auth/auth.types';
import { DomainService } from './domain.service';

const responseAge = 5 * 60_000;
const cacheAge = 60 * 60_000;
const leaseAge = 90_000;
type Db = Pick<
  Prisma.TransactionClient,
  | 'domain'
  | 'registrarAccount'
  | 'registrarCredential'
  | 'registrarOperation'
  | 'domainFactSync'
  | 'domainCatalogueTld'
>;

@Injectable()
export class DomainFactsService {
  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient,
    @Inject(API_ENVIRONMENT) private readonly environment: ApiEnvironment,
    private readonly domains: DomainService,
  ) {}

  private admin(actor: AuthRequestContext) {
    if (
      actor.identity.role !== 'ADMIN' ||
      actor.identity.staffRole !== 'FULL_ADMINISTRATOR' ||
      !actor.identity.twoFactorEnabled ||
      actor.supportAdministratorId
    )
      throw this.error(
        'A full administrator with two-factor authentication is required.',
        HttpStatus.FORBIDDEN,
      );
  }
  private async source(db: Db, id: string, actor: AuthRequestContext) {
    if (actor.identity.role === 'ADMIN') this.admin(actor);
    const domain = await db.domain.findFirst({
      where: {
        id,
        ...(actor.identity.role === 'CUSTOMER'
          ? { customerId: actor.identity.customerId }
          : {}),
      },
    });
    if (!domain)
      throw this.error(
        'The domain record is unavailable.',
        HttpStatus.FORBIDDEN,
      );
    const account = await db.registrarAccount.findUniqueOrThrow({
      where: { id: domain.executionAccountId ?? domain.accountId },
    });
    const credential = await db.registrarCredential.findFirst({
      where: { accountId: account.id },
      orderBy: { version: 'desc' },
    });
    const operation = await db.registrarOperation.findUnique({
      where: { domainId: id },
    });
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

  async stored(id: string, actor: AuthRequestContext) {
    const source = await this.source(this.prisma, id, actor);
    const latest = await this.prisma.domainFactSync.findFirst({
      where: { domainId: id },
      orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
    });
    const success = await this.prisma.domainFactSync.findFirst({
      where: {
        domainId: id,
        bindingHash: source.hash,
        appliedAt: { not: null },
      },
      orderBy: [{ appliedAt: 'desc' }, { id: 'desc' }],
    });
    const facts = success?.facts
      ? registrarDomainFactsSchema.parse(success.facts)
      : null;
    const bound = latest?.bindingHash === source.hash;
    const candidate =
      bound && latest?.facts
        ? registrarDomainFactsSchema.parse(latest.facts)
        : null;
    const stale =
      !facts ||
      Date.now() - Date.parse(facts.observedAt) > cacheAge ||
      Date.parse(facts.expiresAt) !== source.domain.expiresAt?.getTime();
    return domainFactSyncSchema.parse({
      domainId: id,
      attemptId: latest?.id ?? null,
      outcome: latest
        ? bound
          ? latest.status
          : 'REVIEW_REQUIRED'
        : 'NOT_CHECKED',
      code: latest ? (bound ? latest.code : 'LOCAL_BINDING_CHANGED') : null,
      lastAttemptAt: latest?.startedAt.toISOString() ?? null,
      lastSuccessAt: success?.appliedAt?.toISOString() ?? null,
      observedAt: facts?.observedAt ?? null,
      expiresAt: facts?.expiresAt ?? null,
      providerStatus: facts?.status ?? null,
      renewalEligibility: facts?.renewalEligibility ?? 'UNKNOWN',
      registrarAutoRenew: facts?.registrarAutoRenew ?? null,
      simulated: source.account.mode === 'FAKE',
      freshness: facts ? (stale ? 'STALE' : 'FRESH') : 'NOT_CHECKED',
      reviewRequired:
        Boolean(
          latest && (!bound || latest.status !== 'SUCCEEDED' || latest.code),
        ) || Boolean(facts && stale),
      candidateExpiry:
        latest?.status === 'REVIEW_REQUIRED' &&
        latest.code === 'EXPIRY_CONFLICT' &&
        candidate
          ? candidate.expiresAt
          : null,
      canReview:
        actor.identity.role === 'ADMIN' &&
        bound &&
        latest?.status === 'REVIEW_REQUIRED' &&
        latest.code === 'EXPIRY_CONFLICT' &&
        Boolean(candidate && this.fresh(candidate)),
    });
  }

  async synchronize(
    id: string,
    input: { submissionKey: string; confirmation: string },
    actor: AuthRequestContext,
  ) {
    this.admin(actor);
    const source = await this.source(this.prisma, id, actor);
    if (input.confirmation !== source.domain.domainName)
      throw this.error('Confirm the exact domain name.');
    if (
      source.domain.state !== 'REGISTERED' ||
      !source.domain.providerOrderId ||
      (source.domain.origin === 'EXISTING'
        ? !source.domain.ownershipVerifiedAt ||
          !source.domain.linkEvidenceCiphertext
        : !source.operation || !source.domain.quoteId)
    )
      throw this.error(
        'Only an ownership-verified registered domain can be synchronized.',
      );
    const now = new Date(Date.now());
    const claimed = await this.prisma.$transaction(async (tx) => {
      await this.lock(tx, id);
      const current = await this.source(tx, id, actor);
      if (current.hash !== source.hash)
        throw this.error('The registrar binding changed. Refresh the record.');
      const replay = await tx.domainFactSync.findUnique({
        where: { id: input.submissionKey },
      });
      if (replay) {
        if (replay.domainId !== id)
          throw this.error('The submission key belongs to another domain.');
        return false;
      }
      await tx.domainFactSync.updateMany({
        where: {
          domainId: id,
          status: 'RUNNING',
          startedAt: { lte: new Date(now.getTime() - leaseAge) },
        },
        data: {
          status: 'UNAVAILABLE',
          code: 'READ_TIMED_OUT',
          finishedAt: now,
        },
      });
      const recent = await tx.domainFactSync.findFirst({
        where: { domainId: id },
        orderBy: { startedAt: 'desc' },
      });
      if (
        recent &&
        (recent.status === 'RUNNING' ||
          now.getTime() - recent.startedAt.getTime() < 10_000)
      )
        throw this.error(
          'Please wait before another synchronization.',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      await tx.domainFactSync.create({
        data: {
          id: input.submissionKey,
          domainId: id,
          customerId: source.domain.customerId,
          accountId: source.account.id,
          providerOrderId: source.domain.providerOrderId!,
          bindingHash: source.hash,
          previousExpiresAt: source.domain.expiresAt,
          startedAt: now,
        },
      });
      await this.audit(tx, id, actor, 'REQUESTED', input.submissionKey);
      return true;
    });
    if (!claimed) return this.stored(id, actor);
    let code: string | null = null;
    let facts: RegistrarDomainFacts | null = null;
    try {
      const tld = await this.prisma.domainCatalogueTld.findUnique({
        where: { tld: domainExtension(source.domain.domainName) },
      });
      const legacyOffer = await this.prisma.domainOffer.findFirst({
        where: {
          accountId: source.account.id,
          tld: domainExtension(source.domain.domainName),
        },
      });
      if (!tld && !legacyOffer) code = 'UNSUPPORTED_TLD';
      else if (!source.account.enabled) code = 'ACCOUNT_DISABLED';
      else if (
        source.account.mode === 'FAKE' &&
        this.environment.NODE_ENV === 'production'
      )
        code = 'SIMULATION_DISABLED';
      else if (
        source.account.mode !== 'FAKE' &&
        (!this.environment.REGISTRAR_DOMAIN_SYNC_LIVE_ENABLED ||
          !this.environment.RESELLBIZ_LIVE_ENABLED)
      )
        code = 'LIVE_READ_DISABLED';
      else {
        let provider: DomainRegistrar;
        if (source.account.mode === 'FAKE')
          provider = new FakeDomainRegistrar(this.prisma);
        else {
          const context = await this.domains.managementContext(id, actor);
          await this.domains.reserveManagementRead(context.account.id, actor);
          provider = context.provider;
        }
        if (
          provider.supportsDomainFacts?.(
            domainExtension(source.domain.domainName),
          ) === false
        )
          code = 'UNSUPPORTED_TLD';
        else if (!provider.readDomainFacts) code = 'UNSUPPORTED_PROVIDER';
        else {
          const observed = await this.bounded(
            provider.readDomainFacts({
              accountId: source.account.id,
              customerId: source.domain.customerId,
              domainName: source.domain.domainName,
              providerOrderId: source.domain.providerOrderId,
            }),
          );
          const parsed = registrarDomainFactsSchema.safeParse(observed);
          if (!parsed.success)
            code = observed === null ? 'DOMAIN_NOT_FOUND' : 'INVALID_RESPONSE';
          else if (
            parsed.data.accountId !== source.account.id ||
            parsed.data.customerId !== source.domain.customerId ||
            parsed.data.domainName !== source.domain.domainName ||
            parsed.data.providerOrderId !== source.domain.providerOrderId ||
            parsed.data.simulated !== (source.account.mode === 'FAKE')
          )
            code = 'OWNERSHIP_MISMATCH';
          else if (!this.fresh(parsed.data)) code = 'STALE_RESPONSE';
          else facts = parsed.data;
        }
      }
    } catch {
      code = 'PROVIDER_UNAVAILABLE';
    }
    await this.prisma.$transaction(async (tx) => {
      await this.lock(tx, id);
      const row = await tx.domainFactSync.findUniqueOrThrow({
        where: { id: input.submissionKey },
      });
      if (row.status !== 'RUNNING') return;
      const current = await this.source(tx, id, actor);
      if (
        current.hash !== source.hash ||
        current.domain.expiresAt?.toISOString() !==
          row.previousExpiresAt?.toISOString()
      ) {
        code = 'LOCAL_BINDING_CHANGED';
        facts = null;
      }
      if (facts && !this.fresh(facts)) {
        code = 'STALE_RESPONSE';
        facts = null;
      }
      if (
        facts &&
        (Date.parse(facts.expiresAt) <
          (row.previousExpiresAt?.getTime() ?? 0) ||
          (facts.status === 'ACTIVE' &&
            Date.parse(facts.expiresAt) <= Date.now()) ||
          (facts.status === 'EXPIRED' &&
            Date.parse(facts.expiresAt) > Date.now()))
      )
        code = 'EXPIRY_CONFLICT';
      else if (facts && ['UNKNOWN', 'PENDING'].includes(facts.status))
        code = 'STATUS_UNCONFIRMED';
      if (
        facts?.renewalEligibility === 'ELIGIBLE' &&
        (facts.status !== 'ACTIVE' || Date.parse(facts.expiresAt) <= Date.now())
      )
        facts = { ...facts, renewalEligibility: 'UNKNOWN' };
      const applied = Boolean(facts && !code);
      const status = applied
        ? 'SUCCEEDED'
        : [
              'EXPIRY_CONFLICT',
              'OWNERSHIP_MISMATCH',
              'LOCAL_BINDING_CHANGED',
              'STATUS_UNCONFIRMED',
            ].includes(code ?? '')
          ? 'REVIEW_REQUIRED'
          : 'UNAVAILABLE';
      const finishedAt = new Date(Date.now());
      await tx.domainFactSync.update({
        where: { id: row.id },
        data: {
          status,
          code:
            applied && facts?.renewalEligibility === 'UNKNOWN'
              ? 'RENEWAL_UNCONFIRMED'
              : code,
          ...(facts ? { facts } : {}),
          finishedAt,
          ...(applied ? { appliedAt: finishedAt } : {}),
        },
      });
      if (applied && facts)
        await tx.domain.update({
          where: { id },
          data: { expiresAt: new Date(facts.expiresAt) },
        });
      await this.audit(tx, id, actor, status, row.id, { code });
    });
    return this.stored(id, actor);
  }

  async review(
    id: string,
    attemptId: string,
    input: { confirmation: string; reason: string },
    actor: AuthRequestContext,
  ) {
    this.admin(actor);
    await this.prisma.$transaction(async (tx) => {
      await this.lock(tx, id);
      const source = await this.source(tx, id, actor);
      if (source.domain.domainName !== input.confirmation)
        throw this.error('Confirm the exact domain name.');
      const row = await tx.domainFactSync.findFirst({
        where: { id: attemptId, domainId: id },
      });
      if (!row) throw this.error('The synchronization attempt is unavailable.');
      if (row.status === 'SUCCEEDED' && row.appliedAt) return;
      const latest = await tx.domainFactSync.findFirst({
        where: { domainId: id },
        orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
      });
      const facts = registrarDomainFactsSchema.safeParse(row.facts);
      if (
        latest?.id !== row.id ||
        row.status !== 'REVIEW_REQUIRED' ||
        row.code !== 'EXPIRY_CONFLICT' ||
        row.bindingHash !== source.hash ||
        row.previousExpiresAt?.toISOString() !==
          source.domain.expiresAt?.toISOString() ||
        !facts.success ||
        !this.fresh(facts.data)
      )
        throw this.error(
          'Obtain fresh ownership-bound facts before reviewing this expiry.',
        );
      const at = new Date(Date.now());
      await tx.domain.update({
        where: { id },
        data: { expiresAt: new Date(facts.data.expiresAt) },
      });
      await tx.domainFactSync.update({
        where: { id: row.id },
        data: {
          status: 'SUCCEEDED',
          code:
            facts.data.renewalEligibility === 'UNKNOWN'
              ? 'RENEWAL_UNCONFIRMED'
              : null,
          appliedAt: at,
        },
      });
      await this.audit(tx, id, actor, 'EXPIRY_REVIEWED', row.id, {
        reason: input.reason,
        previousExpiry: row.previousExpiresAt?.toISOString() ?? null,
        acceptedExpiry: facts.data.expiresAt,
      });
    });
    return this.stored(id, actor);
  }
  private fresh(facts: RegistrarDomainFacts) {
    const age = Date.now() - Date.parse(facts.observedAt);
    return age >= -30_000 && age <= responseAge;
  }
  private async bounded<T>(work: Promise<T>): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        work,
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error('Read timed out.')),
            12_000,
          );
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
  private lock(tx: Prisma.TransactionClient, id: string) {
    return tx.$queryRaw`SELECT id FROM domains WHERE id=${id}::uuid FOR UPDATE`;
  }
  private audit(
    tx: Prisma.TransactionClient,
    domainId: string,
    actor: AuthRequestContext,
    event: string,
    attemptId: string,
    metadata: Prisma.InputJsonObject = {},
  ) {
    return tx.activityLog.create({
      data: {
        actorUserId: actor.identity.userId,
        action: `DOMAIN_FACT_SYNC_${event}`,
        entityType: 'DOMAIN',
        entityId: domainId,
        metadata: { attemptId, ...metadata },
      },
    });
  }
  private error(message: string, status: HttpStatus = HttpStatus.CONFLICT) {
    return new ApplicationException({
      status,
      code:
        status === HttpStatus.FORBIDDEN
          ? 'FORBIDDEN'
          : status === HttpStatus.TOO_MANY_REQUESTS
            ? 'RATE_LIMITED'
            : 'CONFLICT',
      message,
    });
  }
}
