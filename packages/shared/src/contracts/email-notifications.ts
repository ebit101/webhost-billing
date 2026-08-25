import { z } from 'zod';

export const emailTemplateKeys = [
  'email-verification',
  'password-reset',
  'order-received',
  'order-approved',
  'payment-received',
  'invoice-created',
  'renewal-reminder',
  'overdue-notice',
  'service-provisioned',
  'service-suspended',
  'service-reactivated',
  'ticket-reply',
] as const;

export const emailTemplateKeySchema = z.enum(emailTemplateKeys);
export type EmailTemplateKey = z.infer<typeof emailTemplateKeySchema>;

export const emailOutboxEventTypes = [
  'AUTH_EMAIL_VERIFICATION_REQUESTED',
  'AUTH_PASSWORD_RESET_REQUESTED',
  'EMAIL_ORDER_RECEIVED',
  'EMAIL_ORDER_APPROVED',
  'EMAIL_PAYMENT_RECEIVED',
  'EMAIL_INVOICE_CREATED',
  'EMAIL_RENEWAL_REMINDER',
  'EMAIL_OVERDUE_NOTICE',
  'EMAIL_SERVICE_PROVISIONED',
  'EMAIL_SERVICE_SUSPENDED',
  'EMAIL_SERVICE_REACTIVATED',
  'EMAIL_TICKET_REPLY',
] as const;

export const emailOutboxEventTypeSchema = z.enum(emailOutboxEventTypes);
export type EmailOutboxEventType = z.infer<typeof emailOutboxEventTypeSchema>;

const basePayloadShape = { schemaVersion: z.literal(1).optional() } as const;
const uuidPayload = (key: string) =>
  z.object({ ...basePayloadShape, [key]: z.uuid() }).strict();

const authEmailPayloadSchema = z
  .object({
    ...basePayloadShape,
    recipientEmail: z.email().max(320),
    tokenRecordId: z.uuid(),
    purpose: z.enum(['EMAIL_VERIFICATION', 'PASSWORD_RESET']),
  })
  .strict();

const emailEventPayloadSchemas = {
  AUTH_EMAIL_VERIFICATION_REQUESTED: authEmailPayloadSchema,
  AUTH_PASSWORD_RESET_REQUESTED: authEmailPayloadSchema,
  EMAIL_ORDER_RECEIVED: uuidPayload('orderId'),
  EMAIL_ORDER_APPROVED: uuidPayload('orderId'),
  EMAIL_PAYMENT_RECEIVED: z
    .object({
      ...basePayloadShape,
      paymentId: z.uuid(),
      invoiceId: z.uuid(),
    })
    .strict(),
  EMAIL_INVOICE_CREATED: uuidPayload('invoiceId'),
  EMAIL_RENEWAL_REMINDER: z
    .object({
      ...basePayloadShape,
      invoiceId: z.uuid(),
      reminderNumber: z.number().int().min(1).max(20),
    })
    .strict(),
  EMAIL_OVERDUE_NOTICE: uuidPayload('invoiceId'),
  EMAIL_SERVICE_PROVISIONED: uuidPayload('serviceId'),
  EMAIL_SERVICE_SUSPENDED: uuidPayload('serviceId'),
  EMAIL_SERVICE_REACTIVATED: uuidPayload('serviceId'),
  EMAIL_TICKET_REPLY: z
    .object({
      ...basePayloadShape,
      ticketId: z.uuid(),
      messageId: z.uuid(),
    })
    .strict(),
} satisfies Record<EmailOutboxEventType, z.ZodType>;

export type EmailEventPayload = Record<string, unknown>;

export function parseEmailEventPayload(
  eventType: EmailOutboxEventType,
  payload: unknown,
): EmailEventPayload {
  return emailEventPayloadSchemas[eventType].parse(
    payload,
  ) as EmailEventPayload;
}

export const emailDeliveryStatusSchema = z.enum([
  'QUEUED',
  'SENDING',
  'SENT',
  'FAILED',
]);

export const emailAttemptStatusSchema = z.enum([
  'STARTED',
  'SENT',
  'FAILED',
  'INCONSISTENT',
]);

export const emailAttemptSummarySchema = z.object({
  id: z.uuid(),
  attemptNumber: z.number().int().positive(),
  status: emailAttemptStatusSchema,
  provider: z.string().min(1).max(64),
  failureKind: z.enum(['TEMPORARY', 'PERMANENT', 'INCONSISTENT']).nullable(),
  failureCode: z.string().max(80).nullable(),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable(),
});

export const emailLogSummarySchema = z.object({
  id: z.uuid(),
  // Delivery history can outlive the template catalog. Keep legacy template
  // identifiers visible to administrators instead of making the entire log
  // endpoint fail when a template is retired or renamed.
  templateKey: z.string().min(1).max(100),
  recipientEmail: z.email().max(320),
  subject: z.string().min(1).max(255),
  status: emailDeliveryStatusSchema,
  provider: z.string().max(64).nullable(),
  attemptCount: z.number().int().nonnegative(),
  queuedAt: z.string().datetime(),
  sentAt: z.string().datetime().nullable(),
  failedAt: z.string().datetime().nullable(),
  attempts: z.array(emailAttemptSummarySchema),
});

export type EmailLogSummary = z.infer<typeof emailLogSummarySchema>;
