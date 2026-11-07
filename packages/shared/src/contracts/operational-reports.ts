import { z } from 'zod';
import { dashboardQuerySchema } from './dashboard-reports';
import { paginationQuerySchema, paginationMetaSchema } from './pagination';

const column = (
  label: string,
  format: 'text' | 'money' | 'count' | 'instant' = 'text',
) => ({ label, format });
export const operationalReports = {
  income: {
    title: 'Collected income by product',
    basis:
      'Cash movements verified in the selected business dates; historical purchased product labels.',
    notes:
      'Successful charges less refunds and reversals. Cash is allocated proportionally to positive invoice line totals with exact integer remainders. Discounts and tax are included in this allocation. Unlinked or invalid line data stays unattributed; current catalogue names are never substituted. This is a reporting allocation, not a product settlement ledger.',
    columns: [
      column('Product'),
      column('Item type'),
      column('Net collected', 'money'),
    ],
  },
  renewals: {
    title: 'Renewal invoice balances',
    basis:
      'One issued renewal invoice due in the selected business dates; current recorded balances.',
    notes:
      'Each invoice appears once, including combined hosting and add-on renewals. Paid applied and credits are invoice balances, not cash collected in this period. Draft and cancelled invoices are excluded. Refund movements belong in the cash report.',
    columns: [
      column('Invoice'),
      column('Renewal type'),
      column('Due at', 'instant'),
      column('Invoiced', 'money'),
      column('Paid applied', 'money'),
      column('Credits applied', 'money'),
      column('Outstanding', 'money'),
    ],
  },
  recurring: {
    title: 'Recurring charges due',
    basis:
      'Current next-cycle forecast for hosting due in the selected business dates.',
    notes:
      'Purchased hosting and fulfilled matching-cycle add-on amounts, grouped by product label and billing cycle. Active and suspended hosting only. Excludes one-time extras and choices ending by the next cycle. Excludes hosting cancellation and pending plan-change holds. This is one next-cycle forecast, not collected income or monthly recurring revenue; existing invoices are not added to it.',
    columns: [
      column('Product'),
      column('Item type'),
      column('Billing cycle'),
      column('Purchased entries', 'count'),
      column('Next-cycle forecast', 'money'),
    ],
  },
  'plan-changes': {
    title: 'Hosting plan changes',
    basis:
      'One change record created in the selected business dates; current status and saved quote.',
    notes:
      'Includes quotes and requests as well as completed changes. Creation counts are not completed sales. Missing historical quote facts remain unknown. No hosting panel request is made.',
    columns: [
      column('Service'),
      column('Change'),
      column('From plan'),
      column('To plan'),
      column('Status'),
      column('Created at', 'instant'),
      column('Completed at', 'instant'),
    ],
  },
  'domain-renewals': {
    title: 'Domain renewal exceptions',
    basis:
      'One latest exceptional attempt per renewal invoice, from attempts created in the selected business dates.',
    notes:
      'Shows failed, uncertain, review-required or financially held latest attempts. A newer successful attempt removes an earlier failure from this report. This is retained local status, not a live registrar observation. No attempt means provider outcome is unknown, not success.',
    columns: [
      column('Domain'),
      column('Invoice'),
      column('Attempt'),
      column('Status'),
      column('Review code'),
      column('Financial review'),
      column('Created at', 'instant'),
    ],
  },
  support: {
    title: 'Ticket workload by department',
    basis:
      'Current department workload across all tickets; created count uses the selected business dates.',
    notes:
      'Open, waiting and closed counts are current snapshots, not status history at the period end. Archived departments remain visible. Reply bodies, attachments and private notes are not included. SLA and staff effort data are unavailable.',
    columns: [
      column('Department'),
      column('Created in period', 'count'),
      column('Open', 'count'),
      column('Waiting', 'count'),
      column('Closed', 'count'),
    ],
  },
  cancellations: {
    title: 'Pending manual cancellation work',
    basis:
      'Current unresolved hosting requests and unacknowledged add-on removals; all dates.',
    notes:
      'Includes future scheduled work. Selected dates do not filter this queue. Add-on acknowledgement is matched to the exact service, purchased item and end date. Hosting state, purchased history and billing remain unchanged. Review the service record before applying any provider change.',
    columns: [
      column('Service'),
      column('Work'),
      column('Product'),
      column('Effective at', 'instant'),
      column('Timing'),
    ],
  },
} as const;
export const operationalReportIds = [
  'income',
  'renewals',
  'recurring',
  'plan-changes',
  'domain-renewals',
  'support',
  'cancellations',
] as const;
export const operationalReportIdSchema = z.enum(operationalReportIds);
export type OperationalReportId = z.infer<typeof operationalReportIdSchema>;
export const operationalReportRequestSchema = z
  .object({
    from: z.string().optional(),
    to: z.string().optional(),
    page: z.coerce.number().int().min(1).max(1_000_000).default(1),
    pageSize: paginationQuerySchema.shape.pageSize,
  })
  .strict()
  .superRefine((value, ctx) => {
    const result = dashboardQuerySchema.safeParse({
      from: value.from,
      to: value.to,
    });
    if (!result.success)
      for (const issue of result.error.issues)
        ctx.addIssue({
          code: 'custom',
          path: issue.path,
          message: issue.message,
        });
  });
export type OperationalReportQuery = z.infer<
  typeof operationalReportRequestSchema
>;
export const operationalReportResponseSchema = z
  .object({
    report: operationalReportIdSchema,
    generatedAt: z.iso.datetime(),
    currency: z.string().regex(/^[A-Z]{3}$/),
    timeZone: z.string().min(1),
    period: z.object({ from: z.string(), to: z.string() }).strict(),
    rows: z.array(
      z.object({ id: z.string().min(1), cells: z.array(z.string()) }).strict(),
    ),
    totals: z.array(z.string()),
    pagination: paginationMetaSchema,
  })
  .strict()
  .superRefine((value, ctx) => {
    const columns = operationalReports[value.report].columns;
    const size = columns.length;
    if (
      value.totals.length !== size ||
      value.rows.some((row) => row.cells.length !== size)
    )
      ctx.addIssue({ code: 'custom', message: 'Report columns do not match.' });
    for (const cells of [...value.rows.map((row) => row.cells), value.totals]) {
      columns.forEach((column, index) => {
        const cell = cells[index];
        const numeric = column.format === 'money' || column.format === 'count';
        const pattern =
          column.format === 'count' ? /^(0|[1-9]\d*)$/ : /^(0|-?[1-9]\d*)$/;
        if (numeric && !pattern.test(cell ?? ''))
          ctx.addIssue({
            code: 'custom',
            message: 'Report amounts and counts must be integer strings.',
          });
      });
    }
  });
export type OperationalReportResponse = z.infer<
  typeof operationalReportResponseSchema
>;
