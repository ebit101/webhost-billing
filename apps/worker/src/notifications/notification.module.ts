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
import { NotificationDeliveryService } from './notification-delivery.service';
import { NotificationProjectionService } from './notification-projection.service';
import {
  WHATSAPP_NOTIFICATION_ADAPTER,
  WhatsAppPreviewAdapter,
} from './whatsapp-preview.adapter';

@Injectable()
class NotificationConsumer
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly worker: BackgroundWorker;
  constructor(
    @Inject(WORKER_ENVIRONMENT) environment: WorkerEnvironment,
    private readonly delivery: NotificationDeliveryService,
  ) {
    const logger = new Logger('NotificationConsumer');
    this.worker = new BackgroundWorker(
      environment.REDIS_URL,
      environment.BULLMQ_PREFIX,
      (entry) =>
        entry.level === 'error'
          ? logger.error(JSON.stringify(entry))
          : logger.log(JSON.stringify(entry)),
    );
  }
  onApplicationBootstrap() {
    this.worker.register(
      'notifications',
      (data) => this.delivery.deliver(data),
      1,
    );
  }
  async onApplicationShutdown() {
    await this.worker.close();
  }
}

@Injectable()
class NotificationScheduler
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger('NotificationScheduler');
  private timer?: NodeJS.Timeout;
  private active?: Promise<number>;
  constructor(
    private readonly projection: NotificationProjectionService,
    @Inject(WORKER_ENVIRONMENT) private readonly environment: WorkerEnvironment,
  ) {}
  onApplicationBootstrap() {
    this.timer = setInterval(
      () => void this.tick(),
      this.environment.SCHEDULER_POLL_INTERVAL_MS,
    );
    void this.tick();
  }
  async onApplicationShutdown() {
    if (this.timer) clearInterval(this.timer);
    await this.active;
  }
  private async tick() {
    if (this.active) return;
    this.active = this.projection.projectOnce();
    try {
      await this.active;
    } catch {
      this.logger.error(
        JSON.stringify({ event: 'notification_projection_failed' }),
      );
    } finally {
      this.active = undefined;
    }
  }
}

@Module({
  imports: [WorkerDatabaseModule, WorkerEnvironmentModule],
  providers: [
    NotificationDeliveryService,
    NotificationConsumer,
    {
      provide: WHATSAPP_NOTIFICATION_ADAPTER,
      inject: [WORKER_ENVIRONMENT],
      useFactory: (environment: WorkerEnvironment) =>
        new WhatsAppPreviewAdapter(environment.EMAIL_PREVIEW_DIRECTORY),
    },
  ],
})
export class NotificationDeliveryModule {}

@Module({
  imports: [WorkerDatabaseModule, WorkerEnvironmentModule],
  providers: [NotificationProjectionService, NotificationScheduler],
})
export class NotificationSchedulerModule {}
