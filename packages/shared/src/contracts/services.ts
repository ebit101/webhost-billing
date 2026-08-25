import { z } from 'zod';
import { moneySchema } from './money';
import { requestedDomainSchema } from './orders';
import { paginationQuerySchema } from './pagination';
import { hostingBillingPeriodSchema, serviceStatusSchema } from './states';

export const serverStatusSchema = z.enum(['ACTIVE', 'MAINTENANCE', 'DISABLED']);

export const serviceServerSchema = z
  .object({
    id: z.uuid(),
    name: z.string().min(1).max(120),
    hostname: z.string().min(1).max(253),
    status: serverStatusSchema,
    adapterKey: z.string().min(1).max(64),
  })
  .strict();

export const serviceSchema = z
  .object({
    id: z.uuid(),
    customerId: z.uuid(),
    customerName: z.string().min(1).max(200),
    customerEmail: z.email().max(320),
    orderId: z.uuid().nullable(),
    orderNumber: z.string().min(1).max(32).nullable(),
    orderItemId: z.uuid().nullable(),
    productId: z.uuid(),
    productPriceId: z.uuid(),
    productName: z.string().min(1).max(160),
    productDescription: z.string().max(10_000).nullable(),
    server: serviceServerSchema,
    status: serviceStatusSchema,
    domain: requestedDomainSchema.nullable(),
    controlPanelUsername: z.string().min(1).max(64).nullable(),
    externalAccountId: z.string().min(1).max(191).nullable(),
    billingPeriod: hostingBillingPeriodSchema,
    recurringAmount: moneySchema,
    startedAt: z.iso.datetime({ offset: true }),
    nextDueAt: z.iso.datetime({ offset: true }),
    activatedAt: z.iso.datetime({ offset: true }).nullable(),
    suspendedAt: z.iso.datetime({ offset: true }).nullable(),
    suspensionReason: z.string().min(1).max(1_000).nullable(),
    provisioningFailureReason: z.string().min(1).max(1_000).nullable(),
    cancelledAt: z.iso.datetime({ offset: true }).nullable(),
    cancellationReason: z.string().min(1).max(1_000).nullable(),
    terminatedAt: z.iso.datetime({ offset: true }).nullable(),
    terminationReason: z.string().min(1).max(1_000).nullable(),
    createdAt: z.iso.datetime({ offset: true }),
    updatedAt: z.iso.datetime({ offset: true }),
  })
  .strict();

export const serviceListQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().max(200).optional(),
  status: serviceStatusSchema.optional(),
  customerId: z.uuid().optional(),
  serverId: z.uuid().optional(),
});

export const createServiceRequestSchema = z
  .object({
    orderItemId: z.uuid(),
    serverId: z.uuid(),
  })
  .strict();

const transitionReasonSchema = z.string().trim().min(1).max(1_000);

export const transitionServiceRequestSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('PROVISIONING') }).strict(),
  z
    .object({
      status: z.literal('ACTIVE'),
      externalAccountId: z.string().trim().min(1).max(191).optional(),
      controlPanelUsername: z
        .string()
        .trim()
        .regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/)
        .optional(),
    })
    .strict(),
  z
    .object({ status: z.literal('SUSPENDED'), reason: transitionReasonSchema })
    .strict(),
  z
    .object({
      status: z.literal('PROVISION_FAILED'),
      reason: transitionReasonSchema,
    })
    .strict(),
  z
    .object({ status: z.literal('CANCELLED'), reason: transitionReasonSchema })
    .strict(),
  z
    .object({
      status: z.literal('TERMINATED'),
      reason: transitionReasonSchema,
      confirmation: z.literal('TERMINATE'),
    })
    .strict(),
]);

export const eligibleServiceOrderItemSchema = z
  .object({
    orderItemId: z.uuid(),
    orderId: z.uuid(),
    orderNumber: z.string().min(1).max(32),
    customerId: z.uuid(),
    customerName: z.string().min(1).max(200),
    productName: z.string().min(1).max(160),
    domain: requestedDomainSchema,
    billingPeriod: hostingBillingPeriodSchema,
    recurringAmount: moneySchema,
  })
  .strict();

export const serviceSetupOptionsSchema = z
  .object({
    servers: z.array(serviceServerSchema),
    orderItems: z.array(eligibleServiceOrderItemSchema),
  })
  .strict();

export const serviceCreationResultSchema = z
  .object({ service: serviceSchema, duplicate: z.boolean() })
  .strict();

export type ServerStatus = z.infer<typeof serverStatusSchema>;
export type ServiceServer = z.infer<typeof serviceServerSchema>;
export type Service = z.infer<typeof serviceSchema>;
export type ServiceListQuery = z.infer<typeof serviceListQuerySchema>;
export type CreateServiceRequest = z.infer<typeof createServiceRequestSchema>;
export type TransitionServiceRequest = z.infer<
  typeof transitionServiceRequestSchema
>;
export type EligibleServiceOrderItem = z.infer<
  typeof eligibleServiceOrderItemSchema
>;
export type ServiceSetupOptions = z.infer<typeof serviceSetupOptionsSchema>;
export type ServiceCreationResult = z.infer<typeof serviceCreationResultSchema>;
