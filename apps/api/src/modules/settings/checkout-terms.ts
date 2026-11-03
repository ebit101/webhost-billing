import { HttpStatus } from '@nestjs/common';
import type { Prisma } from '@webhost-billing/database';
import {
  checkoutTermsPolicySchema,
  DEFAULT_CHECKOUT_TERMS,
  type CheckoutTermsAcceptance,
} from '@webhost-billing/shared';
import { ApplicationException } from '../../common/errors/application.exception';

export const CHECKOUT_TERMS_KEY = 'business.checkout-terms';

export function readCheckoutTerms(value: unknown) {
  if (value === undefined) return DEFAULT_CHECKOUT_TERMS;
  const parsed = checkoutTermsPolicySchema.safeParse(value);
  if (parsed.success) return parsed.data;
  throw new ApplicationException({
    status: HttpStatus.SERVICE_UNAVAILABLE,
    code: 'SERVICE_UNAVAILABLE',
    message: 'Checkout terms are temporarily unavailable.',
  });
}

export async function requireCheckoutTerms(
  transaction: Prisma.TransactionClient,
  acceptedVersion: string | undefined,
  now: Date,
): Promise<CheckoutTermsAcceptance | undefined> {
  await transaction.$queryRaw`SELECT pg_advisory_xact_lock_shared(hashtextextended(${CHECKOUT_TERMS_KEY}, 0))::text`;
  const row = await transaction.setting.findUnique({
    where: { key: CHECKOUT_TERMS_KEY },
    select: { value: true },
  });
  const policy = readCheckoutTerms(row?.value);
  if (!policy.required) return undefined;
  if (acceptedVersion !== policy.version) {
    throw new ApplicationException({
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      code: 'UNPROCESSABLE_ENTITY',
      message:
        'Review and accept the current terms of service before placing your order.',
    });
  }
  return {
    url: policy.url,
    revision: policy.revision,
    version: policy.version,
    acceptedAt: now.toISOString(),
  };
}
