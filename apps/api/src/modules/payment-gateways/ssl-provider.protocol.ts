import { z } from 'zod';
import { createHash } from 'node:crypto';
import { majorToMinor } from './payment-money';
import { PaymentProviderError } from './payment-provider.error';
import type { SslCommerzCredentials } from '@webhost-billing/shared';
import type { PaymentHttpClient } from './payment-http.client';

export type SslAccount = SslCommerzCredentials;
export interface SslObservation {
  merchantReference: string;
  bankReference: string | null;
  paymentId?: string;
  invoiceId?: string;
  amount: bigint;
  currency: string;
  status: 'PENDING' | 'SUCCEEDED' | 'FAILED';
  risk: 'SAFE' | 'HELD';
  occurredAt: Date | null;
  validationId: string | null;
}
const identifier = z.string().regex(/^[A-Za-z0-9_-]{1,120}$/);
const decimal = z
  .union([z.string(), z.number()])
  .transform(String)
  .refine((v) => /^(0|[1-9]\d*)(?:\.\d{1,2})?$/.test(v));
const transaction = z
  .object({
    status: z.string().max(40),
    tran_id: identifier,
    amount: decimal,
    currency: z.string().regex(/^[A-Z]{3}$/),
    currency_type: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .optional(),
    currency_amount: decimal.optional(),
    store_id: z.string().min(1).max(191).optional(),
    bank_tran_id: identifier.optional(),
    val_id: identifier.optional(),
    tran_date: z.string().max(40).optional(),
    risk_level: z.union([z.string(), z.number()]).transform(String).optional(),
    value_a: z.uuid().optional(),
    value_b: z.uuid().optional(),
  })
  .passthrough();
