import { z } from 'zod';
import { domainNameSchema } from './domains';

export const registrarDomainFactsSchema = z
  .object({
    accountId: z.uuid(),
    customerId: z.uuid(),
    domainName: domainNameSchema,
    providerOrderId: z.string().min(1).max(64),
    observedAt: z.iso.datetime(),
    expiresAt: z.iso.datetime(),
    status: z.enum(['ACTIVE', 'EXPIRED', 'SUSPENDED', 'PENDING', 'UNKNOWN']),
    renewalEligibility: z.enum(['ELIGIBLE', 'INELIGIBLE', 'UNKNOWN']),
    registrarAutoRenew: z.boolean().nullable(),
    simulated: z.boolean(),
  })
  .strict();
export type RegistrarDomainFacts = z.infer<typeof registrarDomainFactsSchema>;
export const domainFactSyncRequestSchema = z
  .object({ submissionKey: z.uuid(), confirmation: domainNameSchema })
  .strict();
export const domainFactReviewRequestSchema = z
  .object({
    confirmation: domainNameSchema,
    acknowledged: z.literal(true),
    reason: z.string().trim().min(1).max(1000),
  })
  .strict();
export const domainFactSyncSchema = z
  .object({
    domainId: z.uuid(),
    attemptId: z.uuid().nullable(),
    outcome: z.enum([
      'NOT_CHECKED',
      'RUNNING',
      'SUCCEEDED',
      'REVIEW_REQUIRED',
      'UNAVAILABLE',
    ]),
    code: z
      .string()
      .regex(/^[A-Z_]{1,64}$/)
      .nullable(),
    lastAttemptAt: z.iso.datetime().nullable(),
    lastSuccessAt: z.iso.datetime().nullable(),
    observedAt: z.iso.datetime().nullable(),
    expiresAt: z.iso.datetime().nullable(),
    providerStatus: z
      .enum(['ACTIVE', 'EXPIRED', 'SUSPENDED', 'PENDING', 'UNKNOWN'])
      .nullable(),
    renewalEligibility: z.enum(['ELIGIBLE', 'INELIGIBLE', 'UNKNOWN']),
    registrarAutoRenew: z.boolean().nullable(),
    simulated: z.boolean(),
    freshness: z.enum(['NOT_CHECKED', 'FRESH', 'STALE']),
    reviewRequired: z.boolean(),
    candidateExpiry: z.iso.datetime().nullable(),
    canReview: z.boolean(),
  })
  .strict();
export type DomainFactSync = z.infer<typeof domainFactSyncSchema>;
