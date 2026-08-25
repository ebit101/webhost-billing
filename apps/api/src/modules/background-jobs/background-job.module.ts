import {
  Inject,
  Injectable,
  Module,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { BackgroundQueueCatalog } from '@webhost-billing/queue';
import { DatabaseModule } from '../../infrastructure/database/database.module';
import {
  API_ENVIRONMENT,
  EnvironmentModule,
} from '../../infrastructure/environment/environment.module';
import { BackgroundJobController } from './background-job.controller';
import {
  API_BACKGROUND_QUEUES,
  BackgroundJobService,
  createApiBackgroundQueues,
} from './background-job.service';

@Injectable()
class ApiBackgroundQueueLifecycle implements OnApplicationShutdown {
  constructor(
    @Inject(API_BACKGROUND_QUEUES)
    private readonly queues: BackgroundQueueCatalog,
  ) {}

  async onApplicationShutdown(): Promise<void> {
    await this.queues.close();
  }
}

@Module({
  imports: [EnvironmentModule, DatabaseModule],
  controllers: [BackgroundJobController],
  providers: [
    {
      provide: API_BACKGROUND_QUEUES,
      inject: [API_ENVIRONMENT],
      useFactory: createApiBackgroundQueues,
    },
    ApiBackgroundQueueLifecycle,
    BackgroundJobService,
  ],
})
export class BackgroundJobModule {}
