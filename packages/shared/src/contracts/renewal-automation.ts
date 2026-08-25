import { z } from 'zod';

const timeZoneSchema = z
  .string()
  .min(1)
  .max(64)
  .refine((value) => {
    try {
      new Intl.DateTimeFormat('en', { timeZone: value }).format(new Date(0));
      return true;
    } catch {
      return false;
    }
  }, 'Expected an IANA time zone');

export const renewalAutomationPolicySchema = z
  .object({
    enabled: z.boolean(),
    invoiceLeadDays: z.number().int().min(1).max(90),
    reminderDaysBeforeDue: z.array(z.number().int().min(0).max(90)).max(10),
    gracePeriodDays: z.number().int().min(0).max(60),
    timeZone: timeZoneSchema,
  })
  .strict()
  .superRefine((policy, context) => {
    const unique = new Set(policy.reminderDaysBeforeDue);
    if (unique.size !== policy.reminderDaysBeforeDue.length) {
      context.addIssue({
        code: 'custom',
        path: ['reminderDaysBeforeDue'],
        message: 'Reminder days must be unique',
      });
    }
    if (
      policy.reminderDaysBeforeDue.some(
        (days) => days >= policy.invoiceLeadDays,
      )
    ) {
      context.addIssue({
        code: 'custom',
        path: ['reminderDaysBeforeDue'],
        message: 'Reminder days must be less than the invoice lead time',
      });
    }
  });

export type RenewalAutomationPolicy = z.infer<
  typeof renewalAutomationPolicySchema
>;

export const DEFAULT_RENEWAL_AUTOMATION_POLICY: RenewalAutomationPolicy = {
  enabled: true,
  invoiceLeadDays: 14,
  reminderDaysBeforeDue: [7, 3, 1],
  gracePeriodDays: 3,
  timeZone: 'Asia/Dhaka',
};

export const automationRunStatusSchema = z.enum([
  'RUNNING',
  'SUCCEEDED',
  'PARTIALLY_SUCCEEDED',
  'FAILED',
  'SKIPPED',
]);

export const automationRunSummarySchema = z
  .object({
    id: z.uuid(),
    jobName: z.string().min(1).max(100),
    status: automationRunStatusSchema,
    startedAt: z.iso.datetime({ offset: true }),
    completedAt: z.iso.datetime({ offset: true }).nullable(),
    processedCount: z.number().int().nonnegative(),
    succeededCount: z.number().int().nonnegative(),
    failedCount: z.number().int().nonnegative(),
    errorSummary: z.string().max(255).nullable(),
  })
  .strict();

export type AutomationRunSummary = z.infer<typeof automationRunSummarySchema>;

export const renewalCyclePayloadSchema = z
  .object({
    schemaVersion: z.literal(1),
    automationRunId: z.uuid(),
    businessDate: z.iso.date(),
    scheduledFor: z.iso.datetime({ offset: true }),
    policy: renewalAutomationPolicySchema,
  })
  .strict();

export const renewalPaymentPayloadSchema = z
  .object({
    schemaVersion: z.literal(1),
    paymentId: z.uuid(),
    invoiceId: z.uuid(),
  })
  .strict();

export const hostingAutomationPayloadSchema = z
  .object({
    schemaVersion: z.literal(1),
    serviceId: z.uuid(),
    invoiceId: z.uuid(),
    automationRunId: z.uuid(),
  })
  .strict();

export type RenewalCyclePayload = z.infer<typeof renewalCyclePayloadSchema>;
export type RenewalPaymentPayload = z.infer<typeof renewalPaymentPayloadSchema>;
export type HostingAutomationPayload = z.infer<
  typeof hostingAutomationPayloadSchema
>;
