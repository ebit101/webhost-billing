import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { ApiEnvironment } from '@webhost-billing/config';
import {
  createApiSuccessResponse,
  createPaymentSessionRequestSchema,
  type CreatePaymentSessionRequest,
} from '@webhost-billing/shared';
import type { Request } from 'express';
import type { Response } from 'express';
import { z } from 'zod';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe';
import type { AuthRequestContext } from '../auth/auth.types';
import { CurrentAuth } from '../auth/decorators/current-auth.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { AuthRateLimit } from '../auth/decorators/rate-limit.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { SkipCsrf } from '../auth/decorators/skip-csrf.decorator';
import { API_ENVIRONMENT } from '../../infrastructure/environment/environment.module';
import { PaymentGatewayService } from './payment-gateway.service';

const bkashCallbackSchema = z
  .object({
    paymentID: z.string().min(1).max(191),
    status: z.enum(['success', 'failure', 'cancel']),
  })
  .passthrough();

@Controller('payment-gateways')
export class PaymentGatewayController {
  constructor(
    private readonly payments: PaymentGatewayService,
    @Inject(API_ENVIRONMENT) private readonly environment: ApiEnvironment,
  ) {}

  @Get()
  @Roles('ADMIN', 'CUSTOMER')
  async listGateways() {
    return createApiSuccessResponse(await this.payments.listGateways());
  }

  @Get('failures')
  @Roles('ADMIN')
  async listFailures() {
    return createApiSuccessResponse(await this.payments.listFailures());
  }

  @Post(':provider/sessions')
  @Roles('ADMIN', 'CUSTOMER')
  @HttpCode(HttpStatus.CREATED)
  async createSession(
    @Param('provider') provider: string,
    @Body(new ZodValidationPipe(createPaymentSessionRequestSchema))
    input: CreatePaymentSessionRequest,
    @CurrentAuth() auth: AuthRequestContext,
  ) {
    return createApiSuccessResponse(
      await this.payments.createSession(provider, input, auth),
    );
  }

  @Post(':provider/webhooks')
  @Public()
  @SkipCsrf()
  @AuthRateLimit({
    scope: 'payment-webhook',
    limit: 120,
    windowMs: 60_000,
    includeEmail: false,
  })
  @HttpCode(HttpStatus.ACCEPTED)
  async webhook(
    @Param('provider') provider: string,
    @Headers('x-payment-signature') signature: string | undefined,
    @Req() request: RawBodyRequest<Request>,
  ) {
    return createApiSuccessResponse(
      await this.payments.processWebhook(
        provider,
        request.rawBody ?? Buffer.alloc(0),
        signature ?? '',
      ),
    );
  }

  @Get('bkash/callback')
  @Public()
  @SkipCsrf()
  @AuthRateLimit({
    scope: 'bkash-callback',
    limit: 60,
    windowMs: 60_000,
    includeEmail: false,
  })
  async bkashCallback(
    @Query(new ZodValidationPipe(bkashCallbackSchema))
    query: z.infer<typeof bkashCallbackSchema>,
    @Res() response: Response,
  ) {
    const result = await this.payments.completeBkashCallback(
      query.paymentID,
      query.status,
    );
    response.redirect(
      HttpStatus.SEE_OTHER,
      `${this.environment.WEB_ORIGIN}/portal/invoices/${result.invoiceId}`,
    );
  }

  @Post('sslcommerz/return/:status')
  @Public()
  @SkipCsrf()
  @AuthRateLimit({
    scope: 'sslcommerz-return',
    limit: 60,
    windowMs: 60_000,
    includeEmail: false,
  })
  sslCommerzReturn(
    @Param('status') _status: string,
    @Req() request: RawBodyRequest<Request>,
    @Res() response: Response,
  ) {
    const form = new URLSearchParams(
      (request.rawBody ?? Buffer.alloc(0)).toString('utf8'),
    );
    const invoiceId = z.uuid().safeParse(form.get('value_b'));
    const path = invoiceId.success
      ? `/portal/invoices/${invoiceId.data}`
      : '/portal/invoices';
    response.redirect(
      HttpStatus.SEE_OTHER,
      `${this.environment.WEB_ORIGIN}${path}`,
    );
  }

  @Post(':provider/payments/:paymentId/reconcile')
  @Roles('ADMIN')
  async reconcile(
    @Param('provider') provider: string,
    @Param('paymentId') paymentId: string,
    @CurrentAuth() auth: AuthRequestContext,
  ) {
    return createApiSuccessResponse(
      await this.payments.reconcilePayment(provider, paymentId, auth),
    );
  }
}
