import { Body, Controller, Get, Inject, Put, Req } from '@nestjs/common';
import type { ApiEnvironment } from '@webhost-billing/config';
import {
  businessSettingsSchema,
  createApiSuccessResponse,
  integrationCredentialUpdateSchema,
  type BusinessSettings,
  type IntegrationCredentialUpdate,
} from '@webhost-billing/shared';
import type { Request } from 'express';
import { createSecurityRequestContext } from '../../common/http/request-context';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe';
import { API_ENVIRONMENT } from '../../infrastructure/environment/environment.module';
import type { AuthRequestContext } from '../auth/auth.types';
import { CurrentAuth } from '../auth/decorators/current-auth.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { IntegrationCredentialService } from './integration-credential.service';
import { SettingsService } from './settings.service';

@Controller('settings')
@Roles('ADMIN')
export class SettingsController {
  private readonly auditSecret: string;

  constructor(
    private readonly settings: SettingsService,
    private readonly credentials: IntegrationCredentialService,
    @Inject(API_ENVIRONMENT) environment: ApiEnvironment,
  ) {
    this.auditSecret = environment.SESSION_SECRET;
  }

  @Get()
  async overview() {
    return createApiSuccessResponse(await this.settings.overview());
  }

  @Put()
  async update(
    @Body(new ZodValidationPipe(businessSettingsSchema))
    input: BusinessSettings,
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
}
