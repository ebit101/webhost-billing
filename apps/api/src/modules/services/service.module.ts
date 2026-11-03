import { Module } from '@nestjs/common';
import { ServiceController } from './service.controller';
import { ServiceService } from './service.service';
import { SettingsModule } from '../settings/settings.module';
import { HostingCancellationService } from './hosting-cancellation.service';

@Module({
  imports: [SettingsModule],
  controllers: [ServiceController],
  providers: [ServiceService, HostingCancellationService],
  exports: [ServiceService],
})
export class ServiceModule {}
