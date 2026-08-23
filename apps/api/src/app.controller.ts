import { Controller, Get } from '@nestjs/common';
import {
  createApiSuccessResponse,
  type ApiSuccessResponse,
} from '@webhost-billing/shared';
import { AppService } from './app.service';
import { Public } from './modules/auth/decorators/public.decorator';

@Public()
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): ApiSuccessResponse<{ message: string }> {
    return createApiSuccessResponse({ message: this.appService.getHello() });
  }
}
