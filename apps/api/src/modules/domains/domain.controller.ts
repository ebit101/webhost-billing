import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import {
  createApiSuccessResponse,
  domainQuoteRequestSchema,
  domainPurchaseRequestSchema,
  domainApprovalRequestSchema,
  fakeRegistrarSetupSchema,
  registrarToggleSchema,
  type DomainQuoteRequest,
  type DomainPurchaseRequest,
  type DomainApprovalRequest,
} from '@webhost-billing/shared';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe';
import { CurrentAuth } from '../auth/decorators/current-auth.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthRequestContext } from '../auth/auth.types';
import { DomainService } from './domain.service';

@Controller('domains')
export class DomainController {
  constructor(private readonly domains: DomainService) {}
  @Get('registrar')
  @Roles('ADMIN')
  async settings() {
    return createApiSuccessResponse(await this.domains.settings());
  }
  @Post('registrar')
  @Roles('ADMIN')
  async setup(
    @Body(new ZodValidationPipe(fakeRegistrarSetupSchema))
    input: {
      confirmation: 'Enable simulated registrar';
      sellingAmount: string;
    },
    @CurrentAuth() auth: AuthRequestContext,
  ) {
    return createApiSuccessResponse(
      await this.domains.setup(input.sellingAmount, auth),
    );
  }
  @Patch('registrar/:id')
  @Roles('ADMIN')
  async toggle(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(registrarToggleSchema))
    input: { enabled: boolean },
    @CurrentAuth() auth: AuthRequestContext,
  ) {
    return createApiSuccessResponse(
      await this.domains.toggle(id, input.enabled, auth),
    );
  }
  @Get('offers')
  @Roles('ADMIN', 'CUSTOMER')
  async offers() {
    return createApiSuccessResponse(await this.domains.offers());
  }
  @Post('quotes')
  @Roles('CUSTOMER')
  async quote(
    @Body(new ZodValidationPipe(domainQuoteRequestSchema))
    input: DomainQuoteRequest,
    @CurrentAuth() auth: AuthRequestContext,
  ) {
    return createApiSuccessResponse(await this.domains.quote(input, auth));
  }
  @Post('orders')
  @Roles('CUSTOMER')
  async purchase(
    @Body(new ZodValidationPipe(domainPurchaseRequestSchema))
    input: DomainPurchaseRequest,
    @CurrentAuth() auth: AuthRequestContext,
  ) {
    return createApiSuccessResponse(await this.domains.purchase(input, auth));
  }
  @Get()
  @Roles('ADMIN', 'CUSTOMER')
  async list(@CurrentAuth() auth: AuthRequestContext) {
    return createApiSuccessResponse(await this.domains.list(auth));
  }
  @Get(':id')
  @Roles('ADMIN', 'CUSTOMER')
  async detail(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentAuth() auth: AuthRequestContext,
  ) {
    return createApiSuccessResponse(await this.domains.detail(id, auth));
  }
  @Post(':id/approve')
  @Roles('ADMIN')
  async approve(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(domainApprovalRequestSchema))
    input: DomainApprovalRequest,
    @CurrentAuth() auth: AuthRequestContext,
  ) {
    return createApiSuccessResponse(
      await this.domains.approve(id, input, auth),
    );
  }
  @Post(':id/reconcile')
  @Roles('ADMIN')
  async reconcile(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentAuth() auth: AuthRequestContext,
  ) {
    return createApiSuccessResponse(await this.domains.reconcile(id, auth));
  }
}
