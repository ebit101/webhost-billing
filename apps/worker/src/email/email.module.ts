import {
  Inject,
  Injectable,
  Logger,
  Module,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import type { WorkerEnvironment } from '@webhost-billing/config';
import type { PrismaClient } from '@webhost-billing/database';
import { BackgroundWorker } from '@webhost-billing/queue';
import {
  WORKER_ENVIRONMENT,
  WorkerEnvironmentModule,
} from '../infrastructure/environment.module';
import { EmailDeliveryService } from './email-delivery.service';
import { EMAIL_ADAPTER } from './email.module.tokens';
import { EmailMessageResolver } from './email-message.resolver';
import { EmailTemplateCatalog } from './email-template.catalog';
import { ConfiguredEmailAdapter } from './configured-email.adapter';
import { WORKER_PRISMA } from '../infrastructure/database.module';
import type { EmailAdapter } from './email.types';

const EMAIL_BACKGROUND_WORKER = Symbol('EMAIL_BACKGROUND_WORKER');

@Injectable()
class EmailConsumerLifecycle
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  constructor(
    @Inject(EMAIL_BACKGROUND_WORKER)
    private readonly worker: BackgroundWorker,
    @Inject(EMAIL_ADAPTER) private readonly adapter: EmailAdapter,
    private readonly delivery: EmailDeliveryService,
    @Inject(WORKER_ENVIRONMENT) private readonly environment: WorkerEnvironment,
  ) {}

  onApplicationBootstrap(): void {
    this.worker.register(
      'emails',
      (data, signal) => this.delivery.deliver(data, signal),
      this.environment.EMAIL_WORKER_CONCURRENCY,
    );
  }

  async onApplicationShutdown(): Promise<void> {
    await this.worker.close();
    await this.adapter.close();
  }
}

@Module({
  imports: [WorkerEnvironmentModule],
  providers: [
    EmailTemplateCatalog,
    EmailMessageResolver,
    EmailDeliveryService,
    {
      provide: EMAIL_ADAPTER,
      inject: [WORKER_ENVIRONMENT, WORKER_PRISMA],
      useFactory: (
        environment: WorkerEnvironment,
        prisma: PrismaClient,
      ): EmailAdapter => new ConfiguredEmailAdapter(environment, prisma),
    },
    {
      provide: EMAIL_BACKGROUND_WORKER,
      inject: [WORKER_ENVIRONMENT],
      useFactory: (environment: WorkerEnvironment): BackgroundWorker => {
        const logger = new Logger('EmailBackgroundWorker');
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
    EmailConsumerLifecycle,
  ],
})
export class EmailModule {}
