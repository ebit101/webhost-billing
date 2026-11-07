import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { ApiEnvironment } from '@webhost-billing/config';
import {
  createApiSuccessResponse,
  dashboardQuerySchema,
  reportExportRequestSchema,
  reportResourceSchema,
  type DashboardQuery,
  type ReportExportRequest,
  type ReportResource,
  operationalReportIdSchema,
  operationalReportRequestSchema,
  type OperationalReportId,
  type OperationalReportQuery,
} from '@webhost-billing/shared';
import type { Request, Response } from 'express';
import { createSecurityRequestContext } from '../../common/http/request-context';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe';
import { API_ENVIRONMENT } from '../../infrastructure/environment/environment.module';
import type { AuthRequestContext } from '../auth/auth.types';
import { CurrentAuth } from '../auth/decorators/current-auth.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { DashboardReportService } from './dashboard-report.service';
import { OperationalReportService } from './operational-report.service';

@Controller()
@Roles('ADMIN')
export class DashboardReportController {
  private readonly auditSecret: string;

  constructor(
    private readonly reports: DashboardReportService,
    private readonly operational: OperationalReportService,
    @Inject(API_ENVIRONMENT) environment: ApiEnvironment,
  ) {
    this.auditSecret = environment.SESSION_SECRET;
  }

  @Get('dashboard')
  async dashboard(
    @Query(new ZodValidationPipe(dashboardQuerySchema)) query: DashboardQuery,
  ) {
    return createApiSuccessResponse(await this.reports.dashboard(query));
  }

  @Get('reports/invoice-aging')
  async invoiceAging() {
    return createApiSuccessResponse(await this.reports.invoiceAging());
  }

  @Get('reports/operations/:report')
  async operationalReport(
    @Param('report', new ZodValidationPipe(operationalReportIdSchema))
    report: OperationalReportId,
    @Query(new ZodValidationPipe(operationalReportRequestSchema))
    query: OperationalReportQuery,
    @CurrentAuth() auth: AuthRequestContext,
  ) {
    return createApiSuccessResponse(
      await this.operational.list(report, query, auth),
    );
  }

  @Post('reports/operations/:report/export')
  async operationalExport(
    @Param('report', new ZodValidationPipe(operationalReportIdSchema))
    report: OperationalReportId,
    @Body(new ZodValidationPipe(reportExportRequestSchema))
    input: ReportExportRequest,
    @CurrentAuth() auth: AuthRequestContext,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    const result = await this.operational.exportCsv(
      report,
      input,
      auth,
      createSecurityRequestContext(request, this.auditSecret),
    );
    response
      .status(200)
      .set({
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${result.filename}"`,
        'X-Export-Row-Count': String(result.rowCount),
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      })
      .send(result.body);
  }

  @Post('reports/exports/:resource')
  async export(
    @Param('resource', new ZodValidationPipe(reportResourceSchema))
    resource: ReportResource,
    @Body(new ZodValidationPipe(reportExportRequestSchema))
    input: ReportExportRequest,
    @CurrentAuth() auth: AuthRequestContext,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    const report = await this.reports.exportCsv(
      resource,
      input,
      auth,
      createSecurityRequestContext(request, this.auditSecret),
    );
    response
      .status(200)
      .set({
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${report.filename}"`,
        'X-Export-Row-Count': String(report.rowCount),
        'Cache-Control': 'no-store',
      })
      .send(report.body);
  }
}
