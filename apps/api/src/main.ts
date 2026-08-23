import { NestFactory } from '@nestjs/core';
import {
  loadEnvironmentFiles,
  parseApiEnvironment,
} from '@webhost-billing/config';
import { AppModule } from './app.module';

async function bootstrap() {
  loadEnvironmentFiles();
  const environment = parseApiEnvironment({
    ...process.env,
    PORT: process.env.API_PORT ?? '3001',
  });
  const app = await NestFactory.create(AppModule);
  app.enableCors({
    origin: environment.WEB_ORIGIN,
    credentials: true,
    allowedHeaders: ['Content-Type', 'X-CSRF-Token'],
  });
  await app.listen(environment.PORT, '0.0.0.0');
}
void bootstrap();
