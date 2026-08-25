import { Module } from '@nestjs/common';
import { WorkerDatabaseModule } from '../infrastructure/database.module';
import { QueueInfrastructureModule } from '../infrastructure/queue.module';
import { OutboxDispatcherService } from './outbox-dispatcher.service';

@Module({
  imports: [WorkerDatabaseModule, QueueInfrastructureModule],
  providers: [OutboxDispatcherService],
  exports: [OutboxDispatcherService],
})
export class OutboxModule {}
