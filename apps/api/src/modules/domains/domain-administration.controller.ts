import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import { z } from 'zod';
import {
  createApiSuccessResponse,
  createRegistrarConnectionSchema,
  registrarConnectionToggleSchema,
  domainTldRequestSchema,
  domainTldBulkSchema,
  domainDnsDefaultsSchema,
  domainPolicyInputSchema,
  domainNameSchema,
  resellbizCredentialSchema,
} from '@webhost-billing/shared';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentAuth } from '../auth/decorators/current-auth.decorator';
import type { AuthRequestContext } from '../auth/auth.types';
import { DomainAdministrationService } from './domain-administration.service';

@Controller('domains/administration')
@Roles('ADMIN')
export class DomainAdministrationController {
  constructor(private readonly administration: DomainAdministrationService) {}
  @Get('registrars')
  @Header('Cache-Control', 'no-store')
  async connections(@CurrentAuth() auth: AuthRequestContext) {
    return createApiSuccessResponse(
      await this.administration.connections(auth),
    );
  }
  @Post('registrars')
  async create(
    @Body(new ZodValidationPipe(createRegistrarConnectionSchema))
    body: z.infer<typeof createRegistrarConnectionSchema>,
    @CurrentAuth() auth: AuthRequestContext,
  ) {
    return createApiSuccessResponse(
      await this.administration.createConnection(body, auth),
    );
  }
  @Put('registrars/:id/default')
  async default(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(
      new ZodValidationPipe(
        z.object({ confirmation: z.literal('Set default registrar') }).strict(),
      ),
    )
    _body: { confirmation: string },
    @CurrentAuth() auth: AuthRequestContext,
  ) {
    return createApiSuccessResponse(
      await this.administration.setDefault(id, auth),
    );
  }
  @Patch('registrars/:id')
  async toggle(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(registrarConnectionToggleSchema))
    body: z.infer<typeof registrarConnectionToggleSchema>,
    @CurrentAuth() auth: AuthRequestContext,
  ) {
    return createApiSuccessResponse(
      await this.administration.toggle(id, body, auth),
    );
  }
  @Post('registrars/:id/check')
  async check(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(
      new ZodValidationPipe(
        z.object({ domainName: domainNameSchema }).strict(),
      ),
    )
    body: { domainName: string },
    @CurrentAuth() auth: AuthRequestContext,
  ) {
    return createApiSuccessResponse(
      await this.administration.check(id, body.domainName, auth),
    );
  }
  @Patch('registrars/:id/credential')
  async rotate(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(resellbizCredentialSchema))
    body: z.infer<typeof resellbizCredentialSchema>,
    @CurrentAuth() auth: AuthRequestContext,
  ) {
    return createApiSuccessResponse(
      await this.administration.rotate(id, body, auth),
    );
  }
  @Get('tlds')
  @Header('Cache-Control', 'no-store')
  async tlds(@CurrentAuth() auth: AuthRequestContext) {
    return createApiSuccessResponse(await this.administration.tlds(auth));
  }
  @Put('tlds')
  async saveTld(
    @Body(new ZodValidationPipe(domainTldRequestSchema))
    body: z.infer<typeof domainTldRequestSchema>,
    @CurrentAuth() auth: AuthRequestContext,
  ) {
    return createApiSuccessResponse(
      await this.administration.saveTld(body, auth),
    );
  }
  @Post('tlds/bulk')
  async bulk(
    @Body(new ZodValidationPipe(domainTldBulkSchema))
    body: z.infer<typeof domainTldBulkSchema>,
    @CurrentAuth() auth: AuthRequestContext,
  ) {
    return createApiSuccessResponse(await this.administration.bulk(body, auth));
  }
  @Get('defaults')
  @Header('Cache-Control', 'no-store')
  async defaults(@CurrentAuth() auth: AuthRequestContext) {
    return createApiSuccessResponse(await this.administration.defaults(auth));
  }
  @Put('defaults/dns')
  async dns(
    @Body(new ZodValidationPipe(domainDnsDefaultsSchema))
    body: z.infer<typeof domainDnsDefaultsSchema>,
    @CurrentAuth() auth: AuthRequestContext,
  ) {
    return createApiSuccessResponse(
      await this.administration.saveDefaults('dns', body, auth),
    );
  }
  @Put('defaults/policies')
  async policies(
    @Body(new ZodValidationPipe(domainPolicyInputSchema))
    body: z.infer<typeof domainPolicyInputSchema>,
    @CurrentAuth() auth: AuthRequestContext,
  ) {
    return createApiSuccessResponse(
      await this.administration.saveDefaults('policies', body, auth),
    );
  }
}
