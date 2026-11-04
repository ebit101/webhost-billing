import { Module } from '@nestjs/common';
import { ServiceController } from './service.controller';
import { ServiceService } from './service.service';
import { SettingsModule } from '../settings/settings.module';
import { HostingCancellationService } from './hosting-cancellation.service';
import { ServiceSslStatusService } from './service-ssl-status.service';

@Module({
  imports: [SettingsModule],
  controllers: [ServiceController],
  providers: [
    ServiceService,
    HostingCancellationService,
    ServiceSslStatusService,
  ],
  exports: [ServiceService],
})
export class ServiceModule {}
