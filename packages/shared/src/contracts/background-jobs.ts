import { z } from 'zod';

export const backgroundQueueNames = [
  'emails',
  'hosting-provisioning',
  'hosting-suspension',
  'hosting-unsuspension',
  'hosting-status-reconciliation',
  'payment-reconciliation',
  'renewal-invoice-generation',
] as const;

export const backgroundQueueNameSchema = z.enum(backgroundQueueNames);
export type BackgroundQueueName = z.infer<typeof backgroundQueueNameSchema>;
export const backgroundJobIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,191}$/);

export const backgroundFailureKindSchema = z.enum([
  'TEMPORARY',
  'PERMANENT',
  'INCONSISTENT',
]);
export type BackgroundFailureKind = z.infer<typeof backgroundFailureKindSchema>;

export const backgroundJobDataSchema = z
  .object({
    schemaVersion: z.literal(1),
    outboxEventId: z.uuid(),
    aggregateType: z.string().regex(/^[A-Z][A-Z0-9_]{0,79}$/),
    aggregateId: z.uuid(),
    eventType: z.string().regex(/^[A-Z][A-Z0-9_]{0,119}$/),
    correlationId: z.uuid(),
    failureKind: backgroundFailureKindSchema.optional(),
    failureCode: z
      .string()
      .regex(/^[A-Z][A-Z0-9_]{0,79}$/)
      .optional(),
    manualRetryAllowed: z.boolean().optional(),
  })
  .strict();
export type BackgroundJobData = z.infer<typeof backgroundJobDataSchema>;

export interface BackgroundQueuePolicy {
  attempts: number;
  backoffMilliseconds: number;
}

export const backgroundQueuePolicies: Readonly<
  Record<BackgroundQueueName, BackgroundQueuePolicy>
> = {
  emails: { attempts: 5, backoffMilliseconds: 2_000 },
  'hosting-provisioning': { attempts: 1, backoffMilliseconds: 0 },
  'hosting-suspension': { attempts: 1, backoffMilliseconds: 0 },
  'hosting-unsuspension': { attempts: 1, backoffMilliseconds: 0 },
  'hosting-status-reconciliation': {
    attempts: 4,
    backoffMilliseconds: 5_000,
  },
  'payment-reconciliation': {
    attempts: 4,
    backoffMilliseconds: 5_000,
  },
  'renewal-invoice-generation': {
    attempts: 3,
    backoffMilliseconds: 3_000,
  },
};

export interface OutboxQueueRoute {
  queueName: BackgroundQueueName;
  jobName: string;
}

