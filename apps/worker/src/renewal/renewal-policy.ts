import type { PrismaClient } from '@webhost-billing/database';
import {
  DEFAULT_RENEWAL_AUTOMATION_POLICY,
  renewalAutomationPolicySchema,
  type RenewalAutomationPolicy,
} from '@webhost-billing/shared';

export const RENEWAL_POLICY_SETTING_KEY = 'automation.renewal-policy';

export async function loadRenewalPolicy(
  prisma: Pick<PrismaClient, 'setting'>,
): Promise<RenewalAutomationPolicy> {
  const setting = await prisma.setting.findUnique({
    where: { key: RENEWAL_POLICY_SETTING_KEY },
    select: { value: true },
  });
  const parsed = renewalAutomationPolicySchema.safeParse(setting?.value);
  return parsed.success ? parsed.data : DEFAULT_RENEWAL_AUTOMATION_POLICY;
}
