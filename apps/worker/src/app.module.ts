import { Module } from '@nestjs/common';
import { EmailModule } from './email/email.module';
import { WorkerEnvironmentModule } from './infrastructure/environment.module';
import { OutboxModule } from './outbox/outbox.module';

@Module({ imports: [WorkerEnvironmentModule, OutboxModule, EmailModule] })
export class AppModule {}
