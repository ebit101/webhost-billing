import { randomUUID } from 'node:crypto';
import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import type {
  Prisma,
  PrismaClient,
  ServiceUpgrade,
} from '@webhost-billing/database';
import {
  businessIdentitySchema,
  snapshotInvoiceProduct,
  hostingAccountSchema,
  hostingPlanChangeQuoteSchema,
  hostingUpgradeSchema,
  quoteHostingPlanChange,
  PROJECT_NAME,
  sentenceCaseLabel,
  type HostingUpgrade,
} from '@webhost-billing/shared';
import { ApplicationException } from '../../common/errors/application.exception';
import { allocateInvoiceNumber } from '../../common/identifiers/invoice-number';
import type { SecurityRequestContext } from '../../common/http/request-context';
import { PRISMA_CLIENT } from '../../infrastructure/database/database.module';
import type { AuthRequestContext } from '../auth/auth.types';
import { HostingPanelService } from '../hosting-panels/hosting-panel.service';
import { upgradeContext, upgradeOperationKey } from './hosting-upgrade-context';

@Injectable()
export class HostingUpgradeService {
  private readonly logger = new Logger(HostingUpgradeService.name);
  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient,
    private readonly panel: HostingPanelService,
  ) {}

  async list(
    serviceId: string,
    actor: AuthRequestContext,
    customerId?: string,
  ) {
    await this.accessible(this.prisma, serviceId, actor, customerId);
    const rows = await this.prisma.serviceUpgrade.findMany({
      where: { serviceId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 20,
    });
    return Promise.all(
      rows.map((row) =>
        this.serialize(
          row,
          actor.identity.role === 'CUSTOMER' && !actor.supportAdministratorId,
        ),
      ),
    );
  }

  async offer(
    serviceId: string,
    input: {
      submissionKey: string;
      targetPriceId: string;
      reason: string;
      requirementsVerified: true;
      change?: 'UPGRADE' | 'DOWNGRADE';
    },
    actor: AuthRequestContext,
    context: SecurityRequestContext,
    customerId?: string,
  ) {
    this.admin(actor);
    if (input.requirementsVerified !== true)
      throw this.error(
        'An administrator must verify target package, capacity and add-on compatibility.',
      );
    await this.accessible(this.prisma, serviceId, actor, customerId);
    const prior = await this.prisma.serviceUpgrade.findUnique({
      where: { id: input.submissionKey },
    });
    if (prior) {
      if (
        prior.serviceId !== serviceId ||
        hostingPlanChangeQuoteSchema.parse(prior.quote).target.priceId !==
          input.targetPriceId ||
        hostingPlanChangeQuoteSchema.parse(prior.quote).change !==
          (input.change ?? 'UPGRADE')
      )
        throw this.error('The submission key belongs to another upgrade.');
      return this.serialize(prior);
    }
    const inspected = await this.panel.execute(
      serviceId,
      { type: 'GET_ACCOUNT', submissionKey: randomUUID() },
      actor,
      context,
    );
    const account = inspected.operation.account;
    if (
      inspected.operation.status !== 'SUCCEEDED' ||
      !account ||
      account.state !== 'ACTIVE'
    )
      throw this.error(
        'Verify the active hosting account before offering an upgrade.',
      );
    const row = await this.prisma.$transaction(async (tx) => {
      await this.lock(tx, serviceId);
      await this.accessible(tx, serviceId, actor, customerId);
      const replay = await tx.serviceUpgrade.findUnique({
        where: { id: input.submissionKey },
      });
      if (replay) {
        if (
          replay.serviceId !== serviceId ||
          hostingPlanChangeQuoteSchema.parse(replay.quote).target.priceId !==
            input.targetPriceId ||
          hostingPlanChangeQuoteSchema.parse(replay.quote).change !==
            (input.change ?? 'UPGRADE')
        )
          throw this.error('The submission key belongs to another upgrade.');
        return replay;
      }
      const loaded = await upgradeContext(
        tx,
        serviceId,
        input.targetPriceId,
        new Date(Date.now()),
        undefined,
        input.change,
      );
      if (
        account.externalAccountId !== loaded.service.externalAccountId ||
        account.username !== loaded.service.controlPanelUsername ||
        account.domain !== loaded.service.domain ||
        account.packageIdentifier !== loaded.input.current.packageIdentifier
      )
        throw this.error(
          'The recorded package does not match the hosting account. Review it first.',
        );
      const quote = this.eligible(loaded.input);
      await tx.serviceUpgrade.updateMany({
        where: { serviceId, status: 'QUOTED' },
        data: { status: 'CANCELLED' },
      });
      const created = await tx.serviceUpgrade.create({
        data: {
          id: input.submissionKey,
          serviceId,
          quote,
          contextHash: loaded.hash,
        },
      });
      await this.audit(tx, created, 'QUOTED', actor, context, {
        reason: input.reason,
      });
      return created;
    });
    return this.serialize(row);
  }

  async accept(
    serviceId: string,
    id: string,
    actor: AuthRequestContext,
    context: SecurityRequestContext,
    customerId?: string,
  ) {
    if (actor.identity.role !== 'CUSTOMER' || actor.supportAdministratorId)
      throw this.denied();
    const row = await this.prisma.$transaction(async (tx) => {
      await this.lock(tx, serviceId);
      await this.accessible(tx, serviceId, actor, customerId);
      const request = await this.record(tx, serviceId, id);
      if (request.acceptedAt && request.status !== 'CANCELLED') return request;
      if (request.status !== 'QUOTED')
        throw this.error('This quote is no longer available.');
      const quote = hostingPlanChangeQuoteSchema.parse(request.quote);
      this.currentWindow(quote.expiresAt);
      const loaded = await upgradeContext(
        tx,
        serviceId,
        quote.target.priceId,
        new Date(quote.quotedAt),
        id,
        quote.change,
      );
      this.eligible(loaded.input);
      if (loaded.hash !== request.contextHash)
        throw this.error(
          'The service or price changed. Ask for a fresh quote.',
        );
      const now = new Date(Date.now());
      if (quote.change === 'DOWNGRADE') {
        if (loaded.service.nextDueAt.toISOString() !== quote.paidPeriod.endAt)
          throw this.error(
            'Resolve prepaid renewal coverage before scheduling a downgrade.',
          );
        const scheduled = await tx.serviceUpgrade.update({
          where: { id },
          data: { status: 'SCHEDULED', acceptedAt: now },
        });
        await this.audit(tx, scheduled, 'SCHEDULED', actor, context, {
          effectiveAt: quote.paidPeriod.endAt,
        });
        return scheduled;
      }
      const amount = BigInt(quote.immediateCharge.amount);
      const customer = loaded.service.customer;
      const setting = await tx.setting.findUnique({
        where: { key: 'business.identity' },
      });
      const invoice = await tx.invoice.create({
        data: {
          invoiceNumber: await allocateInvoiceNumber(tx),
          submissionKey: `hosting-upgrade:${id}`,
          customerId: customer.id,
          status: amount === 0n ? 'PAID' : 'UNPAID',
          currency: quote.immediateCharge.currency,
          subtotal: amount,
          total: amount,
          balanceDue: amount,
          issuedAt: now,
          dueAt: new Date(quote.expiresAt),
          ...(amount === 0n ? { paidAt: now } : {}),
          customerNameSnapshot:
            customer.companyName ??
            `${customer.firstName} ${customer.lastName}`,
          customerEmailSnapshot: customer.user.email,
          customerAddressSnapshot: {
            line1: customer.addressLine1,
            line2: customer.addressLine2,
            city: customer.city,
            region: customer.region,
            postalCode: customer.postalCode,
            countryCode: customer.countryCode,
          },
          businessIdentitySnapshot: businessIdentitySchema.safeParse(
            setting?.value,
          ).data ?? { name: PROJECT_NAME },
          ...(customer.taxIdentifier
            ? { taxIdentitySnapshot: { taxIdentifier: customer.taxIdentifier } }
            : {}),
          items: {
            create: {
              linePosition: 1,
              serviceId,
              productAttributionSnapshot: snapshotInvoiceProduct({
                productId: quote.target.productId,
                productPriceId: quote.target.priceId,
                name: quote.target.name,
                kind: 'HOSTING',
                source: 'HOSTING_PLAN_CHANGE',
              }),
              descriptionSnapshot: `Hosting upgrade: ${quote.current.name} to ${quote.target.name} (${quote.quotedAt} to ${quote.paidPeriod.endAt})`,
              currency: quote.immediateCharge.currency,
              unitAmount: amount,
              lineTotal: amount,
            },
          },
        },
      });
      const accepted = await tx.serviceUpgrade.update({
        where: { id },
        data: { status: 'REQUESTED', invoiceId: invoice.id, acceptedAt: now },
      });
      await this.audit(tx, accepted, 'ACCEPTED', actor, context, {
        invoiceId: invoice.id,
      });
      return accepted;
    });
    return this.serialize(row, true);
  }

  async approve(
    serviceId: string,
    id: string,
    actor: AuthRequestContext,
    context: SecurityRequestContext,
    customerId?: string,
    downgradeReview?: { capacityFits: boolean; reason: string },
  ) {
    this.admin(actor);
    let handle = false;
    const request = await this.prisma.$transaction(async (tx) => {
      await this.lock(tx, serviceId);
      await this.accessible(tx, serviceId, actor, customerId);
      let row = await this.record(tx, serviceId, id);
      if (row.status === 'COMPLETED') return row;
      if (
        !['REQUESTED', 'SCHEDULED', 'APPLYING', 'REVIEW_REQUIRED'].includes(
          row.status,
        )
      )
        throw this.error('The customer must accept this quote first.');
      const quote = hostingPlanChangeQuoteSchema.parse(row.quote);
      this.executionWindow(quote);
      if (quote.change === 'DOWNGRADE') {
        if (!downgradeReview || !downgradeReview.reason.trim())
          throw this.error(
            'Recheck current account usage, target capacity and retained add-ons, and record a review reason.',
          );
        if (!downgradeReview.capacityFits) {
          if (row.status === 'APPLYING' || row.operationId)
            throw this.error(
              'Reconcile the existing package operation before recording a capacity decision.',
            );
          const held = await tx.serviceUpgrade.update({
            where: { id },
            data: {
              status: 'REVIEW_REQUIRED',
              error:
                'Target capacity or retained add-ons need review. Existing hosting stays unchanged; renewal billing remains on hold.',
            },
          });
          await this.audit(tx, held, 'CAPACITY_REVIEW', actor, context, {
            reason: downgradeReview.reason,
          });
          return held;
        }
      }
      const currentOp = await tx.hostingPanelOperation.findUnique({
        where: {
          idempotencyKey: `hosting-operation:${upgradeOperationKey(id, row.attempt)}`,
        },
      });
      if (currentOp && row.operationId !== currentOp.id)
        row = await tx.serviceUpgrade.update({
          where: { id },
          data: { operationId: currentOp.id },
        });
      if (currentOp?.status === 'RUNNING') return row;
      if (
        currentOp?.status === 'SUCCEEDED' ||
        currentOp?.status === 'INCONSISTENT'
      ) {
        handle = true;
        return row;
      }
      // One caller owns initial dispatch. A lost claim without an operation may
      // be reconciled after a minute; a concurrent click only reads its state.
      if (
        row.status === 'APPLYING' &&
        !currentOp &&
        Date.now() - row.updatedAt.getTime() < 60_000
      )
        return row;
      this.executionWindow(quote);
      await this.verifyContext(tx, row);
      await this.paid(tx, row);
      let attempt = row.attempt;
      if (currentOp) {
        if (row.status === 'APPLYING') {
          handle = true;
          return row;
        }
        if (
          !currentOp.retryable ||
          currentOp.status !== 'FAILED' ||
          attempt >= 2
        )
          throw this.error('This package change needs manual provider review.');
        attempt += 1;
      }
      const approved = await tx.serviceUpgrade.update({
        where: { id },
        data: {
          status: 'APPLYING',
          attempt,
          approvedAt: row.approvedAt ?? new Date(Date.now()),
          error: null,
        },
      });
      await this.audit(
        tx,
        approved,
        'APPROVED',
        actor,
        context,
        downgradeReview
          ? { reason: downgradeReview.reason, capacityFits: true }
          : {},
      );
      handle = true;
      return approved;
    });
    if (request.status === 'COMPLETED' || !handle)
      return this.serialize(request);
    const quote = hostingPlanChangeQuoteSchema.parse(request.quote);
    const key = upgradeOperationKey(id, request.attempt);
    let operation = await this.prisma.hostingPanelOperation.findUnique({
      where: { idempotencyKey: `hosting-operation:${key}` },
    });
    try {
      if (!operation) {
        const inspected = await this.panel.execute(
          serviceId,
          { type: 'GET_ACCOUNT', submissionKey: randomUUID() },
          actor,
          context,
        );
        if (
          inspected.operation.status !== 'SUCCEEDED' ||
          inspected.operation.account?.packageIdentifier !==
            quote.current.packageIdentifier ||
          inspected.operation.account.state !== 'ACTIVE'
        )
          throw this.error(
            'The source hosting package changed. Reconcile the account before retrying.',
          );
        const result =
          request.attempt === 0
            ? await this.panel.executeUpgrade(
                serviceId,
                {
                  type: 'CHANGE_PACKAGE',
                  packageIdentifier: quote.target.packageIdentifier,
                  submissionKey: key,
                },
                actor,
                context,
                id,
              )
            : await this.panel.retry(
                (
                  await this.prisma.hostingPanelOperation.findUniqueOrThrow({
                    where: {
                      idempotencyKey: `hosting-operation:${upgradeOperationKey(id, request.attempt - 1)}`,
                    },
                  })
                ).id,
                { submissionKey: key },
                actor,
                context,
                id,
              );
        operation = await this.prisma.hostingPanelOperation.findUniqueOrThrow({
          where: { id: result.operation.id },
        });
      }
      if (operation.status === 'RUNNING') return this.serialize(request);
      let account: unknown =
        operation.resultMetadata &&
        typeof operation.resultMetadata === 'object' &&
        !Array.isArray(operation.resultMetadata)
          ? operation.resultMetadata.account
          : null;
      if (operation.status === 'INCONSISTENT') {
        const inspected = await this.panel.execute(
          serviceId,
          { type: 'GET_ACCOUNT', submissionKey: randomUUID() },
          actor,
          context,
        );
        account =
          inspected.operation.status === 'SUCCEEDED'
            ? inspected.operation.account
            : null;
      }
      const parsed = hostingAccountSchema.safeParse(account);
      if (
        !['SUCCEEDED', 'INCONSISTENT'].includes(operation.status) ||
        !parsed.success ||
        parsed.data.packageIdentifier !== quote.target.packageIdentifier ||
        parsed.data.state !== 'ACTIVE'
      ) {
        await this.review(
          id,
          operation.id,
          'Package change was not confirmed. Review the provider result before retrying.',
        );
        return this.serialize(
          await this.prisma.serviceUpgrade.findUniqueOrThrow({ where: { id } }),
        );
      }
      const confirmed = parsed.data;
      const completed = await this.prisma.$transaction(async (tx) => {
        await this.lock(tx, serviceId);
        let row = await this.record(tx, serviceId, id);
        if (row.status === 'COMPLETED') return row;
        row = await tx.serviceUpgrade.update({
          where: { id },
          data: { operationId: operation!.id },
        });
        this.executionWindow(quote);
        const loaded = await this.verifyContext(tx, row);
        await this.paid(tx, row);
        if (
          loaded.service.externalAccountId !== confirmed.externalAccountId ||
          loaded.service.controlPanelUsername !== confirmed.username ||
          loaded.service.domain !== confirmed.domain
        )
          throw this.error('The provider account identity changed.');
        await tx.service.update({
          where: { id: serviceId },
          data: {
            productId: loaded.target.productId,
            productPriceId: loaded.target.id,
            productNameSnapshot: quote.target.name,
            productDescriptionSnapshot: loaded.target.product.description,
            recurringAmount: BigInt(quote.nextRecurringAmount.amount),
            currentPackageIdentifier: quote.target.packageIdentifier,
          },
        });
        const result = await tx.serviceUpgrade.update({
          where: { id },
          data: {
            status: 'COMPLETED',
            completedAt: new Date(Date.now()),
            error: null,
          },
        });
        await this.audit(tx, result, 'COMPLETED', actor, context, {
          operationId: operation!.id,
        });
        return result;
      });
      return this.serialize(completed);
    } catch (caught) {
      const code =
        caught &&
        typeof caught === 'object' &&
        'code' in caught &&
        typeof caught.code === 'string' &&
        /^[A-Z0-9_]{1,40}$/.test(caught.code)
          ? caught.code
          : 'UNCONFIRMED';
      this.logger.error(
        JSON.stringify({
          event: 'hosting_upgrade_confirmation_failed',
          upgradeId: id,
          code,
          location:
            caught instanceof Error
              ? caught.stack
                  ?.split('\n')
                  .filter((line) => /at .*hosting-upgrade/.test(line))
                  .slice(0, 3)
              : undefined,
        }),
      );
      await this.review(
        id,
        operation?.id ?? null,
        'Plan change needs review. Keep the recorded plan and financial history until the provider outcome is reconciled.',
      );
      if (caught instanceof ApplicationException) throw caught;
      throw this.error(
        'The plan change could not be confirmed. Review its recorded provider operation.',
      );
    }
  }

  async cancel(
    serviceId: string,
    id: string,
    actor: AuthRequestContext,
    context: SecurityRequestContext,
    customerId?: string,
  ) {
    this.admin(actor);
    await this.accessible(this.prisma, serviceId, actor, customerId);
    const before = await this.prisma.serviceUpgrade.findFirst({
      where: { id, serviceId },
    });
    if (!before) throw this.denied();
    const inspection =
      before.approvedAt || before.operationId
        ? await this.panel.execute(
            serviceId,
            { type: 'GET_ACCOUNT', submissionKey: randomUUID() },
            actor,
            context,
          )
        : null;
    const row = await this.prisma.$transaction(async (tx) => {
      await this.lock(tx, serviceId);
      await this.accessible(tx, serviceId, actor, customerId);
      const row = await this.record(tx, serviceId, id);
      if (row.status === 'CANCELLED') return row;
      if (
        !['QUOTED', 'REQUESTED', 'SCHEDULED', 'REVIEW_REQUIRED'].includes(
          row.status,
        )
      )
        throw this.error(
          'Only an unstarted or financially reconciled upgrade can be closed.',
        );
      if (row.operationId || row.approvedAt) {
        const quote = hostingPlanChangeQuoteSchema.parse(row.quote);
        const op = row.operationId
          ? await tx.hostingPanelOperation.findUnique({
              where: { id: row.operationId },
            })
          : null;
        const source = await tx.service.findUniqueOrThrow({
          where: { id: serviceId },
        });
        const account = inspection?.operation.account;
        if (
          op?.status === 'RUNNING' ||
          inspection?.operation.status !== 'SUCCEEDED' ||
          !account ||
          account.state !== 'ACTIVE' ||
          account.packageIdentifier !== quote.current.packageIdentifier ||
          account.externalAccountId !== source.externalAccountId ||
          account.username !== source.controlPanelUsername ||
          source.productId !== quote.current.productId
        )
          throw this.error(
            'Verify the original package before closing this upgrade.',
          );
      }
      if (row.invoiceId) {
        await tx.$queryRaw`SELECT id FROM invoices WHERE id = ${row.invoiceId}::uuid FOR UPDATE`;
        const invoice = await tx.invoice.findUniqueOrThrow({
          where: { id: row.invoiceId },
        });
        if (
          invoice.amountPaid > 0n ||
          invoice.creditTotal > 0n ||
          !['UNPAID', 'CANCELLED', 'REFUNDED'].includes(invoice.status)
        )
          throw this.error(
            'A paid or adjusted invoice needs financial review.',
          );
        if (invoice.status !== 'REFUNDED')
          await tx.invoice.update({
            where: { id: invoice.id },
            data: { status: 'CANCELLED', cancelledAt: new Date(Date.now()) },
          });
      }
      const result = await tx.serviceUpgrade.update({
        where: { id },
        data: { status: 'CANCELLED' },
      });
      await this.audit(tx, result, 'CANCELLED', actor, context);
      return result;
    });
    return this.serialize(row);
  }

  private async verifyContext(
    tx: Prisma.TransactionClient,
    row: ServiceUpgrade,
  ) {
    const quote = hostingPlanChangeQuoteSchema.parse(row.quote);
    const loaded = await upgradeContext(
      tx,
      row.serviceId,
      quote.target.priceId,
      new Date(quote.quotedAt),
      row.id,
      quote.change,
    );
    this.eligible(loaded.input);
    if (loaded.hash !== row.contextHash)
      throw this.error(
        'The service or price changed. Review the plan change before applying it.',
      );
    return loaded;
  }
  private async paid(tx: Prisma.TransactionClient, row: ServiceUpgrade) {
    const quote = hostingPlanChangeQuoteSchema.parse(row.quote);
    // Downgrades create no invoice, charge, credit or refund. Paid source
    // coverage is checked by verifyContext under the source invoice lock.
    if (quote.change === 'DOWNGRADE') {
      if (row.invoiceId || quote.immediateCharge.amount !== '0')
        throw this.error(
          'The scheduled downgrade has unexpected financial records.',
        );
      return;
    }
    if (row.invoiceId)
      await tx.$queryRaw`SELECT id FROM invoices WHERE id = ${row.invoiceId}::uuid FOR UPDATE`;
    const invoice = row.invoiceId
      ? await tx.invoice.findUnique({
          where: { id: row.invoiceId },
          include: { payments: true, items: true },
        })
      : null;
    const owner = await tx.service.findUniqueOrThrow({
      where: { id: row.serviceId },
    });
    if (
      !invoice ||
      invoice.customerId !== owner.customerId ||
      invoice.status !== 'PAID' ||
      invoice.balanceDue !== 0n ||
      invoice.amountPaid !== invoice.total ||
      invoice.payments
        .filter(
          (payment) =>
            payment.kind === 'CHARGE' &&
            payment.status === 'SUCCEEDED' &&
            payment.verifiedAt,
        )
        .reduce((sum, payment) => sum + payment.amount, 0n) !==
        invoice.amountPaid ||
      invoice.total !== BigInt(quote.immediateCharge.amount) ||
      invoice.currency !== quote.immediateCharge.currency ||
      invoice.creditTotal !== 0n ||
      invoice.taxTotal !== 0n ||
      invoice.discountTotal !== 0n ||
      invoice.items.length !== 1 ||
      invoice.items[0]?.serviceId !== row.serviceId ||
      invoice.payments.some(
        (p) => p.status === 'SUCCEEDED' && p.kind !== 'CHARGE',
      )
    )
      throw this.error(
        'Verified full payment is required before approving the upgrade.',
      );
  }
  private async serialize(
    row: ServiceUpgrade,
    canAccept = false,
  ): Promise<HostingUpgrade> {
    const quote = hostingPlanChangeQuoteSchema.parse(row.quote);
    const invoice = row.invoiceId
      ? await this.prisma.invoice.findUnique({ where: { id: row.invoiceId } })
      : null;
    const operation = await this.prisma.hostingPanelOperation.findUnique({
      where: {
        idempotencyKey: `hosting-operation:${upgradeOperationKey(row.id, row.attempt)}`,
      },
    });
    return hostingUpgradeSchema.parse({
      id: row.id,
      serviceId: row.serviceId,
      change: quote.change,
      status: row.status,
      sourceName: quote.current.name,
      targetName: quote.target.name,
      amount: quote.immediateCharge,
      nextRecurringAmount: quote.nextRecurringAmount,
      quotedAt: quote.quotedAt,
      expiresAt: quote.expiresAt,
      periodEndAt: quote.paidPeriod.endAt,
      acceptedAt: row.acceptedAt?.toISOString() ?? null,
      approvedAt: row.approvedAt?.toISOString() ?? null,
      completedAt: row.completedAt?.toISOString() ?? null,
      invoiceId: row.invoiceId,
      invoiceNumber: invoice?.invoiceNumber ?? null,
      paymentStatus: invoice?.status ?? null,
      operationStatus:
        row.status === 'COMPLETED' && operation?.status === 'INCONSISTENT'
          ? 'RECONCILED'
          : (operation?.status ?? null),
      error: row.error,
      canAccept:
        canAccept &&
        row.status === 'QUOTED' &&
        Date.now() < Date.parse(quote.expiresAt),
      canWithdraw:
        canAccept &&
        quote.change === 'DOWNGRADE' &&
        row.status === 'SCHEDULED' &&
        !row.approvedAt &&
        Date.now() < Date.parse(quote.paidPeriod.endAt),
    });
  }
  private eligible(input: Parameters<typeof quoteHostingPlanChange>[0]) {
    const quote = quoteHostingPlanChange(input);
    if (quote.status !== 'QUOTED')
      throw this.error(
        `Plan change requires review: ${quote.reasons.map(sentenceCaseLabel).join(', ')}.`,
      );
    return hostingPlanChangeQuoteSchema.parse(quote);
  }
  private currentWindow(expiresAt: string) {
    if (Date.now() >= Date.parse(expiresAt))
      throw this.error(
        'The upgrade quote expired. Review any payment and request a fresh quote.',
      );
  }
  private executionWindow(quote: {
    change: 'UPGRADE' | 'DOWNGRADE';
    expiresAt: string;
    paidPeriod: { endAt: string };
  }) {
    if (quote.change === 'UPGRADE') this.currentWindow(quote.expiresAt);
    else if (Date.now() < Date.parse(quote.paidPeriod.endAt))
      throw this.error(
        'The downgrade can only be applied at or after the billing boundary.',
      );
  }

  async withdraw(
    serviceId: string,
    id: string,
    actor: AuthRequestContext,
    context: SecurityRequestContext,
  ) {
    if (actor.identity.role !== 'CUSTOMER' || actor.supportAdministratorId)
      throw this.denied();
    const result = await this.prisma.$transaction(async (tx) => {
      await this.lock(tx, serviceId);
      await this.accessible(tx, serviceId, actor);
      const row = await this.record(tx, serviceId, id);
      const quote = hostingPlanChangeQuoteSchema.parse(row.quote);
      if (quote.change !== 'DOWNGRADE')
        throw this.error('Only a scheduled downgrade can be withdrawn.');
      if (row.status === 'CANCELLED') return row;
      if (
        row.status !== 'SCHEDULED' ||
        row.approvedAt ||
        row.operationId ||
        Date.now() >= Date.parse(quote.paidPeriod.endAt)
      )
        throw this.error(
          'This downgrade can no longer be withdrawn. Ask support to review it.',
        );
      const withdrawn = await tx.serviceUpgrade.update({
        where: { id },
        data: { status: 'CANCELLED' },
      });
      await this.audit(tx, withdrawn, 'WITHDRAWN', actor, context);
      return withdrawn;
    });
    return this.serialize(result);
  }
  private async record(
    tx: Prisma.TransactionClient,
    serviceId: string,
    id: string,
  ) {
    const row = await tx.serviceUpgrade.findFirst({ where: { id, serviceId } });
    if (!row) throw this.denied();
    return row;
  }
  private async accessible(
    db: Pick<Prisma.TransactionClient, 'service'>,
    id: string,
    actor: AuthRequestContext,
    customerId?: string,
  ) {
    const service = await db.service.findFirst({
      where: {
        id,
        ...(actor.identity.role === 'CUSTOMER'
          ? { customerId: actor.identity.customerId }
          : customerId
            ? { customerId }
            : {}),
      },
    });
    if (!service || (customerId && service.customerId !== customerId))
      throw this.denied();
    if (actor.identity.role === 'ADMIN') this.admin(actor);
    return service;
  }
  private admin(actor: AuthRequestContext) {
    if (
      actor.identity.role !== 'ADMIN' ||
      actor.identity.staffRole !== 'FULL_ADMINISTRATOR' ||
      actor.supportAdministratorId
    )
      throw this.denied();
  }
  private lock(tx: Prisma.TransactionClient, serviceId: string) {
    return tx.$queryRaw`SELECT id FROM services WHERE id = ${serviceId}::uuid FOR UPDATE`;
  }
  private async review(id: string, operationId: string | null, error: string) {
    await this.prisma.serviceUpgrade.updateMany({
      where: { id, status: { not: 'COMPLETED' } },
      data: {
        status: 'REVIEW_REQUIRED',
        ...(operationId ? { operationId } : {}),
        error,
      },
    });
  }
  private audit(
    tx: Prisma.TransactionClient,
    row: ServiceUpgrade,
    event: string,
    actor: AuthRequestContext,
    context: SecurityRequestContext,
    metadata: Prisma.InputJsonObject = {},
  ) {
    return tx.activityLog.create({
      data: {
        actorUserId: actor.identity.userId,
        ipAddressHash: context.ipAddressHash,
        action: `HOSTING_UPGRADE_${event}`,
        entityType: 'SERVICE',
        entityId: row.serviceId,
        metadata: { upgradeId: row.id, ...metadata },
      },
    });
  }
  private denied() {
    return new ApplicationException({
      status: HttpStatus.FORBIDDEN,
      code: 'FORBIDDEN',
      message: 'You do not have access to this hosting upgrade.',
    });
  }
  private error(message: string) {
    return new ApplicationException({
      status: HttpStatus.CONFLICT,
      code: 'CONFLICT',
      message,
    });
  }
}
