import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { DashboardReportController } from './dashboard-report.controller';
import { DashboardReportService } from './dashboard-report.service';
import { OperationalReportService } from './operational-report.service';

@Module({
  imports: [SettingsModule],
  controllers: [DashboardReportController],
  providers: [DashboardReportService, OperationalReportService],
})
export class DashboardReportModule {}
