import type { Prisma } from './generated/prisma/client';

/** Department access never grants the base ticket permission. */
export function supportDepartmentAccess(
  userId: string,
): Prisma.SupportDepartmentWhereInput {
  return { OR: [{ restricted: false }, { members: { some: { userId } } }] };
}

export function supportStaffWhere(
  departmentId: string,
  restricted: boolean,
): Prisma.UserWhereInput {
  return {
    role: 'ADMIN',
    status: 'ACTIVE',
    deletedAt: null,
    OR: [
      { adminProfile: { is: { staffRole: 'FULL_ADMINISTRATOR' } } },
      {
        adminProfile: { is: { staffRole: 'SUPPORT_OPERATOR' } },
        adminTotpCredential: { is: { enabledAt: { not: null } } },
        ...(restricted
          ? { supportMemberships: { some: { departmentId } } }
          : {}),
      },
    ],
  };
}
