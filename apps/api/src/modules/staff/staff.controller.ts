import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import type { ApiEnvironment } from '@webhost-billing/config';
import {
  createApiSuccessResponse,
  createStaffRequestSchema,
  updateStaffRequestSchema,
  type CreateStaffRequest,
  type UpdateStaffRequest,
} from '@webhost-billing/shared';
import type { Request } from 'express';
import { createSecurityRequestContext } from '../../common/http/request-context';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe';
import { API_ENVIRONMENT } from '../../infrastructure/environment/environment.module';
import type { AuthRequestContext } from '../auth/auth.types';
import { CurrentAuth } from '../auth/decorators/current-auth.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { StaffPermissionRequired } from '../auth/decorators/staff-permission.decorator';
import { AuthRateLimit } from '../auth/decorators/rate-limit.decorator';
import { StaffService } from './staff.service';

@Controller('staff')
@Roles('ADMIN')
export class StaffController {
  constructor(
    private readonly staff: StaffService,
    @Inject(API_ENVIRONMENT) private readonly environment: ApiEnvironment,
  ) {}

  @Get()
  async list() {
    return createApiSuccessResponse(await this.staff.list());
  }

  @Post()
  @StaffPermissionRequired('staff.manage')
  @AuthRateLimit({
    scope: 'staff-invite',
    limit: 10,
    windowMs: 60 * 60_000,
    includeEmail: false,
  })
  async create(
    @Body(new ZodValidationPipe(createStaffRequestSchema))
    input: CreateStaffRequest,
    @CurrentAuth() actor: AuthRequestContext,
    @Req() request: Request,
  ) {
    return createApiSuccessResponse(
      await this.staff.create(
        input,
        actor,
        createSecurityRequestContext(request, this.environment.SESSION_SECRET),
      ),
    );
  }

  @Patch(':userId')
  @StaffPermissionRequired('staff.manage')
  async update(
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @Body(new ZodValidationPipe(updateStaffRequestSchema))
    input: UpdateStaffRequest,
    @CurrentAuth() actor: AuthRequestContext,
    @Req() request: Request,
  ) {
    return createApiSuccessResponse(
      await this.staff.update(
        userId,
        input,
        actor,
        createSecurityRequestContext(request, this.environment.SESSION_SECRET),
      ),
    );
  }

  @Post(':userId/invitation')
  @StaffPermissionRequired('staff.manage')
  @AuthRateLimit({
    scope: 'staff-invite',
    limit: 10,
    windowMs: 60 * 60_000,
    includeEmail: false,
  })
  async resend(
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @CurrentAuth() actor: AuthRequestContext,
    @Req() request: Request,
  ) {
    await this.staff.resend(
      userId,
      actor,
      createSecurityRequestContext(request, this.environment.SESSION_SECRET),
    );
    return createApiSuccessResponse({ message: 'Invitation emails queued.' });
  }
}
