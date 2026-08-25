import { Module } from '@nestjs/common';
import { WorkerDatabaseModule } from '../infrastructure/database.module';
import { CLOCK, SystemClock } from './clock';
import { RenewalSchedulerService } from './renewal-scheduler.service';

@Module({
  imports: [WorkerDatabaseModule],
  providers: [
    { provide: CLOCK, useClass: SystemClock },
    RenewalSchedulerService,
  ],
  exports: [RenewalSchedulerService],
})
export class RenewalSchedulerModule {}
