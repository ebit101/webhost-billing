import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import type { ApiEnvironment } from '@webhost-billing/config';
import {
  createApiSuccessResponse,
  createHostingUpgradeQuoteSchema,
  confirmHostingUpgradeSchema,
} from '@webhost-billing/shared';
import type { z } from 'zod';
import { createSecurityRequestContext } from '../../common/http/request-context';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe';
import { API_ENVIRONMENT } from '../../infrastructure/environment/environment.module';
import { CurrentAuth } from '../auth/decorators/current-auth.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { CustomerSupportAccess } from '../auth/decorators/customer-support-session.decorator';
import type { AuthRequestContext } from '../auth/auth.types';
import { HostingUpgradeService } from './hosting-upgrade.service';

@Controller('services/:serviceId/upgrades')
export class HostingUpgradeController {
  constructor(
    private readonly upgrades: HostingUpgradeService,
    @Inject(API_ENVIRONMENT) private readonly environment: ApiEnvironment,
  ) {}

  @Get()
  @Roles('ADMIN', 'CUSTOMER')
  @CustomerSupportAccess()
  async list(
    @Param('serviceId', new ParseUUIDPipe()) serviceId: string,
    @CurrentAuth() actor: AuthRequestContext,
    @Query('customerId', new ParseUUIDPipe({ optional: true }))
    customerId?: string,
  ) {
    return createApiSuccessResponse(
      await this.upgrades.list(serviceId, actor, customerId),
    );
  }
  @Post()
  @Roles('ADMIN')
  async offer(
    @Param('serviceId', new ParseUUIDPipe()) serviceId: string,
    @Body(new ZodValidationPipe(createHostingUpgradeQuoteSchema))
    input: z.output<typeof createHostingUpgradeQuoteSchema>,
    @CurrentAuth() actor: AuthRequestContext,
    @Req() request: Request,
    @Query('customerId', new ParseUUIDPipe({ optional: true }))
    customerId?: string,
  ) {
    return createApiSuccessResponse(
      await this.upgrades.offer(
        serviceId,
        input,
        actor,
        this.context(request),
        customerId,
      ),
    );
  }
  @Post(':upgradeId/accept')
  @Roles('CUSTOMER')
  @HttpCode(HttpStatus.OK)
  async accept(
    @Param('serviceId', new ParseUUIDPipe()) serviceId: string,
    @Param('upgradeId', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(confirmHostingUpgradeSchema))
    _input: z.output<typeof confirmHostingUpgradeSchema>,
    @CurrentAuth() actor: AuthRequestContext,
    @Req() request: Request,
    @Query('customerId', new ParseUUIDPipe({ optional: true }))
    customerId?: string,
  ) {
    return createApiSuccessResponse(
      await this.upgrades.accept(
        serviceId,
        id,
        actor,
        this.context(request),
        customerId,
      ),
    );
  }
  @Post(':upgradeId/approve')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.OK)
  async approve(
    @Param('serviceId', new ParseUUIDPipe()) serviceId: string,
    @Param('upgradeId', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(confirmHostingUpgradeSchema))
    _input: z.output<typeof confirmHostingUpgradeSchema>,
    @CurrentAuth() actor: AuthRequestContext,
    @Req() request: Request,
    @Query('customerId', new ParseUUIDPipe({ optional: true }))
    customerId?: string,
  ) {
    return createApiSuccessResponse(
      await this.upgrades.approve(
        serviceId,
        id,
        actor,
        this.context(request),
        customerId,
      ),
    );
  }
  @Post(':upgradeId/cancel')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.OK)
  async cancel(
    @Param('serviceId', new ParseUUIDPipe()) serviceId: string,
    @Param('upgradeId', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(confirmHostingUpgradeSchema))
    _input: z.output<typeof confirmHostingUpgradeSchema>,
    @CurrentAuth() actor: AuthRequestContext,
    @Req() request: Request,
    @Query('customerId', new ParseUUIDPipe({ optional: true }))
    customerId?: string,
  ) {
    return createApiSuccessResponse(
      await this.upgrades.cancel(
        serviceId,
        id,
        actor,
        this.context(request),
        customerId,
      ),
    );
  }
  private context(request: Request) {
    return createSecurityRequestContext(
      request,
      this.environment.SESSION_SECRET,
    );
  }
}
