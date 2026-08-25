import { Inject, Injectable } from '@nestjs/common';
import type { ApiEnvironment } from '@webhost-billing/config';
import { API_ENVIRONMENT } from '../../infrastructure/environment/environment.module';
import { CpanelWhmHostingPanel } from './cpanel-whm.hosting-panel';
import { FakeHostingPanel } from './fake-hosting-panel';
import { HostingPanelProviderError } from './hosting-panel.error';
import type { HostingPanel } from './hosting-panel.interface';

@Injectable()
export class HostingPanelRegistry {
  constructor(
    private readonly fake: FakeHostingPanel,
    private readonly cpanelWhm: CpanelWhmHostingPanel,
    @Inject(API_ENVIRONMENT) private readonly environment: ApiEnvironment,
  ) {}

  get(adapterKey: string): HostingPanel {
    if (adapterKey === this.cpanelWhm.key) return this.cpanelWhm;
    if (
      adapterKey === this.fake.key &&
      this.environment.NODE_ENV !== 'production'
    ) {
      return this.fake;
    }
    throw new HostingPanelProviderError(
      'PERMANENT',
      'PANEL_ADAPTER_UNAVAILABLE',
      'The server hosting-panel adapter is not available.',
    );
  }
}
