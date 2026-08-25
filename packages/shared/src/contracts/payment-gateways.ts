import { z } from 'zod';
import { minorUnitAmountSchema, moneySchema } from './money';

export const paymentGatewayProviderSchema = z
  .string()
  .trim()
  .regex(/^[a-z][a-z0-9-]{0,63}$/);

export const createPaymentSessionRequestSchema = z
  .object({
    invoiceId: z.uuid(),
    submissionKey: z.uuid(),
  })
  .strict();

export const paymentSessionSchema = z
  .object({
    paymentId: z.uuid(),
    invoiceId: z.uuid(),
    provider: paymentGatewayProviderSchema,
    providerSessionId: z.string().min(1).max(191),
    checkoutUrl: z.url(),
    amount: moneySchema,
    expiresAt: z.iso.datetime({ offset: true }),
    duplicate: z.boolean(),
  })
  .strict();

export const normalizedPaymentEventStatusSchema = z.enum([
  'PENDING',
  'SUCCEEDED',
  'FAILED',
]);

export const normalizedPaymentEventSchema = z
  .object({
    providerEventId: z.string().min(1).max(191),
    eventType: z.string().min(1).max(100),
    status: normalizedPaymentEventStatusSchema,
    merchantId: z.string().min(1).max(191),
    paymentId: z.uuid(),
    invoiceId: z.uuid(),
    amount: minorUnitAmountSchema.refine((value) => value !== '0', {
      message: 'Payment amount must be greater than zero',
    }),
    currency: z.string().regex(/^[A-Z]{3}$/),
    providerTransactionId: z.string().min(1).max(191).nullable(),
    occurredAt: z.iso.datetime({ offset: true }),
    failureReason: z.string().trim().min(1).max(500).nullable(),
  })
  .strict();

export const paymentWebhookResultSchema = z
  .object({
    accepted: z.literal(true),
    duplicate: z.boolean(),
    providerEventId: z.string().min(1).max(191),
    status: z.enum(['PROCESSED', 'IGNORED']),
  })
  .strict();

export type CreatePaymentSessionRequest = z.infer<
  typeof createPaymentSessionRequestSchema
>;
export type PaymentSession = z.infer<typeof paymentSessionSchema>;
export type NormalizedPaymentEventStatus = z.infer<
  typeof normalizedPaymentEventStatusSchema
>;
export type NormalizedPaymentEvent = z.infer<
  typeof normalizedPaymentEventSchema
>;
export type PaymentWebhookResult = z.infer<typeof paymentWebhookResultSchema>;
