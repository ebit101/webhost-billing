import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Inject,
  Post,
  Put,
  Req,
} from '@nestjs/common';
import type { ApiEnvironment } from '@webhost-billing/config';
import {
  updateBusinessSettingsRequestSchema,
  createApiSuccessResponse,
  integrationCredentialUpdateSchema,
  type UpdateBusinessSettingsRequest,
  type IntegrationCredentialUpdate,
  saveSmtpSettingsSchema,
  smtpActivationSchema,
  type SaveSmtpSettings,
  type SmtpActivation,
} from '@webhost-billing/shared';
import type { Request } from 'express';
import { createSecurityRequestContext } from '../../common/http/request-context';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe';
import { API_ENVIRONMENT } from '../../infrastructure/environment/environment.module';
import type { AuthRequestContext } from '../auth/auth.types';
import { CurrentAuth } from '../auth/decorators/current-auth.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { StaffPermissionRequired } from '../auth/decorators/staff-permission.decorator';
import { IntegrationCredentialService } from './integration-credential.service';
import { SettingsService } from './settings.service';
import { SmtpSettingsService } from './smtp-settings.service';

@Controller('settings')
@Roles('ADMIN')
export class SettingsController {
  private readonly auditSecret: string;

  constructor(
    private readonly settings: SettingsService,
    private readonly credentials: IntegrationCredentialService,
    private readonly smtp: SmtpSettingsService,
    @Inject(API_ENVIRONMENT) environment: ApiEnvironment,
  ) {
    this.auditSecret = environment.SESSION_SECRET;
  }

  @Get()
  async overview() {
    return createApiSuccessResponse(await this.settings.overview());
  }

  @Get('presentation')
  @StaffPermissionRequired('business.presentation')
  async presentation() {
    return createApiSuccessResponse(await this.settings.presentation());
  }

  @Put()
  async update(
    @Body(new ZodValidationPipe(updateBusinessSettingsRequestSchema))
    input: UpdateBusinessSettingsRequest,
    @CurrentAuth() auth: AuthRequestContext,
    @Req() request: Request,
  ) {
    return createApiSuccessResponse(
      await this.settings.update(input, auth, this.context(request)),
    );
  }

  @Put('credentials')
  async replaceCredential(
    @Body(new ZodValidationPipe(integrationCredentialUpdateSchema))
    input: IntegrationCredentialUpdate,
    @CurrentAuth() auth: AuthRequestContext,
    @Req() request: Request,
  ) {
    return createApiSuccessResponse(
      await this.credentials.replace(input, auth, this.context(request)),
    );
  }

  private context(request: Request) {
    return createSecurityRequestContext(request, this.auditSecret);
  }

  @Get('smtp')
  @Header('Cache-Control', 'no-store')
  async smtpStatus(@CurrentAuth() auth: AuthRequestContext) {
    return createApiSuccessResponse(await this.smtp.status(auth));
  }
  @Put('smtp')
  @Header('Cache-Control', 'no-store')
  async saveSmtp(
    @Body(new ZodValidationPipe(saveSmtpSettingsSchema))
    input: SaveSmtpSettings,
    @CurrentAuth() auth: AuthRequestContext,
    @Req() request: Request,
  ) {
    return createApiSuccessResponse(
      await this.smtp.save(input, auth, this.context(request)),
    );
  }
  @Post('smtp/activation')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async activateSmtp(
    @Body(new ZodValidationPipe(smtpActivationSchema)) input: SmtpActivation,
    @CurrentAuth() auth: AuthRequestContext,
    @Req() request: Request,
  ) {
    return createApiSuccessResponse(
      await this.smtp.activate(input, auth, this.context(request)),
    );
  }
}
