import { Module } from '@nestjs/common';
import { DomainModule } from '../domains/domain.module';
import { AuthModule } from '../auth/auth.module';
import { GuestCheckoutService } from './guest-checkout.service';
import { OrderController } from './order.controller';
import { OrderService } from './order.service';
import { AdminOrderDomainService } from './admin-order-domain.service';

@Module({
  imports: [AuthModule, DomainModule],
  controllers: [OrderController],
  providers: [OrderService, GuestCheckoutService, AdminOrderDomainService],
  exports: [OrderService],
})
export class OrderModule {}
