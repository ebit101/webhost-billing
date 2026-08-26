import { z } from 'zod';
import { backgroundQueueNameSchema } from './background-jobs';
import { automationRunSummarySchema } from './renewal-automation';

export const healthStatusSchema = z
  .object({
    status: z.literal('OK'),
    service: z.literal('api'),
    checkedAt: z.iso.datetime({ offset: true }),
  })
  .strict();
export type HealthStatus = z.infer<typeof healthStatusSchema>;

export const readinessStatusSchema = z
  .object({
    status: z.enum(['READY', 'NOT_READY']),
    checkedAt: z.iso.datetime({ offset: true }),
    components: z
      .object({
        postgresql: z.enum(['UP', 'DOWN']),
        redis: z.enum(['UP', 'DOWN']),
      })
      .strict(),
  })
  .strict();
export type ReadinessStatus = z.infer<typeof readinessStatusSchema>;

export const backgroundQueueMetricSchema = z
  .object({
    queueName: backgroundQueueNameSchema,
    waiting: z.number().int().nonnegative(),
    active: z.number().int().nonnegative(),
    delayed: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
  })
  .strict();
export type BackgroundQueueMetric = z.infer<typeof backgroundQueueMetricSchema>;

export const providerFailureMetricSchema = z
  .object({
    providerType: z.enum(['PAYMENT_GATEWAY', 'HOSTING_PANEL', 'EMAIL']),
    provider: z.string().min(1).max(64),
    failedLast24Hours: z.number().int().nonnegative(),
    inconsistentLast24Hours: z.number().int().nonnegative(),
    mostRecentAt: z.iso.datetime({ offset: true }).nullable(),
  })
  .strict();
export type ProviderFailureMetric = z.infer<typeof providerFailureMetricSchema>;

const queueTotalsSchema = z
  .object({
    waiting: z.number().int().nonnegative(),
    active: z.number().int().nonnegative(),
    delayed: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
  })
  .strict();

export const operationalOverviewSchema = z
  .object({
    generatedAt: z.iso.datetime({ offset: true }),
    queues: z.array(backgroundQueueMetricSchema),
    queueTotals: queueTotalsSchema,
    failedOutboxEvents: z.number().int().nonnegative(),
    automation: z
      .object({
        running: z.number().int().nonnegative(),
        failedLast24Hours: z.number().int().nonnegative(),
        latestRuns: z.array(automationRunSummarySchema).max(20),
      })
      .strict(),
    providerFailures: z.array(providerFailureMetricSchema),
  })
  .strict();
export type OperationalOverview = z.infer<typeof operationalOverviewSchema>;
