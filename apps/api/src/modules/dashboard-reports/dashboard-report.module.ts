import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { DashboardReportController } from './dashboard-report.controller';
import { DashboardReportService } from './dashboard-report.service';

@Module({
  imports: [SettingsModule],
  controllers: [DashboardReportController],
  providers: [DashboardReportService],
})
export class DashboardReportModule {}
