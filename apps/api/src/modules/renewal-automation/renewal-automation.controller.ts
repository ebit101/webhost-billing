import { Body, Controller, Get, Inject, Put, Req } from '@nestjs/common';
import type { ApiEnvironment } from '@webhost-billing/config';
import {
  createApiSuccessResponse,
  renewalAutomationPolicySchema,
  type RenewalAutomationPolicy,
} from '@webhost-billing/shared';
import type { Request } from 'express';
import { createSecurityRequestContext } from '../../common/http/request-context';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe';
import { API_ENVIRONMENT } from '../../infrastructure/environment/environment.module';
import type { AuthRequestContext } from '../auth/auth.types';
import { CurrentAuth } from '../auth/decorators/current-auth.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RenewalAutomationService } from './renewal-automation.service';

@Controller('renewal-automation')
@Roles('ADMIN')
export class RenewalAutomationController {
  private readonly auditSecret: string;

  constructor(
    private readonly automation: RenewalAutomationService,
    @Inject(API_ENVIRONMENT) environment: ApiEnvironment,
  ) {
    this.auditSecret = environment.SESSION_SECRET;
  }

  @Get('policy')
  async policy() {
    return createApiSuccessResponse(await this.automation.policy());
  }

  @Put('policy')
  async updatePolicy(
    @Body(new ZodValidationPipe(renewalAutomationPolicySchema))
    input: RenewalAutomationPolicy,
    @CurrentAuth() auth: AuthRequestContext,
    @Req() request: Request,
  ) {
    return createApiSuccessResponse(
      await this.automation.updatePolicy(
        input,
        auth,
        createSecurityRequestContext(request, this.auditSecret),
      ),
    );
  }

  @Get('runs')
  async runs() {
    return createApiSuccessResponse(await this.automation.runs());
  }
}
