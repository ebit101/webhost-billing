import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { ApiEnvironment } from '@webhost-billing/config';
import {
  createApiSuccessResponse,
  emailVerificationRequestSchema,
  loginRequestSchema,
  passwordResetConfirmationSchema,
  passwordResetRequestSchema,
  registrationRequestSchema,
  twoFactorDisableRequestSchema,
  twoFactorLoginRequestSchema,
  twoFactorPasswordRequestSchema,
  twoFactorVerificationRequestSchema,
  type ApiSuccessResponse,
  type AuthenticatedIdentity,
  type AuthenticationSession,
  type CustomerProfileSummary,
  type EmailVerificationRequest,
  type LoginRequest,
  type PasswordResetConfirmation,
  type PasswordResetRequest,
  type RegistrationRequest,
  type TwoFactorDisableRequest,
  type TwoFactorLoginRequest,
  type TwoFactorPasswordRequest,
  type TwoFactorVerificationRequest,
} from '@webhost-billing/shared';
import type { Request, Response } from 'express';
import { createSecurityRequestContext } from '../../../common/http/request-context';
import { ZodValidationPipe } from '../../../common/validation/zod-validation.pipe';
import { API_ENVIRONMENT } from '../../../infrastructure/environment/environment.module';
import type { AuthRequestContext } from '../auth.types';
import { CurrentAuth } from '../decorators/current-auth.decorator';
import { RequireCustomerOwnership } from '../decorators/customer-ownership.decorator';
import { Public } from '../decorators/public.decorator';
import { AuthRateLimit } from '../decorators/rate-limit.decorator';
import { Roles } from '../decorators/roles.decorator';
import { AuthCookieService } from '../services/auth-cookie.service';
import { AuthService } from '../services/auth.service';
import { CsrfService } from '../services/csrf.service';

interface MessageResponse {
  message: string;
}

@Controller('auth')
export class AuthController {
  private readonly auditSecret: string;

  constructor(
    private readonly authService: AuthService,
    private readonly cookies: AuthCookieService,
    private readonly csrf: CsrfService,
    @Inject(API_ENVIRONMENT) environment: ApiEnvironment,
  ) {
    this.auditSecret = environment.SESSION_SECRET;
  }

  @Public()
  @Get('csrf')
  @Header('Cache-Control', 'no-store')
  csrfToken(@Res({ passthrough: true }) response: Response) {
    const csrfToken = this.csrf.generate();
    this.cookies.setCsrfCookie(response, csrfToken);
    return createApiSuccessResponse({ csrfToken });
  }

  @Public()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @AuthRateLimit({
    scope: 'registration',
    limit: 5,
    windowMs: 60 * 60 * 1_000,
    includeEmail: true,
  })
  async register(
    @Body(new ZodValidationPipe(registrationRequestSchema))
    input: RegistrationRequest,
    @Req() request: Request,
  ): Promise<ApiSuccessResponse<MessageResponse>> {
    await this.authService.register(input, this.securityContext(request));
    return createApiSuccessResponse({
      message: 'Registration accepted. Verify your email before signing in.',
    });
  }

