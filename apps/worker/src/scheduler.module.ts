import { Module } from '@nestjs/common';
import { WorkerEnvironmentModule } from './infrastructure/environment.module';
import { RenewalSchedulerModule } from './renewal/renewal-scheduler.module';

@Module({ imports: [WorkerEnvironmentModule, RenewalSchedulerModule] })
export class SchedulerModule {}
