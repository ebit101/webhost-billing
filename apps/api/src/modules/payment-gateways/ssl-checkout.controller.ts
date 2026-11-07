import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import {
  createApiSuccessResponse,
  sslRefundRequestSchema,
  sslRefundReconcileSchema,
  type SslRefundRequest,
  type SslRefundReconcile,
} from '@webhost-billing/shared';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentAuth } from '../auth/decorators/current-auth.decorator';
import { AuthRateLimit } from '../auth/decorators/rate-limit.decorator';
import type { AuthRequestContext } from '../auth/auth.types';
import { SslCheckoutService } from './ssl-checkout.service';
import { SslRefundService } from './ssl-refund.service';

@Controller('payment-gateways/sslcommerz')
@Roles('ADMIN')
export class SslCheckoutController {
  constructor(
    private readonly checkouts: SslCheckoutService,
    private readonly refunds: SslRefundService,
  ) {}
  @Get('checkouts')
  async list(@CurrentAuth() actor: AuthRequestContext) {
    return createApiSuccessResponse(await this.checkouts.list(actor));
  }
  @Post('payments/:id/refunds')
  @AuthRateLimit({
    scope: 'ssl-refund-request',
    limit: 20,
    windowMs: 60000,
    includeEmail: false,
  })
  async refund(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(sslRefundRequestSchema))
    input: SslRefundRequest,
    @CurrentAuth() actor: AuthRequestContext,
  ) {
    return createApiSuccessResponse(
      await this.refunds.request(id, input, actor),
    );
  }
  @Post('refunds/:id/reconcile')
  @AuthRateLimit({
    scope: 'ssl-refund-reconcile',
    limit: 30,
    windowMs: 60000,
    includeEmail: false,
  })
  async reconcile(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(sslRefundReconcileSchema))
    input: SslRefundReconcile,
    @CurrentAuth() actor: AuthRequestContext,
  ) {
    return createApiSuccessResponse(
      await this.refunds.reconcile(id, input, actor),
    );
  }
}
