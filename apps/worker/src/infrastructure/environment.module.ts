import { Global, Module } from '@nestjs/common';
import {
  loadEnvironmentFiles,
  parseWorkerEnvironment,
  type WorkerEnvironment,
} from '@webhost-billing/config';

export const WORKER_ENVIRONMENT = Symbol('WORKER_ENVIRONMENT');

@Global()
@Module({
  providers: [
    {
      provide: WORKER_ENVIRONMENT,
      useFactory: (): WorkerEnvironment => {
        loadEnvironmentFiles();
        return parseWorkerEnvironment(process.env);
      },
    },
  ],
  exports: [WORKER_ENVIRONMENT],
})
export class WorkerEnvironmentModule {}
