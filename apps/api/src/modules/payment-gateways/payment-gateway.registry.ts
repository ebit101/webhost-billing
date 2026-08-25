import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { ApiEnvironment } from '@webhost-billing/config';
import { ApplicationException } from '../../common/errors/application.exception';
import { API_ENVIRONMENT } from '../../infrastructure/environment/environment.module';
import { BkashPaymentGateway } from './bkash-payment.gateway';
import { FakePaymentGateway } from './fake-payment.gateway';
import type { PaymentGateway } from './payment-gateway.interface';
import { SslCommerzPaymentGateway } from './sslcommerz-payment.gateway';
import { IntegrationCredentialService } from '../settings/integration-credential.service';
import { SettingsService } from '../settings/settings.service';

@Injectable()
export class PaymentGatewayRegistry {
  constructor(
    private readonly fake: FakePaymentGateway,
    private readonly bkash: BkashPaymentGateway,
    private readonly sslcommerz: SslCommerzPaymentGateway,
    @Inject(API_ENVIRONMENT) private readonly environment: ApiEnvironment,
    private readonly settings: SettingsService,
    private readonly credentials: IntegrationCredentialService,
  ) {}

  async get(provider: string, activeOnly = false): Promise<PaymentGateway> {
    if (activeOnly && (await this.settings.activeGateway()) !== provider) {
      throw this.notFound();
    }
    if (
      provider === this.bkash.key &&
      (await this.credentials.isConfigured('bkash'))
    ) {
      return this.bkash;
    }
    if (
      provider === this.sslcommerz.key &&
      (await this.credentials.isConfigured('sslcommerz'))
    ) {
      return this.sslcommerz;
    }
    if (
      provider === this.fake.key &&
      this.environment.NODE_ENV !== 'production'
    ) {
      return this.fake;
    }
    throw this.notFound();
  }

  async list(): Promise<PaymentGateway[]> {
    const active = await this.settings.activeGateway();
    if (active === 'manual') return [];
    try {
      return [await this.get(active, true)];
    } catch (error) {
      if (error instanceof ApplicationException) return [];
      throw error;
    }
  }

  private notFound(): ApplicationException {
    return new ApplicationException({
      status: HttpStatus.NOT_FOUND,
      code: 'RESOURCE_NOT_FOUND',
      message: 'Payment gateway was not found.',
    });
  }
}
