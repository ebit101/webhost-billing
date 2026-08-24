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
  createPaymentAdjustmentRequestSchema,
  paymentListQuerySchema,
  paymentSettingsSchema,
  recordManualPaymentRequestSchema,
  reviewManualPaymentRequestSchema,
  submitManualPaymentRequestSchema,
  type CreatePaymentAdjustmentRequest,
  type PaymentListQuery,
  type PaymentSettings,
  type RecordManualPaymentRequest,
  type ReviewManualPaymentRequest,
  type SubmitManualPaymentRequest,
} from '@webhost-billing/shared';
import type { Request } from 'express';
import { createSecurityRequestContext } from '../../common/http/request-context';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe';
import { API_ENVIRONMENT } from '../../infrastructure/environment/environment.module';
import type { AuthRequestContext } from '../auth/auth.types';
import { CurrentAuth } from '../auth/decorators/current-auth.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { PaymentService } from './payment.service';

@Controller('payments')
export class PaymentController {
  private readonly auditSecret: string;

  constructor(
    private readonly payments: PaymentService,
    @Inject(API_ENVIRONMENT) environment: ApiEnvironment,
  ) {
    this.auditSecret = environment.SESSION_SECRET;
  }

  @Get('settings')
  @Roles('ADMIN')
  async getSettings() {
    return createApiSuccessResponse(await this.payments.getSettings());
  }

  @Patch('settings')
  @Roles('ADMIN')
  async updateSettings(
    @Body(new ZodValidationPipe(paymentSettingsSchema)) input: PaymentSettings,
    @CurrentAuth() auth: AuthRequestContext,
    @Req() request: Request,
  ) {
    return createApiSuccessResponse(
      await this.payments.updateSettings(input, auth, this.context(request)),
    );
  }

  @Post('manual/customer')
  @Roles('CUSTOMER')
  @HttpCode(HttpStatus.CREATED)
  async submitManual(
    @Body(new ZodValidationPipe(submitManualPaymentRequestSchema))
    input: SubmitManualPaymentRequest,
    @CurrentAuth() auth: AuthRequestContext,
    @Req() request: Request,
  ) {
    return createApiSuccessResponse(
      await this.payments.submitManual(input, auth, this.context(request)),
    );
  }

  @Post('manual/admin')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.CREATED)
  async recordManual(
    @Body(new ZodValidationPipe(recordManualPaymentRequestSchema))
    input: RecordManualPaymentRequest,
    @CurrentAuth() auth: AuthRequestContext,
    @Req() request: Request,
  ) {
    return createApiSuccessResponse(
      await this.payments.recordManual(input, auth, this.context(request)),
    );
  }

  @Get('my')
  @Roles('CUSTOMER')
  async myPayments(
    @Query(
      new ZodValidationPipe(paymentListQuerySchema.omit({ customerId: true })),
    )
    query: Omit<PaymentListQuery, 'customerId'>,
    @CurrentAuth() auth: AuthRequestContext,
  ) {
    if (auth.identity.role !== 'CUSTOMER') throw new Error('Unreachable role');
    const result = await this.payments.list({
      ...query,
      customerId: auth.identity.customerId,
    });
    return createPaginatedApiSuccessResponse(result.data, result.pagination);
  }

  @Get()
  @Roles('ADMIN')
  async list(
    @Query(new ZodValidationPipe(paymentListQuerySchema))
    query: PaymentListQuery,
  ) {
    const result = await this.payments.list(query);
    return createPaginatedApiSuccessResponse(result.data, result.pagination);
  }

  @Get(':paymentId')
  @Roles('ADMIN', 'CUSTOMER')
  async detail(
    @Param('paymentId', new ParseUUIDPipe()) paymentId: string,
    @CurrentAuth() auth: AuthRequestContext,
  ) {
    return createApiSuccessResponse(await this.payments.get(paymentId, auth));
  }

  @Patch(':paymentId/review')
  @Roles('ADMIN')
  async review(
    @Param('paymentId', new ParseUUIDPipe()) paymentId: string,
    @Body(new ZodValidationPipe(reviewManualPaymentRequestSchema))
    input: ReviewManualPaymentRequest,
    @CurrentAuth() auth: AuthRequestContext,
    @Req() request: Request,
  ) {
    return createApiSuccessResponse(
      await this.payments.review(paymentId, input, auth, this.context(request)),
    );
  }

  @Post(':paymentId/adjustments')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.CREATED)
  async adjust(
    @Param('paymentId', new ParseUUIDPipe()) paymentId: string,
    @Body(new ZodValidationPipe(createPaymentAdjustmentRequestSchema))
    input: CreatePaymentAdjustmentRequest,
    @CurrentAuth() auth: AuthRequestContext,
    @Req() request: Request,
  ) {
    return createApiSuccessResponse(
      await this.payments.adjust(paymentId, input, auth, this.context(request)),
    );
  }

  private context(request: Request) {
    return createSecurityRequestContext(request, this.auditSecret);
  }
}
