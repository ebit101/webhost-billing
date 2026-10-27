import { Inject, Injectable } from '@nestjs/common';
import { createHmac, randomUUID } from 'node:crypto';
import type { WorkerEnvironment } from '@webhost-billing/config';
import { Prisma, type PrismaClient } from '@webhost-billing/database';
import {
  normalizeNotificationPhone,
  notificationDefinition,
  emailOutboxEventTypeSchema,
  parseEmailEventPayload,
  type NotificationKey,
} from '@webhost-billing/shared';
import { WORKER_PRISMA } from '../infrastructure/database.module';
import { WORKER_ENVIRONMENT } from '../infrastructure/environment.module';
import { DeliveryTokenCipher } from '../email/delivery-token-cipher';
import { loadRenewalPolicy } from '../renewal/renewal-policy';
import { addBusinessDays, businessDate } from '../renewal/renewal-calendar';

type Transaction = Prisma.TransactionClient;
type Source = { key: string; kind: string; id: string; createdAt: Date };
type Target = { customerId?: string; userId?: string };

export function notificationDestinationFingerprint(
  value: string,
  secret: string,
): string {
  return createHmac('sha256', secret)
    .update('notification-destination\0' + value)
    .digest('hex');
}

@Injectable()
export class NotificationProjectionService {
  constructor(
    @Inject(WORKER_PRISMA) private readonly prisma: PrismaClient,
    @Inject(WORKER_ENVIRONMENT) private readonly environment: WorkerEnvironment,
  ) {}

  async projectOnce(now = new Date()): Promise<number> {
    return this.prisma.$transaction(
      async (tx) => {
        const [lock] = await tx.$queryRaw<
          { acquired: boolean }[]
        >`SELECT pg_try_advisory_xact_lock(hashtext('notifications:projection:v1')) AS acquired`;
        if (!lock?.acquired) return 0;
        const epoch = await tx.notificationEpoch.findUniqueOrThrow({
          where: { id: 'main' },
        });
        // An anti-join, not a timestamp cursor: a late-committing transaction cannot
        // fall behind the cursor. Migration sets the historical cutover boundary.
        const sources = await tx.$queryRaw<Source[]>(Prisma.sql`
        SELECT source.* FROM (
          SELECT 'audit:' || id::text AS key, 'AUDIT' AS kind, id, created_at AS "createdAt" FROM activity_logs WHERE created_at >= ${epoch.startedAt} AND action IN ('AUTH_EMAIL_VERIFIED','AUTH_PASSWORD_RESET_COMPLETED','AUTH_TWO_FACTOR_ENABLED','AUTH_TWO_FACTOR_DISABLED','AUTH_TWO_FACTOR_RECOVERY_CODES_REGENERATED','CUSTOMER_PASSWORD_CHANGED','MANUAL_PAYMENT_SUBMITTED_BY_CUSTOMER','MANUAL_PAYMENT_REFUNDED_BY_ADMIN','MANUAL_PAYMENT_REVERSED_BY_ADMIN','TICKET_CREATED_BY_CUSTOMER','TICKET_UPDATED_BY_ADMIN','DOMAIN_ACTION_CONFIRMED','DOMAIN_ACTION_OUTCOME_UNCERTAIN','DOMAIN_ACTION_READ_UNCERTAIN','DOMAIN_ACTION_NOT_SUBMITTED')
          UNION ALL SELECT 'outbox:' || id::text, 'OUTBOX', id, created_at FROM outbox_events WHERE created_at >= ${epoch.startedAt} AND event_type IN ('EMAIL_ORDER_RECEIVED','EMAIL_PAYMENT_RECEIVED','EMAIL_INVOICE_CREATED','EMAIL_OVERDUE_NOTICE','EMAIL_SERVICE_SUSPENDED','EMAIL_SERVICE_REACTIVATED','EMAIL_TICKET_REPLY')
          UNION ALL SELECT 'hosting:' || id::text, 'HOSTING', id, completed_at FROM hosting_panel_operations WHERE completed_at >= ${epoch.startedAt} AND status IN ('FAILED','INCONSISTENT')
          UNION ALL SELECT 'email:' || id::text, 'EMAIL', id, failed_at FROM email_logs WHERE failed_at >= ${epoch.startedAt} AND status = 'FAILED' AND (attempt_count >= 5 OR EXISTS (SELECT 1 FROM email_attempts attempt WHERE attempt.email_log_id = email_logs.id AND attempt.failure_kind IN ('PERMANENT','INCONSISTENT')))
          UNION ALL SELECT 'automation:' || id::text, 'AUTOMATION', id, completed_at FROM automation_runs WHERE completed_at >= ${epoch.startedAt} AND status IN ('FAILED','PARTIALLY_SUCCEEDED')
          UNION ALL SELECT 'registrar:' || id::text, 'REGISTRAR', id, created_at FROM registrar_evidence WHERE created_at >= ${epoch.startedAt} AND code IN ('OWNERSHIP_AND_EXPIRY_CONFIRMED','PROVIDER_REJECTED','MANUAL_RECONCILIATION_REQUIRED')
          UNION ALL SELECT 'failed-outbox:' || id::text, 'FAILED_OUTBOX', id, updated_at FROM outbox_events WHERE updated_at >= ${epoch.startedAt} AND status = 'FAILED' AND event_type <> 'NOTIFICATION_DELIVERY_REQUESTED'
          UNION ALL SELECT 'failed-notification:' || id::text, 'EMAIL', id, completed_at FROM notification_entries WHERE completed_at >= ${epoch.startedAt} AND status = 'FAILED' AND key NOT IN ('admin-delivery-failure','admin-automation-failure')
        ) source WHERE NOT EXISTS (SELECT 1 FROM notification_sources done WHERE done.key = source.key)
        ORDER BY source."createdAt",source.key LIMIT 100
      `);
        for (const source of sources) {
          await this.projectSource(tx, source);
          await tx.notificationSource.create({ data: { key: source.key } });
        }
        await this.calendar(tx, now);
        return sources.length;
      },
      { timeout: 30000 },
    );
  }

