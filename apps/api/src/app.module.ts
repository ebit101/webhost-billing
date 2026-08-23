import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ApiExceptionFilter } from './common/errors/api-exception.filter';
import { EnvironmentModule } from './infrastructure/environment/environment.module';
import { AuthModule } from './modules/auth/auth.module';

@Module({
  imports: [EnvironmentModule, AuthModule],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_FILTER,
      useClass: ApiExceptionFilter,
    },
  ],
})
export class AppModule {}
