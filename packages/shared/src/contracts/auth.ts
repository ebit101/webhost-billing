import { z } from 'zod';
import { staffRoleSchema } from './staff';

const authenticatedIdentityBaseSchema = z.object({
  userId: z.uuid(),
  email: z.email(),
});

export const administratorIdentitySchema = authenticatedIdentityBaseSchema
  .extend({
    role: z.literal('ADMIN'),
    adminProfileId: z.uuid(),
    staffRole: staffRoleSchema,
    twoFactorEnabled: z.boolean(),
  })
  .strict();

export const customerIdentitySchema = authenticatedIdentityBaseSchema
  .extend({
    role: z.literal('CUSTOMER'),
    customerId: z.uuid(),
  })
  .strict();

export const authenticatedIdentitySchema = z.discriminatedUnion('role', [
  administratorIdentitySchema,
  customerIdentitySchema,
]);

export type AdministratorIdentity = z.infer<typeof administratorIdentitySchema>;
export type CustomerIdentity = z.infer<typeof customerIdentitySchema>;
export type AuthenticatedIdentity = z.infer<typeof authenticatedIdentitySchema>;
