import { z } from 'zod';

const publicText = (maximum: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(maximum)
    .regex(/^[^<>\u0000-\u001f\u007f]+$/);

export const webBrandingSchema = z
  .object({
    name: publicText(80).refine((value) => !value.includes('%')),
    logoPath: z
      .string()
      .regex(/^\/branding\/[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}\.png$/)
      .optional(),
    logoWidth: z.coerce.number().int().min(1).max(2048).default(285),
    logoHeight: z.coerce.number().int().min(1).max(2048).default(63),
    tagline: publicText(120).optional(),
    contactEmail: z.email().max(254).optional(),
    contactPhone: z
      .string()
      .regex(/^\+[1-9][0-9]{6,14}$/)
      .optional(),
    contactAddress: publicText(500).optional(),
    website: z
      .url()
      .refine((value) => {
        const url = new URL(value);
        return (
          url.protocol === 'https:' &&
          !url.username &&
          !url.password &&
          url.pathname === '/' &&
          !url.search &&
          !url.hash
        );
      })
      .optional(),
  })
  .strict();

export type WebBranding = z.infer<typeof webBrandingSchema>;
