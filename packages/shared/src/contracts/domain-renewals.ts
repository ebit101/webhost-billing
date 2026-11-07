import { z } from 'zod';
import { domainNameSchema } from './domains';
import { registrarDomainFactsSchema } from './domain-facts';
import { domainRenewalProductAttributionSchema } from './invoice-product-attribution';

export const domainRenewalReferenceSchema = registrarDomainFactsSchema
  .pick({
    accountId: true,
    customerId: true,
    domainName: true,
    providerOrderId: true,
  })
  .extend({
    previousExpiry: z.iso.datetime(),
    targetExpiry: z.iso.datetime(),
    years: z.literal(1),
  })
  .strict();

export const domainRenewalTermsSchema = z
  .object({
    schemaVersion: z.literal(1),
    years: z.literal(1),
    currency: z.literal('BDT'),
    amount: z.string().regex(/^[1-9][0-9]{0,14}$/),
    catalogueRevision: z.number().int().positive(),
    bindingHash: z.string().regex(/^[a-f0-9]{64}$/),
    productAttribution: domainRenewalProductAttributionSchema.optional(),
  })
  .strict();
export const domainRenewalPreferenceRequestSchema = z
  .object({
    confirmation: domainNameSchema,
    expectedRevision: z.number().int().nonnegative(),
    enabled: z.boolean(),
  })
  .strict();
export const domainRenewalConfigureRequestSchema =
  domainRenewalPreferenceRequestSchema
    .extend({
      years: z.literal(1),
      sellingAmount: z.string().regex(/^[1-9][0-9]{0,14}$/),
      catalogueRevision: z.number().int().positive(),
      ordinaryRenewalConfirmed: z.literal(true),
      reason: z.string().trim().min(1).max(1000),
    })
    .strict();
export const domainRenewalExecutionRequestSchema = z
  .object({
    submissionKey: z.uuid(),
    invoiceId: z.uuid(),
    confirmation: domainNameSchema,
    costCeiling: z.string().regex(/^[1-9][0-9]{0,14}$/),
    costCurrency: z.literal('USD'),
    years: z.literal(1),
    approved: z.literal(true),
    reason: z.string().trim().min(1).max(1000),
  })
  .strict();
export const domainRenewalReconcileRequestSchema = z
  .object({
    submissionKey: z.uuid(),
    confirmation: domainNameSchema,
    reason: z.string().trim().min(1).max(1000),
  })
  .strict();
export const domainRenewalExecutionSchema = z
  .object({
    id: z.uuid(),
    attempt: z.number().int().positive(),
    status: z.enum([
      'QUEUED',
      'RUNNING',
      'REJECTED',
      'NEEDS_RECONCILIATION',
      'SUCCEEDED',
    ]),
    code: z
      .string()
      .regex(/^[A-Z_]+$/)
      .nullable(),
    submittedAt: z.iso.datetime().nullable(),
    completedAt: z.iso.datetime().nullable(),
    expiryAfter: z.iso.datetime().nullable(),
    financialReviewRequired: z.boolean(),
  })
  .strict();
export const domainRenewalViewSchema = z
  .object({
    domainId: z.uuid(),
    enabled: z.boolean(),
    revision: z.number().int().nonnegative(),
    terms: domainRenewalTermsSchema
      .omit({ bindingHash: true, productAttribution: true })
      .nullable(),
    suggestedAmount: z.string().nullable(),
    catalogueRevision: z.number().int().nullable(),
    reviewCode: z
      .string()
      .regex(/^[A-Z_]+$/)
      .nullable(),
    canConfigure: z.boolean(),
    canChangePreference: z.boolean(),
    invoice: z
      .object({
        id: z.uuid(),
        invoiceNumber: z.string(),
        status: z.string(),
        amount: z.string(),
        balanceDue: z.string(),
        currency: z.literal('BDT'),
        dueAt: z.iso.datetime(),
        termStart: z.iso.datetime(),
        termEnd: z.iso.datetime(),
      })
      .strict()
      .nullable(),
    externalDispatchEnabled: z.boolean(),
    execution: domainRenewalExecutionSchema.nullable().default(null),
    canApprove: z.boolean().default(false),
    canReconcile: z.boolean().default(false),
  })
  .strict();
export type DomainRenewalView = z.infer<typeof domainRenewalViewSchema>;
