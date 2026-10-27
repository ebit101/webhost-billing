import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../../infrastructure/database/database.module';
import { NotificationController } from './notification.controller';
import { NotificationService } from './notification.service';

@Module({
  imports: [AuthModule, DatabaseModule],
  controllers: [NotificationController],
  providers: [NotificationService],
})
export class NotificationModule {}
