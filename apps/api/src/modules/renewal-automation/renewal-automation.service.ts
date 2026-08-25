import { Inject, Injectable } from '@nestjs/common';
import { SettingCategory, type PrismaClient } from '@webhost-billing/database';
import {
  DEFAULT_RENEWAL_AUTOMATION_POLICY,
  DEFAULT_BUSINESS_SETTINGS,
  automationRunSummarySchema,
  renewalAutomationPolicySchema,
  businessLocalizationSettingsSchema,
  type AutomationRunSummary,
  type RenewalAutomationPolicy,
} from '@webhost-billing/shared';
import type { SecurityRequestContext } from '../../common/http/request-context';
import { PRISMA_CLIENT } from '../../infrastructure/database/database.module';
import type { AuthRequestContext } from '../auth/auth.types';

const POLICY_KEY = 'automation.renewal-policy';

@Injectable()
export class RenewalAutomationService {
  constructor(@Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient) {}

  async policy(): Promise<RenewalAutomationPolicy> {
    const setting = await this.prisma.setting.findUnique({
      where: { key: POLICY_KEY },
      select: { value: true },
    });
    const parsed = renewalAutomationPolicySchema.safeParse(setting?.value);
    return parsed.success ? parsed.data : DEFAULT_RENEWAL_AUTOMATION_POLICY;
  }

  async updatePolicy(
    input: RenewalAutomationPolicy,
    actor: AuthRequestContext,
    context: SecurityRequestContext,
  ): Promise<RenewalAutomationPolicy> {
    const policy = renewalAutomationPolicySchema.parse(input);
    const localizationSetting = await this.prisma.setting.findUnique({
      where: { key: 'business.localization' },
      select: { value: true },
    });
    const parsedLocalization = businessLocalizationSettingsSchema.safeParse(
      localizationSetting?.value,
    );
    const localization = {
      currency: parsedLocalization.success
        ? parsedLocalization.data.currency
        : DEFAULT_BUSINESS_SETTINGS.currency,
      timeZone: policy.timeZone,
    };
    await this.prisma.$transaction([
      this.prisma.setting.upsert({
        where: { key: POLICY_KEY },
        update: {
          category: SettingCategory.AUTOMATION,
          value: policy,
          updatedByUserId: actor.identity.userId,
        },
        create: {
          key: POLICY_KEY,
          category: SettingCategory.AUTOMATION,
          value: policy,
          description: 'Renewal invoice, reminder, overdue, and grace policy.',
          updatedByUserId: actor.identity.userId,
        },
      }),
      this.prisma.setting.upsert({
        where: { key: 'business.localization' },
        update: {
          category: SettingCategory.BUSINESS,
          value: localization,
          updatedByUserId: actor.identity.userId,
        },
        create: {
          key: 'business.localization',
          category: SettingCategory.BUSINESS,
          value: localization,
          description: 'Operating currency and IANA business time zone.',
          updatedByUserId: actor.identity.userId,
        },
      }),
      this.prisma.activityLog.create({
        data: {
          actorUserId: actor.identity.userId,
          action: 'RENEWAL_AUTOMATION_POLICY_UPDATED',
          entityType: 'SETTING',
          ipAddressHash: context.ipAddressHash,
          metadata: policy,
        },
      }),
    ]);
    return policy;
  }

  async runs(): Promise<AutomationRunSummary[]> {
    const runs = await this.prisma.automationRun.findMany({
      where: { jobName: { startsWith: 'renewal-' } },
      orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
      take: 50,
    });
    return runs.map((run) =>
      automationRunSummarySchema.parse({
        id: run.id,
        jobName: run.jobName,
        status: run.status,
        startedAt: run.startedAt.toISOString(),
        completedAt: run.completedAt?.toISOString() ?? null,
        processedCount: run.processedCount,
        succeededCount: run.succeededCount,
        failedCount: run.failedCount,
        errorSummary: run.errorSummary,
      }),
    );
  }
}
