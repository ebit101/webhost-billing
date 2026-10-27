import { Body, Controller, Get, Patch, Query } from '@nestjs/common';
import {
  createApiSuccessResponse,
  createPaginatedApiSuccessResponse,
  notificationCatalog,
  notificationListQuerySchema,
  notificationPreferencesRequestSchema,
  type NotificationListQuery,
  type NotificationPreferencesRequest,
} from '@webhost-billing/shared';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe';
import type { AuthRequestContext } from '../auth/auth.types';
import { CurrentAuth } from '../auth/decorators/current-auth.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { StaffPermissionRequired } from '../auth/decorators/staff-permission.decorator';
import { NotificationService } from './notification.service';

@Controller('notifications')
@Roles('ADMIN', 'CUSTOMER')
@StaffPermissionRequired('account.self')
export class NotificationController {
  constructor(private readonly notifications: NotificationService) {}
  @Get('catalog')
  catalog(@CurrentAuth() auth: AuthRequestContext) {
    return createApiSuccessResponse(
      notificationCatalog.filter(
        (item) =>
          item.audience === auth.identity.role &&
          (auth.identity.role !== 'ADMIN' ||
            auth.identity.staffRole === 'FULL_ADMINISTRATOR' ||
            item.key === 'admin-security-alert'),
      ),
    );
  }
  @Get('preferences')
  async preferences(@CurrentAuth() auth: AuthRequestContext) {
    return createApiSuccessResponse(
      await this.notifications.preferences(auth.identity.userId),
    );
  }
  @Patch('preferences')
  async update(
    @CurrentAuth() auth: AuthRequestContext,
    @Body(new ZodValidationPipe(notificationPreferencesRequestSchema))
    input: NotificationPreferencesRequest,
  ) {
    return createApiSuccessResponse(
      await this.notifications.update(auth.identity.userId, input),
    );
  }
  @Get('email-history')
  async emailHistory(
    @CurrentAuth() auth: AuthRequestContext,
    @Query(new ZodValidationPipe(notificationListQuerySchema))
    query: NotificationListQuery,
  ) {
    const result = await this.notifications.emailHistory(
      auth.identity.userId,
      query,
    );
    return createPaginatedApiSuccessResponse(result.data, result.pagination);
  }
  @Get()
  async list(
    @CurrentAuth() auth: AuthRequestContext,
    @Query(new ZodValidationPipe(notificationListQuerySchema))
    query: NotificationListQuery,
  ) {
    const result = await this.notifications.list(auth.identity.userId, query);
    return createPaginatedApiSuccessResponse(result.data, result.pagination);
  }
}
