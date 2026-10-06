import {
  type CanActivate,
  type ExecutionContext,
  HttpStatus,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { ApiEnvironment } from '@webhost-billing/config';
import {
  hasStaffPermission,
  staffRoleSchema,
  type Role,
  type StaffPermission,
} from '@webhost-billing/shared';
import { ApplicationException } from '../../../common/errors/application.exception';
import { createSecurityRequestContext } from '../../../common/http/request-context';
import { API_ENVIRONMENT } from '../../../infrastructure/environment/environment.module';
import type { AuthenticatedRequest } from '../auth.types';
import { REQUIRED_ROLES_KEY } from '../decorators/roles.decorator';
import { AuthAuditService } from '../services/auth-audit.service';
import { STAFF_PERMISSION_KEY } from '../decorators/staff-permission.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  private readonly auditSecret: string;

  constructor(
    private readonly reflector: Reflector,
    private readonly audit: AuthAuditService,
    @Inject(API_ENVIRONMENT) environment: ApiEnvironment,
  ) {
    this.auditSecret = environment.SESSION_SECRET;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const roles = this.reflector.getAllAndOverride<readonly Role[] | undefined>(
      REQUIRED_ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const auth = request.auth;
    const permission = this.reflector.getAllAndOverride<
      StaffPermission | undefined
    >(STAFF_PERMISSION_KEY, [context.getHandler(), context.getClass()]);
    const roleAllowed =
      !roles?.length || (auth && roles.includes(auth.identity.role));
    const staffAllowed =
      auth?.identity.role !== 'ADMIN' ||
      (staffRoleSchema.safeParse(auth.identity.staffRole).success &&
        (permission
          ? hasStaffPermission(auth.identity.staffRole, permission)
          : auth.identity.staffRole === 'FULL_ADMINISTRATOR') &&
        // Restricted staff can sign in and enroll, but cannot work without MFA.
        ((auth.identity.staffRole === 'FULL_ADMINISTRATOR' &&
          permission !== 'staff.manage') ||
          auth.identity.twoFactorEnabled ||
          permission === 'account.self'));
    if (roleAllowed && staffAllowed) {
      return true;
    }

    if (auth) {
      await this.audit.record(
        {
          actorUserId: auth.identity.userId,
          action: 'AUTH_ROLE_ACCESS_DENIED',
          entityType: 'USER',
          entityId: auth.identity.userId,
          metadata: {
            requiredRoles: [...(roles ?? [])],
            permission: permission ?? 'full-administrator',
          },
        },
        createSecurityRequestContext(request, this.auditSecret),
      );
    }

    throw new ApplicationException({
      status: HttpStatus.FORBIDDEN,
      code: 'FORBIDDEN',
      message: 'You do not have permission to perform this action.',
    });
  }
}
