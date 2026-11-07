import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { ApiEnvironment } from '@webhost-billing/config';
import {
  normalizedPaymentEventSchema,
  type NormalizedPaymentEvent,
} from '@webhost-billing/shared';
import { z } from 'zod';
import { API_ENVIRONMENT } from '../../infrastructure/environment/environment.module';
import type {
  CreateGatewaySessionInput,
  GatewayPaymentSession,
  GatewayTransactionStatus,
  PaymentGateway,
} from './payment-gateway.interface';
import {
  PAYMENT_HTTP_CLIENT,
  type PaymentHttpClient,
} from './payment-http.client';
import { minorToMajor } from './payment-money';
import { PaymentProviderError } from './payment-provider.error';
import { IntegrationCredentialService } from '../settings/integration-credential.service';
import {
  sslQuery,
  sslValidate,
  sslRefundCall,
  sslObservationKey,
  invalidSsl,
  unknownSsl,
  type SslAccount,
  type SslObservation,
} from './ssl-provider.protocol';

export function sslMerchantReference(key: string): string {
  return `WHB${createHash('sha256').update(key).digest('hex').slice(0, 27)}`;
}
@Injectable()
export class SslCommerzPaymentGateway implements PaymentGateway {
  readonly key = 'sslcommerz';
  readonly displayName = 'SSLCOMMERZ';
  readonly mode = 'SANDBOX' as const;
  readonly merchantId = 'sslcommerz-sandbox';
  private readonly verified = new Map<
    string,
    { value: SslObservation; at: number }
  >();
  constructor(
    @Inject(API_ENVIRONMENT) private readonly environment: ApiEnvironment,
    @Inject(PAYMENT_HTTP_CLIENT) private readonly http: PaymentHttpClient,
    private readonly credentials: IntegrationCredentialService,
  ) {}
  async createPaymentSession(
    input: CreateGatewaySessionInput,
  ): Promise<GatewayPaymentSession> {
    return this.createBoundSession(
      input,
      await this.account(),
      sslMerchantReference(input.idempotencyKey),
    );
  }
  async createBoundSession(
    input: CreateGatewaySessionInput,
    account: SslAccount,
    reference: string,
  ) {
    if (
      input.currency !== 'BDT' ||
      input.amount < 1000n ||
      input.amount > 50000000n
    )
      throw new PaymentProviderError(
        'SSLCOMMERZ requires BDT 10.00 to BDT 500,000.00.',
        'FAILED',
      );
    if (!input.customerPhone || !/^\+?[0-9]{8,15}$/.test(input.customerPhone))
      throw new PaymentProviderError(
        'Add a valid customer phone number before online checkout.',
        'FAILED',
      );
    const country = new Intl.DisplayNames(['en'], { type: 'region' }).of(
      input.customerAddress.countryCode,
    );
    if (
      !country ||
      country === input.customerAddress.countryCode ||
      country === 'Unknown Region'
    )
      throw new PaymentProviderError(
        'A valid billing country is required.',
        'FAILED',
      );
    const callbacks = `${this.environment.API_PUBLIC_ORIGIN}/payment-gateways/sslcommerz`;
    const body = new URLSearchParams({
      store_id: account.storeId,
      store_passwd: account.storePassword,
      total_amount: minorToMajor(input.amount),
      currency: 'BDT',
      tran_id: reference,
      success_url: `${callbacks}/return/success`,
      fail_url: `${callbacks}/return/fail`,
      cancel_url: `${callbacks}/return/cancel`,
      ipn_url: `${callbacks}/webhooks`,
      cus_name: input.customerName,
      cus_email: input.customerEmail,
      cus_add1: input.customerAddress.line1,
      cus_add2: input.customerAddress.line2 ?? '',
      cus_city: input.customerAddress.city,
      cus_state: input.customerAddress.region ?? '',
      cus_postcode: input.customerAddress.postalCode ?? '',
      cus_country: country,
      cus_phone: input.customerPhone,
      shipping_method: 'NO',
      product_name: `Web hosting invoice ${input.invoiceNumber}`,
      product_category: 'Web Hosting',
      product_profile: 'general',
      value_a: input.paymentId,
      value_b: input.invoiceId,
      value_c: input.invoiceNumber,
    }).toString();
    const response = await this.http.request({
      url: 'https://sandbox.sslcommerz.com/gwprocess/v4/api.php',
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/x-www-form-urlencoded',
      },
      body,
      timeoutMs: this.environment.PAYMENT_PROVIDER_TIMEOUT_MS,
      retries: 0,
    });
    if (response.status !== 200) throw unknownSsl();
    const parsed = z
      .object({
        status: z.literal('SUCCESS'),
        sessionkey: z.string().min(1).max(191),
        GatewayPageURL: z.url(),
      })
      .safeParse(response.body);
    if (!parsed.success) throw unknownSsl();
    const url = new URL(parsed.data.GatewayPageURL);
    if (
      url.protocol !== 'https:' ||
      url.hostname !== 'sandbox.sslcommerz.com' ||
      url.username ||
      url.password ||
      url.port
    )
      throw unknownSsl();
    return {
      providerSessionId: reference,
      providerSessionKey: parsed.data.sessionkey,
      checkoutUrl: url.toString(),
      expiresAt: new Date(Date.now() + 30 * 60000),
    };
  }
  validateBound(raw: Buffer, account: SslAccount) {
    return sslValidate(
      this.http,
      this.environment.PAYMENT_PROVIDER_TIMEOUT_MS,
      account,
      raw,
    );
  }
  queryBound(reference: string, account: SslAccount) {
    return sslQuery(
      this.http,
      this.environment.PAYMENT_PROVIDER_TIMEOUT_MS,
      account,
      reference,
    );
  }
  refundBound(account: SslAccount, input: Parameters<typeof sslRefundCall>[3]) {
    return sslRefundCall(
      this.http,
      this.environment.PAYMENT_PROVIDER_TIMEOUT_MS,
      account,
      input,
    );
  }
  async verifyWebhookSignature(
    raw: Buffer,
    signature?: string,
  ): Promise<boolean> {
    void signature;
    for (const [key, value] of this.verified)
      if (Date.now() - value.at > 30000) this.verified.delete(key);
    if (this.verified.size >= 64) return false;
    try {
      this.verified.set(this.hash(raw), {
        value: await this.validateBound(raw, await this.account()),
        at: Date.now(),
      });
      return true;
    } catch (error) {
      if (
        error instanceof PaymentProviderError &&
        error.safeMessage === unknownSsl().safeMessage
      )
        throw error;
      return false;
    }
  }
  normalizeProviderEvent(raw: Buffer): NormalizedPaymentEvent {
    const key = this.hash(raw);
    const proof = this.verified.get(key);
    this.verified.delete(key);
    if (
      !proof ||
      Date.now() - proof.at > 30000 ||
      !proof.value.paymentId ||
      !proof.value.invoiceId
    )
      throw invalidSsl();
    const value = proof.value;
    return normalizedPaymentEventSchema.parse({
      providerEventId: `sslcommerz:${sslObservationKey(value)}`,
      eventType: 'payment.observed',
      status:
        value.risk === 'SAFE' && value.occurredAt ? value.status : 'PENDING',
      merchantId: this.merchantId,
      paymentId: value.paymentId,
      invoiceId: value.invoiceId,
      amount: value.amount.toString(),
      currency: value.currency,
      providerTransactionId: value.bankReference,
      occurredAt: (value.occurredAt ?? new Date(0)).toISOString(),
      failureReason:
        value.risk === 'HELD' ? 'The payment requires risk review.' : null,
    });
  }
  async queryTransactionStatus(
    reference: string,
  ): Promise<GatewayTransactionStatus> {
    const value = await this.queryBound(reference, await this.account());
    return {
      providerTransactionId: value.bankReference,
      status:
        value.status === 'SUCCEEDED' &&
        (value.risk !== 'SAFE' || !value.occurredAt)
          ? 'PENDING'
          : value.status,
      amount: value.amount,
      currency: value.currency,
      occurredAt: value.occurredAt ?? new Date(0),
      failureReason:
        value.status === 'FAILED'
          ? 'The provider reported a failed payment.'
          : value.risk === 'HELD'
            ? 'The payment requires review.'
            : null,
    };
  }
  extractProviderTransactionId(event: NormalizedPaymentEvent) {
    return event.providerTransactionId;
  }
  private hash(raw: Buffer) {
    return createHash('sha256').update(raw).digest('hex');
  }
  private async account() {
    const value = await this.credentials.sslCommerz();
    if (!value)
      throw new PaymentProviderError(
        'SSLCOMMERZ sandbox is not configured.',
        'FAILED',
      );
    return value.value;
  }
}
