import { Inject, Injectable } from '@nestjs/common';
import type { ApiEnvironment } from '@webhost-billing/config';
import { parse, type SerializeOptions } from 'cookie';
import type { Request, Response } from 'express';
import { API_ENVIRONMENT } from '../../../infrastructure/environment/environment.module';
import {
  CSRF_COOKIE_BASE_NAME,
  SESSION_COOKIE_BASE_NAME,
} from '../auth.constants';

@Injectable()
export class AuthCookieService {
  readonly csrfCookieName: string;
  readonly sessionCookieName: string;
  private readonly secure: boolean;
  private readonly sessionTtlMilliseconds: number;

  constructor(@Inject(API_ENVIRONMENT) environment: ApiEnvironment) {
    this.secure = environment.NODE_ENV === 'production';
    this.csrfCookieName = this.secure
      ? `__Host-${CSRF_COOKIE_BASE_NAME}`
      : CSRF_COOKIE_BASE_NAME;
    this.sessionCookieName = this.secure
      ? `__Host-${SESSION_COOKIE_BASE_NAME}`
      : SESSION_COOKIE_BASE_NAME;
    this.sessionTtlMilliseconds = environment.SESSION_TTL_SECONDS * 1_000;
  }

  read(request: Request, name: string): string | undefined {
    const header = request.headers.cookie;

    if (!header) {
      return undefined;
    }

    try {
      return parse(header)[name];
    } catch {
      return undefined;
    }
  }

  setCsrfCookie(response: Response, token: string): void {
    response.cookie(this.csrfCookieName, token, {
      ...this.baseOptions(),
      httpOnly: false,
    });
  }

  setSessionCookie(response: Response, token: string): void {
    response.cookie(this.sessionCookieName, token, {
      ...this.baseOptions(),
      httpOnly: true,
      maxAge: this.sessionTtlMilliseconds,
    });
  }

  clearSessionCookie(response: Response): void {
    response.clearCookie(this.sessionCookieName, {
      ...this.baseOptions(),
      httpOnly: true,
    });
  }

  private baseOptions(): SerializeOptions {
    return {
      secure: this.secure,
      sameSite: 'lax',
      path: '/',
    };
  }
}
