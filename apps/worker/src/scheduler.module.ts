import { TicketAttachmentRetentionService } from './ticket-attachment-retention.service';
import { WorkerDatabaseModule } from './infrastructure/database.module';
import { Module } from '@nestjs/common';
import { NotificationSchedulerModule } from './notifications/notification.module';
import { WorkerEnvironmentModule } from './infrastructure/environment.module';
import { RenewalSchedulerModule } from './renewal/renewal-scheduler.module';

@Module({
  providers: [TicketAttachmentRetentionService],
  imports: [
    WorkerEnvironmentModule,
    WorkerDatabaseModule,
    RenewalSchedulerModule,
    NotificationSchedulerModule,
  ],
})
export class SchedulerModule {}
