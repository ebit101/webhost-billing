import { z } from 'zod';
import { notificationKeySchema } from './notifications';

/** Private encrypted configuration, never an API response or a job payload. */
export const metaWhatsAppConfigurationSchema = z
  .object({
    enabled: z.boolean().default(false),
    senderPhoneNumber: z.string().regex(/^\+[1-9][0-9]{7,14}$/),
    phoneNumberId: z.string().regex(/^[1-9][0-9]{4,29}$/),
    apiVersion: z.string().regex(/^v[1-9][0-9]?\.0$/),
    accessToken: z
      .string()
      .min(20)
      .max(4096)
      .refine((value) => !/\s/.test(value)),
    templates: z.partialRecord(
      notificationKeySchema,
      z
        .object({
          name: z.string().regex(/^[a-z][a-z0-9_]{0,127}$/),
          language: z.string().regex(/^[a-z]{2,3}(?:_[A-Z]{2})?$/),
        })
        .strict(),
    ),
  })
  .strict();

export type MetaWhatsAppConfiguration = z.infer<
  typeof metaWhatsAppConfigurationSchema
>;
