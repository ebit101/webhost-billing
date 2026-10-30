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
    addressLine2: z.string().trim().max(64).optional(),
    city: text,
    region: text,
    postalCode: text,
    country: z.string().regex(/^[A-Z]{2}$/),
    email: z.email().max(320),
    phoneCountryCode: z.string().regex(/^[1-9][0-9]{0,3}$/),
    phone: z.string().regex(/^[0-9]{5,15}$/),
    publishOrganization: z.boolean().optional(),
  })
  .strict();
export const domainQuoteRequestSchema = z
  .object({
    offerId: z.uuid(),
    domainName: domainNameSchema,
    contact: domainContactSchema,
    agreement: z.enum([
      'fictional-registration-v1',
      'resellbiz-registration-v1',
    ]),
    consent: z.literal(true),
    customerPolicyConsent: z.literal(true).optional(),
    selectionConsentRevision: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
  })
  .strict();
export const domainPurchaseRequestSchema = z
  .object({
    quoteId: z.uuid(),
    submissionKey: z.uuid(),
  })
  .strict();
export const adminDomainQuoteRequestSchema = domainQuoteRequestSchema
  .omit({ consent: true })
  .extend({
    customerId: z.uuid(),
    offlineConsent: z
      .object({
        method: z.enum(['PHONE', 'IN_PERSON', 'WRITTEN']),
        reference: z.string().trim().min(3).max(160),
        consentedAt: z.iso.datetime(),
        attestation: z.literal(true),
      })
      .strict(),
  })
  .strict();
export const adminDomainPurchaseRequestSchema = domainPurchaseRequestSchema
  .extend({ customerId: z.uuid() })
  .strict();
export type AdminDomainQuoteRequest = z.infer<
  typeof adminDomainQuoteRequestSchema
>;
export type AdminDomainPurchaseRequest = z.infer<
  typeof adminDomainPurchaseRequestSchema
>;
export const adminOfflineConsentEvidenceSchema = z
  .object({
    method: z.enum(['PHONE', 'IN_PERSON', 'WRITTEN']),
    reference: z.string().min(3).max(160),
    consentedAt: z.iso.datetime(),
    recordedAt: z.iso.datetime(),
    recordedBy: z.uuid(),
  })
  .strict();
