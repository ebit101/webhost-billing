import { Module } from '@nestjs/common';
import { ServiceController } from './service.controller';
import { ServiceService } from './service.service';
import { SettingsModule } from '../settings/settings.module';
import { HostingCancellationService } from './hosting-cancellation.service';
import { ServiceSslStatusService } from './service-ssl-status.service';
import { ServiceAddOnsService } from './service-add-ons.service';
import { ServiceUsageService } from './service-usage.service';
import { HostingUpgradeService } from './hosting-upgrade.service';
import { HostingUpgradeController } from './hosting-upgrade.controller';
import { HostingPanelModule } from '../hosting-panels/hosting-panel.module';

@Module({
  imports: [SettingsModule, HostingPanelModule],
  controllers: [ServiceController, HostingUpgradeController],
  providers: [
    ServiceService,
    HostingCancellationService,
    ServiceSslStatusService,
    ServiceAddOnsService,
    ServiceUsageService,
    HostingUpgradeService,
  ],
  exports: [ServiceService],
})
export class ServiceModule {}
