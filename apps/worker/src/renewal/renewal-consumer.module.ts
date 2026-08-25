import {
  Inject,
  Injectable,
  Logger,
  Module,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import type { WorkerEnvironment } from '@webhost-billing/config';
import { BackgroundWorker } from '@webhost-billing/queue';
import { WorkerDatabaseModule } from '../infrastructure/database.module';
import {
  WORKER_ENVIRONMENT,
  WorkerEnvironmentModule,
} from '../infrastructure/environment.module';
import { CLOCK, SystemClock } from './clock';
import { RenewalProcessorService } from './renewal-processor.service';

const RENEWAL_BACKGROUND_WORKER = Symbol('RENEWAL_BACKGROUND_WORKER');

@Injectable()
class RenewalConsumerLifecycle
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  constructor(
    @Inject(RENEWAL_BACKGROUND_WORKER)
    private readonly worker: BackgroundWorker,
    private readonly processor: RenewalProcessorService,
  ) {}

  onApplicationBootstrap(): void {
    this.worker.register('renewal-invoice-generation', (data) =>
      this.processor.process(data),
    );
  }

  async onApplicationShutdown(): Promise<void> {
    await this.worker.close();
  }
}

@Module({
  imports: [WorkerEnvironmentModule, WorkerDatabaseModule],
  providers: [
    { provide: CLOCK, useClass: SystemClock },
    RenewalProcessorService,
    {
      provide: RENEWAL_BACKGROUND_WORKER,
      inject: [WORKER_ENVIRONMENT],
      useFactory: (environment: WorkerEnvironment) => {
        const logger = new Logger('RenewalBackgroundWorker');
        return new BackgroundWorker(
          environment.REDIS_URL,
          environment.BULLMQ_PREFIX,
          (entry) =>
            entry.level === 'error'
              ? logger.error(JSON.stringify(entry))
              : logger.log(JSON.stringify(entry)),
        );
      },
    },
    RenewalConsumerLifecycle,
  ],
})
export class RenewalConsumerModule {}
