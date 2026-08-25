import { Module } from '@nestjs/common';
import { FakePaymentGateway } from './fake-payment.gateway';
import { PaymentGatewayController } from './payment-gateway.controller';
import { PaymentGatewayRegistry } from './payment-gateway.registry';
import { PaymentGatewayService } from './payment-gateway.service';

@Module({
  controllers: [PaymentGatewayController],
  providers: [
    FakePaymentGateway,
    PaymentGatewayRegistry,
    PaymentGatewayService,
  ],
  exports: [FakePaymentGateway, PaymentGatewayRegistry, PaymentGatewayService],
})
export class PaymentGatewayModule {}
