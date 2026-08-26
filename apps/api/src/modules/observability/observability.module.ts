import {
  MiddlewareConsumer,
  Module,
  RequestMethod,
  type NestModule,
} from '@nestjs/common';
import { DatabaseModule } from '../../infrastructure/database/database.module';
import { RedisModule } from '../../infrastructure/redis/redis.module';
import { BackgroundJobModule } from '../background-jobs/background-job.module';
import {
  HealthController,
  ObservabilityController,
} from './observability.controller';
import { ObservabilityService } from './observability.service';
import { RequestObservabilityMiddleware } from './request-observability.middleware';

@Module({
  imports: [DatabaseModule, RedisModule, BackgroundJobModule],
  controllers: [HealthController, ObservabilityController],
  providers: [ObservabilityService, RequestObservabilityMiddleware],
})
export class ObservabilityModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestObservabilityMiddleware).forRoutes({
      path: '{*path}',
      method: RequestMethod.ALL,
    });
  }
}
