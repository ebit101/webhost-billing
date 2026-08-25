import { Module } from '@nestjs/common';
import { EmailModule } from './email/email.module';
import { WorkerEnvironmentModule } from './infrastructure/environment.module';
import { OutboxModule } from './outbox/outbox.module';
import { RenewalConsumerModule } from './renewal/renewal-consumer.module';
import { HostingAutomationModule } from './renewal/hosting-automation.module';

@Module({
  imports: [
    WorkerEnvironmentModule,
    OutboxModule,
    EmailModule,
    RenewalConsumerModule,
    HostingAutomationModule,
  ],
})
export class AppModule {}