  private async emit(
    tx: Transaction,
    key: NotificationKey,
    sourceKey: string,
    target: Target = {},
    metadata?: Prisma.InputJsonObject,
  ) {
    const definition = notificationDefinition(key);
    if (
      definition.audience === 'CUSTOMER' &&
      !target.customerId &&
      !target.userId
    )
      return;
    const users = await tx.user.findMany({
      where: {
        role: definition.audience,
        status: 'ACTIVE',
        deletedAt: null,
        emailVerifiedAt: { not: null },
        ...(target.userId ? { id: target.userId } : {}),
        ...(definition.audience === 'CUSTOMER'
          ? {
              customer: {
                is: {
                  ...(target.customerId ? { id: target.customerId } : {}),
                  status: 'ACTIVE',
                  deletedAt: null,
                },
              },
            }
          : target.userId
            ? {}
            : { adminProfile: { is: { staffRole: 'FULL_ADMINISTRATOR' } } }),
      },
      include: { customer: true, notificationPreference: true },
    });
    for (const user of users) {
      const channels: ('EMAIL' | 'WHATSAPP')[] = [];
      if (!definition.existingEmail) channels.push('EMAIL');
      if (definition.whatsApp) channels.push('WHATSAPP');
      for (const channel of channels) {
        let destination = user.email;
        let suppressed = false;
        if (channel === 'WHATSAPP') {
          const preference = user.notificationPreference;
          suppressed = preference?.whatsAppEnabled === false;
          destination =
            normalizeNotificationPhone(
              user.customer?.phone,
              user.customer?.countryCode,
            ) ?? '';
          if (preference?.phoneCiphertext) {
            try {
              destination = new DeliveryTokenCipher(
                this.environment.CREDENTIAL_ENCRYPTION_KEY,
              ).decrypt(preference.phoneCiphertext);
            } catch {
              destination = '';
            }
          }
          if (!normalizeNotificationPhone(destination)) suppressed = true;
        }
        const id = randomUUID();
        const status = suppressed
          ? 'SUPPRESSED'
          : this.environment.NOTIFICATION_DELIVERY_MODE === 'preview'
            ? 'QUEUED'
            : 'DISABLED';
        const created = await tx.notificationEntry.createMany({
          data: [
            {
              id,
              userId: user.id,
              key,
              sourceKey,
              channel,
              status,
              metadata: {
                ...metadata,
                destinationFingerprint: notificationDestinationFingerprint(
                  destination,
                  this.environment.CREDENTIAL_ENCRYPTION_KEY,
                ),
              },
            },
          ],
          skipDuplicates: true,
        });
        if (created.count && status === 'QUEUED')
          await tx.outboxEvent.create({
            data: {
              aggregateType: 'NOTIFICATION',
              aggregateId: id,
              eventType: 'NOTIFICATION_DELIVERY_REQUESTED',
              idempotencyKey: `notification:${id}`,
              payload: { schemaVersion: 1, notificationId: id },
            },
          });
      }
    }
  }

