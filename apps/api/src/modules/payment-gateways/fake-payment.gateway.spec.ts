import type { ApiEnvironment } from '@webhost-billing/config';
import { FakePaymentGateway } from './fake-payment.gateway';

const environment: ApiEnvironment = {
  NODE_ENV: 'test',
  PORT: 3001,
  DATABASE_URL: 'postgresql://example.test/database',
  REDIS_URL: 'redis://example.test',
  SESSION_SECRET: 's'.repeat(32),
  CREDENTIAL_ENCRYPTION_KEY: 'e'.repeat(32),
  WEB_ORIGIN: 'http://localhost:3000',
  API_PUBLIC_ORIGIN: 'http://localhost:3001',
  PAYMENT_PROVIDER_TIMEOUT_MS: 10_000,
  HOSTING_PANEL_TIMEOUT_MS: 10_000,
  BKASH_ENABLED: false,
  BKASH_SANDBOX_BASE_URL: 'https://tokenized.sandbox.bka.sh/v1.2.0-beta',
  SSLCOMMERZ_ENABLED: false,
  SESSION_TTL_SECONDS: 604_800,
  PASSWORD_RESET_TTL_SECONDS: 3_600,
  EMAIL_VERIFICATION_TTL_SECONDS: 86_400,
  AUTH_RATE_LIMIT_NAMESPACE: 'test',
};

describe('FakePaymentGateway', () => {
  const gateway = new FakePaymentGateway(environment);

  it('creates deterministic idempotent sessions', async () => {
    const input = {
      paymentId: '10000000-0000-4000-8000-000000000001',
      invoiceId: '10000000-0000-4000-8000-000000000002',
      invoiceNumber: 'INV-20260825-0000000000000001',
      amount: 12_000n,
      currency: 'BDT',
      customerName: 'Example Customer',
      customerEmail: 'customer@example.test',
      customerAddress: {
        line1: '1 Test Road',
        line2: null,
        city: 'Dhaka',
        region: null,
        postalCode: '1200',
        countryCode: 'BD',
      },
      idempotencyKey: 'gateway-session:fake:test-key',
    };
    const first = await gateway.createPaymentSession(input);
    const second = await gateway.createPaymentSession(input);
    expect(second).toEqual(first);
    expect(first.providerSessionId).toMatch(/^fps_[a-f0-9]{32}$/);
    expect(first.checkoutUrl).toContain('/fake-payment/fps_');
  });

  it('signs and validates the exact raw request bytes', () => {
    const compact = Buffer.from('{"event_id":"evt-1","value":1}');
    const spaced = Buffer.from('{ "event_id": "evt-1", "value": 1 }');
    const signature = gateway.signWebhook(compact);
    expect(gateway.verifyWebhookSignature(compact, signature)).toBe(true);
    expect(gateway.verifyWebhookSignature(spaced, signature)).toBe(false);
    expect(gateway.verifyWebhookSignature(compact, 'sha256=invalid')).toBe(
      false,
    );
  });

  it('normalizes events and extracts the transaction identifier', () => {
    const rawBody = Buffer.from(
      JSON.stringify({
        event_id: 'fake-event-1',
        type: 'payment.succeeded',
        merchant_id: gateway.merchantId,
        data: {
          payment_id: '10000000-0000-4000-8000-000000000001',
          invoice_id: '10000000-0000-4000-8000-000000000002',
          amount: '12000',
          currency: 'BDT',
          transaction_id: 'fake-transaction-1',
          occurred_at: '2026-08-25T10:00:00.000Z',
        },
      }),
    );
    const event = gateway.normalizeProviderEvent(rawBody);
    expect(event).toMatchObject({
      status: 'SUCCEEDED',
      amount: '12000',
      providerTransactionId: 'fake-transaction-1',
    });
    expect(gateway.extractProviderTransactionId(event)).toBe(
      'fake-transaction-1',
    );
  });

  it('queries fake status and supports the optional refund operation', async () => {
    gateway.rememberTransaction({
      providerTransactionId: 'fake-transaction-refundable',
      status: 'SUCCEEDED',
      amount: 12_000n,
      currency: 'BDT',
      occurredAt: new Date('2026-08-25T10:00:00.000Z'),
      failureReason: null,
    });
    await expect(
      gateway.queryTransactionStatus('fake-transaction-refundable'),
    ).resolves.toMatchObject({ status: 'SUCCEEDED' });
    const input = {
      providerTransactionId: 'fake-transaction-refundable',
      amount: 12_000n,
      currency: 'BDT',
      idempotencyKey: 'fake-refund-1',
    };
    const first = await gateway.refund(input);
    const replay = await gateway.refund(input);
    expect(first).toMatchObject({ status: 'SUCCEEDED' });
    expect(replay).toEqual(first);
  });
});
