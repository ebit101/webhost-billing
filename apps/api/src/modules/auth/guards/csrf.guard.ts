import {
  type CanActivate,
  type ExecutionContext,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import { ApplicationException } from '../../../common/errors/application.exception';
import { AuthCookieService } from '../services/auth-cookie.service';
import { CsrfService } from '../services/csrf.service';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(
    private readonly cookies: AuthCookieService,
    private readonly csrf: CsrfService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();

    if (SAFE_METHODS.has(request.method)) {
      return true;
    }

    const cookieToken = this.cookies.read(request, this.cookies.csrfCookieName);
    const headerToken = request.get('x-csrf-token');

    if (
      !cookieToken ||
      !headerToken ||
      cookieToken !== headerToken ||
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
}
