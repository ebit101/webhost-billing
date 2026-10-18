import { Module } from '@nestjs/common';
import { DomainModule } from '../domains/domain.module';
import { OrderController } from './order.controller';
import { OrderService } from './order.service';

@Module({
  imports: [DomainModule],
  controllers: [OrderController],
  providers: [OrderService],
  exports: [OrderService],
})
export class OrderModule {}
