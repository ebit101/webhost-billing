import {
  Global,
  Inject,
  Injectable,
  Module,
  type OnApplicationShutdown,
} from '@nestjs/common';
import type { ApiEnvironment } from '@webhost-billing/config';
import {
  createPrismaClient,
  type PrismaClient,
} from '@webhost-billing/database';
import {
  API_ENVIRONMENT,
  EnvironmentModule,
} from '../environment/environment.module';

export const PRISMA_CLIENT = Symbol('PRISMA_CLIENT');

@Injectable()
class DatabaseLifecycle implements OnApplicationShutdown {
  constructor(@Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient) {}

  async onApplicationShutdown(): Promise<void> {
    await this.prisma.$disconnect();
  }
}

@Global()
@Module({
  imports: [EnvironmentModule],
  providers: [
    {
      provide: PRISMA_CLIENT,
      inject: [API_ENVIRONMENT],
      useFactory: (environment: ApiEnvironment): PrismaClient =>
        createPrismaClient(environment.DATABASE_URL),
    },
    DatabaseLifecycle,
  ],
  exports: [PRISMA_CLIENT],
})
export class DatabaseModule {}
