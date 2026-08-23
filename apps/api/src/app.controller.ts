import { Controller, Get } from '@nestjs/common';
import {
  createApiSuccessResponse,
  type ApiSuccessResponse,
} from '@webhost-billing/shared';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): ApiSuccessResponse<{ message: string }> {
    return createApiSuccessResponse({ message: this.appService.getHello() });
  }
}