export const domainApprovalRequestSchema = z
  .object({
    confirmation: domainNameSchema,
    costCeiling: z.string().regex(/^[1-9][0-9]{0,14}$/),
    costCurrency: z.literal('USD'),
    acceptPriceChangeRisk: z.literal(true).optional(),
    registrarAccountId: z.uuid().optional(),
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
// Ordinary Contact constraints; historical simulated snapshots remain readable.
export const resellbizContactSchema = domainContactSchema.extend({
  address: text.max(64),
  city: text.max(64),
  region: text.max(64),
  postalCode: text.max(10),
  phoneCountryCode: z.string().regex(/^[1-9][0-9]{0,2}$/),
  phone: z.string().regex(/^[0-9]{4,12}$/),
});
export type DomainPurchaseRequest = z.infer<typeof domainPurchaseRequestSchema>;
export type DomainApprovalRequest = z.infer<typeof domainApprovalRequestSchema>;
const amount = z.string().regex(/^(0|[1-9][0-9]{0,18})$/);
const positiveAmount = z.string().regex(/^[1-9][0-9]{0,18}$/);
const fictionalNameservers = z.tuple([
  z.literal('ns1.example.test'),
  z.literal('ns2.example.test'),
]);
export const registrarNameserversSchema = z
  .array(
    z
      .string()
      .trim()
      .toLowerCase()
      .max(253)
      .regex(/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/)
      .refine(
        (value) =>
          !value.endsWith('.test') &&
          !value.endsWith('.localhost') &&
          !value.endsWith('.invalid') &&
          !value.endsWith('.example'),
      ),
  )
  .min(2)
  .max(5)
  .refine((values) => new Set(values).size === values.length);
export const resellbizCredentialSchema = z
  .object({
    resellerId: z.string().regex(/^[1-9][0-9]{0,18}$/),
    apiKey: z.string().regex(/^[a-zA-Z0-9]{16,512}$/),
  })
  .strict();
export const resellbizSetupSchema = resellbizCredentialSchema
  .extend({
    confirmation: z.literal('Configure live resell.biz'),
    sellingAmount: z.string().regex(/^[1-9][0-9]{0,14}$/),
    nameservers: registrarNameserversSchema,
    agreementUrl: z
      .url()
      .max(1000)
      .refine((value) => {
        const url = new URL(value);
        return url.protocol === 'https:' && !url.username && !url.password;
      }),
    confirmNativeUsdCosts: z.literal(true),
    customerTermsUrl: z
      .url()
      .max(1000)
      .refine((value) => {
        const url = new URL(value);
        return url.protocol === 'https:' && !url.username && !url.password;
      }),
    customerPrivacyUrl: z
      .url()
      .max(1000)
      .refine((value) => {
        const url = new URL(value);
        return url.protocol === 'https:' && !url.username && !url.password;
      }),
  })
  .strict();
export const resellbizMappingSchema = z
  .object({
    remoteCustomerId: z.string().regex(/^[1-9][0-9]{0,18}$/),
    remoteContactId: z.string().regex(/^[1-9][0-9]{0,18}$/),
  })
  .strict();
export const resellbizConfigurationSchema = z
  .object({
    resellerId: resellbizCredentialSchema.shape.resellerId,
    nameservers: registrarNameserversSchema,
    agreementUrl: resellbizSetupSchema.shape.agreementUrl,
    confirmNativeUsdCosts: z.literal(true),
    customerTermsUrl: resellbizSetupSchema.shape.customerTermsUrl,
    customerPrivacyUrl: resellbizSetupSchema.shape.customerPrivacyUrl,
  })
  .strict();
export const resellbizSettingsSchema = z
  .object({
    id: z.uuid(),
    enabled: z.boolean(),
    networkEnabled: z.boolean(),
    mode: z.literal('Live'),
    maskedResellerId: z.string().max(30),
    credentialVersion: z.number().int().positive(),
    agreementUrl: resellbizSetupSchema.shape.agreementUrl,
    customerTermsUrl: resellbizSetupSchema.shape.customerTermsUrl,
    customerPrivacyUrl: resellbizSetupSchema.shape.customerPrivacyUrl,
    nameservers: registrarNameserversSchema,
    sellingAmount: z.string().regex(/^[1-9][0-9]{0,18}$/),
  })
  .strict();
export type ResellbizSetup = z.infer<typeof resellbizSetupSchema>;
export type ResellbizSettings = z.infer<typeof resellbizSettingsSchema>;
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
    nameservers: z.union([fictionalNameservers, registrarNameserversSchema]),
    simulated: z.boolean(),
    agreementUrl: resellbizSetupSchema.shape.agreementUrl.optional(),
    customerTermsUrl: resellbizSetupSchema.shape.customerTermsUrl.optional(),
    customerPrivacyUrl:
      resellbizSetupSchema.shape.customerPrivacyUrl.optional(),
    costAmount: positiveAmount.optional(),
    costCurrency: z.literal('USD').optional(),
    observedAt: z.iso.datetime().optional(),
    eligibleRegistrars: z
      .array(
        z.object({ id: z.uuid(), name: z.string().min(1).max(100) }).strict(),
      )
      .max(32)
      .optional(),
    featured: z.boolean().optional(),
    selectionConsentRevision: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
  })
  .strict();
export const domainQuoteSchema = z
  .object({
    id: z.uuid(),
    domainName: domainNameSchema,
    sellingAmount: positiveAmount,
    currency: z.literal('BDT'),
    costAmount: positiveAmount.optional(),
    costCurrency: z.literal('USD').optional(),
    expiresAt: z.iso.datetime(),
    simulated: z.boolean(),
  })
  .strict()
  .refine(
    (quote) =>
      !quote.simulated || Boolean(quote.costAmount && quote.costCurrency),
    { message: 'Simulated cost evidence is required' },
  );
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
    simulated: z.boolean(),
    autoRenew: z.literal(false),
    registrar: z.string().min(1).max(100),
    origin: z.enum(['REGISTRATION', 'EXISTING']).optional(),
    ownershipVerifiedAt: z.iso.datetime().optional(),
    billingOrder: z
      .object({
        orderId: z.uuid(),
        invoiceId: z.uuid(),
        invoiceStatus: invoiceStatusSchema,
        sellingAmount: amount,
        balanceDue: amount,
        currency: z.literal('BDT'),
        billingPeriod: z.literal('ANNUAL'),
      })
      .strict()
      .optional(),
    registrationYears: z.literal(1).nullable(),
    requestedAt: z.iso.datetime(),
    sellingAmount: amount.nullable(),
    financialAttention: z.boolean(),
    invoiceId: z.uuid().nullable(),
    invoiceStatus: invoiceStatusSchema.nullable(),
    orderId: z.uuid().nullable(),
    balanceDue: amount.nullable(),
    currency: z.literal('BDT'),
    nameservers: z.union([fictionalNameservers, registrarNameserversSchema]),
    agreement: z.enum([
      'fictional-registration-v1',
      'resellbiz-registration-v1',
      'existing-domain-link-v1',
    ]),
    agreementUrl: resellbizSetupSchema.shape.agreementUrl.optional(),
    contactMappingVerified: z.boolean().optional(),
    customerId: z.uuid().optional(),
    accountId: z.uuid().optional(),
    costAmount: amount.optional(),
    costCurrency: z.literal('USD').optional(),
    contact: domainContactSchema.optional(),
    offlineConsent: adminOfflineConsentEvidenceSchema.optional(),
    operationId: z.uuid().nullable().optional(),
    dispatchClaimed: z.boolean().optional(),
    renewalSellingAmount: positiveAmount.nullable().optional(),
    renewalCatalogueRevision: z.number().int().positive().optional(),
    selectedRegistrarId: z.uuid().nullable().optional(),
    eligibleRegistrars: z
      .array(
        z
          .object({
            id: z.uuid(),
            name: z.string().min(1).max(100),
            isDefault: z.boolean(),
          })
          .strict(),
      )
      .max(32)
      .optional(),
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
  .strict()
  .superRefine((value, context) => {
    const linked = value.origin === 'EXISTING';
    if (value.billingOrder && !linked)
      context.addIssue({
        code: 'custom',
        message: 'Existing-domain billing requires a linked domain',
      });
    const noBilling =
      value.invoiceId === null &&
      value.invoiceStatus === null &&
      value.orderId === null &&
      value.balanceDue === null &&
      value.sellingAmount === null &&
      value.registrationYears === null;
    const registrationBilling =
      value.invoiceId !== null &&
      value.invoiceStatus !== null &&
      value.orderId !== null &&
      value.balanceDue !== null &&
      value.sellingAmount !== null &&
      value.registrationYears === 1;
    if (
      linked
        ? !noBilling ||
          !value.ownershipVerifiedAt ||
          value.simulated ||
          !registrarNameserversSchema.safeParse(value.nameservers).success ||
          value.agreement !== 'existing-domain-link-v1' ||
          value.state !== 'REGISTERED'
        : !registrationBilling ||
          value.agreement === 'existing-domain-link-v1' ||
          value.ownershipVerifiedAt !== undefined
    )
      context.addIssue({
        code: 'custom',
        message: 'Domain origin and billing evidence do not match',
      });
  });
