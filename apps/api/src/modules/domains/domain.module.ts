import { Module } from '@nestjs/common';
import { DomainController } from './domain.controller';
import { DomainService } from './domain.service';
import { DomainLifecycleService } from './domain-lifecycle.service';
@Module({
  controllers: [DomainController],
  providers: [DomainService, DomainLifecycleService],
})
export class DomainModule {}
