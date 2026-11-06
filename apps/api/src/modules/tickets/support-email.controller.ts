import { Controller, Inject, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import type { ApiEnvironment } from '@webhost-billing/config';
import { API_ENVIRONMENT } from '../../infrastructure/environment/environment.module';
import { Public } from '../auth/decorators/public.decorator';
import { SkipCsrf } from '../auth/decorators/skip-csrf.decorator';
import { AuthRateLimit } from '../auth/decorators/rate-limit.decorator';
import { SupportEmailService } from './support-email.service';
import { createSecurityRequestContext } from '../../common/http/request-context';

@Controller('support-email')
export class SupportEmailController {
  constructor(
    private readonly ingress: SupportEmailService,
    @Inject(API_ENVIRONMENT) private readonly env: ApiEnvironment,
  ) {}

  @Post('deliveries')
  @Public()
  @SkipCsrf()
  @AuthRateLimit({
    scope: 'support-email-ingress',
    limit: 60,
    windowMs: 60000,
    includeEmail: false,
  })
  receive(@Req() request: Request) {
    return this.ingress.receive(
      request,
      createSecurityRequestContext(request, this.env.SESSION_SECRET),
    );
  }
}
