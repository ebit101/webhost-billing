import { Injectable } from '@nestjs/common';
import { PaymentProviderError } from './payment-provider.error';

export const PAYMENT_HTTP_CLIENT = Symbol('PAYMENT_HTTP_CLIENT');

export interface PaymentHttpRequest {
  url: string;
  method: 'GET' | 'POST';
  headers?: Readonly<Record<string, string>>;
  body?: string;
  timeoutMs: number;
  retries: 0 | 1 | 2;
}

export interface PaymentHttpResponse {
  status: number;
  body: unknown;
}

export interface PaymentHttpClient {
  request(input: PaymentHttpRequest): Promise<PaymentHttpResponse>;
}

@Injectable()
export class FetchPaymentHttpClient implements PaymentHttpClient {
  async request(input: PaymentHttpRequest): Promise<PaymentHttpResponse> {
    const url = new URL(input.url);
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.port ||
      !['sandbox.sslcommerz.com', 'tokenized.sandbox.bka.sh'].includes(
        url.hostname,
      )
    )
      throw new PaymentProviderError(
        'The payment endpoint is not allowed.',
        'FAILED',
      );
    let lastError: unknown;
    for (let attempt = 0; attempt <= input.retries; attempt += 1) {
      try {
        const response = await fetch(input.url, {
          method: input.method,
          headers: input.headers,
          body: input.body,
          redirect: 'error',
          signal: AbortSignal.timeout(input.timeoutMs),
        });
        const reader = response.body?.getReader();
        const chunks: Uint8Array[] = [];
        let size = 0;
        if (reader)
          try {
            while (true) {
              const next = await reader.read();
              if (next.done) break;
              size += next.value.length;
              if (size > 262144) {
                await reader.cancel();
                throw new PaymentProviderError(
                  'The payment response exceeds its limit. Reconciliation is required.',
                  'UNKNOWN',
                );
              }
              chunks.push(next.value);
            }
          } finally {
            reader.releaseLock();
          }
        const text = new TextDecoder('utf-8', { fatal: true }).decode(
          Buffer.concat(chunks),
        );
        const body = this.parseBody(text);
        if (response.status >= 500 && attempt < input.retries) {
          await this.backoff(attempt);
          continue;
        }
        return { status: response.status, body };
      } catch (error) {
        if (error instanceof PaymentProviderError) throw error;
        lastError = error;
        if (attempt < input.retries) {
          await this.backoff(attempt);
          continue;
        }
      }
    }
    void lastError;
    throw new PaymentProviderError(
      'The payment provider could not be reached. Reconciliation is required before retrying.',
      'UNKNOWN',
    );
  }

  private parseBody(value: string): unknown {
    if (!value) return null;
    try {
      return JSON.parse(value) as unknown;
    } catch {
      return value;
    }
  }

  private async backoff(attempt: number): Promise<void> {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 100 * 2 ** attempt);
    });
  }
}
