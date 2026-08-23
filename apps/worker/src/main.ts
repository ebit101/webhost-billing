import { NestFactory } from '@nestjs/core';
import {
  loadEnvironmentFiles,
  parseWorkerEnvironment,
} from '@webhost-billing/config';
import { AppModule } from './app.module';

async function bootstrap() {
  loadEnvironmentFiles();
  parseWorkerEnvironment(process.env);
  const app = await NestFactory.createApplicationContext(AppModule);
  app.enableShutdownHooks();
}
void bootstrap();
