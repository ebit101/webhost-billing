import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Header,
  Query,
} from '@nestjs/common';
import {
  createApiSuccessResponse,
  domainQuoteRequestSchema,
  domainPurchaseRequestSchema,
  adminDomainQuoteRequestSchema,
  adminDomainPurchaseRequestSchema,
  type AdminDomainQuoteRequest,
  type AdminDomainPurchaseRequest,
  domainApprovalRequestSchema,
  fakeRegistrarSetupSchema,
  registrarToggleSchema,
  type DomainQuoteRequest,
  type DomainPurchaseRequest,
  type DomainApprovalRequest,
  resellbizSetupSchema,
  resellbizCredentialSchema,
  resellbizMappingSchema,
  domainNameSchema,
  type ResellbizSetup,
  domainActionRequestSchema,
  type DomainActionRequest,
} from '@webhost-billing/shared';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe';
import { CurrentAuth } from '../auth/decorators/current-auth.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthRequestContext } from '../auth/auth.types';
import { DomainService } from './domain.service';
import { z } from 'zod';
import { DomainLifecycleService } from './domain-lifecycle.service';

@Controller('domains')
export class DomainController {
  constructor(
    private readonly domains: DomainService,
    private readonly lifecycle: DomainLifecycleService,
  ) {}
  @Get('registrar/live')
  @Roles('ADMIN')
  async liveSettings(@CurrentAuth() auth: AuthRequestContext) {
    return createApiSuccessResponse(await this.domains.liveSettings(auth));
  }
  @Post(':id/registration-check')
  @Roles('ADMIN')
  async registrationCheck(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(
      new ZodValidationPipe(
        z.object({ registrarAccountId: z.uuid() }).strict(),
      ),
    )
    body: { registrarAccountId: string },
    @CurrentAuth() auth: AuthRequestContext,
  ) {
    return createApiSuccessResponse(
      await this.domains.checkRegistration(id, body.registrarAccountId, auth),
    );
  }
  @Post('registrar/live')
  @Roles('ADMIN')
  async liveSetup(
    @Body(new ZodValidationPipe(resellbizSetupSchema)) input: ResellbizSetup,
    @CurrentAuth() auth: AuthRequestContext,
  ) {
    return createApiSuccessResponse(await this.domains.setupLive(input, auth));
  }
  @Patch('registrar/live/:id/credential')
  @Roles('ADMIN')
  async liveCredential(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(resellbizCredentialSchema))
    input: { resellerId: string; apiKey: string },
    @CurrentAuth() auth: AuthRequestContext,
  ) {
    return createApiSuccessResponse(
      await this.domains.rotateLiveCredential(id, input, auth),
    );
  }
  @Post('registrar/live/:id/check')
  @Roles('ADMIN')
  async liveCheck(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(
      new ZodValidationPipe(
        z.object({ domainName: domainNameSchema }).strict(),
      ),
    )
    input: { domainName: string },
    @CurrentAuth() auth: AuthRequestContext,
  ) {
    return createApiSuccessResponse(
      await this.domains.checkLive(id, input.domainName, auth),
    );
  }
  @Patch('registrar/live/:id')
  @Roles('ADMIN')
  async liveToggle(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(registrarToggleSchema))
    input: { enabled: boolean },
    @CurrentAuth() auth: AuthRequestContext,
  ) {
    return createApiSuccessResponse(
      await this.domains.toggleLive(id, input.enabled, auth),
    );
  }
  @Post(':id/registrar-contact')
  @Roles('ADMIN')
  async liveContact(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(resellbizMappingSchema))
    input: { remoteCustomerId: string; remoteContactId: string },
    @CurrentAuth() auth: AuthRequestContext,
  ) {
    return createApiSuccessResponse(
      await this.domains.bindLiveContact(id, input, auth),
    );
  }
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
  @Post('admin/quotes')
  @Roles('ADMIN')
  async adminQuote(
    @Body(new ZodValidationPipe(adminDomainQuoteRequestSchema))
    input: AdminDomainQuoteRequest,
    @CurrentAuth() auth: AuthRequestContext,
  ) {
    return createApiSuccessResponse(await this.domains.adminQuote(input, auth));
  }
  @Post('admin/orders')
  @Roles('ADMIN')
  async adminPurchase(
    @Body(new ZodValidationPipe(adminDomainPurchaseRequestSchema))
    input: AdminDomainPurchaseRequest,
    @CurrentAuth() auth: AuthRequestContext,
  ) {
    return createApiSuccessResponse(
      await this.domains.adminPurchase(input, auth),
    );
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
  async list(
    @CurrentAuth() auth: AuthRequestContext,
    @Query('customerId', new ParseUUIDPipe({ optional: true }))
    customerId?: string,
  ) {
    return createApiSuccessResponse(await this.domains.list(auth, customerId));
  }
  @Get(':id')
  @Roles('ADMIN', 'CUSTOMER')
  async detail(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentAuth() auth: AuthRequestContext,
    @Query('customerId', new ParseUUIDPipe({ optional: true }))
    customerId?: string,
  ) {
    return createApiSuccessResponse(
      await this.domains.detail(id, auth, customerId),
    );
  }
  @Get(':id/management')
  @Header('Cache-Control', 'private, no-store, max-age=0')
  @Roles('ADMIN', 'CUSTOMER')
  async management(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentAuth() auth: AuthRequestContext,
  ) {
    return createApiSuccessResponse(await this.lifecycle.stored(id, auth));
  }
  @Post(':id/management/refresh')
  @Roles('ADMIN', 'CUSTOMER')
  async managementRefresh(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentAuth() auth: AuthRequestContext,
  ) {
    return createApiSuccessResponse(await this.lifecycle.refresh(id, auth));
  }
  @Get(':id/actions')
  @Roles('ADMIN', 'CUSTOMER')
  async actions(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentAuth() auth: AuthRequestContext,
  ) {
    return createApiSuccessResponse(await this.lifecycle.list(id, auth));
  }
  @Post(':id/actions')
  @Roles('ADMIN')
  async action(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(
      new ZodValidationPipe(
        z
          .object({
            confirmation: domainNameSchema,
            request: domainActionRequestSchema,
          })
          .strict(),
      ),
    )
    input: { confirmation: string; request: DomainActionRequest },
    @CurrentAuth() auth: AuthRequestContext,
  ) {
    return createApiSuccessResponse(
      await this.lifecycle.create(id, input.request, input.confirmation, auth),
    );
  }
  @Post(':id/actions/:actionId/execute')
  @Roles('ADMIN')
  async executeAction(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('actionId', new ParseUUIDPipe()) actionId: string,
    @Body(
      new ZodValidationPipe(
        z.object({ confirmation: domainNameSchema }).strict(),
      ),
    )
    input: { confirmation: string },
    @CurrentAuth() auth: AuthRequestContext,
  ) {
    return createApiSuccessResponse(
      await this.lifecycle.execute(id, actionId, input.confirmation, auth),
    );
  }
  @Post(':id/actions/:actionId/reconcile')
  @Roles('ADMIN')
  async reconcileAction(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('actionId', new ParseUUIDPipe()) actionId: string,
    @Body(
      new ZodValidationPipe(
        z.object({ confirmation: domainNameSchema }).strict(),
      ),
    )
    input: { confirmation: string },
    @CurrentAuth() auth: AuthRequestContext,
  ) {
    return createApiSuccessResponse(
      await this.lifecycle.execute(
        id,
        actionId,
        input.confirmation,
        auth,
        true,
      ),
    );
  }
  @Post(':id/authorization-code')
  @Header('Cache-Control', 'private, no-store, max-age=0')
  @Roles('ADMIN')
  async authorizationCode(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(
      new ZodValidationPipe(
        z.object({ confirmation: domainNameSchema }).strict(),
      ),
    )
    input: { confirmation: string },
    @CurrentAuth() auth: AuthRequestContext,
  ) {
    return createApiSuccessResponse(
      await this.lifecycle.authorizationCode(id, input.confirmation, auth),
    );
  }
  @Post(':id/actions/:actionId/cancel-unsent')
  @Roles('ADMIN')
  async cancelUnsentAction(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('actionId', new ParseUUIDPipe()) actionId: string,
    @Body(
      new ZodValidationPipe(
        z.object({ confirmation: domainNameSchema }).strict(),
      ),
    )
    input: { confirmation: string },
    @CurrentAuth() auth: AuthRequestContext,
  ) {
    return createApiSuccessResponse(
      await this.lifecycle.cancelUnsent(id, actionId, input.confirmation, auth),
    );
  }
  @Post(':id/actions/:actionId/recover-contact')
  @Roles('ADMIN')
  async recoverContact(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('actionId', new ParseUUIDPipe()) actionId: string,
    @Body(
      new ZodValidationPipe(
        z
          .object({
            confirmation: domainNameSchema,
            contactId: z.string().regex(/^[1-9][0-9]{0,18}$/),
          })
          .strict(),
      ),
    )
    input: { confirmation: string; contactId: string },
    @CurrentAuth() auth: AuthRequestContext,
  ) {
    return createApiSuccessResponse(
      await this.lifecycle.recoverContact(
        id,
        actionId,
        input.contactId,
        input.confirmation,
        auth,
      ),
    );
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
