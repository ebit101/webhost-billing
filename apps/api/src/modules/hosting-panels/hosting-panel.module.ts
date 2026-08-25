import { Module } from '@nestjs/common';
import { CpanelCredentialCipher } from './cpanel-credential-cipher';
import { CpanelWhmHostingPanel } from './cpanel-whm.hosting-panel';
import {
  CPANEL_WHM_FETCH,
  CpanelWhmHttpClient,
} from './cpanel-whm-http.client';
import { FakeHostingPanel } from './fake-hosting-panel';
import { HostingPanelController } from './hosting-panel.controller';
import { HostingPanelRegistry } from './hosting-panel.registry';
import { HostingPanelService } from './hosting-panel.service';

@Module({
  controllers: [HostingPanelController],
  providers: [
    CpanelCredentialCipher,
    { provide: CPANEL_WHM_FETCH, useValue: globalThis.fetch.bind(globalThis) },
    CpanelWhmHttpClient,
    CpanelWhmHostingPanel,
    FakeHostingPanel,
    HostingPanelRegistry,
    HostingPanelService,
  ],
  exports: [
    CpanelCredentialCipher,
    CpanelWhmHostingPanel,
    FakeHostingPanel,
    HostingPanelRegistry,
    HostingPanelService,
  ],
})
export class HostingPanelModule {}