  private async customerFor(
    tx: Transaction,
    entityType: string,
    id: string,
  ): Promise<string | undefined> {
    if (entityType === 'CUSTOMER')
      return (
        await tx.customer.findUnique({ where: { id }, select: { id: true } })
      )?.id;
    if (entityType === 'PAYMENT')
      return (
        await tx.payment.findUnique({
          where: { id },
          include: { invoice: { select: { customerId: true } } },
        })
      )?.invoice.customerId;
    if (entityType === 'TICKET')
      return (
        await tx.ticket.findUnique({
          where: { id },
          select: { customerId: true },
        })
      )?.customerId;
    if (entityType === 'DOMAIN')
      return (
        await tx.domain.findUnique({
          where: { id },
          select: { customerId: true },
        })
      )?.customerId;
    return undefined;
  }

  private async projectSource(tx: Transaction, source: Source) {
    if (source.kind === 'AUDIT') {
      const audit = await tx.activityLog.findUniqueOrThrow({
        where: { id: source.id },
      });
      if (!audit.entityId) return;
      if (audit.action === 'AUTH_EMAIL_VERIFIED') {
        const user = await tx.user.findUnique({
          where: { id: audit.entityId },
        });
        if (user?.role === 'CUSTOMER' && user.emailVerifiedAt) {
          await this.emit(tx, 'client-welcome', source.key, {
            userId: user.id,
          });
          await this.emit(tx, 'admin-customer-verified', source.key);
        }
      } else if (
        [
          'AUTH_PASSWORD_RESET_COMPLETED',
          'AUTH_TWO_FACTOR_ENABLED',
          'AUTH_TWO_FACTOR_DISABLED',
          'AUTH_TWO_FACTOR_RECOVERY_CODES_REGENERATED',
        ].includes(audit.action)
      ) {
        const user = await tx.user.findUnique({
          where: { id: audit.entityId },
        });
        if (user)
          await this.emit(
            tx,
            user.role === 'ADMIN'
              ? 'admin-security-alert'
              : 'client-security-change',
            source.key,
            { userId: user.id },
          );
      } else if (audit.action === 'CUSTOMER_PASSWORD_CHANGED') {
        const customerId = await this.customerFor(
          tx,
          audit.entityType,
          audit.entityId,
        );
        if (customerId)
          await this.emit(tx, 'client-security-change', source.key, {
            customerId,
          });
      } else if (audit.action === 'MANUAL_PAYMENT_SUBMITTED_BY_CUSTOMER') {
        const payment = await tx.payment.findUnique({
          where: { id: audit.entityId },
        });
        if (payment?.status === 'PENDING')
          await this.emit(
            tx,
            'admin-payment-review',
            source.key,
            {},
            { paymentId: payment.id },
          );
      } else if (
        [
          'MANUAL_PAYMENT_REFUNDED_BY_ADMIN',
          'MANUAL_PAYMENT_REVERSED_BY_ADMIN',
        ].includes(audit.action)
      ) {
        const customerId = await this.customerFor(
          tx,
          audit.entityType,
          audit.entityId,
        );
        if (customerId) {
          await this.emit(tx, 'client-payment-adjustment', source.key, {
            customerId,
          });
          await this.emit(tx, 'admin-payment-adjustment', source.key);
        }
      } else if (audit.action === 'TICKET_CREATED_BY_CUSTOMER') {
        await this.emit(tx, 'admin-support-activity', source.key);
      } else if (audit.action === 'TICKET_UPDATED_BY_ADMIN') {
        const ticket = await tx.ticket.findUnique({
          where: { id: audit.entityId },
        });
        const metadata = record(audit.metadata);
        if (
          ticket?.priority === 'URGENT' &&
          metadata.previousPriority !== 'URGENT' &&
          metadata.priority === 'URGENT'
        ) {
          await this.emit(
            tx,
            'client-urgent-support',
            source.key,
            { customerId: ticket.customerId },
            { ticketId: ticket.id },
          );
          await this.emit(
            tx,
            'admin-urgent-support',
            source.key,
            {},
            { ticketId: ticket.id },
          );
        }
      } else if (
        audit.action === 'DOMAIN_ACTION_CONFIRMED' &&
        record(audit.metadata).kind === 'RENEW'
      ) {
        const customerId = await this.customerFor(tx, 'DOMAIN', audit.entityId);
        if (customerId)
          await this.emit(
            tx,
            'client-domain-renewed',
            `domain-renewed:${auditActionReference(audit)}`,
            { customerId },
          );
      } else if (
        [
          'DOMAIN_ACTION_OUTCOME_UNCERTAIN',
          'DOMAIN_ACTION_READ_UNCERTAIN',
          'DOMAIN_ACTION_NOT_SUBMITTED',
        ].includes(audit.action)
      ) {
        await this.emit(
          tx,
          'admin-domain-problem',
          `domain-problem:${auditActionReference(audit)}`,
        );
      }
      return;
    }
    if (source.kind === 'OUTBOX') {
      const event = await tx.outboxEvent.findUniqueOrThrow({
        where: { id: source.id },
      });
      const eventType = emailOutboxEventTypeSchema.safeParse(event.eventType);
      if (!eventType.success) return;
      let payload: Record<string, unknown>;
      try {
        payload = parseEmailEventPayload(eventType.data, event.payload);
      } catch {
        await this.emit(tx, 'admin-automation-failure', source.key);
        return;
      }
      if (event.eventType === 'EMAIL_ORDER_RECEIVED')
        await this.emit(tx, 'admin-new-order', source.key);
      else if (event.eventType === 'EMAIL_PAYMENT_RECEIVED')
        await this.emit(tx, 'admin-payment-confirmed', source.key);
      else if (
        event.eventType === 'EMAIL_INVOICE_CREATED' ||
        event.eventType === 'EMAIL_OVERDUE_NOTICE'
      ) {
        if (typeof payload.invoiceId !== 'string') return;
        const invoice = await tx.invoice.findUnique({
          where: { id: payload.invoiceId },
        });
        if (
          invoice &&
          invoice.issuedAt &&
          invoice.status !== 'DRAFT' &&
          invoice.status !== 'CANCELLED' &&
          (event.eventType !== 'EMAIL_OVERDUE_NOTICE' ||
            (['UNPAID', 'OVERDUE'].includes(invoice.status) &&
              invoice.balanceDue > 0n))
        )
          await this.emit(
            tx,
            event.eventType === 'EMAIL_INVOICE_CREATED'
              ? 'client-invoice-issued'
              : 'client-overdue-notice',
            `${event.eventType}:${invoice.id}`,
            { customerId: invoice.customerId },
            { invoiceId: invoice.id },
          );
      } else if (
        event.eventType === 'EMAIL_SERVICE_SUSPENDED' ||
        event.eventType === 'EMAIL_SERVICE_REACTIVATED'
      ) {
        if (typeof payload.serviceId !== 'string') return;
        const service = await tx.service.findUnique({
          where: { id: payload.serviceId },
        });
        if (
          service?.status ===
          (event.eventType === 'EMAIL_SERVICE_SUSPENDED'
            ? 'SUSPENDED'
            : 'ACTIVE')
        )
          await this.emit(
            tx,
            event.eventType === 'EMAIL_SERVICE_SUSPENDED'
              ? 'client-service-suspended'
              : 'client-service-restored',
            source.key,
            { customerId: service.customerId },
            { serviceId: service.id },
          );
      } else if (
        event.eventType === 'EMAIL_TICKET_REPLY' &&
        typeof payload.ticketId === 'string' &&
        typeof payload.messageId === 'string'
      ) {
        const ticket = await tx.ticket.findUnique({
          where: { id: payload.ticketId },
          include: { messages: { where: { id: payload.messageId } } },
        });
        const message = ticket?.messages[0];
        if (ticket?.priority === 'URGENT' && message)
          await this.emit(
            tx,
            message.kind === 'CUSTOMER'
              ? 'admin-urgent-support'
              : 'client-urgent-support',
            source.key,
            message.kind === 'CUSTOMER'
              ? {}
              : { customerId: ticket.customerId },
            { ticketId: ticket.id },
          );
      }
      return;
    }
    if (source.kind === 'REGISTRAR') {
      const evidence = await tx.registrarEvidence.findUniqueOrThrow({
        where: { id: source.id },
      });
      const operation = await tx.registrarOperation.findUnique({
        where: { id: evidence.operationId },
      });
      if (!operation) return;
      if (evidence.code === 'OWNERSHIP_AND_EXPIRY_CONFIRMED')
        await this.emit(
          tx,
          'client-domain-registered',
          `domain-registered:${operation.id}`,
          { customerId: operation.customerId },
        );
      else
        await this.emit(
          tx,
          'admin-domain-problem',
          `registrar-problem:${operation.id}`,
        );
      return;
    }
    const key =
      source.kind === 'HOSTING'
        ? 'admin-provisioning-problem'
        : source.kind === 'EMAIL'
          ? 'admin-delivery-failure'
          : 'admin-automation-failure';
    await this.emit(tx, key, source.key);
    // Retain only the reference, never provider errors, ticket text or credentials.
  }

