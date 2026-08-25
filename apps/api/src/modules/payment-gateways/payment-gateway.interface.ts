import type { NormalizedPaymentEvent } from '@webhost-billing/shared';

export interface CreateGatewaySessionInput {
  paymentId: string;
  invoiceId: string;
  invoiceNumber: string;
  amount: bigint;
  currency: string;
  customerName: string;
  customerEmail: string;
  customerAddress: {
    line1: string;
    line2: string | null;
    city: string;
    region: string | null;
    postalCode: string | null;
    countryCode: string;
  };
  idempotencyKey: string;
}

export interface GatewayPaymentSession {
  providerSessionId: string;
  checkoutUrl: string;
  expiresAt: Date;
}

export interface GatewayTransactionStatus {
  providerTransactionId: string | null;
  status: 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'REFUNDED';
  amount: bigint;
  currency: string;
  occurredAt: Date;
  failureReason: string | null;
}

export interface CompleteGatewaySessionInput {
  providerSessionId: string;
  paymentId: string;
  invoiceId: string;
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
  readonly displayName: string;
  readonly mode: 'SANDBOX';
  readonly merchantId: string;

  createPaymentSession(
    input: CreateGatewaySessionInput,
  ): Promise<GatewayPaymentSession>;
  verifyWebhookSignature(
    rawBody: Buffer,
    signature: string,
  ): boolean | Promise<boolean>;
  normalizeProviderEvent(rawBody: Buffer): NormalizedPaymentEvent;
  queryTransactionStatus(
    providerTransactionId: string,
  ): Promise<GatewayTransactionStatus>;
  extractProviderTransactionId(event: NormalizedPaymentEvent): string | null;
  completePaymentSession?(
    input: CompleteGatewaySessionInput,
  ): Promise<NormalizedPaymentEvent>;
  refund?(input: GatewayRefundInput): Promise<GatewayRefundResult>;
}
