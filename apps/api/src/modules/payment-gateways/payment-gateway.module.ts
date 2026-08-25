import { Module } from '@nestjs/common';
import { BkashPaymentGateway } from './bkash-payment.gateway';
import { FakePaymentGateway } from './fake-payment.gateway';
import { PaymentGatewayController } from './payment-gateway.controller';
import { PaymentGatewayRegistry } from './payment-gateway.registry';
import { PaymentGatewayService } from './payment-gateway.service';
import {
  FetchPaymentHttpClient,
  PAYMENT_HTTP_CLIENT,
} from './payment-http.client';
import { SslCommerzPaymentGateway } from './sslcommerz-payment.gateway';

@Module({
  controllers: [PaymentGatewayController],
  providers: [
    FakePaymentGateway,
    BkashPaymentGateway,
    SslCommerzPaymentGateway,
    {
      provide: PAYMENT_HTTP_CLIENT,
      useClass: FetchPaymentHttpClient,
    },
    PaymentGatewayRegistry,
    PaymentGatewayService,
  ],
  exports: [
    FakePaymentGateway,
    BkashPaymentGateway,
    SslCommerzPaymentGateway,
    PaymentGatewayRegistry,
    PaymentGatewayService,
  ],
})
export class PaymentGatewayModule {}
