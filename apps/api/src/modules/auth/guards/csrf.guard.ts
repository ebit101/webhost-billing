import {
  type CanActivate,
  type ExecutionContext,
  HttpStatus,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { ApplicationException } from '../../../common/errors/application.exception';
import { AuthCookieService } from '../services/auth-cookie.service';
import { CsrfService } from '../services/csrf.service';
import { SKIP_CSRF_KEY } from '../decorators/skip-csrf.decorator';
import { timingSafeEqual } from 'node:crypto';
import type { ApiEnvironment } from '@webhost-billing/config';
import { API_ENVIRONMENT } from '../../../infrastructure/environment/environment.module';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

@Injectable()
export class CsrfGuard implements CanActivate {
  private readonly webOrigin: string;

  constructor(
    private readonly reflector: Reflector,
    private readonly cookies: AuthCookieService,
    private readonly csrf: CsrfService,
    @Inject(API_ENVIRONMENT) environment: ApiEnvironment,
  ) {
    this.webOrigin = new URL(environment.WEB_ORIGIN).origin;
  }

  canActivate(context: ExecutionContext): boolean {
    const skipCsrf = this.reflector.getAllAndOverride<boolean>(SKIP_CSRF_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skipCsrf) return true;

    const request = context.switchToHttp().getRequest<Request>();

    if (SAFE_METHODS.has(request.method)) {
      return true;
    }

    const cookieToken = this.cookies.read(request, this.cookies.csrfCookieName);
    const headerToken = request.get('x-csrf-token');
    const requestOrigin = request.get('origin');
    const fetchSite = request.get('sec-fetch-site');

    if (
      fetchSite === 'cross-site' ||
      (requestOrigin && requestOrigin !== this.webOrigin) ||
      !cookieToken ||
      !headerToken ||
      !this.equalTokens(cookieToken, headerToken) ||
      !this.csrf.validate(headerToken)
    ) {
      throw new ApplicationException({
        status: HttpStatus.FORBIDDEN,
        code: 'CSRF_VALIDATION_FAILED',
        message: 'CSRF validation failed.',
      });
    }

    return true;
  }

  private equalTokens(left: string, right: string): boolean {
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);
    return (
      leftBuffer.length === rightBuffer.length &&
      timingSafeEqual(leftBuffer, rightBuffer)
    );
  }
}
