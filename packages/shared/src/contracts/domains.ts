import { z } from 'zod';
import { invoiceStatusSchema } from './states';

export const domainNameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^(?!xn--)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.(com|net)$/);
const text = z.string().trim().min(1).max(160);
export const domainContactSchema = z
  .object({
    name: text,
    company: text,
    address: text,
    city: text,
    region: text,
    postalCode: text,
    country: z.string().regex(/^[A-Z]{2}$/),
    email: z.email().max(320),
    phoneCountryCode: z.string().regex(/^[1-9][0-9]{0,3}$/),
    phone: z.string().regex(/^[0-9]{5,15}$/),
  })
  .strict();
export const domainQuoteRequestSchema = z
  .object({
    offerId: z.uuid(),
    domainName: domainNameSchema,
    contact: domainContactSchema,
    agreement: z.literal('fictional-registration-v1'),
    consent: z.literal(true),
  })
  .strict();
export const domainPurchaseRequestSchema = z
  .object({
    quoteId: z.uuid(),
    submissionKey: z.uuid(),
  })
  .strict();
export const domainApprovalRequestSchema = z
  .object({
    confirmation: domainNameSchema,
    costCeiling: z.string().regex(/^[1-9][0-9]{0,14}$/),
    costCurrency: z.literal('USD'),
  })
  .strict();
export const fakeRegistrarSetupSchema = z
  .object({
    confirmation: z.literal('Enable simulated registrar'),
    sellingAmount: z.string().regex(/^[1-9][0-9]{0,14}$/),
  })
  .strict();
export const registrarToggleSchema = z
  .object({ enabled: z.boolean() })
  .strict();
export const domainStates = [
  'AWAITING_PAYMENT',
  'AWAITING_APPROVAL',
  'PENDING',
  'NEEDS_RECONCILIATION',
  'FAILED',
  'REGISTERED',
] as const;
export type DomainQuoteRequest = z.infer<typeof domainQuoteRequestSchema>;
export type DomainContact = z.infer<typeof domainContactSchema>;
export type DomainPurchaseRequest = z.infer<typeof domainPurchaseRequestSchema>;
export type DomainApprovalRequest = z.infer<typeof domainApprovalRequestSchema>;
const amount = z.string().regex(/^(0|[1-9][0-9]{0,18})$/);
const positiveAmount = z.string().regex(/^[1-9][0-9]{0,18}$/);
const fictionalNameservers = z.tuple([
  z.literal('ns1.example.test'),
  z.literal('ns2.example.test'),
]);
export const fakeRegistrarSettingsSchema = z
  .object({
    id: z.uuid(),
    brand: z.literal('StarGate/UK2 (resell.biz)'),
    mode: z.literal('Simulated'),
    enabled: z.boolean(),
    networkEnabled: z.literal(false),
    credentials: z.literal('No external credentials configured'),
  })
  .strict();
export const domainOfferSchema = z
  .object({
    id: z.uuid(),
    tld: z.enum(['com', 'net']),
    years: z.literal(1),
    sellingAmount: positiveAmount,
    currency: z.literal('BDT'),
    nameservers: fictionalNameservers,
    simulated: z.literal(true),
    costAmount: positiveAmount,
    costCurrency: z.literal('USD'),
    observedAt: z.iso.datetime(),
  })
  .strict();
export const domainQuoteSchema = z
  .object({
    id: z.uuid(),
    domainName: domainNameSchema,
    sellingAmount: positiveAmount,
    currency: z.literal('BDT'),
    costAmount: positiveAmount,
    costCurrency: z.literal('USD'),
    expiresAt: z.iso.datetime(),
    simulated: z.literal(true),
  })
  .strict();
export type FakeRegistrarSettings = z.infer<typeof fakeRegistrarSettingsSchema>;
export type DomainOffer = z.infer<typeof domainOfferSchema>;
export type DomainQuote = z.infer<typeof domainQuoteSchema>;
export const domainDetailSchema = z
  .object({
    id: z.uuid(),
    domainName: domainNameSchema,
    state: z.enum(domainStates),
    verification: z.enum(['Unknown', 'Pending', 'Verified']),
    expiresAt: z.iso.datetime().nullable(),
    simulated: z.literal(true),
    autoRenew: z.literal(false),
    registrar: z.literal('StarGate/UK2 (resell.biz)'),
    registrationYears: z.literal(1),
    requestedAt: z.iso.datetime(),
    sellingAmount: amount,
    financialAttention: z.boolean(),
    invoiceId: z.uuid(),
    invoiceStatus: invoiceStatusSchema,
    orderId: z.uuid(),
    balanceDue: amount,
    currency: z.literal('BDT'),
    nameservers: fictionalNameservers,
    agreement: z.literal('fictional-registration-v1'),
    customerId: z.uuid().optional(),
    accountId: z.uuid().optional(),
    costAmount: amount.optional(),
    costCurrency: z.literal('USD').optional(),
    contact: domainContactSchema.optional(),
    operationId: z.uuid().nullable().optional(),
    dispatchClaimed: z.boolean().optional(),
    evidence: z
      .array(
        z
          .object({
            code: z.string().regex(/^[A-Z_]{1,64}$/),
            createdAt: z.iso.datetime(),
          })
          .strict(),
      )
      .max(100)
      .optional(),
  })
  .strict();
export type DomainDetail = z.infer<typeof domainDetailSchema>;
