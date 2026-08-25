import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { ApiEnvironment } from '@webhost-billing/config';
import {
  createApiSuccessResponse,
  createPaginatedApiSuccessResponse,
  executeHostingOperationRequestSchema,
  hostingPanelOperationListQuerySchema,
  retryHostingOperationRequestSchema,
  testHostingConnectionRequestSchema,
  type ExecuteHostingOperationRequest,
  type HostingPanelOperationListQuery,
  type RetryHostingOperationRequest,
  type TestHostingConnectionRequest,
} from '@webhost-billing/shared';
import type { Request } from 'express';
import { createSecurityRequestContext } from '../../common/http/request-context';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe';
import { API_ENVIRONMENT } from '../../infrastructure/environment/environment.module';
import type { AuthRequestContext } from '../auth/auth.types';
import { CurrentAuth } from '../auth/decorators/current-auth.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { HostingPanelService } from './hosting-panel.service';

@Controller('hosting-panel')
export class HostingPanelController {
  private readonly auditSecret: string;

  constructor(
    private readonly hostingPanels: HostingPanelService,
    @Inject(API_ENVIRONMENT) environment: ApiEnvironment,
  ) {
    this.auditSecret = environment.SESSION_SECRET;
  }

  @Get('operations')
  @Roles('ADMIN')
  async list(
    @Query(new ZodValidationPipe(hostingPanelOperationListQuerySchema))
    query: HostingPanelOperationListQuery,
  ) {
    const result = await this.hostingPanels.list(query);
    return createPaginatedApiSuccessResponse(result.data, result.pagination);
  }

  @Post('servers/:serverId/test')
  @Roles('ADMIN')
  async testConnection(
    @Param('serverId', new ParseUUIDPipe()) serverId: string,
    @Body(new ZodValidationPipe(testHostingConnectionRequestSchema))
    input: TestHostingConnectionRequest,
    @CurrentAuth() auth: AuthRequestContext,
    @Req() request: Request,
  ) {
    return createApiSuccessResponse(
      await this.hostingPanels.testConnection(
        serverId,
        input,
        auth,
        this.context(request),
      ),
    );
  }

  @Post('services/:serviceId/operations')
  @Roles('ADMIN')
  async execute(
    @Param('serviceId', new ParseUUIDPipe()) serviceId: string,
    @Body(new ZodValidationPipe(executeHostingOperationRequestSchema))
    input: ExecuteHostingOperationRequest,
    @CurrentAuth() auth: AuthRequestContext,
    @Req() request: Request,
  ) {
    return createApiSuccessResponse(
      await this.hostingPanels.execute(
        serviceId,
        input,
        auth,
        this.context(request),
      ),
    );
  }

  @Post('services/:serviceId/login-url')
  @Roles('CUSTOMER')
  async customerLogin(
    @Param('serviceId', new ParseUUIDPipe()) serviceId: string,
    @Body(new ZodValidationPipe(testHostingConnectionRequestSchema))
    input: TestHostingConnectionRequest,
    @CurrentAuth() auth: AuthRequestContext,
    @Req() request: Request,
  ) {
    return createApiSuccessResponse(
      await this.hostingPanels.generateCustomerLogin(
        serviceId,
        input.submissionKey,
        auth,
        this.context(request),
      ),
    );
  }

  @Post('operations/:operationId/retry')
  @Roles('ADMIN')
  async retry(
    @Param('operationId', new ParseUUIDPipe()) operationId: string,
    @Body(new ZodValidationPipe(retryHostingOperationRequestSchema))
    input: RetryHostingOperationRequest,
    @CurrentAuth() auth: AuthRequestContext,
    @Req() request: Request,
  ) {
    return createApiSuccessResponse(
      await this.hostingPanels.retry(
        operationId,
        input,
        auth,
        this.context(request),
      ),
    );
  }

  private context(request: Request) {
    return createSecurityRequestContext(request, this.auditSecret);
  }
}
