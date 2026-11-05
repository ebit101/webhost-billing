import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { ApiEnvironment } from '@webhost-billing/config';
import type { PrismaClient } from '@webhost-billing/database';
import {
  lockDomainInvoice,
  paidDomainRenewal,
} from '@webhost-billing/database/registrar';
import { domainRenewalContext } from '@webhost-billing/database/domain-renewals';
import {
  domainRenewalExecutionRequestSchema,
  domainRenewalReconcileRequestSchema,
  type DomainRenewalView,
} from '@webhost-billing/shared';
import type { z } from 'zod';
import { API_ENVIRONMENT } from '../../infrastructure/environment/environment.module';
import { PRISMA_CLIENT } from '../../infrastructure/database/database.module';
import { ApplicationException } from '../../common/errors/application.exception';
import type { AuthRequestContext } from '../auth/auth.types';

@Injectable()
export class DomainRenewalExecutionService {
  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient,
    @Inject(API_ENVIRONMENT) private readonly env: ApiEnvironment,
  ) {}
  private admin(actor: AuthRequestContext) {
    if (
      actor.supportAdministratorId ||
      actor.identity.role !== 'ADMIN' ||
      actor.identity.staffRole !== 'FULL_ADMINISTRATOR' ||
      !actor.identity.twoFactorEnabled
    )
      throw this.error(
        'A full administrator with two-factor authentication is required.',
        HttpStatus.FORBIDDEN,
      );
  }
  async info(
    id: string,
    actor: AuthRequestContext,
  ): Promise<
    Pick<
      DomainRenewalView,
      'execution' | 'canApprove' | 'canReconcile' | 'externalDispatchEnabled'
    >
  > {
    const result = {
      execution: null as DomainRenewalView['execution'],
      canApprove: false,
      canReconcile: false,
      externalDispatchEnabled: false,
    };
    return this.prisma.$transaction(async (tx) => {
      const domain = await tx.domain.findFirst({
        where: {
          id,
          ...(actor.identity.role === 'CUSTOMER'
            ? { customerId: actor.identity.customerId }
            : {}),
        },
      });
      if (!domain) return result;
      const account = await tx.registrarAccount.findUniqueOrThrow({
        where: { id: domain.executionAccountId ?? domain.accountId },
      });
      result.externalDispatchEnabled =
        account.mode === 'LIVE' &&
        this.env.RESELLBIZ_LIVE_ENABLED &&
        this.env.REGISTRAR_RENEWAL_DISPATCH_ENABLED;
      const billing = await tx.domainRenewalInvoice.findFirst({
        where: { domainId: id },
        orderBy: { createdAt: 'desc' },
      });
      if (!billing) return result;
      const op = await tx.domainRenewalOperation.findFirst({
        where: { renewalInvoiceId: billing.id },
        orderBy: { attempt: 'desc' },
      });
      if (op)
        result.execution = {
          id: op.id,
          attempt: op.attempt,
          status: op.status as NonNullable<
            DomainRenewalView['execution']
          >['status'],
          code: op.code,
          submittedAt: op.submittedAt?.toISOString() ?? null,
          completedAt: op.completedAt?.toISOString() ?? null,
          expiryAfter: op.expiryAfter?.toISOString() ?? null,
          financialReviewRequired: op.financialReviewRequired,
        };
      if (
        actor.identity.role !== 'ADMIN' ||
        actor.identity.staffRole !== 'FULL_ADMINISTRATOR' ||
        !actor.identity.twoFactorEnabled ||
        actor.supportAdministratorId
      )
        return result;
      const allowed =
        account.enabled &&
        (account.mode === 'FAKE'
          ? this.env.NODE_ENV !== 'production'
          : result.externalDispatchEnabled);
      const ctx = await domainRenewalContext(tx, id, new Date(Date.now()));
      result.canApprove = Boolean(
        allowed &&
        ctx &&
        !ctx.factCode &&
        ctx.preference?.enabled &&
        domain.expiresAt?.getTime() === billing.termStart.getTime() &&
        (!op || op.status === 'REJECTED') &&
        (await paidDomainRenewal(tx, billing.id)),
      );
      result.canReconcile = Boolean(
        account.enabled &&
        (account.mode === 'FAKE'
          ? this.env.NODE_ENV !== 'production'
          : this.env.RESELLBIZ_LIVE_ENABLED) &&
        op &&
        ['RUNNING', 'NEEDS_RECONCILIATION'].includes(op.status) &&
        (!op.leaseUntil || op.leaseUntil.getTime() <= Date.now()) &&
        op.readCount < 10,
      );
      return result;
    });
  }
  async approve(
    id: string,
    raw: z.infer<typeof domainRenewalExecutionRequestSchema>,
    actor: AuthRequestContext,
  ) {
    this.admin(actor);
    const input = domainRenewalExecutionRequestSchema.parse(raw);
    const billing = await this.prisma.domainRenewalInvoice.findFirst({
      where: { domainId: id, invoiceId: input.invoiceId },
    });
    if (!billing) throw this.error('The owned renewal invoice is unavailable.');
    await this.prisma.$transaction(async (tx) => {
      await lockDomainInvoice(tx, billing.invoiceId);
      await tx.$queryRaw`SELECT id FROM domains WHERE id=${id}::uuid FOR UPDATE`;
      const ctx = await domainRenewalContext(tx, id, new Date(Date.now()));
      if (!ctx || input.confirmation !== ctx.domain.domainName)
        throw this.error('Confirm the exact domain name.');
      const replay = await tx.domainRenewalOperation.findUnique({
        where: { id: input.submissionKey },
      });
      if (replay) {
        if (
          replay.renewalInvoiceId !== billing.id ||
          replay.costCeiling !== BigInt(input.costCeiling) ||
          replay.approvedByUserId !== actor.identity.userId
        )
          throw this.error('The submission key belongs to another approval.');
        return;
      }
      if (
        !ctx.account.enabled ||
        (ctx.account.mode === 'FAKE'
          ? this.env.NODE_ENV === 'production'
          : !this.env.RESELLBIZ_LIVE_ENABLED ||
            !this.env.REGISTRAR_RENEWAL_DISPATCH_ENABLED)
      )
        throw this.error(
          'Registrar renewal dispatch is disabled for this account.',
        );
      if (
        !ctx.preference?.enabled ||
        ctx.factCode ||
        ctx.domain.expiresAt?.getTime() !== billing.termStart.getTime()
      )
        throw this.error(
          'Fresh eligible facts, unchanged expiry and application-managed renewal responsibility are required.',
        );
      if (!(await paidDomainRenewal(tx, billing.id)))
        throw this.error(
          'A fully verified, unadjusted renewal payment is required.',
        );
      const latest = await tx.domainRenewalOperation.findFirst({
        where: { renewalInvoiceId: billing.id },
        orderBy: { attempt: 'desc' },
      });
      const active = await tx.domainRenewalOperation.count({
        where: {
          domainId: id,
          status: { in: ['QUEUED', 'RUNNING', 'NEEDS_RECONCILIATION'] },
        },
      });
      if (active || (latest && latest.status !== 'REJECTED'))
        throw this.error(
          'Reconcile the existing renewal before another approval.',
        );
      const credential = await tx.registrarCredential.findFirstOrThrow({
        where: { accountId: ctx.account.id },
        orderBy: { version: 'desc' },
        select: { id: true },
      });
      const attempt = (latest?.attempt ?? 0) + 1;
      await tx.domainRenewalOperation.create({
        data: {
          id: input.submissionKey,
          renewalInvoiceId: billing.id,
          domainId: id,
          accountId: ctx.account.id,
          customerId: ctx.domain.customerId,
          credentialId: credential.id,
          approvedByUserId: actor.identity.userId,
          bindingHash: ctx.hash,
          reference: {
            accountId: ctx.account.id,
            customerId: ctx.domain.customerId,
            domainName: ctx.domain.domainName,
            providerOrderId: ctx.domain.providerOrderId!,
            previousExpiry: billing.termStart.toISOString(),
            targetExpiry: billing.termEnd.toISOString(),
            years: 1,
          },
          costCeiling: BigInt(input.costCeiling),
          costCurrency: input.costCurrency,
          attempt,
        },
      });
      await tx.outboxEvent.create({
        data: {
          aggregateType: 'DOMAIN_RENEWAL_OPERATION',
          aggregateId: input.submissionKey,
          eventType: 'DOMAIN_RENEWAL_REQUESTED',
          idempotencyKey: `domain-renewal:${input.submissionKey}`,
          payload: { schemaVersion: 1, operationId: input.submissionKey },
        },
      });
      await tx.activityLog.create({
        data: {
          actorUserId: actor.identity.userId,
          action: 'DOMAIN_RENEWAL_APPROVED',
          entityType: 'DOMAIN',
          entityId: id,
          metadata: {
            operationId: input.submissionKey,
            invoiceId: billing.invoiceId,
            attempt,
            costCeiling: input.costCeiling,
            costCurrency: input.costCurrency,
            reason: input.reason,
          },
        },
      });
    });
  }
  async reconcile(
    id: string,
    operationId: string,
    raw: z.infer<typeof domainRenewalReconcileRequestSchema>,
    actor: AuthRequestContext,
  ) {
    this.admin(actor);
    const input = domainRenewalReconcileRequestSchema.parse(raw);
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM domains WHERE id=${id}::uuid FOR UPDATE`;
      const op = await tx.domainRenewalOperation.findFirst({
        where: { id: operationId, domainId: id },
      });
      const domain = await tx.domain.findUnique({ where: { id } });
      if (!op || !domain || input.confirmation !== domain.domainName)
        throw this.error('Confirm the owned operation and exact domain name.');
      const account = await tx.registrarAccount.findUniqueOrThrow({
        where: { id: op.accountId },
      });
      if (
        !account.enabled ||
        (account.mode === 'FAKE'
          ? this.env.NODE_ENV === 'production'
          : !this.env.RESELLBIZ_LIVE_ENABLED)
      )
        throw this.error('Registrar reads are disabled.');
      const key = `domain-renewal-read:${op.id}:${input.submissionKey}`;
      if (await tx.outboxEvent.findUnique({ where: { idempotencyKey: key } }))
        return;
      if (
        !['RUNNING', 'NEEDS_RECONCILIATION'].includes(op.status) ||
        op.readCount >= 10 ||
        (op.leaseUntil && op.leaseUntil.getTime() > Date.now())
      )
        throw this.error(
          'Wait for the current read lease, or review an exhausted read budget.',
        );
      await tx.outboxEvent.create({
        data: {
          aggregateType: 'DOMAIN_RENEWAL_OPERATION',
          aggregateId: op.id,
          eventType: 'DOMAIN_RENEWAL_RECONCILE',
          idempotencyKey: key,
          payload: { schemaVersion: 1, operationId: op.id },
        },
      });
      await tx.activityLog.create({
        data: {
          actorUserId: actor.identity.userId,
          action: 'DOMAIN_RENEWAL_RECONCILIATION_REQUESTED',
          entityType: 'DOMAIN',
          entityId: id,
          metadata: { operationId: op.id, reason: input.reason },
        },
      });
    });
  }
  private error(message: string, status: HttpStatus = HttpStatus.CONFLICT) {
    return new ApplicationException({
      status,
      code: status === HttpStatus.FORBIDDEN ? 'FORBIDDEN' : 'CONFLICT',
      message,
    });
  }
}
