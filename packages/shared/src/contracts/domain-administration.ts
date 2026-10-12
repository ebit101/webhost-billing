import { z } from 'zod';
import {
  registrarNameserversSchema,
  resellbizCredentialSchema,
} from './domains';

const positiveMoney = z.string().regex(/^[1-9][0-9]{0,14}$/);
const policyUrl = z
  .url()
  .max(1000)
  .refine((value) => {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  });
export const domainPolicyInputSchema = z
  .object({
    agreementUrl: policyUrl,
    customerTermsUrl: policyUrl,
    customerPrivacyUrl: policyUrl,
  })
  .strict();
export const domainPolicySchema = domainPolicyInputSchema
  .extend({ revision: z.uuid() })
  .strict();
export const domainDnsDefaultsSchema = z
  .object({ nameservers: registrarNameserversSchema })
  .strict();
export const domainDefaultsStatusSchema = z
  .object({
    dns: domainDnsDefaultsSchema.nullable(),
    policies: domainPolicySchema.nullable(),
  })
  .strict();
export type DomainDefaultsStatus = z.infer<typeof domainDefaultsStatusSchema>;
export const registrarConnectionIdentitySchema = z
  .object({
    schemaVersion: z.literal(2),
    resellerId: resellbizCredentialSchema.shape.resellerId,
  })
  .strict();
export const createRegistrarConnectionSchema = resellbizCredentialSchema
  .extend({
    name: z
      .string()
      .trim()
      .min(1)
      .max(100)
      .regex(/^[^\u0000-\u001f\u007f]+$/),
    module: z.literal('logicboxes'),
    confirmation: z.literal('Save registrar connection'),
  })
  .strict();
export const registrarConnectionSchema = z
  .object({
    id: z.uuid(),
    name: z.string().min(1).max(100),
    module: z.literal('logicboxes'),
    mode: z.enum(['Live', 'Simulated']),
    enabled: z.boolean(),
    isDefault: z.boolean(),
    networkEnabled: z.boolean(),
    credentialVersion: z.number().int().nonnegative(),
    maskedResellerId: z.string().max(30),
    nativeCostConfirmed: z.boolean(),
    capabilities: z
      .object({
        registration: z.boolean(),
        renewal: z.boolean(),
        transfer: z.literal(false),
        dnsManagement: z.literal(false),
        emailForwarding: z.literal(false),
        idProtection: z.literal(false),
      })
      .strict(),
  })
  .strict();
export const registrarConnectionListSchema = registrarConnectionSchema
  .array()
  .max(100);
export const registrarConnectionToggleSchema = z
  .object({
    enabled: z.boolean(),
    confirmNativeUsdCosts: z.literal(true).optional(),
  })
  .strict();
const tldFields = z
  .object({
    tld: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z]{2,24}(?:\.[a-z]{2,24})?$/),
    registrationAmount: positiveMoney.nullable(),
    renewalAmount: positiveMoney.nullable(),
    enabled: z.boolean(),
    featured: z.boolean(),
    displayOrder: z.number().int().min(0).max(10000),
    preferredRegistrarId: z.uuid().nullable(),
    revision: z.number().int().nonnegative(),
  })
  .strict();
export const domainTldRequestSchema = tldFields.refine(
  (value) =>
    !value.enabled ||
    (value.tld === 'com' && value.registrationAmount !== null),
  { message: 'Only priced ordinary .com registrations can be enabled.' },
);
export const domainTldSchema = tldFields
  .extend({
    id: z.uuid(),
    revision: z.number().int().positive(),
    currency: z.literal('BDT'),
    years: z.literal(1),
    registrationSupported: z.boolean(),
    transferSupported: z.literal(false),
    renewalSupported: z.boolean(),
  })
  .strict();
export const domainTldListSchema = domainTldSchema.array().max(1000);
export const domainTldBulkSchema = z
  .object({
    entries: z
      .array(
        z
          .object({ id: z.uuid(), revision: z.number().int().positive() })
          .strict(),
      )
      .min(1)
      .max(100),
    enabled: z.boolean().optional(),
    preferredRegistrarId: z.uuid().nullable().optional(),
    confirmation: z.literal('Apply TLD changes'),
  })
  .strict()
  .refine(
    (value) =>
      value.enabled !== undefined || value.preferredRegistrarId !== undefined,
  );
export const domainSelectionSnapshotSchema = z
  .object({
    schemaVersion: z.literal(1),
    catalogueId: z.uuid(),
    catalogueRevision: z.number().int().positive(),
    priceId: z.uuid(),
    policies: domainPolicySchema,
    eligibleRegistrars: z
      .array(
        z.object({ id: z.uuid(), name: z.string().min(1).max(100) }).strict(),
      )
      .min(1)
      .max(32),
  })
  .strict()
  .refine(
    (value) =>
      new Set(value.eligibleRegistrars.map((entry) => entry.id)).size ===
      value.eligibleRegistrars.length,
  );
export const registrarChoiceSchema = z
  .object({
    id: z.uuid(),
    name: z.string().min(1).max(100),
    isDefault: z.boolean(),
  })
  .strict();
export type RegistrarConnection = z.infer<typeof registrarConnectionSchema>;
export type DomainTld = z.infer<typeof domainTldSchema>;
export type DomainTldRequest = z.infer<typeof domainTldRequestSchema>;
export type DomainSelectionSnapshot = z.infer<
  typeof domainSelectionSnapshotSchema
>;

// Human BDT price input, without Number/parseFloat or currency activation.
export function bdtPriceToMinor(value: string): string | null {
  if (!value.trim()) return null;
  const match = /^([0-9]{1,13})(?:\.([0-9]{1,2}))?$/.exec(value.trim());
  if (!match)
    throw new Error(
      'Enter a positive BDT amount with up to two decimal places.',
    );
  const amount =
    BigInt(match[1]!) * 100n + BigInt((match[2] ?? '').padEnd(2, '0'));
  if (amount <= 0n || amount > 999999999999999n)
    throw new Error('Enter a positive supported BDT amount.');
  return amount.toString();
}
