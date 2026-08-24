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
  createAdminOrderRequestSchema,
  createApiSuccessResponse,
  createCustomerOrderRequestSchema,
  createPaginatedApiSuccessResponse,
  orderListQuerySchema,
  updateOrderStatusRequestSchema,
  type CreateAdminOrderRequest,
  type CreateCustomerOrderRequest,
  type OrderListQuery,
  type UpdateOrderStatusRequest,
} from '@webhost-billing/shared';
import type { Request } from 'express';
import { createSecurityRequestContext } from '../../common/http/request-context';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe';
import { API_ENVIRONMENT } from '../../infrastructure/environment/environment.module';
import type { AuthRequestContext } from '../auth/auth.types';
import { CurrentAuth } from '../auth/decorators/current-auth.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { OrderService } from './order.service';

@Controller('orders')
export class OrderController {
  private readonly auditSecret: string;

  constructor(
    private readonly orders: OrderService,
    @Inject(API_ENVIRONMENT) environment: ApiEnvironment,
  ) {
    this.auditSecret = environment.SESSION_SECRET;
  }

  @Post('checkout')
  @Roles('CUSTOMER')
  @HttpCode(HttpStatus.CREATED)
  async checkout(
    @Body(new ZodValidationPipe(createCustomerOrderRequestSchema))
    input: CreateCustomerOrderRequest,
    @CurrentAuth() auth: AuthRequestContext,
    @Req() request: Request,
  ) {
    if (auth.identity.role !== 'CUSTOMER') throw new Error('Unreachable role');
    return createApiSuccessResponse(
      await this.orders.create(
        { ...input, customerId: auth.identity.customerId },
        auth,
        this.context(request),
        'CUSTOMER',
      ),
    );
  }

  @Post('admin')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.CREATED)
  async createByAdmin(
    @Body(new ZodValidationPipe(createAdminOrderRequestSchema))
    input: CreateAdminOrderRequest,
    @CurrentAuth() auth: AuthRequestContext,
    @Req() request: Request,
  ) {
    return createApiSuccessResponse(
      await this.orders.create(input, auth, this.context(request), 'ADMIN'),
    );
  }

  @Get('my')
  @Roles('CUSTOMER')
  async myOrders(
    @Query(
      new ZodValidationPipe(orderListQuerySchema.omit({ customerId: true })),
    )
    query: Omit<OrderListQuery, 'customerId'>,
    @CurrentAuth() auth: AuthRequestContext,
  ) {
    if (auth.identity.role !== 'CUSTOMER') throw new Error('Unreachable role');
    const result = await this.orders.list({
      ...query,
      customerId: auth.identity.customerId,
    });
    return createPaginatedApiSuccessResponse(result.data, result.pagination);
  }

  @Get()
  @Roles('ADMIN')
  async list(
    @Query(new ZodValidationPipe(orderListQuerySchema)) query: OrderListQuery,
  ) {
    const result = await this.orders.list(query);
    return createPaginatedApiSuccessResponse(result.data, result.pagination);
  }

  @Get(':orderId')
  @Roles('ADMIN', 'CUSTOMER')
  async detail(
    @Param('orderId', new ParseUUIDPipe()) orderId: string,
    @CurrentAuth() auth: AuthRequestContext,
  ) {
    return createApiSuccessResponse(await this.orders.get(orderId, auth));
  }

  @Patch(':orderId/status')
  @Roles('ADMIN')
  async updateStatus(
    @Param('orderId', new ParseUUIDPipe()) orderId: string,
    @Body(new ZodValidationPipe(updateOrderStatusRequestSchema))
    input: UpdateOrderStatusRequest,
    @CurrentAuth() auth: AuthRequestContext,
    @Req() request: Request,
  ) {
    return createApiSuccessResponse(
      await this.orders.updateStatus(
        orderId,
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
