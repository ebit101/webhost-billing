import { Global, Module } from '@nestjs/common';
import {
  loadEnvironmentFiles,
  parseApiEnvironment,
  type ApiEnvironment,
} from '@webhost-billing/config';

export const API_ENVIRONMENT = Symbol('API_ENVIRONMENT');

@Global()
@Module({
  providers: [
    {
      provide: API_ENVIRONMENT,
      useFactory: (): ApiEnvironment => {
        loadEnvironmentFiles();
        return parseApiEnvironment({
          ...process.env,
          PORT: process.env.API_PORT ?? process.env.PORT ?? '3001',
        });
      },
    },
  ],
  exports: [API_ENVIRONMENT],
})
export class EnvironmentModule {}
