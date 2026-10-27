import { Module } from '@nestjs/common';
import { NotificationDeliveryModule } from './notifications/notification.module';
import { RegistrarModule } from './registrar/registrar.module';
import { EmailModule } from './email/email.module';
import { WorkerEnvironmentModule } from './infrastructure/environment.module';
import { OutboxModule } from './outbox/outbox.module';
import { RenewalConsumerModule } from './renewal/renewal-consumer.module';
import { HostingAutomationModule } from './renewal/hosting-automation.module';

@Module({
  imports: [
    NotificationDeliveryModule,
    RegistrarModule,
    WorkerEnvironmentModule,
    OutboxModule,
    EmailModule,
    RenewalConsumerModule,
    HostingAutomationModule,
  ],
})
export class AppModule {}
