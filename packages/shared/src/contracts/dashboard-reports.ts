import { z } from 'zod';
import { currencyCodeSchema, moneySchema } from './money';

const signedMoneySchema = z
  .object({
    amount: z.string().regex(/^(0|-?[1-9]\d*)$/),
    currency: z.string().regex(/^[A-Z]{3}$/),
  })
  .strict();

const businessDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected a date in YYYY-MM-DD format')
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return (
      !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
    );
  }, 'Expected a valid calendar date');

export const dashboardQuerySchema = z
  .object({
    from: businessDateSchema.optional(),
    to: businessDateSchema.optional(),
  })
  .strict()
  .refine((value) => Boolean(value.from) === Boolean(value.to), {
    message: 'from and to must be supplied together',
  });

export const reportResourceSchema = z.enum([
  'customers',
  'invoices',
  'payments',
  'services',
]);

export const reportExportRequestSchema = dashboardQuerySchema;

export const invoiceAgingBuckets = [
  { id: '1-30', minimumDays: 1, maximumDays: 30, label: '1–30 days' },
  { id: '31-60', minimumDays: 31, maximumDays: 60, label: '31–60 days' },
  { id: '61-90', minimumDays: 61, maximumDays: 90, label: '61–90 days' },
  { id: '91-plus', minimumDays: 91, maximumDays: null, label: '91+ days' },
] as const;

const invoiceAgingBucketSchema = z.enum(
  invoiceAgingBuckets.map(({ id }) => id),
);

export const invoiceAgingFilterSchema = z.object({
  agingBucket: invoiceAgingBucketSchema,
  agingAsOf: businessDateSchema.refine((value) => value >= '1900-01-01'),
  agingCurrency: currencyCodeSchema,
});

export const invoiceAgingResponseSchema = z
  .object({
    asOf: businessDateSchema,
    currency: invoiceAgingFilterSchema.shape.agingCurrency,
    buckets: z.array(
      z
        .object({
          id: invoiceAgingBucketSchema,
          count: z.number().int().nonnegative(),
          balance: z.string().regex(/^(0|[1-9]\d*)$/),
        })
        .strict(),
    ),
  })
  .strict();

export type InvoiceAgingFilter = z.infer<typeof invoiceAgingFilterSchema>;
export type InvoiceAgingResponse = z.infer<typeof invoiceAgingResponseSchema>;

export const dashboardResponseSchema = z
  .object({
    generatedAt: z.iso.datetime({ offset: true }),
    timeZone: z.string().min(1).max(100),
    currency: z.string().regex(/^[A-Z]{3}$/),
    period: z
      .object({ from: businessDateSchema, to: businessDateSchema })
      .strict(),
    metrics: z
      .object({
        collectedRevenue: signedMoneySchema,
        outstandingBalance: moneySchema,
        overdueBalance: moneySchema,
        activeServices: z.number().int().nonnegative(),
        suspendedServices: z.number().int().nonnegative(),
        pendingOrders: z.number().int().nonnegative(),
        openTickets: z.number().int().nonnegative(),
        failedAutomationJobs: z.number().int().nonnegative(),
      })
      .strict(),
    revenueSeries: z.array(
      z
        .object({
          date: businessDateSchema,
          amount: z.string().regex(/^-?\d+$/),
        })
        .strict(),
    ),
    recentActivity: z.array(
      z
        .object({
          id: z.string().uuid(),
          action: z.string().min(1).max(120),
          label: z.string().min(1).max(160),
          entityType: z.string().min(1).max(80),
          entityId: z.string().uuid().nullable(),
          actor: z.string().min(1).max(320),
          createdAt: z.iso.datetime({ offset: true }),
        })
        .strict(),
    ),
  })
  .strict();

export type DashboardQuery = z.infer<typeof dashboardQuerySchema>;
export type DashboardResponse = z.infer<typeof dashboardResponseSchema>;
export type ReportResource = z.infer<typeof reportResourceSchema>;
export type ReportExportRequest = z.infer<typeof reportExportRequestSchema>;