export type DomainDetail = z.infer<typeof domainDetailSchema>;

export const existingDomainLinkRequestSchema = z
  .object({
    customerId: z.uuid(),
    registrarAccountId: z.uuid(),
    domainName: domainNameSchema.refine((value) => value.endsWith('.com')),
    confirmation: domainNameSchema,
    submissionKey: z.uuid(),
  })
  .strict()
  .refine((value) => value.confirmation === value.domainName, {
    message: 'Confirm the exact domain name',
    path: ['confirmation'],
  });
export type ExistingDomainLinkRequest = z.infer<
  typeof existingDomainLinkRequestSchema
>;

// Encrypted at rest, never serialized as customer-facing provider identity.
export const existingDomainLinkEvidenceSchema = z
  .object({
    remoteCustomerId: z.string().regex(/^[1-9][0-9]{0,18}$/),
    remoteContactId: z.string().regex(/^[1-9][0-9]{0,18}$/),
    contact: resellbizContactSchema,
    nameservers: registrarNameserversSchema,
  })
  .strict();

export const domainActionRequestSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('NAMESERVERS'),
      nameservers: registrarNameserversSchema,
    })
    .strict(),
  z.object({ kind: z.literal('LOCK'), locked: z.boolean() }).strict(),
  z
    .object({
      kind: z.literal('CONTACT'),
      contact: resellbizContactSchema,
      consent: z.literal(true),
      acceptRegistrantChange: z.literal(true),
    })
    .strict(),
  z
    .object({
      kind: z.literal('RENEW'),
      sellingAmount: positiveAmount,
      catalogueRevision: z.number().int().positive().optional(),
      costCeiling: positiveAmount,
      acceptPriceChangeRisk: z.literal(true),
    })
    .strict(),
]);
export type DomainActionRequest = z.infer<typeof domainActionRequestSchema>;
export const domainActionSchema = z
  .object({
    id: z.uuid(),
    kind: z.enum(['NAMESERVERS', 'LOCK', 'CONTACT', 'RENEW']),
    state: z.enum([
      'REQUESTED',
      'NEEDS_RECONCILIATION',
      'SUCCEEDED',
      'CANCELLED',
      'FAILED',
    ]),
    createdAt: z.iso.datetime(),
    claimed: z.boolean(),
    invoiceId: z.uuid().nullable(),
    financialAttention: z.boolean(),
  })
  .strict();
export type DomainAction = z.infer<typeof domainActionSchema>;
export const domainManagementSchema = z
  .object({
    contact: resellbizContactSchema.optional(),
    nameservers: registrarNameserversSchema,
    locked: z.boolean(),
    observedAt: z.iso.datetime(),
    expiresAt: z.iso.datetime(),
    verification: z.enum(['Pending', 'Verified']),
  })
  .strict();
export type DomainManagement = z.infer<typeof domainManagementSchema>;
