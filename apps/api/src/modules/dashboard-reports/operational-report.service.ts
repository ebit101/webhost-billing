import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { Prisma, type PrismaClient } from '@webhost-billing/database';
import {
  createPaginationMeta,
  operationalReports,
  operationalReportResponseSchema,
  type OperationalReportId,
  type OperationalReportQuery,
  type DashboardQuery,
} from '@webhost-billing/shared';
import { ApplicationException } from '../../common/errors/application.exception';
import type { SecurityRequestContext } from '../../common/http/request-context';
import { PRISMA_CLIENT } from '../../infrastructure/database/database.module';
import type { AuthRequestContext } from '../auth/auth.types';
import { SettingsService } from '../settings/settings.service';
import { csvDocument } from './csv';
import { resolveDashboardPeriod } from './dashboard-period';
import { operationalReportSql } from './operational-report.sql';

@Injectable()
export class OperationalReportService {
  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient,
    private readonly settings: SettingsService,
  ) {}

  async list(
    report: OperationalReportId,
    query: OperationalReportQuery,
    actor: AuthRequestContext,
  ) {
    return this.read(
      report,
      query,
      actor,
      query.pageSize,
      (query.page - 1) * query.pageSize,
    );
  }

  async exportCsv(
    report: OperationalReportId,
    query: DashboardQuery,
    actor: AuthRequestContext,
    context: SecurityRequestContext,
  ) {
    const result = await this.read(
      report,
      { ...query, page: 1, pageSize: 100 },
      actor,
      10001,
      0,
    );
    if (result.pagination.totalItems > 10000)
      throw new ApplicationException({
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        code: 'UNPROCESSABLE_ENTITY',
        message:
          'Export exceeds the 10,000 row safety limit. Narrow the period or use paginated reports.',
      });
    const definition = operationalReports[report];
    const headers = [
      'Report',
      'Currency',
      'Business time zone',
      'From',
      'To',
      'Generated at UTC',
      ...definition.columns.map(
        (c) =>
          c.label +
          (c.format === 'money'
            ? ' (minor units)'
            : c.format === 'instant'
              ? ' (UTC)'
              : ''),
      ),
    ];
    const rows = result.rows.map((row) => [
      definition.title,
      result.currency,
      result.timeZone,
      result.period.from,
      result.period.to,
      result.generatedAt,
      ...row.cells,
    ]);
    await this.prisma.activityLog.create({
      data: {
        actorUserId: actor.identity.userId,
        action: 'REPORT_CSV_EXPORTED_BY_ADMIN',
        entityType: 'REPORT',
        ipAddressHash: context.ipAddressHash,
        metadata: {
          report,
          rowCount: rows.length,
          currency: result.currency,
          timeZone: result.timeZone,
          ...result.period,
          basis: definition.basis,
        },
      },
    });
    return {
      body: csvDocument(headers, rows),
      rowCount: rows.length,
      filename: `webhost-billing-${report}-${result.period.from}-to-${result.period.to}.csv`,
    };
  }

  private async read(
    report: OperationalReportId,
    query: OperationalReportQuery,
    actor: AuthRequestContext,
    limit: number,
    offset: number,
  ) {
    if (
      actor.identity.role !== 'ADMIN' ||
      actor.identity.staffRole !== 'FULL_ADMINISTRATOR' ||
      actor.supportAdministratorId
    )
      throw new ApplicationException({
        status: HttpStatus.FORBIDDEN,
        code: 'FORBIDDEN',
        message: 'Reports require a full administrator account.',
      });
    const { currency, timeZone } = await this.settings.overview();
    const now = new Date();
    const period = resolveDashboardPeriod(query, timeZone, now);
    const source = operationalReportSql(
      report,
      currency,
      period.start,
      period.endExclusive,
      now,
    );
    const totals = operationalReports[report].columns.map((c, index) =>
      c.format === 'money' || c.format === 'count'
        ? Prisma.sql`coalesce(sum(cells[${index + 1}::int]::numeric),0)::text`
        : Prisma.sql`''::text`,
    );
    const [data] = await this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SET TRANSACTION READ ONLY`;
        await tx.$executeRaw`SET LOCAL statement_timeout='15s'`;
        return tx.$queryRaw<
          Array<{ total: string; totals: string[]; rows: unknown }>
        >`
        WITH report AS (${source}) SELECT count(*)::text AS total, ARRAY[${Prisma.join(totals)}] AS totals,
          coalesce((SELECT jsonb_agg(jsonb_build_object('id',p.id,'cells',p.cells) ORDER BY p.id)
            FROM (SELECT id,cells FROM report ORDER BY id LIMIT ${limit} OFFSET ${offset}) p),'[]'::jsonb) AS rows FROM report`;
      },
      { isolationLevel: 'RepeatableRead', timeout: 20000 },
    );
    return operationalReportResponseSchema.parse({
      report,
      generatedAt: now.toISOString(),
      currency,
      timeZone,
      period: { from: period.from, to: period.to },
      rows: data.rows,
      totals: data.totals,
      pagination: createPaginationMeta(
        query.page,
        query.pageSize,
        Number(data.total),
      ),
    });
  }
}
