import { Module } from '@nestjs/common';
import { NotificationSchedulerModule } from './notifications/notification.module';
import { WorkerEnvironmentModule } from './infrastructure/environment.module';
import { RenewalSchedulerModule } from './renewal/renewal-scheduler.module';

@Module({
  imports: [
    WorkerEnvironmentModule,
    RenewalSchedulerModule,
    NotificationSchedulerModule,
  ],
})
export class SchedulerModule {}