  @Public()
  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  @AuthRateLimit({
    scope: 'email-verification',
    limit: 10,
    windowMs: 15 * 60 * 1_000,
    includeEmail: false,
  })
  async verifyEmail(
    @Body(new ZodValidationPipe(emailVerificationRequestSchema))
    input: EmailVerificationRequest,
    @Req() request: Request,
  ): Promise<ApiSuccessResponse<MessageResponse>> {
    await this.authService.verifyEmail(
      input.token,
      this.securityContext(request),
    );
    return createApiSuccessResponse({ message: 'Email address verified.' });
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @AuthRateLimit({
    scope: 'login',
    limit: 5,
    windowMs: 15 * 60 * 1_000,
    includeEmail: true,
  })
  async login(
    @Body(new ZodValidationPipe(loginRequestSchema)) input: LoginRequest,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.login(
      input,
      this.securityContext(request),
    );
    if ('requiresTwoFactor' in result) {
      return createApiSuccessResponse(result);
    }
    this.cookies.setSessionCookie(response, result.token);

    return createApiSuccessResponse({
      identity: result.identity,
      session: result.session,
    });
  }

  @Public()
  @Post('login/two-factor')
  @HttpCode(HttpStatus.OK)
  @AuthRateLimit({
    scope: 'two-factor-login',
    limit: 5,
    windowMs: 15 * 60 * 1_000,
    includeEmail: false,
  })
  async completeTwoFactorLogin(
    @Body(new ZodValidationPipe(twoFactorLoginRequestSchema))
    input: TwoFactorLoginRequest,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.completeTwoFactorLogin(
      input,
      this.securityContext(request),
    );
    this.cookies.setSessionCookie(response, result.token);
    return createApiSuccessResponse({
      identity: result.identity,
      session: result.session,
    });
  }

  @Get('two-factor')
  @Roles('ADMIN')
  async twoFactorStatus(@CurrentAuth() auth: AuthRequestContext) {
    return createApiSuccessResponse(
      await this.authService.getTwoFactorStatus(auth),
    );
  }

  @Post('two-factor/setup')
  @Roles('ADMIN')
  async beginTwoFactorSetup(
    @CurrentAuth() auth: AuthRequestContext,
    @Body(new ZodValidationPipe(twoFactorPasswordRequestSchema))
    input: TwoFactorPasswordRequest,
    @Req() request: Request,
  ) {
    return createApiSuccessResponse(
      await this.authService.beginTwoFactorSetup(
        auth,
        input.password,
        this.securityContext(request),
      ),
    );
  }

  @Post('two-factor/enable')
  @Roles('ADMIN')
  async enableTwoFactor(
    @CurrentAuth() auth: AuthRequestContext,
    @Body(new ZodValidationPipe(twoFactorVerificationRequestSchema))
    input: TwoFactorVerificationRequest,
    @Req() request: Request,
  ) {
    return createApiSuccessResponse(
      await this.authService.enableTwoFactor(
        auth,
        input.code,
        this.securityContext(request),
      ),
    );
  }

  @Post('two-factor/recovery-codes')
  @Roles('ADMIN')
  async regenerateRecoveryCodes(
    @CurrentAuth() auth: AuthRequestContext,
    @Body(new ZodValidationPipe(twoFactorDisableRequestSchema))
    input: TwoFactorDisableRequest,
    @Req() request: Request,
  ) {
    return createApiSuccessResponse(
      await this.authService.regenerateRecoveryCodes(
        auth,
        input,
        this.securityContext(request),
      ),
    );
  }

  @Delete('two-factor')
  @Roles('ADMIN')
  async disableTwoFactor(
    @CurrentAuth() auth: AuthRequestContext,
    @Body(new ZodValidationPipe(twoFactorDisableRequestSchema))
    input: TwoFactorDisableRequest,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.authService.disableTwoFactor(
      auth,
      input,
      this.securityContext(request),
    );
    this.cookies.clearSessionCookie(response);
    return createApiSuccessResponse({
      message: 'Two-factor authentication disabled. Sign in again.',
    });
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @CurrentAuth() auth: AuthRequestContext,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ApiSuccessResponse<MessageResponse>> {
    await this.authService.logout(auth, this.securityContext(request));
    this.cookies.clearSessionCookie(response);
    return createApiSuccessResponse({ message: 'Signed out.' });
  }

  @Post('logout-all')
  @HttpCode(HttpStatus.OK)
  async logoutAll(
    @CurrentAuth() auth: AuthRequestContext,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ApiSuccessResponse<MessageResponse>> {
    await this.authService.logoutAll(auth, this.securityContext(request));
    this.cookies.clearSessionCookie(response);
    return createApiSuccessResponse({ message: 'All sessions were revoked.' });
  }

  @Public()
  @Post('password-reset/request')
  @HttpCode(HttpStatus.ACCEPTED)
  @AuthRateLimit({
    scope: 'password-reset-request',
    limit: 3,
    windowMs: 60 * 60 * 1_000,
    includeEmail: true,
  })
  async requestPasswordReset(
    @Body(new ZodValidationPipe(passwordResetRequestSchema))
    input: PasswordResetRequest,
    @Req() request: Request,
  ): Promise<ApiSuccessResponse<MessageResponse>> {
    await this.authService.requestPasswordReset(
      input.email,
      this.securityContext(request),
    );
    return createApiSuccessResponse({
      message:
        'If the account exists, password-reset instructions have been queued.',
    });
  }

  @Public()
  @Post('password-reset/confirm')
  @HttpCode(HttpStatus.OK)
  @AuthRateLimit({
    scope: 'password-reset-confirmation',
    limit: 5,
    windowMs: 15 * 60 * 1_000,
    includeEmail: false,
  })
  async confirmPasswordReset(
    @Body(new ZodValidationPipe(passwordResetConfirmationSchema))
    input: PasswordResetConfirmation,
    @Req() request: Request,
  ): Promise<ApiSuccessResponse<MessageResponse>> {
    await this.authService.confirmPasswordReset(
      input,
      this.securityContext(request),
    );
    return createApiSuccessResponse({
      message: 'Password changed. Existing sessions were revoked.',
    });
  }

  @Get('me')
  me(
    @CurrentAuth() auth: AuthRequestContext,
  ): ApiSuccessResponse<AuthenticatedIdentity> {
    return createApiSuccessResponse(auth.identity);
  }

  @Get('sessions')
  async sessions(
    @CurrentAuth() auth: AuthRequestContext,
  ): Promise<ApiSuccessResponse<AuthenticationSession[]>> {
    return createApiSuccessResponse(await this.authService.listSessions(auth));
  }

  @Delete('sessions/:sessionId')
  async revokeSession(
    @CurrentAuth() auth: AuthRequestContext,
    @Param('sessionId', new ParseUUIDPipe()) sessionId: string,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ApiSuccessResponse<MessageResponse>> {
    const revokedCurrent = await this.authService.revokeSession(
      auth,
      sessionId,
      this.securityContext(request),
    );

    if (revokedCurrent) {
      this.cookies.clearSessionCookie(response);
    }

    return createApiSuccessResponse({ message: 'Session revoked.' });
  }

  @Get('admin-check')
  @Roles('ADMIN')
  adminCheck(): ApiSuccessResponse<{ authorized: true }> {
    return createApiSuccessResponse({ authorized: true });
  }

  @Get('customer-profile/:customerId')
  @RequireCustomerOwnership('customerId')
  async customerProfile(
    @Param('customerId', new ParseUUIDPipe()) customerId: string,
  ): Promise<ApiSuccessResponse<CustomerProfileSummary>> {
    return createApiSuccessResponse(
      await this.authService.getCustomerProfile(customerId),
    );
  }

  private securityContext(request: Request) {
    return createSecurityRequestContext(request, this.auditSecret);
  }
}