export function sslDate(value?: string): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value))
    return null;
  const date = new Date(value.replace(' ', 'T') + '+06:00');
  if (!Number.isFinite(date.getTime())) return null;
  return new Date(date.getTime() + 21600000).toISOString().slice(0, 19) ===
    value.replace(' ', 'T')
    ? date
    : null;
}
function observation(value: z.infer<typeof transaction>): SslObservation {
  if (
    (value.currency_type && value.currency_type !== value.currency) ||
    (value.currency_amount &&
      majorToMinor(value.currency_amount) !== majorToMinor(value.amount))
  )
    throw invalidSsl();
  const state = value.status.toUpperCase();
  const paid = ['VALID', 'VALIDATED'].includes(state);
  const safe = value.risk_level === '0';
  if (paid && !value.bank_tran_id) throw unknownSsl();
  return {
    merchantReference: value.tran_id,
    bankReference: value.bank_tran_id ?? null,
    ...(value.value_a ? { paymentId: value.value_a } : {}),
    ...(value.value_b ? { invoiceId: value.value_b } : {}),
    amount: majorToMinor(value.amount),
    currency: value.currency,
    status: paid
      ? 'SUCCEEDED'
      : ['FAILED', 'CANCELLED', 'EXPIRED'].includes(state)
        ? 'FAILED'
        : 'PENDING',
    risk: paid && safe ? 'SAFE' : 'HELD',
    occurredAt: sslDate(value.tran_date),
    validationId: value.val_id ?? null,
  };
}
export function sslForm(raw: Buffer): Record<string, string> {
  if (!raw.length || raw.length > 262144) throw invalidSsl();
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(raw);
  } catch {
    throw invalidSsl();
  }
  const pairs = new URLSearchParams(text);
  const result: Record<string, string> = {};
  for (const [key, value] of pairs) {
    if (Object.hasOwn(result, key)) throw invalidSsl();
    result[key] = value;
  }
  if (
    !identifier.safeParse(result.tran_id).success ||
    (result.val_id !== undefined &&
      !identifier.safeParse(result.val_id).success)
  )
    throw invalidSsl();
  return result;
}
export function sslObservationKey(value: SslObservation) {
  // Observation identity is semantic, not raw form encoding, wall clock or VALID/VALIDATED spelling.
  return createHash('sha256')
    .update(
      JSON.stringify({
        merchantReference: value.merchantReference,
        bankReference: value.bankReference,
        amount: value.amount.toString(),
        currency: value.currency,
        status: value.status,
        risk: value.risk,
        dateValid: !!value.occurredAt,
      }),
    )
    .digest('hex');
}
export async function sslValidate(
  http: PaymentHttpClient,
  timeoutMs: number,
  account: SslAccount,
  raw: Buffer,
): Promise<SslObservation> {
  const form = sslForm(raw);
  if (!form.val_id) throw invalidSsl();
  if (form.store_id && form.store_id !== account.storeId) throw invalidSsl();
  if (!['VALID', 'VALIDATED'].includes(form.status ?? '')) throw invalidSsl();
  const url = endpoint('validationserverAPI.php', account, {
    val_id: form.val_id,
    v: '1',
  });
  const response = await http.request({
    url,
    method: 'GET',
    headers: { accept: 'application/json' },
    timeoutMs,
    retries: 2,
  });
  if (response.status !== 200) throw unknownSsl();
  const parsed = transaction
    .extend({
      APIConnect: z.literal('DONE'),
      status: z.enum(['VALID', 'VALIDATED']),
      val_id: identifier,
    })
    .safeParse(response.body);
  if (!parsed.success) throw invalidSsl();
  const data = parsed.data;
  if (data.store_id && data.store_id !== account.storeId) throw invalidSsl();
  if (
    data.tran_id !== form.tran_id ||
    data.val_id !== form.val_id ||
    data.currency !== form.currency ||
    majorToMinor(data.amount) !== majorToMinor(form.amount ?? '') ||
    (form.value_a && data.value_a !== form.value_a) ||
    (form.value_b && data.value_b !== form.value_b)
  )
    throw invalidSsl();
  const result = observation(data);
  if (form.risk_level && form.risk_level !== '0') result.risk = 'HELD';
  return result;
}
export async function sslQuery(
  http: PaymentHttpClient,
  timeoutMs: number,
  account: SslAccount,
  reference: string,
): Promise<SslObservation> {
  const response = await http.request({
    url: endpoint('merchantTransIDvalidationAPI.php', account, {
      tran_id: reference,
    }),
    method: 'GET',
    headers: { accept: 'application/json' },
    timeoutMs,
    retries: 2,
  });
  if (response.status !== 200) throw unknownSsl();
  const parsed = z
    .object({
      APIConnect: z.literal('DONE'),
      element: z.array(transaction).max(20),
    })
    .safeParse(response.body);
  if (!parsed.success) throw unknownSsl();
  const matches = parsed.data.element.filter(
    (value) => value.tran_id === reference,
  );
  if (matches.length !== 1) throw unknownSsl();
  if (matches[0].store_id && matches[0].store_id !== account.storeId)
    throw invalidSsl();
  return observation(matches[0]);
}
export interface SslRefundObservation {
  reference: string;
  bankReference: string;
  status: 'PENDING' | 'SUCCEEDED' | 'FAILED';
  amount: bigint | null;
}
export async function sslRefundCall(
  http: PaymentHttpClient,
  timeoutMs: number,
  account: SslAccount,
  input:
    | { bankReference: string; amount: bigint; reference: string }
    | { providerReference: string },
): Promise<SslRefundObservation> {
  const mutation = 'bankReference' in input;
  const params: Record<string, string> = mutation
    ? {
        bank_tran_id: input.bankReference,
        refund_amount: `${input.amount / 100n}.${(input.amount % 100n).toString().padStart(2, '0')}`,
        refund_remarks: 'Administrator approved invoice refund',
        refund_trans_id: input.reference,
        refe_id: input.reference,
      }
    : { refund_ref_id: input.providerReference };
  const response = await http.request({
    url: endpoint('merchantTransIDvalidationAPI.php', account, params),
    method: 'GET',
    headers: { accept: 'application/json' },
    timeoutMs,
    retries: mutation ? 0 : 2,
  });
  if (response.status !== 200) throw unknownSsl();
  const parsed = z
    .object({
      APIConnect: z.literal('DONE'),
      bank_tran_id: identifier,
      refund_ref_id: identifier,
      status: z.string().max(30),
      refund_amount: decimal.optional(),
    })
    .safeParse(response.body);
  if (!parsed.success) throw unknownSsl();
  const value = parsed.data;
  if (
    (mutation && value.bank_tran_id !== input.bankReference) ||
    (!mutation && value.refund_ref_id !== input.providerReference)
  )
    throw unknownSsl();
  return {
    reference: value.refund_ref_id,
    bankReference: value.bank_tran_id,
    status:
      value.status === 'refunded'
        ? 'SUCCEEDED'
        : value.status === 'failed'
          ? 'FAILED'
          : 'PENDING',
    amount: value.refund_amount ? majorToMinor(value.refund_amount) : null,
  };
}
function endpoint(
  path: string,
  account: SslAccount,
  params: Record<string, string>,
): string {
  const url = new URL(`https://sandbox.sslcommerz.com/validator/api/${path}`);
  url.search = new URLSearchParams({
    store_id: account.storeId,
    store_passwd: account.storePassword,
    format: 'json',
    ...params,
  }).toString();
  return url.toString();
}
export function invalidSsl() {
  return new PaymentProviderError(
    'The payment proof does not match this checkout.',
    'UNKNOWN',
  );
}
export function unknownSsl() {
  return new PaymentProviderError(
    'The provider outcome is uncertain. Reconcile this attempt before retrying.',
    'UNKNOWN',
  );
}
