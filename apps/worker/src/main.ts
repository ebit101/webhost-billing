import { NestFactory } from '@nestjs/core';
import {
  loadEnvironmentFiles,
  parseWorkerEnvironment,
} from '@webhost-billing/config';
import { StructuredLogger } from '@webhost-billing/shared/observability';
import { AppModule } from './app.module';

async function bootstrap() {
  loadEnvironmentFiles();
  const environment = parseWorkerEnvironment(process.env);
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: new StructuredLogger({
      service: 'worker',
      environment: environment.NODE_ENV,
    }),
  });
  app.enableShutdownHooks();
}
void bootstrap();
