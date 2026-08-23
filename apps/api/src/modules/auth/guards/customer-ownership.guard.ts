import {
  type CanActivate,
  type ExecutionContext,
  HttpStatus,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { ApiEnvironment } from '@webhost-billing/config';
import { ApplicationException } from '../../../common/errors/application.exception';
import { createSecurityRequestContext } from '../../../common/http/request-context';
import { API_ENVIRONMENT } from '../../../infrastructure/environment/environment.module';
import type { AuthenticatedRequest } from '../auth.types';
import { CUSTOMER_OWNERSHIP_PARAM_KEY } from '../decorators/customer-ownership.decorator';
import { AuthAuditService } from '../services/auth-audit.service';

@Injectable()
export class CustomerOwnershipGuard implements CanActivate {
  private readonly auditSecret: string;

  constructor(
    private readonly reflector: Reflector,
    private readonly audit: AuthAuditService,
    @Inject(API_ENVIRONMENT) environment: ApiEnvironment,
  ) {
    this.auditSecret = environment.SESSION_SECRET;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const parameterName = this.reflector.getAllAndOverride<string | undefined>(
      CUSTOMER_OWNERSHIP_PARAM_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!parameterName) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const auth = request.auth;
    const parameterValue = request.params[parameterName];
    const requestedCustomerId =
      typeof parameterValue === 'string' ? parameterValue : undefined;

    if (
      auth?.identity.role === 'ADMIN' ||
      (auth?.identity.role === 'CUSTOMER' &&
        auth.identity.customerId === requestedCustomerId)
    ) {
      return true;
    }

    if (auth) {
      await this.audit.record(
        {
          actorUserId: auth.identity.userId,
          action: 'AUTH_CUSTOMER_OWNERSHIP_DENIED',
          entityType: 'CUSTOMER',
          ...(requestedCustomerId ? { entityId: requestedCustomerId } : {}),
        },
        createSecurityRequestContext(request, this.auditSecret),
      );
    }

    throw new ApplicationException({
      status: HttpStatus.FORBIDDEN,
      code: 'FORBIDDEN',
      message: 'You do not have access to this customer resource.',
    });
  }
}