  private async calendar(tx: Transaction, now: Date) {
    const policy = await loadRenewalPolicy(tx);
    const date = businessDate(now, policy.timeZone);
    const dailyKey = `notification-digest:${date}`;
    if (
      !(await tx.notificationSource.findUnique({ where: { key: dailyKey } }))
    ) {
      const pendingOrders = await tx.order.count({
        where: { status: 'PENDING' },
      });
      const overdueInvoices = await tx.invoice.count({
        where: {
          status: { in: ['UNPAID', 'OVERDUE'] },
          dueAt: { lt: now },
          balanceDue: { gt: 0n },
        },
      });
      const failedOperations = await tx.hostingPanelOperation.count({
        where: { status: { in: ['FAILED', 'INCONSISTENT'] } },
      });
      const expiringDomains = await tx.domain.count({
        where: {
          state: 'REGISTERED',
          expiresAt: { gte: now, lte: new Date(now.getTime() + 14 * 86400000) },
        },
      });
      await this.emit(
        tx,
        'admin-daily-summary',
        dailyKey,
        {},
        { pendingOrders, overdueInvoices, failedOperations, expiringDomains },
      );
      await tx.notificationSource.create({ data: { key: dailyKey } });
    }
    // Calendar scans use keyset pages rather than a fixed first-100 slice.
    let after: string | undefined;
    for (;;) {
      const domains = await tx.domain.findMany({
        where: {
          state: 'REGISTERED',
          expiresAt: {
            gte: new Date(now.getTime() - 86400000),
            lte: new Date(now.getTime() + 15 * 86400000),
          },
          ...(after ? { id: { gt: after } } : {}),
        },
        orderBy: { id: 'asc' },
        take: 100,
      });
      for (const domain of domains) {
        if (!domain.expiresAt) continue;
        const expiry = businessDate(domain.expiresAt, policy.timeZone);
        const key =
          expiry === addBusinessDays(date, 14) ||
          expiry === addBusinessDays(date, 7)
            ? 'client-domain-renewal-reminder'
            : expiry === addBusinessDays(date, 1) || expiry === date
              ? 'client-domain-expiry-warning'
              : undefined;
        if (key)
          await this.emit(
            tx,
            key,
            `domain-expiry:${domain.id}:${expiry}:${key === 'client-domain-expiry-warning' ? 'final' : date}`,
            { customerId: domain.customerId },
            { domainId: domain.id, expiresAt: domain.expiresAt.toISOString() },
          );
      }
      if (domains.length < 100) break;
      after = domains[domains.length - 1]?.id;
    }
    if (!policy.enabled) return;
    after = undefined;
    for (;;) {
      const invoices: Prisma.InvoiceGetPayload<{
        include: { items: { include: { service: true } } };
      }>[] = await tx.invoice.findMany({
        where: {
          status: { in: ['UNPAID', 'OVERDUE'] },
          balanceDue: { gt: 0n },
          items: { some: { serviceId: { not: null } } },
          dueAt: {
            gte: new Date(
              now.getTime() - (policy.gracePeriodDays + 2) * 86400000,
            ),
            lte: now,
          },
          ...(after ? { id: { gt: after } } : {}),
        },
        include: { items: { include: { service: true } } },
        orderBy: { id: 'asc' },
        take: 100,
      });
      for (const invoice of invoices) {
        const suspensionDate = addBusinessDays(
          businessDate(invoice.dueAt, policy.timeZone),
          policy.gracePeriodDays + 1,
        );
        if (
          suspensionDate !== addBusinessDays(date, 1) ||
          !invoice.items.some((item) => item.service?.status === 'ACTIVE')
        )
          continue;
        await this.emit(
          tx,
          'client-final-warning',
          `final-warning:${invoice.id}:${suspensionDate}`,
          { customerId: invoice.customerId },
          { invoiceId: invoice.id, suspensionDate },
        );
      }
      if (invoices.length < 100) break;
      after = invoices[invoices.length - 1]?.id;
    }
  }
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function auditActionReference(audit: {
  id: string;
  metadata: unknown;
}): string {
  const reference = record(audit.metadata).actionId;
  return typeof reference === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      reference,
    )
    ? reference
    : audit.id;
}
