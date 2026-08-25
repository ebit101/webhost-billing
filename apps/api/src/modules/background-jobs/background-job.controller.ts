import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from '@nestjs/common';
import type { ApiEnvironment } from '@webhost-billing/config';
import {
  backgroundQueueNameSchema,
  backgroundJobIdSchema,
  createApiSuccessResponse,
  retryBackgroundJobRequestSchema,
  retryOutboxEventRequestSchema,
  type RetryBackgroundJobRequest,
  type RetryOutboxEventRequest,
} from '@webhost-billing/shared';
import type { Request } from 'express';
import { createSecurityRequestContext } from '../../common/http/request-context';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe';
import { API_ENVIRONMENT } from '../../infrastructure/environment/environment.module';
import type { AuthRequestContext } from '../auth/auth.types';
import { CurrentAuth } from '../auth/decorators/current-auth.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { BackgroundJobService } from './background-job.service';

@Controller('background-jobs')
@Roles('ADMIN')
export class BackgroundJobController {
  private readonly auditSecret: string;

  constructor(
    private readonly backgroundJobs: BackgroundJobService,
    @Inject(API_ENVIRONMENT) environment: ApiEnvironment,
  ) {
    this.auditSecret = environment.SESSION_SECRET;
  }

  @Get('failures')
  async failures() {
    return createApiSuccessResponse(await this.backgroundJobs.failures());
  }

  @Post('queues/:queueName/:jobId/retry')
  async retryQueueJob(
    @Param('queueName', new ZodValidationPipe(backgroundQueueNameSchema))
    queueName: string,
    @Param('jobId', new ZodValidationPipe(backgroundJobIdSchema)) jobId: string,
    @Body(new ZodValidationPipe(retryBackgroundJobRequestSchema))
    _input: RetryBackgroundJobRequest,
    @CurrentAuth() auth: AuthRequestContext,
    @Req() request: Request,
  ) {
    return createApiSuccessResponse(
      await this.backgroundJobs.retryQueueJob(
        queueName,
        jobId,
        auth,
        this.context(request),
      ),
    );
  }

  @Post('outbox/:eventId/retry')
  async retryOutboxEvent(
    @Param('eventId', new ParseUUIDPipe()) eventId: string,
    @Body(new ZodValidationPipe(retryOutboxEventRequestSchema))
    _input: RetryOutboxEventRequest,
    @CurrentAuth() auth: AuthRequestContext,
    @Req() request: Request,
  ) {
    return createApiSuccessResponse(
      await this.backgroundJobs.retryOutboxEvent(
        eventId,
        auth,
        this.context(request),
      ),
    );
  }

  private context(request: Request) {
    return createSecurityRequestContext(request, this.auditSecret);
  }
}
