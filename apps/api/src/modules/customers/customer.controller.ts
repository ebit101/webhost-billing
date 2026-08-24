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
  Res,
} from '@nestjs/common';
import type { ApiEnvironment } from '@webhost-billing/config';
import {
  changeCustomerPasswordRequestSchema,
  createApiSuccessResponse,
  createCustomerRequestSchema,
  createPaginatedApiSuccessResponse,
  customerListQuerySchema,
  updateCustomerAccessRequestSchema,
  updateCustomerBillingRequestSchema,
  updateCustomerProfileRequestSchema,
  type ChangeCustomerPasswordRequest,
  type CreateCustomerRequest,
  type CustomerListQuery,
  type UpdateCustomerAccessRequest,
  type UpdateCustomerBillingRequest,
  type UpdateCustomerProfileRequest,
} from '@webhost-billing/shared';
import type { Request, Response } from 'express';
import { createSecurityRequestContext } from '../../common/http/request-context';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe';
import { API_ENVIRONMENT } from '../../infrastructure/environment/environment.module';
import type { AuthRequestContext } from '../auth/auth.types';
import { CurrentAuth } from '../auth/decorators/current-auth.decorator';
import { RequireCustomerOwnership } from '../auth/decorators/customer-ownership.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthCookieService } from '../auth/services/auth-cookie.service';
import { CustomerService } from './customer.service';

@Controller('customers')
export class CustomerController {
  private readonly auditSecret: string;

  constructor(
    private readonly customers: CustomerService,
    private readonly cookies: AuthCookieService,
    @Inject(API_ENVIRONMENT) environment: ApiEnvironment,
  ) {
    this.auditSecret = environment.SESSION_SECRET;
  }

  @Post()
  @Roles('ADMIN')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body(new ZodValidationPipe(createCustomerRequestSchema))
    input: CreateCustomerRequest,
    @CurrentAuth() auth: AuthRequestContext,
    @Req() request: Request,
  ) {
    return createApiSuccessResponse(
      await this.customers.create(input, auth, this.context(request)),
    );
  }

  @Get()
  @Roles('ADMIN')
  async list(
    @Query(new ZodValidationPipe(customerListQuerySchema))
    query: CustomerListQuery,
  ) {
    const result = await this.customers.list(query);
    return createPaginatedApiSuccessResponse(result.data, result.pagination);
  }

  @Get(':customerId')
  @Roles('ADMIN', 'CUSTOMER')
  @RequireCustomerOwnership('customerId')
  async detail(@Param('customerId', new ParseUUIDPipe()) customerId: string) {
    return createApiSuccessResponse(await this.customers.getById(customerId));
  }

  @Patch(':customerId/profile')
  @Roles('ADMIN', 'CUSTOMER')
  @RequireCustomerOwnership('customerId')
  async updateProfile(
    @Param('customerId', new ParseUUIDPipe()) customerId: string,
    @Body(new ZodValidationPipe(updateCustomerProfileRequestSchema))
    input: UpdateCustomerProfileRequest,
    @CurrentAuth() auth: AuthRequestContext,
    @Req() request: Request,
  ) {
    return createApiSuccessResponse(
      await this.customers.updateProfile(
        customerId,
        input,
        auth,
        this.context(request),
      ),
    );
  }

  @Patch(':customerId/billing')
  @Roles('ADMIN')
  async updateBilling(
    @Param('customerId', new ParseUUIDPipe()) customerId: string,
    @Body(new ZodValidationPipe(updateCustomerBillingRequestSchema))
    input: UpdateCustomerBillingRequest,
    @CurrentAuth() auth: AuthRequestContext,
    @Req() request: Request,
  ) {
    return createApiSuccessResponse(
      await this.customers.updateBilling(
        customerId,
        input,
        auth,
        this.context(request),
      ),
    );
  }

  @Patch(':customerId/access')
  @Roles('ADMIN')
  async updateAccess(
    @Param('customerId', new ParseUUIDPipe()) customerId: string,
    @Body(new ZodValidationPipe(updateCustomerAccessRequestSchema))
    input: UpdateCustomerAccessRequest,
    @CurrentAuth() auth: AuthRequestContext,
    @Req() request: Request,
  ) {
    return createApiSuccessResponse(
      await this.customers.updateAccess(
        customerId,
        input,
        auth,
        this.context(request),
      ),
    );
  }

  @Post(':customerId/change-password')
  @Roles('CUSTOMER')
  @RequireCustomerOwnership('customerId')
  @HttpCode(HttpStatus.OK)
  async changePassword(
    @Param('customerId', new ParseUUIDPipe()) customerId: string,
    @Body(new ZodValidationPipe(changeCustomerPasswordRequestSchema))
    input: ChangeCustomerPasswordRequest,
    @CurrentAuth() auth: AuthRequestContext,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.customers.changePassword(
      customerId,
      input,
      auth,
      this.context(request),
    );
    this.cookies.clearSessionCookie(response);
    return createApiSuccessResponse({
      message: 'Password changed. Sign in again.',
    });
  }

  private context(request: Request) {
    return createSecurityRequestContext(request, this.auditSecret);
  }
}
