import { NestFactory } from '@nestjs/core';
import { parseBaseEnvironment } from '@webhost-billing/config';
import { AppModule } from './app.module';

async function bootstrap() {
  parseBaseEnvironment(process.env);
  const app = await NestFactory.createApplicationContext(AppModule);
  app.enableShutdownHooks();
}
void bootstrap();
