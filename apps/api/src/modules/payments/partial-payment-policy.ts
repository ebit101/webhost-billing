import { HttpStatus } from '@nestjs/common';
import { SettingCategory, type Prisma } from '@webhost-billing/database';
import {
  PARTIAL_PAYMENT_POLICY_CONFIRMATION,
  paymentSettingsSchema,
} from '@webhost-billing/shared';
import { ApplicationException } from '../../common/errors/application.exception';
import type { SecurityRequestContext } from '../../common/http/request-context';
import type { AuthRequestContext } from '../auth/auth.types';

export const PARTIAL_PAYMENT_POLICY_KEY = 'billing.manual-payments';

// Both settings routes take the same lock, including when no setting exists yet.
export async function updatePartialPaymentPolicy(
  transaction: Prisma.TransactionClient,
  enabled: boolean,
  confirmation: typeof PARTIAL_PAYMENT_POLICY_CONFIRMATION | undefined,
  actor: AuthRequestContext,
  context: SecurityRequestContext,
): Promise<void> {
  await transaction.$executeRaw`
    SELECT pg_advisory_xact_lock(hashtextextended(${PARTIAL_PAYMENT_POLICY_KEY}, 0))
  `;
  const stored = await transaction.setting.findUnique({
    where: { key: PARTIAL_PAYMENT_POLICY_KEY },
    select: { value: true },
  });
  const parsed = paymentSettingsSchema.safeParse(stored?.value);
  const previous = parsed.success ? parsed.data.partialPaymentsEnabled : false;
  if (previous === enabled) return;
  if (confirmation !== PARTIAL_PAYMENT_POLICY_CONFIRMATION) {
    throw new ApplicationException({
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      code: 'UNPROCESSABLE_ENTITY',
      message:
        'Review and confirm the partial-payment policy change before saving.',
    });
  }
  const data = {
    value: { partialPaymentsEnabled: enabled },
    category: SettingCategory.BILLING,
    updatedByUserId: actor.identity.userId,
  };
  await transaction.setting.upsert({
    where: { key: PARTIAL_PAYMENT_POLICY_KEY },
    update: data,
    create: {
      ...data,
      key: PARTIAL_PAYMENT_POLICY_KEY,
      description: 'Manual payment policy.',
    },
  });
  await transaction.activityLog.create({
    data: {
      actorUserId: actor.identity.userId,
      action: 'MANUAL_PAYMENT_POLICY_CHANGED_BY_ADMIN',
      entityType: 'SETTING',
      ipAddressHash: context.ipAddressHash,
      metadata: {
        previousPartialPaymentsEnabled: previous,
        partialPaymentsEnabled: enabled,
      },
    },
  });
}
