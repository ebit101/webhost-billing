import { Module } from '@nestjs/common';
import { RenewalAutomationController } from './renewal-automation.controller';
import { RenewalAutomationService } from './renewal-automation.service';

@Module({
  controllers: [RenewalAutomationController],
  providers: [RenewalAutomationService],
})
export class RenewalAutomationModule {}
