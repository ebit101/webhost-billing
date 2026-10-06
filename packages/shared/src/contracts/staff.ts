import { z } from 'zod';

export const staffRoleSchema = z.enum([
  'FULL_ADMINISTRATOR',
  'BILLING_OPERATOR',
  'SUPPORT_OPERATOR',
]);
export type StaffRole = z.infer<typeof staffRoleSchema>;

export const staffRoleLabels: Record<StaffRole, string> = {
  FULL_ADMINISTRATOR: 'Full administrator',
  BILLING_OPERATOR: 'Billing operator',
  SUPPORT_OPERATOR: 'Support operator',
};

export const staffPermissions = [
  'staff.manage',
  'account.self',
  'customers.read',
  'invoices.read',
  'invoices.manage',
  'payments.read',
  'payments.manage',
  'tickets.manage',
  'business.presentation',
] as const;
export type StaffPermission = (typeof staffPermissions)[number];

const grants: Record<StaffRole, readonly StaffPermission[]> = {
  FULL_ADMINISTRATOR: staffPermissions,
  BILLING_OPERATOR: [
    'account.self',
    'customers.read',
    'invoices.read',
    'invoices.manage',
    'payments.read',
    'payments.manage',
    'business.presentation',
  ],
  SUPPORT_OPERATOR: ['account.self', 'tickets.manage'],
};

// Unknown/missing role is never an implicit full administrator.
export function hasStaffPermission(
  role: unknown,
  permission: StaffPermission,
): boolean {
  const parsed = staffRoleSchema.safeParse(role);
  return parsed.success && grants[parsed.data].includes(permission);
}

export function staffHome(role: StaffRole): string {
  return role === 'BILLING_OPERATOR'
    ? '/admin/invoices'
    : role === 'SUPPORT_OPERATOR'
      ? '/admin/support'
      : '/admin';
}

export const staffAccountSchema = z
  .object({
    id: z.uuid(),
    email: z.email(),
    displayName: z.string().min(1).max(150),
    staffRole: staffRoleSchema,
    status: z.enum(['PENDING_VERIFICATION', 'ACTIVE', 'DISABLED', 'SUSPENDED']),
    twoFactorEnabled: z.boolean(),
  })
  .strict();
export type StaffAccount = z.infer<typeof staffAccountSchema>;
export const staffAccountListSchema = z.array(staffAccountSchema);

export const createStaffRequestSchema = z
  .object({
    email: z.string().trim().toLowerCase().pipe(z.email().max(320)),
    displayName: z.string().trim().min(1).max(150),
    staffRole: staffRoleSchema,
  })
  .strict();
export type CreateStaffRequest = z.infer<typeof createStaffRequestSchema>;

export const updateStaffRequestSchema = z
  .object({
    displayName: z.string().trim().min(1).max(150),
    staffRole: staffRoleSchema,
    enabled: z.boolean(),
  })
  .strict();
export type UpdateStaffRequest = z.infer<typeof updateStaffRequestSchema>;
