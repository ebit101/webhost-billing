import { Inject, Injectable } from '@nestjs/common';
import type { ApiEnvironment } from '@webhost-billing/config';
import {
  normalizedPaymentEventSchema,
  type NormalizedPaymentEvent,
} from '@webhost-billing/shared';
import { z } from 'zod';
import { API_ENVIRONMENT } from '../../infrastructure/environment/environment.module';
import type {
  CompleteGatewaySessionInput,
  CreateGatewaySessionInput,
  GatewayPaymentSession,
  GatewayTransactionStatus,
  PaymentGateway,
} from './payment-gateway.interface';
import {
  PAYMENT_HTTP_CLIENT,
  type PaymentHttpClient,
} from './payment-http.client';
import { minorToMajor, majorToMinor } from './payment-money';
import { PaymentProviderError } from './payment-provider.error';
import {
  IntegrationCredentialService,
  type ResolvedCredentials,
} from '../settings/integration-credential.service';
import type { BkashCredentials } from '@webhost-billing/shared';

const tokenSchema = z
  .object({
    id_token: z.string().min(1),
    expires_in: z.coerce.number().int().positive(),
  })
  .passthrough();

const createSchema = z
  .object({
    paymentID: z.string().min(1).max(191),
    bKashURL: z.url(),
  })
  .passthrough();

const transactionSchema = z
  .object({
    paymentID: z.string().min(1).max(191),
    trxID: z.string().min(1).max(191).optional(),
    transactionStatus: z.string().min(1).max(100),
    amount: z.union([z.string(), z.number()]).transform(String),
    currency: z.string().length(3),
    completedTime: z.string().optional(),
    createTime: z.string().optional(),
    statusMessage: z.string().max(500).optional(),
    errorMessage: z.string().max(500).optional(),
  })
  .passthrough();

interface CachedToken {
  value: string;
  expiresAt: number;
  credentialRevision: string;
}

@Injectable()
export class BkashPaymentGateway implements PaymentGateway {
  readonly key = 'bkash';
  readonly displayName = 'bKash';
  readonly mode = 'SANDBOX' as const;
  readonly merchantId = 'bkash-sandbox';
  private token: CachedToken | null = null;

  constructor(
    @Inject(API_ENVIRONMENT) private readonly environment: ApiEnvironment,
    @Inject(PAYMENT_HTTP_CLIENT) private readonly http: PaymentHttpClient,
    private readonly credentials: IntegrationCredentialService,
  ) {}

  async createPaymentSession(
    input: CreateGatewaySessionInput,
  ): Promise<GatewayPaymentSession> {
    this.assertBdt(input.currency);
    const response = await this.http.request({
      url: `${this.environment.BKASH_SANDBOX_BASE_URL}/tokenized/checkout/create`,
      method: 'POST',
      headers: await this.authenticatedHeaders(),
      body: JSON.stringify({
        mode: '0001',
        payerReference: input.paymentId,
        callbackURL: `${this.environment.API_PUBLIC_ORIGIN}/payment-gateways/bkash/callback`,
        amount: minorToMajor(input.amount),
        currency: 'BDT',
        intent: 'sale',
        merchantInvoiceNumber: input.invoiceNumber,
      }),
      timeoutMs: this.environment.PAYMENT_PROVIDER_TIMEOUT_MS,
      // Creating a second checkout after an uncertain response may duplicate it.
      retries: 0,
    });
    if (response.status < 200 || response.status >= 300) {
      throw this.httpFailure(
        response.status,
        'bKash rejected the checkout request.',
      );
    }
    const session = this.parse(createSchema, response.body, 'UNKNOWN');
    return {
      providerSessionId: session.paymentID,
      checkoutUrl: session.bKashURL,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    };
  }

  verifyWebhookSignature(): boolean {
    // Tokenized Checkout documents a browser callback, not a signed webhook.
    return false;
  }

  normalizeProviderEvent(): NormalizedPaymentEvent {
    throw this.providerFailure('bKash does not use this webhook endpoint.');
  }

  async completePaymentSession(
    input: CompleteGatewaySessionInput,
  ): Promise<NormalizedPaymentEvent> {
    try {
      const response = await this.http.request({
        url: `${this.environment.BKASH_SANDBOX_BASE_URL}/tokenized/checkout/execute`,
        method: 'POST',
        headers: await this.authenticatedHeaders(),
        body: JSON.stringify({ paymentID: input.providerSessionId }),
        timeoutMs: this.environment.PAYMENT_PROVIDER_TIMEOUT_MS,
        retries: 0,
      });
      if (response.status < 200 || response.status >= 300) {
        throw this.httpFailure(
          response.status,
          'bKash could not complete the payment.',
        );
      }
      return this.toEvent(
        this.parse(transactionSchema, response.body, 'UNKNOWN'),
        input,
      );
    } catch (error) {
      if (
        error instanceof PaymentProviderError &&
        error.outcome === 'UNKNOWN'
      ) {
        const status = await this.queryTransactionStatus(
          input.providerSessionId,
        );
        return this.statusToEvent(status, input);
      }
      throw error;
    }
  }

