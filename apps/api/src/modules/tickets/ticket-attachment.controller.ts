import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Req,
  Res,
  StreamableFile,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import type { ApiEnvironment } from '@webhost-billing/config';
import {
  createApiSuccessResponse,
  createTicketAttachmentSchema,
  type CreateTicketAttachment,
} from '@webhost-billing/shared';
import { API_ENVIRONMENT } from '../../infrastructure/environment/environment.module';
import { createSecurityRequestContext } from '../../common/http/request-context';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe';
import { CurrentAuth } from '../auth/decorators/current-auth.decorator';
import { CustomerSupportAccess } from '../auth/decorators/customer-support-session.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { StaffPermissionRequired } from '../auth/decorators/staff-permission.decorator';
import { AuthRateLimit } from '../auth/decorators/rate-limit.decorator';
import type { AuthRequestContext } from '../auth/auth.types';
import { TicketAttachmentService } from './ticket-attachment.service';

@Controller('tickets')
@Roles('ADMIN', 'CUSTOMER')
@StaffPermissionRequired('tickets.manage')
export class TicketAttachmentController {
  constructor(
    private readonly files: TicketAttachmentService,
    @Inject(API_ENVIRONMENT) private readonly env: ApiEnvironment,
  ) {}

  @Get('attachment-policy')
  @CustomerSupportAccess()
  policy() {
    return createApiSuccessResponse(this.files.policy());
  }

  @Post('attachment-uploads')
  @AuthRateLimit({
    scope: 'ticket-file-intent',
    limit: 20,
    windowMs: 15 * 60000,
    includeEmail: false,
  })
  async create(
    @Body(new ZodValidationPipe(createTicketAttachmentSchema))
    input: CreateTicketAttachment,
    @CurrentAuth() auth: AuthRequestContext,
    @Req() request: Request,
  ) {
    return createApiSuccessResponse(
      await this.files.create(
        input,
        auth,
        createSecurityRequestContext(request, this.env.SESSION_SECRET),
      ),
    );
  }

  @Get('attachment-uploads/:id')
  @CustomerSupportAccess()
  async status(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentAuth() auth: AuthRequestContext,
  ) {
    return createApiSuccessResponse(await this.files.status(id, auth));
  }

  @Put('attachment-uploads/:id/content')
  @AuthRateLimit({
    scope: 'ticket-file-content',
    limit: 30,
    windowMs: 15 * 60000,
    includeEmail: false,
  })
  async upload(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentAuth() auth: AuthRequestContext,
    @Req() request: Request,
  ) {
    return createApiSuccessResponse(
      await this.files.upload(
        id,
        request,
        auth,
        createSecurityRequestContext(request, this.env.SESSION_SECRET),
      ),
    );
  }

  @AuthRateLimit({
    scope: 'ticket-file-download',
    limit: 60,
    windowMs: 60000,
    includeEmail: false,
  })
  @Get('attachments/:id/download')
  @CustomerSupportAccess()
  async download(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentAuth() auth: AuthRequestContext,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const file = await this.files.download(
      id,
      auth,
      createSecurityRequestContext(request, this.env.SESSION_SECRET),
    );
    response.set({
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${file.filename}"`,
      'Content-Length': String(file.content.length),
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store',
      'X-Accel-Buffering': 'no',
      'Content-Security-Policy': "sandbox; default-src 'none'",
      'Referrer-Policy': 'no-referrer',
    });
    return new StreamableFile(file.content);
  }
}
