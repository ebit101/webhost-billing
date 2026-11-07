import { z } from 'zod';

const bytes = z.string().regex(/^(0|[1-9][0-9]{0,29})$/);
export const hostingUsageMetricSchema = z
  .object({
    usedBytes: bytes.nullable(),
    limitBytes: bytes.nullable(),
    limitKind: z.enum(['LIMITED', 'UNLIMITED', 'UNKNOWN']),
  })
  .strict()
  .refine(
    (value) => (value.limitKind === 'LIMITED') === (value.limitBytes !== null),
    {
      message: 'Only a known finite limit has a byte value.',
    },
  );
export const hostingUsageSampleSchema = z
  .object({
    disk: hostingUsageMetricSchema.nullable(),
    bandwidth: hostingUsageMetricSchema.nullable(),
    bandwidthPeriod: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  })
  .strict();
export const serviceUsageSchema = hostingUsageSampleSchema
  .extend({
    serviceId: z.uuid(),
    status: z.enum([
      'AVAILABLE',
      'STALE',
      'UNAVAILABLE',
      'UNSUPPORTED',
      'NOT_READY',
    ]),
    sampledAt: z.iso.datetime().nullable(),
    freshUntil: z.iso.datetime().nullable(),
    retryAfterSeconds: z.number().int().min(0).max(300),
    simulated: z.boolean(),
  })
  .strict()
  .refine(
    (value) => {
      const hasSample =
        value.status === 'AVAILABLE' || value.status === 'STALE';
      return hasSample
        ? Boolean(
            value.sampledAt &&
            value.freshUntil &&
            (value.disk || value.bandwidth),
          )
        : value.sampledAt === null &&
            value.freshUntil === null &&
            value.disk === null &&
            value.bandwidth === null;
    },
    { message: 'Only available or stale results may contain a saved sample.' },
  );
export type HostingUsageMetric = z.infer<typeof hostingUsageMetricSchema>;
export type HostingUsageSample = z.infer<typeof hostingUsageSampleSchema>;
export type ServiceUsage = z.infer<typeof serviceUsageSchema>;