  async queryTransactionStatus(
    paymentId: string,
  ): Promise<GatewayTransactionStatus> {
    const response = await this.http.request({
      url: `${this.environment.BKASH_SANDBOX_BASE_URL}/tokenized/checkout/payment/status`,
      method: 'POST',
      headers: await this.authenticatedHeaders(),
      body: JSON.stringify({ paymentID: paymentId }),
      timeoutMs: this.environment.PAYMENT_PROVIDER_TIMEOUT_MS,
      retries: 2,
    });
    if (response.status < 200 || response.status >= 300) {
      throw this.unknown('bKash could not confirm the payment status.');
    }
    const transaction = this.parse(transactionSchema, response.body, 'UNKNOWN');
    return this.toStatus(transaction);
  }

  extractProviderTransactionId(event: NormalizedPaymentEvent): string | null {
    return event.providerTransactionId;
  }

  private async authenticatedHeaders(): Promise<Record<string, string>> {
    const credentials = await this.providerCredentials();
    return {
      accept: 'application/json',
      'content-type': 'application/json',
      authorization: await this.accessToken(credentials),
      'x-app-key': credentials.value.appKey,
    };
  }

  private async accessToken(
    credentials: ResolvedCredentials<BkashCredentials>,
  ): Promise<string> {
    if (
      this.token &&
      this.token.credentialRevision === credentials.revision &&
      this.token.expiresAt > Date.now() + 60_000
    ) {
      return this.token.value;
    }
    const response = await this.http.request({
      url: `${this.environment.BKASH_SANDBOX_BASE_URL}/tokenized/checkout/token/grant`,
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        username: credentials.value.username,
        password: credentials.value.password,
      },
      body: JSON.stringify({
        app_key: credentials.value.appKey,
        app_secret: credentials.value.appSecret,
      }),
      timeoutMs: this.environment.PAYMENT_PROVIDER_TIMEOUT_MS,
      retries: 1,
    });
    if (response.status < 200 || response.status >= 300) {
      throw this.httpFailure(response.status, 'bKash authentication failed.');
    }
    const token = this.parse(tokenSchema, response.body, 'UNKNOWN');
    this.token = {
      value: token.id_token,
      expiresAt: Date.now() + token.expires_in * 1000,
      credentialRevision: credentials.revision,
    };
    return token.id_token;
  }

  private toEvent(
    transaction: z.infer<typeof transactionSchema>,
    input: CompleteGatewaySessionInput,
  ): NormalizedPaymentEvent {
    const status = this.toStatus(transaction);
    return this.statusToEvent(status, input);
  }

  private statusToEvent(
    status: GatewayTransactionStatus,
    input: CompleteGatewaySessionInput,
  ): NormalizedPaymentEvent {
    return normalizedPaymentEventSchema.parse({
      providerEventId: `bkash:${input.providerSessionId}:${status.providerTransactionId ?? status.status}`,
      eventType: `payment.${status.status.toLowerCase()}`,
      status: status.status === 'REFUNDED' ? 'FAILED' : status.status,
      merchantId: this.merchantId,
      paymentId: input.paymentId,
      invoiceId: input.invoiceId,
      amount: status.amount.toString(),
      currency: status.currency,
      providerTransactionId: status.providerTransactionId,
      occurredAt: status.occurredAt.toISOString(),
      failureReason: status.failureReason,
    });
  }

  private toStatus(
    transaction: z.infer<typeof transactionSchema>,
  ): GatewayTransactionStatus {
    const providerStatus = transaction.transactionStatus.toLowerCase();
    const status =
      providerStatus === 'completed'
        ? 'SUCCEEDED'
        : providerStatus === 'initiated' || providerStatus === 'pending'
          ? 'PENDING'
          : providerStatus === 'refunded'
            ? 'REFUNDED'
            : 'FAILED';
    const occurredAt = this.safeDate(
      transaction.completedTime ?? transaction.createTime,
    );
    return {
      providerTransactionId: transaction.trxID ?? null,
      status,
      amount: majorToMinor(transaction.amount),
      currency: transaction.currency.toUpperCase(),
      occurredAt,
      failureReason:
        status === 'FAILED'
          ? (transaction.errorMessage ??
            transaction.statusMessage ??
            'bKash reported payment failure.')
          : null,
    };
  }

  private safeDate(value: string | undefined): Date {
    if (!value) return new Date();
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  }

  private async providerCredentials(): Promise<
    ResolvedCredentials<BkashCredentials>
  > {
    const credentials = await this.credentials.bkash();
    if (!credentials) {
      throw this.providerFailure('bKash sandbox is not configured.');
    }
    return credentials;
  }

  private assertBdt(currency: string): void {
    if (currency !== 'BDT') {
      throw this.providerFailure('bKash sandbox accepts BDT invoices only.');
    }
  }

  private parse<T>(
    schema: z.ZodType<T>,
    value: unknown,
    outcome: 'FAILED' | 'UNKNOWN' = 'FAILED',
  ): T {
    const parsed = schema.safeParse(value);
    if (!parsed.success) {
      throw new PaymentProviderError(
        'bKash returned an invalid response.',
        outcome,
      );
    }
    return parsed.data;
  }

  private providerFailure(message: string): PaymentProviderError {
    return new PaymentProviderError(message, 'FAILED');
  }

  private unknown(message: string): PaymentProviderError {
    return new PaymentProviderError(message, 'UNKNOWN');
  }

  private httpFailure(status: number, message: string): PaymentProviderError {
    return status === 408 || status === 429 || status >= 500
      ? this.unknown(`${message} Reconciliation is required before retrying.`)
      : this.providerFailure(message);
  }
}
