import {
  Global,
  Inject,
  Injectable,
  Module,
  type OnApplicationShutdown,
} from '@nestjs/common';
import type { ApiEnvironment } from '@webhost-billing/config';
import { createClient } from 'redis';
import {
  API_ENVIRONMENT,
  EnvironmentModule,
} from '../environment/environment.module';

async function createRedisConnection(url: string) {
  const client = createClient({ url });
  await client.connect();
  return client;
}

export type RedisClient = Awaited<ReturnType<typeof createRedisConnection>>;
export const REDIS_CLIENT = Symbol('REDIS_CLIENT');

@Injectable()
class RedisLifecycle implements OnApplicationShutdown {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: RedisClient) {}

  async onApplicationShutdown(): Promise<void> {
    if (this.redis.isOpen) {
      await this.redis.close();
    }
  }
}

@Global()
@Module({
  imports: [EnvironmentModule],
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [API_ENVIRONMENT],
      useFactory: (environment: ApiEnvironment): Promise<RedisClient> =>
        createRedisConnection(environment.REDIS_URL),
    },
    RedisLifecycle,
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule {}
