import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { ApiEnvironment } from '@webhost-billing/config';
import { ApplicationException } from '../../common/errors/application.exception';
import { API_ENVIRONMENT } from '../../infrastructure/environment/environment.module';
import { BkashPaymentGateway } from './bkash-payment.gateway';
import { FakePaymentGateway } from './fake-payment.gateway';
import type { PaymentGateway } from './payment-gateway.interface';
import { SslCommerzPaymentGateway } from './sslcommerz-payment.gateway';

@Injectable()
export class PaymentGatewayRegistry {
  constructor(
    private readonly fake: FakePaymentGateway,
    private readonly bkash: BkashPaymentGateway,
    private readonly sslcommerz: SslCommerzPaymentGateway,
    @Inject(API_ENVIRONMENT) private readonly environment: ApiEnvironment,
  ) {}

  get(provider: string): PaymentGateway {
    if (provider === this.bkash.key && this.environment.BKASH_ENABLED) {
      return this.bkash;
    }
    if (
      provider === this.sslcommerz.key &&
      this.environment.SSLCOMMERZ_ENABLED
    ) {
      return this.sslcommerz;
    }
    if (
      provider === this.fake.key &&
      this.environment.NODE_ENV !== 'production'
    ) {
      return this.fake;
    }
    throw new ApplicationException({
      status: HttpStatus.NOT_FOUND,
      code: 'RESOURCE_NOT_FOUND',
      message: 'Payment gateway was not found.',
    });
  }

  list(): PaymentGateway[] {
    const gateways: PaymentGateway[] = [];
    if (this.environment.BKASH_ENABLED) gateways.push(this.bkash);
    if (this.environment.SSLCOMMERZ_ENABLED) gateways.push(this.sslcommerz);
    if (this.environment.NODE_ENV !== 'production') gateways.push(this.fake);
    return gateways;
  }
}
