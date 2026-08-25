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
import { HostingAutomationService } from './hosting-automation.service';

const HOSTING_AUTOMATION_WORKER = Symbol('HOSTING_AUTOMATION_WORKER');

@Injectable()
class HostingAutomationLifecycle
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  constructor(
    @Inject(HOSTING_AUTOMATION_WORKER)
    private readonly worker: BackgroundWorker,
    private readonly automation: HostingAutomationService,
  ) {}

  onApplicationBootstrap(): void {
    const handler = (
      data: Parameters<HostingAutomationService['process']>[0],
    ) => this.automation.process(data);
    this.worker.register('hosting-suspension', handler);
    this.worker.register('hosting-unsuspension', handler);
  }

  async onApplicationShutdown(): Promise<void> {
    await this.worker.close();
  }
}

@Module({
  imports: [WorkerEnvironmentModule, WorkerDatabaseModule],
  providers: [
    { provide: CLOCK, useClass: SystemClock },
    HostingAutomationService,
    {
      provide: HOSTING_AUTOMATION_WORKER,
      inject: [WORKER_ENVIRONMENT],
      useFactory: (environment: WorkerEnvironment) => {
        const logger = new Logger('HostingAutomationWorker');
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
    HostingAutomationLifecycle,
  ],
})
export class HostingAutomationModule {}
