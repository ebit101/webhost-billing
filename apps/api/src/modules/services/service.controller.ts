import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { ApiEnvironment } from '@webhost-billing/config';
import {
  createApiSuccessResponse,
  createPaginatedApiSuccessResponse,
  createServiceRequestSchema,
  serviceListQuerySchema,
  transitionServiceRequestSchema,
  type CreateServiceRequest,
  type ServiceListQuery,
  type TransitionServiceRequest,
} from '@webhost-billing/shared';
import type { Request } from 'express';
import { createSecurityRequestContext } from '../../common/http/request-context';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe';
import { API_ENVIRONMENT } from '../../infrastructure/environment/environment.module';
import type { AuthRequestContext } from '../auth/auth.types';
import { CurrentAuth } from '../auth/decorators/current-auth.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { ServiceService } from './service.service';

@Controller('services')
export class ServiceController {
  private readonly auditSecret: string;

  constructor(
    private readonly services: ServiceService,
    @Inject(API_ENVIRONMENT) environment: ApiEnvironment,
  ) {
    this.auditSecret = environment.SESSION_SECRET;
  }

  @Get('setup-options')
  @Roles('ADMIN')
  async setupOptions() {
    return createApiSuccessResponse(await this.services.setupOptions());
  }

  @Get('my')
  @Roles('CUSTOMER')
  async myServices(
    @Query(
      new ZodValidationPipe(
        serviceListQuerySchema.omit({ customerId: true, serverId: true }),
      ),
    )
    query: Omit<ServiceListQuery, 'customerId' | 'serverId'>,
    @CurrentAuth() auth: AuthRequestContext,
  ) {
    if (auth.identity.role !== 'CUSTOMER') throw new Error('Unreachable role');
    const result = await this.services.list({
      ...query,
      customerId: auth.identity.customerId,
    });
    return createPaginatedApiSuccessResponse(result.data, result.pagination);
  }

  @Get()
  @Roles('ADMIN')
  async list(
    @Query(new ZodValidationPipe(serviceListQuerySchema))
    query: ServiceListQuery,
  ) {
    const result = await this.services.list(query);
    return createPaginatedApiSuccessResponse(result.data, result.pagination);
  }

  @Get(':serviceId')
  @Roles('ADMIN', 'CUSTOMER')
  async detail(
    @Param('serviceId', new ParseUUIDPipe()) serviceId: string,
    @CurrentAuth() auth: AuthRequestContext,
  ) {
    return createApiSuccessResponse(await this.services.get(serviceId, auth));
  }

  @Post()
  @Roles('ADMIN')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body(new ZodValidationPipe(createServiceRequestSchema))
    input: CreateServiceRequest,
    @CurrentAuth() auth: AuthRequestContext,
    @Req() request: Request,
  ) {
    return createApiSuccessResponse(
      await this.services.create(input, auth, this.context(request)),
    );
  }

  @Patch(':serviceId/status')
  @Roles('ADMIN')
  async transition(
    @Param('serviceId', new ParseUUIDPipe()) serviceId: string,
    @Body(new ZodValidationPipe(transitionServiceRequestSchema))
    input: TransitionServiceRequest,
    @CurrentAuth() auth: AuthRequestContext,
    @Req() request: Request,
  ) {
    return createApiSuccessResponse(
      await this.services.transition(
        serviceId,
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
