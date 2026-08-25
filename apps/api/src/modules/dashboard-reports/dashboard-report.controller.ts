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
} from '@webhost-billing/shared';
import type { Request, Response } from 'express';
import { createSecurityRequestContext } from '../../common/http/request-context';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe';
import { API_ENVIRONMENT } from '../../infrastructure/environment/environment.module';
import type { AuthRequestContext } from '../auth/auth.types';
import { CurrentAuth } from '../auth/decorators/current-auth.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { DashboardReportService } from './dashboard-report.service';

@Controller()
@Roles('ADMIN')
export class DashboardReportController {
  private readonly auditSecret: string;

  constructor(
    private readonly reports: DashboardReportService,
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
