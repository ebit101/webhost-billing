import type { PrismaClient } from '@webhost-billing/database';
import { manualPaymentInstructionsSchema } from '@webhost-billing/shared';

export async function readManualPaymentInstructions(
  prisma: Pick<PrismaClient, 'setting'>,
): Promise<string> {
  const setting = await prisma.setting.findUnique({
    where: { key: 'billing.manual-payment-instructions' },
    select: { value: true },
  });
  const parsed = manualPaymentInstructionsSchema
    .pick({ instructions: true })
    .safeParse(setting?.value);
  return parsed.success
    ? parsed.data.instructions
    : 'Pay by bank deposit, cash, or an approved mobile financial service, then submit the transaction reference for review.';
}
