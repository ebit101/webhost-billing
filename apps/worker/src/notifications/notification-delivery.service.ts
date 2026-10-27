import { Inject, Injectable } from '@nestjs/common';
import type { WorkerEnvironment } from '@webhost-billing/config';
import { Prisma, type PrismaClient } from '@webhost-billing/database';
import { BackgroundJobError } from '@webhost-billing/queue';
import {
  normalizeNotificationPhone,
  notificationDefinition,
  notificationKeySchema,
  emailBrandingSettingsSchema,
  type BackgroundJobData,
} from '@webhost-billing/shared';
import { WORKER_PRISMA } from '../infrastructure/database.module';
import { WORKER_ENVIRONMENT } from '../infrastructure/environment.module';
import { DeliveryTokenCipher } from '../email/delivery-token-cipher';
import { PreviewEmailAdapter } from '../email/nodemailer-email.adapter';
import { loadRenewalPolicy } from '../renewal/renewal-policy';
import { addBusinessDays, businessDate } from '../renewal/renewal-calendar';
import { notificationDestinationFingerprint } from './notification-projection.service';
import {
  WHATSAPP_NOTIFICATION_ADAPTER,
  type WhatsAppNotificationAdapter,
} from './whatsapp-preview.adapter';

@Injectable()
export class NotificationDeliveryService {
  constructor(
    @Inject(WORKER_PRISMA) private readonly prisma: PrismaClient,
    @Inject(WORKER_ENVIRONMENT) private readonly environment: WorkerEnvironment,
    @Inject(WHATSAPP_NOTIFICATION_ADAPTER)
    private readonly whatsApp: WhatsAppNotificationAdapter,
  ) {}

