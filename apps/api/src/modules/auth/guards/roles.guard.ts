import {
  type CanActivate,
  type ExecutionContext,
  HttpStatus,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { ApiEnvironment } from '@webhost-billing/config';
import type { Role } from '@webhost-billing/shared';
import { ApplicationException } from '../../../common/errors/application.exception';
import { createSecurityRequestContext } from '../../../common/http/request-context';
import { API_ENVIRONMENT } from '../../../infrastructure/environment/environment.module';
import type { AuthenticatedRequest } from '../auth.types';
import { REQUIRED_ROLES_KEY } from '../decorators/roles.decorator';
import { AuthAuditService } from '../services/auth-audit.service';

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

    if (!roles || roles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const auth = request.auth;

    if (auth && roles.includes(auth.identity.role)) {
      return true;
    }

    if (auth) {
      await this.audit.record(
        {
          actorUserId: auth.identity.userId,
          action: 'AUTH_ROLE_ACCESS_DENIED',
          entityType: 'USER',
          entityId: auth.identity.userId,
          metadata: { requiredRoles: [...roles] },
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
