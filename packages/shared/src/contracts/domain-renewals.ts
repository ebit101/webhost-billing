import { z } from 'zod';
import { domainNameSchema } from './domains';

export const domainRenewalTermsSchema = z
  .object({
    schemaVersion: z.literal(1),
    years: z.literal(1),
    currency: z.literal('BDT'),
    amount: z.string().regex(/^[1-9][0-9]{0,14}$/),
    catalogueRevision: z.number().int().positive(),
    bindingHash: z.string().regex(/^[a-f0-9]{64}$/),
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
export const domainRenewalViewSchema = z
  .object({
    domainId: z.uuid(),
    enabled: z.boolean(),
    revision: z.number().int().nonnegative(),
    terms: domainRenewalTermsSchema.omit({ bindingHash: true }).nullable(),
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
    externalDispatchEnabled: z.literal(false),
  })
  .strict();
export type DomainRenewalView = z.infer<typeof domainRenewalViewSchema>;
