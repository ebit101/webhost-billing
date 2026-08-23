import { z } from 'zod';
import { authenticatedIdentitySchema } from './auth';

export const normalizedEmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email().max(320));

export const passwordSchema = z
  .string()
  .min(12, 'Password must contain at least 12 characters')
  .max(128, 'Password must contain at most 128 characters');

export const registrationRequestSchema = z
  .object({
    email: normalizedEmailSchema,
    password: passwordSchema,
    firstName: z.string().trim().min(1).max(100),
    lastName: z.string().trim().min(1).max(100),
    companyName: z.string().trim().min(1).max(200).optional(),
    phone: z.string().trim().min(1).max(32).optional(),
    addressLine1: z.string().trim().min(1).max(200),
    addressLine2: z.string().trim().min(1).max(200).optional(),
    city: z.string().trim().min(1).max(100),
    region: z.string().trim().min(1).max(100).optional(),
    postalCode: z.string().trim().min(1).max(32).optional(),
    countryCode: z
      .string()
      .trim()
      .toUpperCase()
      .pipe(z.string().regex(/^[A-Z]{2}$/)),
  })
  .strict();

export const loginRequestSchema = z
  .object({
    email: normalizedEmailSchema,
    password: z.string().min(1).max(128),
  })
  .strict();

export const passwordResetRequestSchema = z
  .object({ email: normalizedEmailSchema })
  .strict();

export const passwordResetConfirmationSchema = z
  .object({
    token: z.string().min(32).max(256),
    password: passwordSchema,
  })
  .strict();

export const emailVerificationRequestSchema = z
  .object({ token: z.string().min(32).max(256) })
  .strict();

export const authenticationSessionSchema = z
  .object({
    id: z.uuid(),
    createdAt: z.iso.datetime({ offset: true }),
    lastSeenAt: z.iso.datetime({ offset: true }),
    expiresAt: z.iso.datetime({ offset: true }),
    current: z.boolean(),
  })
  .strict();

export const authenticatedSessionResponseSchema = z
  .object({
    identity: authenticatedIdentitySchema,
    session: authenticationSessionSchema,
  })
  .strict();

export const customerProfileSummarySchema = z
  .object({
    id: z.uuid(),
    customerNumber: z.string().min(1).max(32),
    firstName: z.string().min(1).max(100),
    lastName: z.string().min(1).max(100),
    companyName: z.string().max(200).nullable(),
  })
  .strict();

export type RegistrationRequest = z.infer<typeof registrationRequestSchema>;
export type LoginRequest = z.infer<typeof loginRequestSchema>;
export type PasswordResetRequest = z.infer<typeof passwordResetRequestSchema>;
export type PasswordResetConfirmation = z.infer<
  typeof passwordResetConfirmationSchema
>;
export type EmailVerificationRequest = z.infer<
  typeof emailVerificationRequestSchema
>;
export type AuthenticationSession = z.infer<typeof authenticationSessionSchema>;
export type AuthenticatedSessionResponse = z.infer<
  typeof authenticatedSessionResponseSchema
>;
export type CustomerProfileSummary = z.infer<
  typeof customerProfileSummarySchema
>;
