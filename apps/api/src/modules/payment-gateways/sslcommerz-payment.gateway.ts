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
import { majorToMinor, minorToMajor } from './payment-money';
import { PaymentProviderError } from './payment-provider.error';

const sessionSchema = z
  .object({
    status: z.literal('SUCCESS'),
    sessionkey: z.string().min(1),
    GatewayPageURL: z.url(),
  })
  .passthrough();

const ipnSchema = z
  .object({
    val_id: z.string().min(1).max(191),
    tran_id: z.string().min(1).max(191),
    amount: z.string().min(1),
    currency: z.string().length(3),
    store_id: z.string().min(1),
    status: z.string().min(1),
    value_a: z.uuid(),
    value_b: z.uuid(),
    risk_level: z.string().optional(),
  })
  .passthrough();

const validationSchema = z
  .object({
    status: z.enum(['VALID', 'VALIDATED']),
    APIConnect: z.literal('DONE'),
    val_id: z.string().min(1).max(191),
    tran_id: z.string().min(1).max(191),
    amount: z.union([z.string(), z.number()]).transform(String),
    currency: z.string().length(3),
    bank_tran_id: z.string().min(1).max(191),
    tran_date: z.string().optional(),
    value_a: z.uuid(),
    value_b: z.uuid(),
    risk_level: z.union([z.string(), z.number()]).transform(String).optional(),
  })
  .passthrough();

const queryEntrySchema = z
  .object({
    status: z.string().min(1),
    tran_id: z.string().min(1).max(191),
    amount: z.union([z.string(), z.number()]).transform(String),
    currency: z.string().length(3),
    bank_tran_id: z.string().max(191).optional(),
    tran_date: z.string().optional(),
    error: z.string().max(500).optional(),
    risk_level: z.union([z.string(), z.number()]).transform(String).optional(),
  })
  .passthrough();

const querySchema = z
  .object({
    APIConnect: z.literal('DONE'),
    element: z.array(queryEntrySchema),
  })
  .passthrough();

interface VerifiedIpn {
  ipn: z.infer<typeof ipnSchema>;
  validation: z.infer<typeof validationSchema>;
}

@Injectable()
export class SslCommerzPaymentGateway implements PaymentGateway {
  readonly key = 'sslcommerz';
  readonly displayName = 'SSLCOMMERZ';
  readonly mode = 'SANDBOX' as const;
  readonly merchantId = 'sslcommerz-sandbox';
  private readonly verified = new Map<string, VerifiedIpn>();

  constructor(
    @Inject(API_ENVIRONMENT) private readonly environment: ApiEnvironment,
    @Inject(PAYMENT_HTTP_CLIENT) private readonly http: PaymentHttpClient,
  ) {}

  async createPaymentSession(
    input: CreateGatewaySessionInput,
  ): Promise<GatewayPaymentSession> {
    this.assertSupported(input.amount, input.currency);
    const transactionId = this.transactionId(input.idempotencyKey);
    const callbacks = `${this.environment.API_PUBLIC_ORIGIN}/payment-gateways/sslcommerz`;
    const body = new URLSearchParams({
      store_id: this.storeId(),
      store_passwd: this.storePassword(),
      total_amount: minorToMajor(input.amount),
      currency: 'BDT',
      tran_id: transactionId,
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
      cus_country: input.customerAddress.countryCode,
      cus_phone: 'N/A',
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
      // Session creation is not retried after an uncertain response.
      retries: 0,
    });
    if (response.status < 200 || response.status >= 300) {
      throw this.httpFailure(
        response.status,
        'SSLCOMMERZ rejected the checkout request.',
      );
    }
    const session = this.parse(sessionSchema, response.body, 'UNKNOWN');
    return {
      providerSessionId: transactionId,
      checkoutUrl: session.GatewayPageURL,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    };
  }

  async verifyWebhookSignature(
    rawBody: Buffer,
    signature: string,
  ): Promise<boolean> {
    void signature;
    const ipnResult = ipnSchema.safeParse(
      Object.fromEntries(new URLSearchParams(rawBody.toString('utf8'))),
    );
    if (
      !ipnResult.success ||
      ipnResult.data.store_id !== this.storeId() ||
      !['VALID', 'VALIDATED'].includes(ipnResult.data.status.toUpperCase())
    ) {
      return false;
    }
    const url = new URL(
      'https://sandbox.sslcommerz.com/validator/api/validationserverAPI.php',
    );
    url.search = new URLSearchParams({
      val_id: ipnResult.data.val_id,
      store_id: this.storeId(),
      store_passwd: this.storePassword(),
      format: 'json',
      v: '1',
    }).toString();
    const response = await this.http.request({
      url: url.toString(),
      method: 'GET',
      headers: { accept: 'application/json' },
      timeoutMs: this.environment.PAYMENT_PROVIDER_TIMEOUT_MS,
      retries: 2,
    });
    if (response.status < 200 || response.status >= 300) {
      if (
        response.status === 408 ||
        response.status === 429 ||
        response.status >= 500
      ) {
        throw this.unknown('SSLCOMMERZ validation is temporarily unavailable.');
      }
      return false;
    }
    const validationResult = validationSchema.safeParse(response.body);
    if (!validationResult.success) return false;
    const ipn = ipnResult.data;
    const validation = validationResult.data;
    if (
      validation.val_id !== ipn.val_id ||
      validation.tran_id !== ipn.tran_id ||
      validation.value_a !== ipn.value_a ||
      validation.value_b !== ipn.value_b ||
      validation.currency.toUpperCase() !== ipn.currency.toUpperCase() ||
      majorToMinor(validation.amount) !== majorToMinor(ipn.amount)
    ) {
      return false;
    }
    this.verified.set(this.payloadHash(rawBody), { ipn, validation });
    return true;
  }

