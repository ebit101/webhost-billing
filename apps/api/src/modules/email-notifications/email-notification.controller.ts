import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import {
  createApiSuccessResponse,
  createPaginatedApiSuccessResponse,
  clientEmailHistoryQuerySchema,
  type ClientEmailHistoryQuery,
} from '@webhost-billing/shared';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe';
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

  @Get('customers/:customerId')
  async clientHistory(
    @Param('customerId', new ParseUUIDPipe()) customerId: string,
    @Query(new ZodValidationPipe(clientEmailHistoryQuerySchema))
    query: ClientEmailHistoryQuery,
  ) {
    const result = await this.notifications.forCustomer(customerId, query);
    return createPaginatedApiSuccessResponse(result.data, result.pagination);
  }
}
