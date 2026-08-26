import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { createApiSuccessResponse } from '@webhost-billing/shared';
import type { Response } from 'express';
import { Public } from '../auth/decorators/public.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { ObservabilityService } from './observability.service';

@Public()
@Controller()
export class HealthController {
  constructor(private readonly observability: ObservabilityService) {}

  @Get('health')
  health() {
    return createApiSuccessResponse(this.observability.health());
  }

  @Get('ready')
  async readiness(
    @Res({ passthrough: true }) response: Response,
  ): Promise<ReturnType<typeof createApiSuccessResponse>> {
    const readiness = await this.observability.readiness();
    if (readiness.status === 'NOT_READY') {
      response.status(HttpStatus.SERVICE_UNAVAILABLE);
    }
    return createApiSuccessResponse(readiness);
  }
}

@Controller('observability')
@Roles('ADMIN')
export class ObservabilityController {
  constructor(private readonly observability: ObservabilityService) {}

  @Get('overview')
  async overview() {
    return createApiSuccessResponse(await this.observability.overview());
  }
}