  normalizeProviderEvent(rawBody: Buffer): NormalizedPaymentEvent {
    const key = this.payloadHash(rawBody);
    const verified = this.verified.get(key);
    this.verified.delete(key);
    if (!verified) throw this.failure('SSLCOMMERZ IPN was not validated.');
    const highRisk =
      verified.validation.risk_level === '1' || verified.ipn.risk_level === '1';
    const occurredAt = this.sslDate(verified.validation.tran_date);
    return normalizedPaymentEventSchema.parse({
      providerEventId: `sslcommerz:${verified.validation.val_id}`,
      eventType: highRisk ? 'payment.high_risk' : 'payment.succeeded',
      status: highRisk ? 'PENDING' : 'SUCCEEDED',
      merchantId: this.merchantId,
      paymentId: verified.validation.value_a,
      invoiceId: verified.validation.value_b,
      amount: majorToMinor(verified.validation.amount).toString(),
      currency: verified.validation.currency.toUpperCase(),
      providerTransactionId: verified.validation.tran_id,
      occurredAt: occurredAt.toISOString(),
      failureReason: highRisk
        ? 'SSLCOMMERZ marked this transaction as high risk; administrator review is required.'
        : null,
    });
  }

  async queryTransactionStatus(
    transactionId: string,
  ): Promise<GatewayTransactionStatus> {
    const url = new URL(
      'https://sandbox.sslcommerz.com/validator/api/merchantTransIDvalidationAPI.php',
    );
    url.search = new URLSearchParams({
      tran_id: transactionId,
      store_id: this.storeId(),
      store_passwd: this.storePassword(),
      format: 'json',
    }).toString();
    const response = await this.http.request({
      url: url.toString(),
      method: 'GET',
      headers: { accept: 'application/json' },
      timeoutMs: this.environment.PAYMENT_PROVIDER_TIMEOUT_MS,
      retries: 2,
    });
    if (response.status < 200 || response.status >= 300) {
      throw this.unknown('SSLCOMMERZ could not confirm the payment status.');
    }
    const query = this.parse(querySchema, response.body, 'UNKNOWN');
    const transaction = query.element.find(
      (entry) => entry.tran_id === transactionId,
    );
    if (!transaction) {
      throw this.failure(
        'SSLCOMMERZ did not return the requested transaction.',
      );
    }
    const providerStatus = transaction.status.toUpperCase();
    const highRisk = transaction.risk_level === '1';
    const status = highRisk
      ? 'PENDING'
      : providerStatus === 'VALID' || providerStatus === 'VALIDATED'
        ? 'SUCCEEDED'
        : providerStatus === 'PENDING'
          ? 'PENDING'
          : providerStatus === 'REFUNDED'
            ? 'REFUNDED'
            : 'FAILED';
    return {
      providerTransactionId: transaction.tran_id,
      status,
      amount: majorToMinor(transaction.amount),
      currency: transaction.currency.toUpperCase(),
      occurredAt: this.sslDate(transaction.tran_date),
      failureReason: highRisk
        ? 'SSLCOMMERZ marked this transaction as high risk; administrator review is required.'
        : status === 'FAILED'
          ? (transaction.error ?? 'SSLCOMMERZ reported payment failure.')
          : null,
    };
  }

  extractProviderTransactionId(event: NormalizedPaymentEvent): string | null {
    return event.providerTransactionId;
  }

  private transactionId(idempotencyKey: string): string {
    return `WHB${createHash('sha256').update(idempotencyKey).digest('hex').slice(0, 27)}`;
  }

  private payloadHash(rawBody: Buffer): string {
    return createHash('sha256').update(rawBody).digest('hex');
  }

  private storeId(): string {
    if (
      !this.environment.SSLCOMMERZ_ENABLED ||
      !this.environment.SSLCOMMERZ_STORE_ID
    ) {
      throw this.failure('SSLCOMMERZ sandbox is not configured.');
    }
    return this.environment.SSLCOMMERZ_STORE_ID;
  }

  private storePassword(): string {
    if (
      !this.environment.SSLCOMMERZ_ENABLED ||
      !this.environment.SSLCOMMERZ_STORE_PASSWORD
    ) {
      throw this.failure('SSLCOMMERZ sandbox is not configured.');
    }
    return this.environment.SSLCOMMERZ_STORE_PASSWORD;
  }

  private assertSupported(amount: bigint, currency: string): void {
    if (currency !== 'BDT') {
      throw this.failure('SSLCOMMERZ sandbox accepts BDT invoices only.');
    }
    if (amount < 1_000n || amount > 50_000_000n) {
      throw this.failure(
        'SSLCOMMERZ requires an amount from BDT 10.00 to BDT 500,000.00.',
      );
    }
  }

  private sslDate(value: string | undefined): Date {
    if (!value) return new Date();
    const parsed = new Date(`${value.replace(' ', 'T')}+06:00`);
    return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  }

  private parse<T>(
    schema: z.ZodType<T>,
    value: unknown,
    outcome: 'FAILED' | 'UNKNOWN' = 'FAILED',
  ): T {
    const result = schema.safeParse(value);
    if (!result.success) {
      throw new PaymentProviderError(
        'SSLCOMMERZ returned an invalid response.',
        outcome,
      );
    }
    return result.data;
  }

  private failure(message: string): PaymentProviderError {
    return new PaymentProviderError(message, 'FAILED');
  }

  private unknown(message: string): PaymentProviderError {
    return new PaymentProviderError(message, 'UNKNOWN');
  }

  private httpFailure(status: number, message: string): PaymentProviderError {
    return status === 408 || status === 429 || status >= 500
      ? this.unknown(`${message} Reconciliation is required before retrying.`)
      : this.failure(message);
  }
}
