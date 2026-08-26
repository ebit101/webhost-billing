import { NestFactory } from '@nestjs/core';
import {
  loadEnvironmentFiles,
  parseWorkerEnvironment,
} from '@webhost-billing/config';
import { StructuredLogger } from '@webhost-billing/shared';
import { SchedulerModule } from './scheduler.module';

async function bootstrap(): Promise<void> {
  loadEnvironmentFiles();
  const environment = parseWorkerEnvironment(process.env);
  const application = await NestFactory.createApplicationContext(
    SchedulerModule,
    {
      logger: new StructuredLogger({
        service: 'scheduler',
        environment: environment.NODE_ENV,
      }),
    },
  );
  application.enableShutdownHooks(['SIGINT', 'SIGTERM']);
}

void bootstrap();