const exactOutboxRoutes: Readonly<Record<string, OutboxQueueRoute>> = {
  AUTH_EMAIL_VERIFICATION_REQUESTED: {
    queueName: 'emails',
    jobName: 'send-auth-email',
  },
  AUTH_PASSWORD_RESET_REQUESTED: {
    queueName: 'emails',
    jobName: 'send-auth-email',
  },
  EMAIL_ORDER_RECEIVED: {
    queueName: 'emails',
    jobName: 'send-order-email',
  },
  EMAIL_ORDER_APPROVED: {
    queueName: 'emails',
    jobName: 'send-order-email',
  },
  EMAIL_PAYMENT_RECEIVED: {
    queueName: 'emails',
    jobName: 'send-payment-email',
  },
  EMAIL_INVOICE_CREATED: {
    queueName: 'emails',
    jobName: 'send-invoice-email',
  },
  EMAIL_RENEWAL_REMINDER: {
    queueName: 'emails',
    jobName: 'send-invoice-email',
  },
  EMAIL_OVERDUE_NOTICE: {
    queueName: 'emails',
    jobName: 'send-invoice-email',
  },
  EMAIL_SERVICE_PROVISIONED: {
    queueName: 'emails',
    jobName: 'send-service-email',
  },
  EMAIL_SERVICE_SUSPENDED: {
    queueName: 'emails',
    jobName: 'send-service-email',
  },
  EMAIL_SERVICE_REACTIVATED: {
    queueName: 'emails',
    jobName: 'send-service-email',
  },
  EMAIL_TICKET_REPLY: {
    queueName: 'emails',
    jobName: 'send-ticket-email',
  },
  GATEWAY_PAYMENT_SUCCEEDED: {
    queueName: 'payment-reconciliation',
    jobName: 'reconcile-payment-follow-up',
  },
  GATEWAY_PAYMENT_FAILED: {
    queueName: 'payment-reconciliation',
    jobName: 'reconcile-payment-follow-up',
  },
  HOSTING_PROVISIONING_REQUESTED: {
    queueName: 'hosting-provisioning',
    jobName: 'provision-hosting',
  },
  HOSTING_SUSPENSION_REQUESTED: {
    queueName: 'hosting-suspension',
    jobName: 'suspend-hosting',
  },
  HOSTING_UNSUSPENSION_REQUESTED: {
    queueName: 'hosting-unsuspension',
    jobName: 'unsuspend-hosting',
  },
  HOSTING_STATUS_RECONCILIATION_REQUESTED: {
    queueName: 'hosting-status-reconciliation',
    jobName: 'reconcile-hosting-status',
  },
  PAYMENT_RECONCILIATION_REQUESTED: {
    queueName: 'payment-reconciliation',
    jobName: 'reconcile-payment',
  },
  RENEWAL_INVOICE_GENERATION_REQUESTED: {
    queueName: 'renewal-invoice-generation',
    jobName: 'generate-renewal-invoice',
  },
  RENEWAL_PAYMENT_COMPLETED: {
    queueName: 'renewal-invoice-generation',
    jobName: 'apply-renewal-payment',
  },
};

export function routeOutboxEvent(eventType: string): OutboxQueueRoute | null {
  return exactOutboxRoutes[eventType] ?? null;
}

export const backgroundJobStateSchema = z.enum([
  'waiting',
  'active',
  'delayed',
  'completed',
  'failed',
  'paused',
  'prioritized',
  'waiting-children',
  'unknown',
]);

export const failedBackgroundJobSchema = z.object({
  source: z.literal('QUEUE'),
  queueName: backgroundQueueNameSchema,
  jobId: backgroundJobIdSchema,
  jobName: z.string().min(1).max(120),
  state: backgroundJobStateSchema,
  correlationId: z.uuid().nullable(),
  outboxEventId: z.uuid().nullable(),
  attemptsMade: z.number().int().nonnegative(),
  maxAttempts: z.number().int().positive(),
  failureKind: backgroundFailureKindSchema.nullable(),
  failureCode: z.string().max(80).nullable(),
  manualRetryAllowed: z.boolean(),
  failedAt: z.string().datetime().nullable(),
});
export type FailedBackgroundJob = z.infer<typeof failedBackgroundJobSchema>;

export const failedOutboxEventSchema = z.object({
  source: z.literal('OUTBOX'),
  outboxEventId: z.uuid(),
  eventType: z.string().min(1).max(120),
  aggregateType: z.string().min(1).max(80),
  aggregateId: z.uuid(),
  attemptCount: z.number().int().nonnegative(),
  manualRetryAllowed: z.boolean(),
  failedAt: z.string().datetime(),
});
export type FailedOutboxEvent = z.infer<typeof failedOutboxEventSchema>;

export const backgroundFailureListSchema = z.object({
  queueJobs: z.array(failedBackgroundJobSchema),
  outboxEvents: z.array(failedOutboxEventSchema),
});
export type BackgroundFailureList = z.infer<typeof backgroundFailureListSchema>;

export const retryBackgroundJobRequestSchema = z
  .object({ confirmation: z.literal('RETRY_JOB') })
  .strict();
export type RetryBackgroundJobRequest = z.infer<
  typeof retryBackgroundJobRequestSchema
>;

export const retryOutboxEventRequestSchema = z
  .object({ confirmation: z.literal('RETRY_OUTBOX') })
  .strict();
export type RetryOutboxEventRequest = z.infer<
  typeof retryOutboxEventRequestSchema
>;
