import { NestFactory } from '@nestjs/core';
import { parseServerEnvironment } from '@webhost-billing/config';
import { AppModule } from './app.module';

async function bootstrap() {
  const environment = parseServerEnvironment({
    ...process.env,
    PORT: process.env.API_PORT ?? '3001',
  });
  const app = await NestFactory.create(AppModule);
  await app.listen(environment.PORT, '0.0.0.0');
}
void bootstrap();
