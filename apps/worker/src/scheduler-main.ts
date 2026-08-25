import { NestFactory } from '@nestjs/core';
import { SchedulerModule } from './scheduler.module';

async function bootstrap(): Promise<void> {
  const application =
    await NestFactory.createApplicationContext(SchedulerModule);
  application.enableShutdownHooks(['SIGINT', 'SIGTERM']);
}

void bootstrap();
