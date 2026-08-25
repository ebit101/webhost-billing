import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  AutomationStatus,
  InvoiceStatus,
  OrderStatus,
  PaymentKind,
  PaymentStatus,
  ServiceStatus,
  TicketStatus,
  type PrismaClient,
} from '@webhost-billing/database';
import {
  dashboardResponseSchema,
  serializeMoney,
  type DashboardQuery,
  type DashboardResponse,
  type ReportExportRequest,
  type ReportResource,
} from '@webhost-billing/shared';
import { ApplicationException } from '../../common/errors/application.exception';
import type { SecurityRequestContext } from '../../common/http/request-context';
import { PRISMA_CLIENT } from '../../infrastructure/database/database.module';
import type { AuthRequestContext } from '../auth/auth.types';
import { SettingsService } from '../settings/settings.service';
import { csvDocument } from './csv';
import {
  addCalendarDays,
  businessDate,
  resolveDashboardPeriod,
} from './dashboard-period';

const EXPORT_LIMIT = 10_000;

export interface CsvExport {
  body: string;
  filename: string;
  rowCount: number;
}

@Injectable()
export class DashboardReportService {
  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient,
    private readonly settings: SettingsService,
  ) {}

  async dashboard(query: DashboardQuery): Promise<DashboardResponse> {
    const localization = await this.settings.overview();
    const { currency, timeZone } = localization;
    const period = resolveDashboardPeriod(query, timeZone);
    const [
      payments,
      outstanding,
      overdue,
      activeServices,
      suspendedServices,
      pendingOrders,
      openTickets,
      failedAutomationJobs,
      activity,
    ] = await Promise.all([
      this.prisma.payment.findMany({
        where: {
          status: PaymentStatus.SUCCEEDED,
          currency,
          verifiedAt: { gte: period.start, lt: period.endExclusive },
        },
        select: { kind: true, amount: true, verifiedAt: true },
      }),
      this.prisma.invoice.aggregate({
        where: {
          status: { in: [InvoiceStatus.UNPAID, InvoiceStatus.OVERDUE] },
          currency,
        },
        _sum: { balanceDue: true },
      }),
      this.prisma.invoice.aggregate({
        where: { status: InvoiceStatus.OVERDUE, currency },
        _sum: { balanceDue: true },
      }),
      this.prisma.service.count({ where: { status: ServiceStatus.ACTIVE } }),
      this.prisma.service.count({ where: { status: ServiceStatus.SUSPENDED } }),
      this.prisma.order.count({
        where: {
          status: {
            in: [
              OrderStatus.PENDING,
              OrderStatus.AWAITING_PAYMENT,
              OrderStatus.PAID,
              OrderStatus.PROCESSING,
            ],
          },
        },
      }),
      this.prisma.ticket.count({
        where: { status: { not: TicketStatus.CLOSED } },
      }),
      this.prisma.automationRun.count({
        where: {
          status: {
            in: [AutomationStatus.FAILED, AutomationStatus.PARTIALLY_SUCCEEDED],
          },
          startedAt: { gte: period.start, lt: period.endExclusive },
        },
      }),
      this.prisma.activityLog.findMany({
        take: 12,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: {
          id: true,
          action: true,
          entityType: true,
          entityId: true,
          createdAt: true,
          actor: {
            select: {
              email: true,
              adminProfile: { select: { displayName: true } },
              customer: { select: { firstName: true, lastName: true } },
            },
          },
        },
      }),
    ]);

    const daily = new Map<string, bigint>();
    let collected = 0n;
    for (const payment of payments) {
      if (!payment.verifiedAt) continue;
      const sign = payment.kind === PaymentKind.CHARGE ? 1n : -1n;
      const amount = payment.amount * sign;
      collected += amount;
      const date = businessDate(payment.verifiedAt, timeZone);
      daily.set(date, (daily.get(date) ?? 0n) + amount);
    }
    const revenueSeries: { date: string; amount: string }[] = [];
    for (
      let date = period.from;
      date <= period.to;
      date = addCalendarDays(date, 1)
    ) {
      revenueSeries.push({ date, amount: (daily.get(date) ?? 0n).toString() });
    }

    return dashboardResponseSchema.parse({
      generatedAt: new Date().toISOString(),
      timeZone,
      currency,
      period: { from: period.from, to: period.to },
      metrics: {
        collectedRevenue: { amount: collected.toString(), currency },
        outstandingBalance: serializeMoney(
          outstanding._sum.balanceDue ?? 0n,
          currency,
        ),
        overdueBalance: serializeMoney(overdue._sum.balanceDue ?? 0n, currency),
        activeServices,
        suspendedServices,
        pendingOrders,
        openTickets,
        failedAutomationJobs,
      },
      revenueSeries,
      recentActivity: activity.map((entry) => ({
        id: entry.id,
        action: entry.action,
        label: actionLabel(entry.action),
        entityType: entry.entityType,
        entityId: entry.entityId,
        actor:
          entry.actor?.adminProfile?.displayName ??
          (entry.actor?.customer
            ? `${entry.actor.customer.firstName} ${entry.actor.customer.lastName}`
            : (entry.actor?.email ?? 'System')),
        createdAt: entry.createdAt.toISOString(),
      })),
    });
  }

  async exportCsv(
    resource: ReportResource,
    query: ReportExportRequest,
    actor: AuthRequestContext,
    context: SecurityRequestContext,
  ): Promise<CsvExport> {
    const { currency, timeZone } = await this.settings.overview();
    const period = resolveDashboardPeriod(query, timeZone);
    const result = await this.buildExport(
      resource,
      period.start,
      period.endExclusive,
    );
    if (result.rows.length > EXPORT_LIMIT) {
      throw new ApplicationException({
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        code: 'UNPROCESSABLE_ENTITY',
        message: `Export exceeds the ${EXPORT_LIMIT.toLocaleString('en')} row safety limit.`,
      });
    }
    await this.prisma.activityLog.create({
      data: {
        actorUserId: actor.identity.userId,
        action: 'REPORT_CSV_EXPORTED_BY_ADMIN',
        entityType: 'REPORT',
        ipAddressHash: context.ipAddressHash,
        metadata: {
          resource,
          rowCount: result.rows.length,
          from: period.from,
          to: period.to,
          currency,
          timeZone,
        },
      },
    });
    return {
      body: csvDocument(result.headers, result.rows),
      filename: `webhost-billing-${resource}-${period.from}-to-${period.to}.csv`,
      rowCount: result.rows.length,
    };
  }

  private async buildExport(
    resource: ReportResource,
    start: Date,
    endExclusive: Date,
  ) {
    if (resource === 'customers') {
      const data = await this.prisma.customer.findMany({
        take: EXPORT_LIMIT + 1,
        where: { deletedAt: null },
        orderBy: { customerNumber: 'asc' },
        include: { user: { select: { email: true } } },
      });
      return {
        headers: [
          'Customer number',
          'Status',
          'First name',
          'Last name',
          'Company',
          'Email',
          'Phone',
          'Address line 1',
          'Address line 2',
          'City',
          'Region',
          'Postal code',
          'Country',
          'Created at UTC',
        ],
        rows: data.map((row) => [
          row.customerNumber,
          row.status,
          row.firstName,
          row.lastName,
          row.companyName,
          row.user.email,
          row.phone,
          row.addressLine1,
          row.addressLine2,
          row.city,
          row.region,
          row.postalCode,
          row.countryCode,
          row.createdAt,
        ]),
      };
    }
    if (resource === 'invoices') {
      const data = await this.prisma.invoice.findMany({
        take: EXPORT_LIMIT + 1,
        where: { createdAt: { gte: start, lt: endExclusive } },
        orderBy: [{ createdAt: 'asc' }, { invoiceNumber: 'asc' }],
        include: { customer: { select: { customerNumber: true } } },
      });
      return {
        headers: [
          'Invoice number',
          'Customer number',
          'Customer',
          'Email',
          'Status',
          'Currency',
          'Subtotal minor',
          'Discount minor',
          'Tax minor',
          'Total minor',
          'Credit minor',
          'Paid minor',
          'Balance minor',
          'Issued at UTC',
          'Due at UTC',
          'Paid at UTC',
          'Created at UTC',
        ],
        rows: data.map((row) => [
          row.invoiceNumber,
          row.customer.customerNumber,
          row.customerNameSnapshot,
          row.customerEmailSnapshot,
          row.status,
          row.currency,
          row.subtotal,
          row.discountTotal,
          row.taxTotal,
          row.total,
          row.creditTotal,
          row.amountPaid,
          row.balanceDue,
          row.issuedAt,
          row.dueAt,
          row.paidAt,
          row.createdAt,
        ]),
      };
    }
    if (resource === 'payments') {
      const data = await this.prisma.payment.findMany({
        take: EXPORT_LIMIT + 1,
        where: { createdAt: { gte: start, lt: endExclusive } },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        include: { invoice: { select: { invoiceNumber: true } } },
      });
      return {
        headers: [
          'Invoice number',
          'Kind',
          'Status',
          'Provider',
          'Manual method',
          'Reference',
          'Currency',
          'Amount minor',
          'Received at UTC',
          'Verified at UTC',
          'Created at UTC',
        ],
        rows: data.map((row) => [
          row.invoice.invoiceNumber,
          row.kind,
          row.status,
          row.provider,
          row.manualMethod,
          row.reference,
          row.currency,
          row.amount,
          row.receivedAt,
          row.verifiedAt,
          row.createdAt,
        ]),
      };
    }
    const data = await this.prisma.service.findMany({
      take: EXPORT_LIMIT + 1,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      include: {
        customer: { select: { customerNumber: true } },
        server: { select: { name: true } },
      },
    });
    return {
      headers: [
        'Customer number',
        'Domain',
        'Product',
        'Status',
        'Server',
        'Billing period',
        'Currency',
        'Recurring minor',
        'Started at UTC',
        'Next due at UTC',
        'Activated at UTC',
        'Suspended at UTC',
        'Cancelled at UTC',
        'Terminated at UTC',
      ],
      rows: data.map((row) => [
        row.customer.customerNumber,
        row.domain,
        row.productNameSnapshot,
        row.status,
        row.server.name,
        row.billingPeriod,
        row.currency,
        row.recurringAmount,
        row.startedAt,
        row.nextDueAt,
        row.activatedAt,
        row.suspendedAt,
        row.cancelledAt,
        row.terminatedAt,
      ]),
    };
  }
}

function actionLabel(action: string): string {
  return action
    .toLowerCase()
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
