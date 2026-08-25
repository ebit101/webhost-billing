import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { ApiEnvironment } from '@webhost-billing/config';
import { ApplicationException } from '../../common/errors/application.exception';
import { API_ENVIRONMENT } from '../../infrastructure/environment/environment.module';
import { FakePaymentGateway } from './fake-payment.gateway';
import type { PaymentGateway } from './payment-gateway.interface';

@Injectable()
export class PaymentGatewayRegistry {
  constructor(
    private readonly fake: FakePaymentGateway,
    @Inject(API_ENVIRONMENT) private readonly environment: ApiEnvironment,
  ) {}

  get(provider: string): PaymentGateway {
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
}
