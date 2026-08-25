import { Module } from '@nestjs/common';
import { CpanelCredentialCipher } from './cpanel-credential-cipher';
import { CpanelWhmHostingPanel } from './cpanel-whm.hosting-panel';
import {
  CPANEL_WHM_FETCH,
  CPANEL_WHM_LOOKUP,
  CpanelWhmHttpClient,
} from './cpanel-whm-http.client';
import { lookup } from 'node:dns/promises';
import { FakeHostingPanel } from './fake-hosting-panel';
import { HostingPanelController } from './hosting-panel.controller';
import { HostingPanelRegistry } from './hosting-panel.registry';
import { HostingPanelService } from './hosting-panel.service';

@Module({
  controllers: [HostingPanelController],
  providers: [
    CpanelCredentialCipher,
    { provide: CPANEL_WHM_FETCH, useValue: globalThis.fetch.bind(globalThis) },
    {
      provide: CPANEL_WHM_LOOKUP,
      useValue: (hostname: string) =>
        lookup(hostname, { all: true, verbatim: true }),
    },
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
