import { Controller, Get } from '@nestjs/common';
import { createApiSuccessResponse } from '@webhost-billing/shared';
import { Roles } from '../auth/decorators/roles.decorator';
import { EmailNotificationService } from './email-notification.service';

@Controller('email-notifications')
@Roles('ADMIN')
export class EmailNotificationController {
  constructor(private readonly notifications: EmailNotificationService) {}

  @Get()
  async recent() {
    return createApiSuccessResponse(await this.notifications.recent());
  }
}
