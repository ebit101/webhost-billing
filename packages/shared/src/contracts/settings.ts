import { z } from 'zod';
import { businessIdentitySchema } from './invoices';
import { currencyCodeSchema } from './money';
import { renewalAutomationPolicySchema } from './renewal-automation';

export const businessTimeZoneSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .refine((value) => {
    try {
      new Intl.DateTimeFormat('en', { timeZone: value }).format(new Date(0));
      return true;
    } catch {
      return false;
    }
  }, 'Expected an IANA time zone');

export const invoiceNumberingSettingsSchema = z
  .object({
    prefix: z
      .string()
      .trim()
      .toUpperCase()
      .pipe(z.string().regex(/^[A-Z][A-Z0-9]{1,9}$/)),
    nextNumber: z.number().int().min(1).max(999_999_999_999),
    padding: z.number().int().min(4).max(12),
  })
  .strict()
  .superRefine((settings, context) => {
    if (String(settings.nextNumber).length > settings.padding) {
      context.addIssue({
        code: 'custom',
        path: ['nextNumber'],
        message: 'Next invoice number does not fit the configured padding',
      });
    }
  });

export const terminationPolicySchema = z
  .object({
    mode: z.literal('ADMIN_CONFIRMATION_REQUIRED'),
    confirmationText: z.literal('TERMINATE'),
  })
  .strict();

export const manualPaymentInstructionsSchema = z
  .object({
    partialPaymentsEnabled: z.boolean(),
    instructions: z.string().trim().max(4_000),
  })
  .strict();

const emailHeaderValueSchema = z
  .string()
  .trim()
  .min(1)
  .max(160)
  .refine((value) => !/[\r\n]/.test(value), {
    message: 'Email header values cannot contain line breaks',
  });

export const emailBrandingSettingsSchema = z
  .object({
    brandName: emailHeaderValueSchema,
    brandColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
    fromName: emailHeaderValueSchema,
    fromAddress: z.string().trim().toLowerCase().pipe(z.email().max(320)),
    replyToAddress: z
      .string()
      .trim()
      .toLowerCase()
      .pipe(z.email().max(320))
      .nullable(),
  })
  .strict();

export const activePaymentGatewaySchema = z.enum([
  'manual',
  'bkash',
  'sslcommerz',
  'fake',
]);

export const activeHostingPanelAdapterSchema = z.enum([
  'cpanel-whm',
  'fake-panel',
]);

export const businessLocalizationSettingsSchema = z
  .object({
    currency: currencyCodeSchema,
    timeZone: businessTimeZoneSchema,
  })
  .strict();

export const activeProviderSettingsSchema = z
  .object({
    activeGateway: activePaymentGatewaySchema,
    activeHostingPanelAdapter: activeHostingPanelAdapterSchema,
  })
  .strict();

export const integrationCredentialProviderSchema = z.enum([
  'bkash',
  'sslcommerz',
  'cpanel-whm',
]);

export const credentialStatusSchema = z
  .object({
    provider: integrationCredentialProviderSchema,
    configured: z.boolean(),
    maskedIdentifier: z.string().max(200).nullable(),
    updatedAt: z.iso.datetime({ offset: true }).nullable(),
    keyVersion: z.string().max(64).nullable(),
    managedAt: z.enum(['SETTINGS', 'HOSTING_SERVERS']),
  })
  .strict();

export const businessSettingsSchema = z
  .object({
    businessIdentity: businessIdentitySchema,
    ...businessLocalizationSettingsSchema.shape,
    invoiceNumbering: invoiceNumberingSettingsSchema,
    renewalAutomation: renewalAutomationPolicySchema,
    terminationPolicy: terminationPolicySchema,
    manualPayments: manualPaymentInstructionsSchema,
    emailBranding: emailBrandingSettingsSchema,
    ...activeProviderSettingsSchema.shape,
  })
  .strict()
  .superRefine((settings, context) => {
    if (settings.renewalAutomation.timeZone !== settings.timeZone) {
      context.addIssue({
        code: 'custom',
        path: ['renewalAutomation', 'timeZone'],
        message: 'Renewal automation must use the business time zone',
      });
    }
  });

export const settingsOverviewSchema = businessSettingsSchema
  .safeExtend({ credentialStatuses: z.array(credentialStatusSchema) })
  .strict();

const bkashCredentialsSchema = z
  .object({
    appKey: z.string().trim().min(1).max(512),
    appSecret: z.string().min(1).max(512),
    username: z.string().trim().min(1).max(512),
    password: z.string().min(1).max(512),
  })
  .strict();

const sslCommerzCredentialsSchema = z
  .object({
    storeId: z.string().trim().min(1).max(512),
    storePassword: z.string().min(1).max(512),
  })
  .strict();

export const integrationCredentialUpdateSchema = z.discriminatedUnion(
  'provider',
  [
    z
      .object({
        provider: z.literal('bkash'),
        credentials: bkashCredentialsSchema,
        confirmation: z.literal('REPLACE_CREDENTIALS'),
      })
      .strict(),
    z
      .object({
        provider: z.literal('sslcommerz'),
        credentials: sslCommerzCredentialsSchema,
        confirmation: z.literal('REPLACE_CREDENTIALS'),
      })
      .strict(),
  ],
);

export const DEFAULT_BUSINESS_SETTINGS: BusinessSettings = {
  businessIdentity: { name: 'Webhost Billing' },
  currency: 'BDT',
  timeZone: 'Asia/Dhaka',
  invoiceNumbering: { prefix: 'INV', nextNumber: 1001, padding: 6 },
  renewalAutomation: {
    enabled: true,
    invoiceLeadDays: 14,
    reminderDaysBeforeDue: [7, 3, 1],
    gracePeriodDays: 3,
    timeZone: 'Asia/Dhaka',
  },
  terminationPolicy: {
    mode: 'ADMIN_CONFIRMATION_REQUIRED',
    confirmationText: 'TERMINATE',
  },
  manualPayments: {
    partialPaymentsEnabled: false,
    instructions:
      'Pay by bank deposit, cash, or an approved mobile financial service, then submit the transaction reference for review.',
  },
  emailBranding: {
    brandName: 'Webhost Billing',
    brandColor: '#0891b2',
    fromName: 'Webhost Billing',
    fromAddress: 'no-reply@example.test',
    replyToAddress: null,
  },
  activeGateway: 'manual',
  activeHostingPanelAdapter: 'cpanel-whm',
};

export function formatInvoiceNumber(
  settings: InvoiceNumberingSettings,
): string {
  return `${settings.prefix}-${String(settings.nextNumber).padStart(settings.padding, '0')}`;
}

export type InvoiceNumberingSettings = z.infer<
  typeof invoiceNumberingSettingsSchema
>;
export type ManualPaymentInstructions = z.infer<
  typeof manualPaymentInstructionsSchema
>;
export type EmailBrandingSettings = z.infer<typeof emailBrandingSettingsSchema>;
export type ActivePaymentGateway = z.infer<typeof activePaymentGatewaySchema>;
export type ActiveHostingPanelAdapter = z.infer<
  typeof activeHostingPanelAdapterSchema
>;
export type CredentialStatus = z.infer<typeof credentialStatusSchema>;
export type BusinessSettings = z.infer<typeof businessSettingsSchema>;
export type SettingsOverview = z.infer<typeof settingsOverviewSchema>;
export type IntegrationCredentialUpdate = z.infer<
  typeof integrationCredentialUpdateSchema
>;
export type BkashCredentials = z.infer<typeof bkashCredentialsSchema>;
export type SslCommerzCredentials = z.infer<typeof sslCommerzCredentialsSchema>;
