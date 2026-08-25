import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import type { Express, NextFunction, Request, Response } from 'express';
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
  const app = await NestFactory.create(AppModule, { rawBody: true });
  const express = app.getHttpAdapter().getInstance() as Express;
  express.set('trust proxy', 'loopback');
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'same-site' },
      hsts:
        environment.NODE_ENV === 'production'
          ? { maxAge: 31_536_000, includeSubDomains: true, preload: true }
          : false,
    }),
  );
  app.use((_request: Request, response: Response, next: NextFunction) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Pragma', 'no-cache');
    next();
  });
  app.enableCors({
    origin: environment.WEB_ORIGIN,
    credentials: true,
    allowedHeaders: ['Content-Type', 'X-CSRF-Token'],
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    exposedHeaders: ['Content-Disposition'],
    maxAge: 600,
  });
  await app.listen(environment.PORT, '0.0.0.0');
}
void bootstrap();
