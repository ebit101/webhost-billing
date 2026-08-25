import {
  Global,
  Inject,
  Injectable,
  Module,
  type OnApplicationShutdown,
} from '@nestjs/common';
import type { WorkerEnvironment } from '@webhost-billing/config';
import {
  createPrismaClient,
  type PrismaClient,
} from '@webhost-billing/database';
import {
  WORKER_ENVIRONMENT,
  WorkerEnvironmentModule,
} from './environment.module';

export const WORKER_PRISMA = Symbol('WORKER_PRISMA');

@Injectable()
class WorkerDatabaseLifecycle implements OnApplicationShutdown {
  constructor(@Inject(WORKER_PRISMA) private readonly prisma: PrismaClient) {}

  async onApplicationShutdown(): Promise<void> {
    await this.prisma.$disconnect();
  }
}

@Global()
@Module({
  imports: [WorkerEnvironmentModule],
  providers: [
    {
      provide: WORKER_PRISMA,
      inject: [WORKER_ENVIRONMENT],
      useFactory: (environment: WorkerEnvironment): PrismaClient =>
        createPrismaClient(environment.DATABASE_URL),
    },
    WorkerDatabaseLifecycle,
  ],
  exports: [WORKER_PRISMA],
})
export class WorkerDatabaseModule {}
