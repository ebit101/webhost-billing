import {
  domainNameSchema,
  requestedDomainSchema,
} from '@webhost-billing/shared';
import { readCheckoutIntent, type CheckoutIntent } from './checkout-intent';

export type OrderDraft = CheckoutIntent & {
  domainChoice: 'EXISTING' | 'REGISTER';
  requestedDomain: string;
};

const storageKey = 'webhost-order-draft';
const lifetimeMs = 24 * 60 * 60 * 1_000;

export function saveOrderDraft(draft: OrderDraft): boolean {
  const selection = readCheckoutIntent(draft);
  const domain = (
    draft.domainChoice === 'REGISTER' ? domainNameSchema : requestedDomainSchema
  ).safeParse(draft.requestedDomain);
  if (
    !selection ||
    !domain.success ||
    !['EXISTING', 'REGISTER'].includes(draft.domainChoice)
  )
    return false;
  try {
    localStorage.setItem(
      storageKey,
      JSON.stringify({
        ...selection,
        domainChoice: draft.domainChoice,
        requestedDomain: domain.data,
        expiresAt: Date.now() + lifetimeMs,
      }),
    );
    return true;
  } catch {
    return false;
  }
}

export function readOrderDraft(intent: CheckoutIntent): OrderDraft | undefined {
  const selection = readCheckoutIntent(intent);
  if (!selection) return undefined;
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(storageKey) ?? 'null');
    if (typeof raw !== 'object' || raw === null) return undefined;
    const record = raw as Record<string, unknown>;
    const domain = (
      record.domainChoice === 'REGISTER'
        ? domainNameSchema
        : requestedDomainSchema
    ).safeParse(record.requestedDomain);
    if (
      typeof record.expiresAt === 'number' &&
      record.expiresAt <= Date.now()
    ) {
      clearOrderDraft();
      return undefined;
    }
    if (
      record.productId !== selection.productId ||
      record.priceId !== selection.priceId ||
      (record.domainChoice !== 'EXISTING' &&
        record.domainChoice !== 'REGISTER') ||
      !domain.success ||
      typeof record.expiresAt !== 'number' ||
      record.expiresAt <= Date.now()
    )
      return undefined;
    return {
      ...selection,
      domainChoice: record.domainChoice,
      requestedDomain: domain.data,
    };
  } catch {
    return undefined;
  }
}

export function clearOrderDraft(): void {
  try {
    localStorage.removeItem(storageKey);
  } catch {
    /* Storage may be disabled. */
  }
}
