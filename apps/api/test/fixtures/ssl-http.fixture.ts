import { randomUUID } from 'node:crypto';
import type {
  PaymentHttpClient,
  PaymentHttpRequest,
  PaymentHttpResponse,
} from '../../src/modules/payment-gateways/payment-http.client';
import { PaymentProviderError } from '../../src/modules/payment-gateways/payment-provider.error';

export interface FictionalSslTransaction {
  tran_id: string;
  val_id: string;
  bank_tran_id: string;
  amount: string;
  currency: string;
  status: string;
  tran_date: string;
  risk_level?: string;
  value_a: string;
  value_b: string;
  store_id: string;
  store_passwd: string;
}
/** Test-only normalized provider. No fetch, sockets, credentials from runtime or fallback networking. */
export class FictionalSslHttp implements PaymentHttpClient {
  readonly calls: PaymentHttpRequest[] = [];
  readonly transactions = new Map<string, FictionalSslTransaction>();
  readonly refunds = new Map<
    string,
    {
      bank_tran_id: string;
      refund_ref_id: string;
      refund_amount: string;
      status: string;
    }
  >();
  loseCreateResponse = false;
  loseRefundResponse = false;
  omitRefundAmount = false;
  createBarrier: (() => Promise<void>) | undefined;
  validationOverride: Record<string, unknown> = {};
  queryOverride: Record<string, unknown> = {};
  async request(input: PaymentHttpRequest): Promise<PaymentHttpResponse> {
    this.calls.push(input);
    const url = new URL(input.url);
    if (url.protocol !== 'https:' || url.hostname !== 'sandbox.sslcommerz.com')
      throw new Error('Fictional provider refuses unexpected networking.');
    if (url.pathname === '/gwprocess/v4/api.php') {
      const body = new URLSearchParams(input.body);
      const id = body.get('tran_id')!;
      if (this.transactions.has(id))
        throw new Error('Fictional provider detected duplicate mutation.');
      const row: FictionalSslTransaction = {
        tran_id: id,
        val_id: `val_${id}`,
        bank_tran_id: `bank_${id}`,
        amount: body.get('total_amount')!,
        currency: body.get('currency')!,
        status: 'PENDING',
        tran_date: '2026-11-07 12:00:00',
        risk_level: '0',
        value_a: body.get('value_a')!,
        value_b: body.get('value_b')!,
        store_id: body.get('store_id')!,
        store_passwd: body.get('store_passwd')!,
      };
      this.transactions.set(id, row);
      if (this.createBarrier) await this.createBarrier();
      if (this.loseCreateResponse) {
        this.loseCreateResponse = false;
        throw new PaymentProviderError(
          'Fictional lost create response',
          'UNKNOWN',
        );
      }
      return {
        status: 200,
        body: {
          status: 'SUCCESS',
          sessionkey: `session_${id}`,
          GatewayPageURL: `https://sandbox.sslcommerz.com/EasyCheckOut/${id}`,
        },
      };
    }
    const params = url.searchParams;
    if (url.pathname.endsWith('/validationserverAPI.php')) {
      const row = [...this.transactions.values()].find(
        (value) => value.val_id === params.get('val_id'),
      );
      if (!row || !accountMatches(row, params))
        return { status: 200, body: { APIConnect: 'FAILED' } };
      const { store_passwd: unused, ...safe } = row;
      void unused;
      return {
        status: 200,
        body: { APIConnect: 'DONE', ...safe, ...this.validationOverride },
      };
    }
    if (url.pathname.endsWith('/merchantTransIDvalidationAPI.php')) {
      if (params.has('refund_amount')) {
        const row = [...this.transactions.values()].find(
          (value) => value.bank_tran_id === params.get('bank_tran_id'),
        );
        if (!row || !accountMatches(row, params))
          return { status: 200, body: { APIConnect: 'FAILED' } };
        const refund = {
          bank_tran_id: row.bank_tran_id,
          refund_ref_id: `refund_${randomUUID()}`,
          refund_amount: params.get('refund_amount')!,
          status: 'processing',
        };
        this.refunds.set(refund.refund_ref_id, refund);
        if (this.loseRefundResponse) {
          this.loseRefundResponse = false;
          throw new PaymentProviderError(
            'Fictional lost refund response',
            'UNKNOWN',
          );
        }
        return {
          status: 200,
          body: { APIConnect: 'DONE', ...refund, status: 'success' },
        };
      }
      if (params.has('refund_ref_id')) {
        const refund = this.refunds.get(params.get('refund_ref_id')!);
        if (!refund) return { status: 200, body: { APIConnect: 'FAILED' } };
        const row = [...this.transactions.values()].find(
          (value) => value.bank_tran_id === refund.bank_tran_id,
        );
        if (!row || !accountMatches(row, params))
          return { status: 200, body: { APIConnect: 'FAILED' } };
        const body: Record<string, unknown> = { APIConnect: 'DONE', ...refund };
        if (this.omitRefundAmount) delete body.refund_amount;
        return { status: 200, body };
      }
      const row = this.transactions.get(params.get('tran_id')!);
      if (!row)
        return { status: 200, body: { APIConnect: 'DONE', element: [] } };
      if (!accountMatches(row, params))
        return { status: 200, body: { APIConnect: 'FAILED' } };
      const { store_passwd: unused, ...safe } = row;
      void unused;
      return {
        status: 200,
        body: {
          APIConnect: 'DONE',
          element: [{ ...safe, ...this.queryOverride }],
        },
      };
    }
    throw new Error('Unexpected fictional payment operation.');
  }
}
function accountMatches(row: FictionalSslTransaction, params: URLSearchParams) {
  return (
    row.store_id === params.get('store_id') &&
    row.store_passwd === params.get('store_passwd')
  );
}
