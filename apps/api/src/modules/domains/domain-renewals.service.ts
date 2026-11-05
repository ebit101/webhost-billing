import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { type PrismaClient } from '@webhost-billing/database';
import { domainRenewalContext } from '@webhost-billing/database/domain-renewals';
import {
  domainRenewalConfigureRequestSchema,
  domainRenewalPreferenceRequestSchema,
  domainRenewalViewSchema,
} from '@webhost-billing/shared';
import { PRISMA_CLIENT } from '../../infrastructure/database/database.module';
import { ApplicationException } from '../../common/errors/application.exception';
import type { AuthRequestContext } from '../auth/auth.types';
import type { z } from 'zod';

@Injectable()
export class DomainRenewalsService {
  constructor(@Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient) {}
  private admin(actor: AuthRequestContext) {
    return (
      actor.identity.role === 'ADMIN' &&
      actor.identity.staffRole === 'FULL_ADMINISTRATOR' &&
      actor.identity.twoFactorEnabled &&
      !actor.supportAdministratorId
    );
  }
  private async owned(id: string, actor: AuthRequestContext) {
    if (actor.identity.role === 'ADMIN' && !this.admin(actor))
      throw this.error(
        'A full administrator with two-factor authentication is required.',
        403,
      );
    const domain = await this.prisma.domain.findFirst({
      where: {
        id,
        ...(actor.identity.role === 'CUSTOMER'
          ? { customerId: actor.identity.customerId }
          : {}),
      },
    });
    if (!domain) throw this.error('The domain is unavailable.', 403);
    return domain;
  }
  async view(id: string, actor: AuthRequestContext) {
    await this.owned(id, actor);
    const context = await this.prisma.$transaction((tx) =>
      domainRenewalContext(tx, id, new Date(Date.now())),
    );
    if (!context) throw this.error('The domain is unavailable.', 403);
    const record = await this.prisma.domainRenewalInvoice.findFirst({
      where: { domainId: id },
      orderBy: { createdAt: 'desc' },
    });
    const invoice = record
      ? await this.prisma.invoice.findUniqueOrThrow({
          where: { id: record.invoiceId },
        })
      : null;
    const { terms } = context;
    return domainRenewalViewSchema.parse({
      domainId: id,
      enabled: context.preference?.enabled ?? false,
      revision: context.preference?.revision ?? 0,
      terms: terms
        ? {
            schemaVersion: 1,
            years: terms.years,
            currency: terms.currency,
            amount: terms.amount,
            catalogueRevision: terms.catalogueRevision,
          }
        : null,
      suggestedAmount: context.catalogue?.renewalAmount?.toString() ?? null,
      catalogueRevision: context.catalogue?.revision ?? null,
      reviewCode: context.preference?.enabled
        ? (context.code ?? context.preference.reviewCode)
        : context.code,
      canConfigure: this.admin(actor),
      canChangePreference:
        !actor.supportAdministratorId &&
        (this.admin(actor) || actor.identity.role === 'CUSTOMER'),
      invoice:
        invoice && record
          ? {
              id: invoice.id,
              invoiceNumber: invoice.invoiceNumber,
              status: invoice.status,
              amount: invoice.total.toString(),
              balanceDue: invoice.balanceDue.toString(),
              currency: invoice.currency,
              dueAt: invoice.dueAt.toISOString(),
              termStart: record.termStart.toISOString(),
              termEnd: record.termEnd.toISOString(),
            }
          : null,
      externalDispatchEnabled: false,
    });
  }
  async update(
    id: string,
    raw:
      | z.infer<typeof domainRenewalPreferenceRequestSchema>
      | z.infer<typeof domainRenewalConfigureRequestSchema>,
    actor: AuthRequestContext,
    configure = false,
  ) {
    if (actor.supportAdministratorId)
      throw this.error('Support sessions are read-only.', 403);
    if (configure && !this.admin(actor))
      throw this.error(
        'A full administrator with two-factor authentication is required.',
        403,
      );
    const configured = configure
      ? domainRenewalConfigureRequestSchema.parse(raw)
      : null;
    const input = configured ?? domainRenewalPreferenceRequestSchema.parse(raw);
    const domain = await this.owned(id, actor);
    if (input.confirmation !== domain.domainName)
      throw this.error('Confirm the exact domain name.');
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM domains WHERE id=${id}::uuid FOR UPDATE`;
      const current = await domainRenewalContext(tx, id, new Date(Date.now()));
      if (!current || current.domain.customerId !== domain.customerId)
        throw this.error('The domain changed.');
      if ((current.preference?.revision ?? 0) !== input.expectedRevision)
        throw this.error('Renewal preferences changed. Refresh the record.');
      let terms = current.terms;
      if (configured) {
        // Match the catalogue under the same advisory lock as catalogue edits.
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(510118)::text`;
        const fresh = await domainRenewalContext(tx, id, new Date(Date.now()));
        if (
          !fresh ||
          fresh.factCode ||
          fresh.catalogue?.renewalAmount?.toString() !==
            configured.sellingAmount ||
          fresh.catalogue?.revision !== configured.catalogueRevision
        )
          throw this.error(
            'Fresh eligible facts and the current ordinary renewal price are required.',
          );
        terms = {
          schemaVersion: 1,
          years: 1,
          currency: 'BDT',
          amount: configured.sellingAmount,
          catalogueRevision: configured.catalogueRevision,
          bindingHash: fresh.hash,
        };
      } else if (input.enabled && current.code)
        throw this.error(
          'Ask an administrator to confirm fresh renewal facts and terms.',
        );
      if (input.enabled && !terms)
        throw this.error('Renewal terms are not confirmed.');
      await tx.domainRenewalPreference.upsert({
        where: { domainId: id },
        create: {
          domainId: id,
          enabled: input.enabled,
          revision: 1,
          ...(terms ? { terms } : {}),
        },
        update: {
          enabled: input.enabled,
          revision: { increment: 1 },
          reviewCode: null,
          ...(terms ? { terms } : {}),
        },
      });
      await tx.activityLog.create({
        data: {
          actorUserId: actor.identity.userId,
          action: configure
            ? 'DOMAIN_RENEWAL_TERMS_CONFIRMED'
            : 'DOMAIN_RENEWAL_PREFERENCE_CHANGED',
          entityType: 'DOMAIN',
          entityId: id,
          metadata: {
            enabled: input.enabled,
            revision: input.expectedRevision + 1,
            ...(configured
              ? {
                  reason: configured.reason,
                  amount: configured.sellingAmount,
                  catalogueRevision: configured.catalogueRevision,
                }
              : {}),
          },
        },
      });
    });
    return this.view(id, actor);
  }
  private error(message: string, status: HttpStatus = HttpStatus.CONFLICT) {
    return new ApplicationException({
      status,
      code: status === HttpStatus.FORBIDDEN ? 'FORBIDDEN' : 'CONFLICT',
      message,
    });
  }
}
