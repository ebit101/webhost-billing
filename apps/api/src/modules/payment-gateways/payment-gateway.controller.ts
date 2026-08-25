import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import {
  createApiSuccessResponse,
  createPaymentSessionRequestSchema,
  type CreatePaymentSessionRequest,
} from '@webhost-billing/shared';
import type { Request } from 'express';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe';
import type { AuthRequestContext } from '../auth/auth.types';
import { CurrentAuth } from '../auth/decorators/current-auth.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { AuthRateLimit } from '../auth/decorators/rate-limit.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { SkipCsrf } from '../auth/decorators/skip-csrf.decorator';
import { PaymentGatewayService } from './payment-gateway.service';

@Controller('payment-gateways')
export class PaymentGatewayController {
  constructor(private readonly payments: PaymentGatewayService) {}

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
}
