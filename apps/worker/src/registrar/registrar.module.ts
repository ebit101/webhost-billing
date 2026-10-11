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
import { RegistrarProcessor } from '@webhost-billing/database/registrar';
import { BackgroundWorker } from '@webhost-billing/queue';
import {
  WorkerDatabaseModule,
  WORKER_PRISMA,
} from '../infrastructure/database.module';
import {
  WorkerEnvironmentModule,
  WORKER_ENVIRONMENT,
} from '../infrastructure/environment.module';

@Injectable()
export class RegistrarConsumer
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly worker: BackgroundWorker;
  private readonly processor: RegistrarProcessor;
  private readonly simulationAllowed: boolean;
  constructor(
    @Inject(WORKER_ENVIRONMENT) environment: WorkerEnvironment,
    @Inject(WORKER_PRISMA) private readonly prisma: PrismaClient,
  ) {
    this.simulationAllowed = environment.NODE_ENV !== 'production';
    const logger = new Logger('RegistrarConsumer');
    this.worker = new BackgroundWorker(
      environment.REDIS_URL,
      environment.BULLMQ_PREFIX,
      (entry) => logger.log(JSON.stringify(entry)),
    );
    this.processor = new RegistrarProcessor(
      prisma,
      environment.CREDENTIAL_ENCRYPTION_KEY,
    );
  }
  onApplicationBootstrap() {
    if (!this.simulationAllowed) return;
    this.worker.register('domain-registration', async (data) => {
      const event = await this.prisma.outboxEvent.findUnique({
        where: { id: data.outboxEventId },
      });
      if (
        !event ||
        event.aggregateType !== 'REGISTRAR_OPERATION' ||
        event.aggregateId !== data.aggregateId ||
        event.eventType !== data.eventType ||
        ![
          'DOMAIN_REGISTRATION_REQUESTED',
          'DOMAIN_REGISTRATION_RECONCILE',
        ].includes(event.eventType)
      )
        throw new Error('Registrar job reference is invalid.');
      const op = await this.prisma.registrarOperation.findUnique({
        where: { id: data.aggregateId },
      });
      if (event.eventType === 'DOMAIN_REGISTRATION_RECONCILE' && !op?.claimedAt)
        throw new Error('Reconciliation cannot dispatch a registration.');
      await this.processor.process(data.aggregateId);
    });
  }
  async onApplicationShutdown() {
    await this.worker.close();
  }
}
@Module({
  imports: [WorkerDatabaseModule, WorkerEnvironmentModule],
  providers: [RegistrarConsumer],
})
export class RegistrarModule {}
