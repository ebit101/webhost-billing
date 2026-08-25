import { createHmac, timingSafeEqual } from 'node:crypto';
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
  GatewayRefundInput,
  GatewayRefundResult,
  GatewayTransactionStatus,
  PaymentGateway,
} from './payment-gateway.interface';

const fakeWebhookPayloadSchema = z
  .object({
    event_id: z.string().min(1).max(191),
    type: z.enum(['payment.pending', 'payment.succeeded', 'payment.failed']),
    merchant_id: z.string().min(1).max(191),
    data: z
      .object({
        payment_id: z.uuid(),
        invoice_id: z.uuid(),
        amount: z.string().regex(/^(0|[1-9]\d*)$/),
        currency: z.string().regex(/^[A-Z]{3}$/),
        transaction_id: z.string().min(1).max(191).nullable(),
        occurred_at: z.iso.datetime({ offset: true }),
        failure_reason: z.string().trim().min(1).max(500).nullable().optional(),
      })
      .strict(),
  })
  .strict();

@Injectable()
export class FakePaymentGateway implements PaymentGateway {
  readonly key = 'fake';
  readonly merchantId = 'webhost-billing-fake';
  private readonly webhookKey: Buffer;
  private readonly webOrigin: string;
  private readonly transactions = new Map<string, GatewayTransactionStatus>();
  private readonly sessions = new Map<string, GatewayPaymentSession>();
  private readonly refunds = new Map<
    string,
    { input: GatewayRefundInput; result: GatewayRefundResult }
  >();

  constructor(@Inject(API_ENVIRONMENT) environment: ApiEnvironment) {
    this.webOrigin = environment.WEB_ORIGIN;
    this.webhookKey = createHmac(
      'sha256',
      environment.CREDENTIAL_ENCRYPTION_KEY,
    )
      .update('webhost-billing:fake-payment-webhook:v1')
      .digest();
  }

  createPaymentSession(
    input: CreateGatewaySessionInput,
  ): Promise<GatewayPaymentSession> {
    const existing = this.sessions.get(input.idempotencyKey);
    if (existing) return Promise.resolve(existing);
    const providerSessionId = `fps_${this.identifier(input.idempotencyKey)}`;
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
    const session = {
      providerSessionId,
      checkoutUrl: `${this.webOrigin}/fake-payment/${providerSessionId}`,
      expiresAt,
    };
    this.sessions.set(input.idempotencyKey, session);
    return Promise.resolve(session);
  }

  verifyWebhookSignature(rawBody: Buffer, signature: string): boolean {
    const match = /^sha256=([a-f0-9]{64})$/.exec(signature);
    if (!match?.[1]) return false;
    const actual = Buffer.from(match[1], 'hex');
    const expected = createHmac('sha256', this.webhookKey)
      .update(rawBody)
      .digest();
    return (
      actual.length === expected.length && timingSafeEqual(actual, expected)
    );
  }

  normalizeProviderEvent(rawBody: Buffer): NormalizedPaymentEvent {
    const parsedJson: unknown = JSON.parse(rawBody.toString('utf8'));
    const payload = fakeWebhookPayloadSchema.parse(parsedJson);
    const status =
      payload.type === 'payment.succeeded'
        ? 'SUCCEEDED'
        : payload.type === 'payment.failed'
          ? 'FAILED'
          : 'PENDING';
    return normalizedPaymentEventSchema.parse({
      providerEventId: payload.event_id,
      eventType: payload.type,
      status,
      merchantId: payload.merchant_id,
      paymentId: payload.data.payment_id,
      invoiceId: payload.data.invoice_id,
      amount: payload.data.amount,
      currency: payload.data.currency,
      providerTransactionId: payload.data.transaction_id,
      occurredAt: payload.data.occurred_at,
      failureReason: payload.data.failure_reason ?? null,
    });
  }

  queryTransactionStatus(
    providerTransactionId: string,
  ): Promise<GatewayTransactionStatus> {
    const transaction = this.transactions.get(providerTransactionId);
    if (!transaction) {
      throw new Error('Fake transaction was not found.');
    }
    return Promise.resolve({ ...transaction });
  }

  extractProviderTransactionId(event: NormalizedPaymentEvent): string | null {
    return event.providerTransactionId;
  }

  async refund(input: GatewayRefundInput): Promise<GatewayRefundResult> {
    const existing = this.refunds.get(input.idempotencyKey);
    if (existing) {
      if (
        existing.input.providerTransactionId !== input.providerTransactionId ||
        existing.input.amount !== input.amount ||
        existing.input.currency !== input.currency
      ) {
        throw new Error('Fake refund idempotency key was reused.');
      }
      return existing.result;
    }
    const transaction = await this.queryTransactionStatus(
      input.providerTransactionId,
    );
    if (
      transaction.status !== 'SUCCEEDED' ||
      transaction.currency !== input.currency ||
      input.amount <= 0n ||
      input.amount > transaction.amount
    ) {
      const result = {
        providerRefundId: `fpr_${this.identifier(input.idempotencyKey)}`,
        status: 'FAILED' as const,
      };
      this.refunds.set(input.idempotencyKey, { input: { ...input }, result });
      return result;
    }
    this.transactions.set(input.providerTransactionId, {
      ...transaction,
      status: 'REFUNDED',
    });
    const result = {
      providerRefundId: `fpr_${this.identifier(input.idempotencyKey)}`,
      status: 'SUCCEEDED' as const,
    };
    this.refunds.set(input.idempotencyKey, { input: { ...input }, result });
    return result;
  }

  signWebhook(rawBody: Buffer): string {
    return `sha256=${createHmac('sha256', this.webhookKey).update(rawBody).digest('hex')}`;
  }

  rememberTransaction(transaction: GatewayTransactionStatus): void {
    this.transactions.set(transaction.providerTransactionId, {
      ...transaction,
    });
  }

  private identifier(value: string): string {
    return createHmac('sha256', this.webhookKey)
      .update(value)
      .digest('hex')
      .slice(0, 32);
  }
}