  async deliver(job: BackgroundJobData): Promise<void> {
    let failed = false;
    await this.prisma.$transaction(
      async (tx) => {
        const event = await tx.outboxEvent.findUnique({
          where: { id: job.outboxEventId },
        });
        if (
          !event ||
          event.eventType !== 'NOTIFICATION_DELIVERY_REQUESTED' ||
          job.eventType !== event.eventType ||
          event.aggregateId !== job.aggregateId ||
          job.aggregateType !== 'NOTIFICATION' ||
          event.aggregateType !== 'NOTIFICATION'
        )
          throw new BackgroundJobError(
            'PERMANENT',
            'NOTIFICATION_REFERENCE_INVALID',
            'Notification reference is invalid.',
          );
        if (event.status !== 'PUBLISHED')
          throw new BackgroundJobError(
            event.status === 'FAILED' ? 'PERMANENT' : 'TEMPORARY',
            'NOTIFICATION_NOT_PUBLISHED',
            'Notification publication has not completed.',
          );
        const payload = record(event.payload);
        if (
          payload.notificationId !== event.aggregateId ||
          payload.schemaVersion !== 1 ||
          Object.keys(payload).some(
            (key) => !['notificationId', 'schemaVersion'].includes(key),
          )
        )
          throw new BackgroundJobError(
            'PERMANENT',
            'NOTIFICATION_PAYLOAD_INVALID',
            'Notification payload is invalid.',
          );
        const reference = await tx.notificationEntry.findUnique({
          where: { id: event.aggregateId },
          select: { userId: true },
        });
        if (!reference) return;
        await tx.$queryRaw`SELECT id FROM users WHERE id=${reference.userId}::uuid FOR UPDATE`;
        await tx.$queryRaw(
          Prisma.sql`SELECT id FROM notification_entries WHERE id=${event.aggregateId}::uuid FOR UPDATE`,
        );
        const entry = await tx.notificationEntry.findUnique({
          where: { id: event.aggregateId },
          include: {
            user: { include: { customer: true, adminProfile: true } },
          },
        });
        if (
          !entry ||
          (entry.status !== 'QUEUED' &&
            !(
              entry.status === 'FAILED' &&
              job.failureKind === 'TEMPORARY' &&
              job.manualRetryAllowed === true
            ))
        )
          return;
        const key = notificationKeySchema.safeParse(entry.key);
        if (!key.success)
          throw new BackgroundJobError(
            'PERMANENT',
            'NOTIFICATION_KEY_INVALID',
            'Notification type is invalid.',
          );
        const definition = notificationDefinition(key.data);
        const user = entry.user;
        // Same recipient lock as preferences prevents a delivery racing an opt-out.
        const current = await tx.user.findUniqueOrThrow({
          where: { id: user.id },
          include: {
            customer: true,
            adminProfile: true,
            notificationPreference: true,
          },
        });
        let suppressed =
          current.emailVerifiedAt === null ||
          current.status !== 'ACTIVE' ||
          current.deletedAt !== null ||
          current.role !== definition.audience;
        if (
          current.role === 'CUSTOMER' &&
          (!current.customer ||
            current.customer.status !== 'ACTIVE' ||
            current.customer.deletedAt)
        )
          suppressed = true;
        if (
          current.role === 'ADMIN' &&
          key.data !== 'admin-security-alert' &&
          current.adminProfile?.staffRole !== 'FULL_ADMINISTRATOR'
        )
          suppressed = true;
        const references = record(entry.metadata);
        if (
          key.data === 'client-invoice-issued' ||
          key.data === 'client-overdue-notice' ||
          key.data === 'client-final-warning'
        ) {
          const invoice =
            typeof references.invoiceId === 'string'
              ? await tx.invoice.findUnique({
                  where: { id: references.invoiceId },
                  include: { items: { include: { service: true } } },
                })
              : null;
          if (
            !invoice ||
            invoice.customerId !== current.customer?.id ||
            !invoice.issuedAt ||
            invoice.status === 'DRAFT' ||
            invoice.status === 'CANCELLED' ||
            (key.data !== 'client-invoice-issued' &&
              (invoice.balanceDue <= 0n ||
                !['UNPAID', 'OVERDUE'].includes(invoice.status)))
          )
            suppressed = true;
          if (key.data === 'client-final-warning' && invoice) {
            const policy = await loadRenewalPolicy(tx);
            const suspensionDate = addBusinessDays(
              businessDate(invoice.dueAt, policy.timeZone),
              policy.gracePeriodDays + 1,
            );
            if (
              !policy.enabled ||
              references.suspensionDate !== suspensionDate ||
              businessDate(new Date(), policy.timeZone) >= suspensionDate ||
              !invoice.items.some((item) => item.service?.status === 'ACTIVE')
            )
              suppressed = true;
          }
        }
        if (
          key.data === 'client-service-suspended' ||
          key.data === 'client-service-restored'
        ) {
          const service =
            typeof references.serviceId === 'string'
              ? await tx.service.findUnique({
                  where: { id: references.serviceId },
                })
              : null;
          if (
            !service ||
            service.customerId !== current.customer?.id ||
            service.status !==
              (key.data === 'client-service-suspended' ? 'SUSPENDED' : 'ACTIVE')
          )
            suppressed = true;
        }
        if (
          key.data === 'client-domain-renewal-reminder' ||
          key.data === 'client-domain-expiry-warning'
        ) {
          const domain =
            typeof references.domainId === 'string'
              ? await tx.domain.findUnique({
                  where: { id: references.domainId },
                })
              : null;
          if (
            !domain ||
            domain.customerId !== current.customer?.id ||
            domain.expiresAt?.toISOString() !== references.expiresAt ||
            domain.state !== 'REGISTERED'
          )
            suppressed = true;
        }
        if (
          key.data === 'client-urgent-support' ||
          key.data === 'admin-urgent-support'
        ) {
          const ticket =
            typeof references.ticketId === 'string'
              ? await tx.ticket.findUnique({
                  where: { id: references.ticketId },
                })
              : null;
          if (
            !ticket ||
            ticket.priority !== 'URGENT' ||
            (current.role === 'CUSTOMER' &&
              ticket.customerId !== current.customer?.id)
          )
            suppressed = true;
        }
        if (key.data === 'admin-payment-review') {
          const payment =
            typeof references.paymentId === 'string'
              ? await tx.payment.findUnique({
                  where: { id: references.paymentId },
                })
              : null;
          if (payment?.status !== 'PENDING') suppressed = true;
        }
        let destination = current.email;
        if (entry.channel === 'WHATSAPP') {
          if (this.whatsApp.key !== 'preview') suppressed = true;
          if (
            !definition.whatsApp ||
            current.notificationPreference?.whatsAppEnabled === false
          )
            suppressed = true;
          destination =
            normalizeNotificationPhone(
              current.customer?.phone,
              current.customer?.countryCode,
            ) ?? '';
          if (current.notificationPreference?.phoneCiphertext) {
            try {
              destination = new DeliveryTokenCipher(
                this.environment.CREDENTIAL_ENCRYPTION_KEY,
              ).decrypt(current.notificationPreference.phoneCiphertext);
            } catch {
              destination = '';
            }
          }
          if (!normalizeNotificationPhone(destination)) suppressed = true;
        } else if (entry.channel !== 'EMAIL' || definition.existingEmail)
          suppressed = true;
        if (
          record(entry.metadata).destinationFingerprint !==
          notificationDestinationFingerprint(
            destination,
            this.environment.CREDENTIAL_ENCRYPTION_KEY,
          )
        )
          suppressed = true;
        if (
          suppressed ||
          this.environment.NOTIFICATION_DELIVERY_MODE !== 'preview'
        ) {
          await tx.notificationEntry.update({
            where: { id: entry.id },
            data: {
              status: suppressed ? 'SUPPRESSED' : 'DISABLED',
              completedAt: new Date(),
            },
          });
          return;
        }
        const brandingSetting = await tx.setting.findUnique({
          where: { key: 'email.branding' },
          select: { value: true },
        });
        const parsedBranding = emailBrandingSettingsSchema.safeParse(
          brandingSetting?.value,
        );
        const branding = parsedBranding.success
          ? parsedBranding.data
          : {
              brandName: this.environment.EMAIL_BRAND_NAME,
              brandColor: this.environment.EMAIL_BRAND_COLOR,
              fromName: this.environment.EMAIL_FROM_NAME,
              fromAddress: this.environment.EMAIL_FROM_ADDRESS,
              replyToAddress: this.environment.EMAIL_REPLY_TO_ADDRESS ?? null,
            };
        const url = new URL(
          definition.path,
          this.environment.EMAIL_PUBLIC_WEB_URL,
        ).toString();
        const metadata = record(entry.metadata);
        const countLabels = {
          pendingOrders: 'Pending orders',
          overdueInvoices: 'Overdue invoices',
          failedOperations: 'Failed operations',
          expiringDomains: 'Expiring domains',
        };
        const counts =
          key.data === 'admin-daily-summary'
            ? Object.entries(countLabels)
                .map(
                  ([name, label]) =>
                    `${label}: ${typeof metadata[name] === 'number' && Number.isSafeInteger(metadata[name]) ? metadata[name] : 0}`,
                )
                .join('\n')
            : '';
        const text = `${branding.brandName}\n\n${definition.label}\n\n${definition.description}\n${counts}\nSign in to view details: ${url}\n\nLocal preview only. No message was delivered externally.`;
        const attemptCount = entry.attemptCount + 1;
        try {
          if (entry.channel === 'EMAIL') {
            const adapter = new PreviewEmailAdapter(this.environment);
            try {
              await adapter.send({
                templateKey: 'account-notification',
                recipientEmail: destination,
                subject: definition.label,
                text,
                html: `<div style="font-family:Arial,sans-serif;border-top:4px solid ${branding.brandColor};padding:20px"><p>${escapeHtml(text).replaceAll('\n', '<br>')}</p></div>`,
                fromAddress: branding.fromAddress,
                fromName: branding.fromName,
                ...(branding.replyToAddress
                  ? { replyToAddress: branding.replyToAddress }
                  : {}),
                messageId: `<notification-${entry.id}@webhost-billing.local>`,
              });
            } finally {
              await adapter.close();
            }
          } else {
            await this.whatsApp.send({
              id: entry.id,
              key: key.data,
              recipient: destination,
              text,
            });
          }
          await tx.notificationEntry.update({
            where: { id: entry.id },
            data: {
              status: 'PREVIEWED',
              attemptCount,
              completedAt: new Date(),
              failureCode: null,
            },
          });
        } catch {
          failed = true;
          await tx.notificationEntry.update({
            where: { id: entry.id },
            data: {
              attemptCount,
              status: attemptCount >= 5 ? 'FAILED' : 'QUEUED',
              failureCode: 'NOTIFICATION_PREVIEW_UNAVAILABLE',
              ...(attemptCount >= 5 ? { completedAt: new Date() } : {}),
            },
          });
        }
      },
      { timeout: 30000 },
    );
    if (failed)
      throw new BackgroundJobError(
        'TEMPORARY',
        'NOTIFICATION_PREVIEW_UNAVAILABLE',
        'Local notification preview is unavailable.',
      );
  }
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        char
      ] ?? char,
  );
}
