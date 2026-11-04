import { Module } from '@nestjs/common';
import { ServiceController } from './service.controller';
import { ServiceService } from './service.service';
import { SettingsModule } from '../settings/settings.module';
import { HostingCancellationService } from './hosting-cancellation.service';
import { ServiceSslStatusService } from './service-ssl-status.service';
import { ServiceAddOnsService } from './service-add-ons.service';

@Module({
  imports: [SettingsModule],
  controllers: [ServiceController],
  providers: [
    ServiceService,
    HostingCancellationService,
    ServiceSslStatusService,
    ServiceAddOnsService,
  ],
  exports: [ServiceService],
})
export class ServiceModule {}
