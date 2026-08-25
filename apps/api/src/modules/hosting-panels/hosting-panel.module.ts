import { Module } from '@nestjs/common';
import { FakeHostingPanel } from './fake-hosting-panel';
import { HostingPanelController } from './hosting-panel.controller';
import { HostingPanelRegistry } from './hosting-panel.registry';
import { HostingPanelService } from './hosting-panel.service';

@Module({
  controllers: [HostingPanelController],
  providers: [FakeHostingPanel, HostingPanelRegistry, HostingPanelService],
  exports: [FakeHostingPanel, HostingPanelRegistry, HostingPanelService],
})
export class HostingPanelModule {}
