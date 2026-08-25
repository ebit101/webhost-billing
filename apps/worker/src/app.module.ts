import { Module } from '@nestjs/common';
import { WorkerEnvironmentModule } from './infrastructure/environment.module';
import { OutboxModule } from './outbox/outbox.module';

@Module({ imports: [WorkerEnvironmentModule, OutboxModule] })
export class AppModule {}
