import {
  Global,
  Inject,
  Injectable,
  Logger,
  Module,
  type OnApplicationShutdown,
} from '@nestjs/common';
import type { WorkerEnvironment } from '@webhost-billing/config';
import { BackgroundQueueCatalog } from '@webhost-billing/queue';
import {
  WORKER_ENVIRONMENT,
  WorkerEnvironmentModule,
} from './environment.module';

export const BACKGROUND_QUEUES = Symbol('BACKGROUND_QUEUES');

@Injectable()
class QueueLifecycle implements OnApplicationShutdown {
  constructor(
    @Inject(BACKGROUND_QUEUES) private readonly queues: BackgroundQueueCatalog,
  ) {}

  async onApplicationShutdown(): Promise<void> {
    await this.queues.close();
  }
}

@Global()
@Module({
  imports: [WorkerEnvironmentModule],
  providers: [
    {
      provide: BACKGROUND_QUEUES,
      inject: [WORKER_ENVIRONMENT],
      useFactory: (environment: WorkerEnvironment): BackgroundQueueCatalog =>
        new BackgroundQueueCatalog(
          environment.REDIS_URL,
          environment.BULLMQ_PREFIX,
          (entry) =>
            new Logger('BackgroundQueues').error(JSON.stringify(entry)),
        ),
    },
    QueueLifecycle,
  ],
  exports: [BACKGROUND_QUEUES],
})
export class QueueInfrastructureModule {}
