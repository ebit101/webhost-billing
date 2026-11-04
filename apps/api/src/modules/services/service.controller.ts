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
  cancelServiceAddOnSchema,
  createApiSuccessResponse,
  createPaginatedApiSuccessResponse,
  createServiceRequestSchema,
  serviceListQuerySchema,
  serviceSslQuerySchema,
  transitionServiceRequestSchema,
  hostingCancellationInputSchema,
  paginationQuerySchema,
  type HostingCancellationInput,
  type PaginationQuery,
  type CreateServiceRequest,
  type ServiceListQuery,
  type TransitionServiceRequest,
} from '@webhost-billing/shared';
import type { z } from 'zod';
import type { Request } from 'express';
import { createSecurityRequestContext } from '../../common/http/request-context';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe';
import { API_ENVIRONMENT } from '../../infrastructure/environment/environment.module';
import type { AuthRequestContext } from '../auth/auth.types';
import { CurrentAuth } from '../auth/decorators/current-auth.decorator';
import { CustomerSupportAccess } from '../auth/decorators/customer-support-session.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthRateLimit } from '../auth/decorators/rate-limit.decorator';
import { ServiceService } from './service.service';
import { HostingCancellationService } from './hosting-cancellation.service';
import { ServiceSslStatusService } from './service-ssl-status.service';
import { ServiceAddOnsService } from './service-add-ons.service';

@Controller('services')
export class ServiceController {
  private readonly auditSecret: string;

  constructor(
    private readonly services: ServiceService,
    private readonly cancellations: HostingCancellationService,
    private readonly ssl: ServiceSslStatusService,
    private readonly addOns: ServiceAddOnsService,
    @Inject(API_ENVIRONMENT) environment: ApiEnvironment,
  ) {
    this.auditSecret = environment.SESSION_SECRET;
  }

  @Get('my/ssl-status')
  @Roles('CUSTOMER')
  @CustomerSupportAccess()
  @AuthRateLimit({
    scope: 'service-ssl-status',
    limit: 60,
    windowMs: 60_000,
    includeEmail: false,
  })
  async mySslStatus(
    @Query(new ZodValidationPipe(serviceSslQuerySchema))
    query: z.output<typeof serviceSslQuerySchema>,
    @CurrentAuth() auth: AuthRequestContext,
  ) {
    if (auth.identity.role !== 'CUSTOMER') throw new Error('Unreachable role');
    return createApiSuccessResponse(
      await this.ssl.list(auth.identity.customerId, query.ids),
    );
  }

  @Get('setup-options')
  @Roles('ADMIN')
  async setupOptions() {
    return createApiSuccessResponse(await this.services.setupOptions());
  }

  @Get('my')
  @CustomerSupportAccess()
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

  @Get('cancellation-requests')
  @Roles('ADMIN')
  async listCancellations(
    @Query(new ZodValidationPipe(paginationQuerySchema)) query: PaginationQuery,
  ) {
    const result = await this.cancellations.list(query);
    return createPaginatedApiSuccessResponse(result.data, result.pagination);
  }

  @Get(':serviceId/add-ons')
  @Roles('CUSTOMER')
  @CustomerSupportAccess()
  async listAddOns(
    @Param('serviceId', new ParseUUIDPipe()) serviceId: string,
    @CurrentAuth() auth: AuthRequestContext,
  ) {
    return createApiSuccessResponse(await this.addOns.list(serviceId, auth));
  }

  @Post(':serviceId/add-ons/:addOnId/cancel')
  @HttpCode(HttpStatus.OK)
  @Roles('CUSTOMER')
  async cancelAddOn(
    @Param('serviceId', new ParseUUIDPipe()) serviceId: string,
    @Param('addOnId', new ParseUUIDPipe()) addOnId: string,
    @Body(new ZodValidationPipe(cancelServiceAddOnSchema))
    input: z.output<typeof cancelServiceAddOnSchema>,
    @CurrentAuth() auth: AuthRequestContext,
    @Req() request: Request,
  ) {
    return createApiSuccessResponse(
      await this.addOns.cancel(
        serviceId,
        addOnId,
        input.expectedEndAt,
        auth,
        this.context(request),
      ),
    );
  }

  @Get(':serviceId/cancellation-request')
  @Roles('CUSTOMER')
  @CustomerSupportAccess()
  async cancellation(
    @Param('serviceId', new ParseUUIDPipe()) serviceId: string,
    @CurrentAuth() auth: AuthRequestContext,
  ) {
    return createApiSuccessResponse(
      await this.cancellations.detail(serviceId, auth),
    );
  }

  @Post(':serviceId/cancellation-request')
  @Roles('CUSTOMER')
  async requestCancellation(
    @Param('serviceId', new ParseUUIDPipe()) serviceId: string,
    @Body(new ZodValidationPipe(hostingCancellationInputSchema))
    input: HostingCancellationInput,
    @CurrentAuth() auth: AuthRequestContext,
    @Req() request: Request,
  ) {
    return createApiSuccessResponse(
      await this.cancellations.request(
        serviceId,
        input,
        auth,
        this.context(request),
      ),
    );
  }

  @Post(':serviceId/cancellation-request/:cancellationId/withdraw')
  @Roles('CUSTOMER')
  async withdrawCancellation(
    @Param('serviceId', new ParseUUIDPipe()) serviceId: string,
    @Param('cancellationId', new ParseUUIDPipe()) cancellationId: string,
    @CurrentAuth() auth: AuthRequestContext,
    @Req() request: Request,
  ) {
    return createApiSuccessResponse(
      await this.cancellations.withdraw(
        serviceId,
        cancellationId,
        auth,
        this.context(request),
      ),
    );
  }

  @Post(':serviceId/cancellation-request/:cancellationId/approve')
  @Roles('ADMIN')
  async approveCancellation(
    @Param('serviceId', new ParseUUIDPipe()) serviceId: string,
    @Param('cancellationId', new ParseUUIDPipe()) cancellationId: string,
    @CurrentAuth() auth: AuthRequestContext,
    @Req() request: Request,
  ) {
    return createApiSuccessResponse(
      await this.cancellations.approve(
        serviceId,
        cancellationId,
        auth,
        this.context(request),
      ),
    );
  }

  @Get(':serviceId')
  @CustomerSupportAccess()
  @Roles('ADMIN', 'CUSTOMER')
  async detail(
    @Param('serviceId', new ParseUUIDPipe()) serviceId: string,
    @CurrentAuth() auth: AuthRequestContext,
    @Query('customerId', new ParseUUIDPipe({ optional: true }))
    customerId?: string,
  ) {
    return createApiSuccessResponse(
      await this.services.get(serviceId, auth, customerId),
    );
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
