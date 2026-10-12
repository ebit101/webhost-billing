import { z } from 'zod';

export const smtpHostSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(253)
  .refine(
    (value) =>
      value.includes('.') &&
      value
        .split('.')
        .every((label) =>
          /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label),
        ) &&
      !/^[\d.]+$/.test(value) &&
      !/(?:^|\.)(?:localhost|local|internal|test|invalid|example)$/.test(value),
    'Enter a public SMTP hostname, without a URL or IP address.',
  );
export const smtpConnectionSchema = z.discriminatedUnion('security', [
  z.object({ security: z.literal('STARTTLS'), port: z.literal(587) }).strict(),
  z.object({ security: z.literal('TLS'), port: z.literal(465) }).strict(),
]);
export const smtpConfigurationSchema = z
  .object({
    host: smtpHostSchema,
    connection: smtpConnectionSchema,
    username: z
      .string()
      .trim()
      .min(1)
      .max(320)
      .refine((value) => !/[\x00-\x1f\x7f]/.test(value)),
    password: z
      .string()
      .min(1)
      .max(512)
      .refine((value) => !/[\r\n\x00]/.test(value)),
    enabled: z.boolean(),
  })
  .strict();
export const saveSmtpSettingsSchema = smtpConfigurationSchema
  .omit({ enabled: true })
  .extend({
    confirmation: z.literal('SAVE_SMTP'),
  })
  .strict();
export const smtpActivationSchema = z.discriminatedUnion('enabled', [
  z
    .object({
      enabled: z.literal(true),
      confirmation: z.literal('ENABLE_SMTP'),
      revision: z.string().regex(/^[a-f0-9]{64}$/),
    })
    .strict(),
  z
    .object({
      enabled: z.literal(false),
      confirmation: z.literal('USE_DEPLOYMENT_EMAIL'),
      revision: z.string().regex(/^[a-f0-9]{64}$/),
    })
    .strict(),
]);
export const smtpSettingsStatusSchema = z
  .object({
    configured: z.boolean(),
    enabled: z.boolean(),
    host: smtpHostSchema.nullable(),
    connection: smtpConnectionSchema.nullable(),
    maskedUsername: z.string().max(12).nullable(),
    passwordConfigured: z.boolean(),
    updatedAt: z.iso.datetime({ offset: true }).nullable(),
    revision: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .nullable(),
  })
  .strict();
export type SmtpConfiguration = z.infer<typeof smtpConfigurationSchema>;
export type SaveSmtpSettings = z.infer<typeof saveSmtpSettingsSchema>;
export type SmtpActivation = z.infer<typeof smtpActivationSchema>;
export type SmtpSettingsStatus = z.infer<typeof smtpSettingsStatusSchema>;
