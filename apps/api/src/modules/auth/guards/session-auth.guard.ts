import {
  type CanActivate,
  type ExecutionContext,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Response } from 'express';
import { ApplicationException } from '../../../common/errors/application.exception';
import type { AuthenticatedRequest } from '../auth.types';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { CUSTOMER_SUPPORT_ACCESS_KEY } from '../decorators/customer-support-session.decorator';
import { AuthCookieService } from '../services/auth-cookie.service';
import { AuthService } from '../services/auth.service';

@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly cookies: AuthCookieService,
    private readonly authService: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.cookies.read(request, this.cookies.sessionCookieName);
    const supportToken = this.cookies.read(
      request,
      this.cookies.supportCookieName,
    );
    if (supportToken !== undefined) {
      const access = this.reflector.get<'read' | 'end'>(
        CUSTOMER_SUPPORT_ACCESS_KEY,
        context.getHandler(),
      );
      const read = request.method === 'GET' || request.method === 'HEAD';
      if (isPublic && ((read && access === 'read') || access === 'end'))
        return true;
      if (!read || access !== 'read') {
        throw new ApplicationException({
          status: HttpStatus.FORBIDDEN,
          code: 'FORBIDDEN',
          message:
            'End the read-only support session before performing this action.',
        });
      }
      if (token) {
        request.auth =
          await this.authService.authenticateCustomerSupportSession(
            token,
            supportToken,
          );
        context
          .switchToHttp()
          .getResponse<Response>()
          .set('Cache-Control', 'private, no-store');
        return true;
      }
    } else if (isPublic) {
      return true;
    } else if (token) {
      request.auth = await this.authService.authenticateSession(token);
      return true;
    }

    throw new ApplicationException({
      status: HttpStatus.UNAUTHORIZED,
      code: 'AUTHENTICATION_REQUIRED',
      message: 'Authentication is required.',
    });
  }
}
