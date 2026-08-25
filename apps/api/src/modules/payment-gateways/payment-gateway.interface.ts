import type { NormalizedPaymentEvent } from '@webhost-billing/shared';

export interface CreateGatewaySessionInput {
  paymentId: string;
  invoiceId: string;
  invoiceNumber: string;
  amount: bigint;
  currency: string;
  customerEmail: string;
  idempotencyKey: string;
}

export interface GatewayPaymentSession {
  providerSessionId: string;
  checkoutUrl: string;
  expiresAt: Date;
}

export interface GatewayTransactionStatus {
  providerTransactionId: string;
  status: 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'REFUNDED';
  amount: bigint;
  currency: string;
}

export interface GatewayRefundInput {
  providerTransactionId: string;
  amount: bigint;
  currency: string;
  idempotencyKey: string;
}

export interface GatewayRefundResult {
  providerRefundId: string;
  status: 'PENDING' | 'SUCCEEDED' | 'FAILED';
}

export interface PaymentGateway {
  readonly key: string;
  readonly merchantId: string;

  createPaymentSession(
    input: CreateGatewaySessionInput,
  ): Promise<GatewayPaymentSession>;
  verifyWebhookSignature(rawBody: Buffer, signature: string): boolean;
  normalizeProviderEvent(rawBody: Buffer): NormalizedPaymentEvent;
  queryTransactionStatus(
    providerTransactionId: string,
  ): Promise<GatewayTransactionStatus>;
  extractProviderTransactionId(event: NormalizedPaymentEvent): string | null;
  refund?(input: GatewayRefundInput): Promise<GatewayRefundResult>;
}
