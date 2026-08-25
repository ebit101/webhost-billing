import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { ApiEnvironment } from '@webhost-billing/config';
import {
  businessIdentitySchema,
  createApiSuccessResponse,
  createInvoiceRequestSchema,
  createPaginatedApiSuccessResponse,
  invoiceActionRequestSchema,
  invoiceListQuerySchema,
  updateDraftInvoiceRequestSchema,
  type BusinessIdentity,
  type CreateInvoiceRequest,
  type InvoiceActionRequest,
  type InvoiceListQuery,
  type UpdateDraftInvoiceRequest,
} from '@webhost-billing/shared';
import type { Request, Response } from 'express';
import { createSecurityRequestContext } from '../../common/http/request-context';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe';
import { API_ENVIRONMENT } from '../../infrastructure/environment/environment.module';
import type { AuthRequestContext } from '../auth/auth.types';
import { CurrentAuth } from '../auth/decorators/current-auth.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { InvoiceService } from './invoice.service';
import { InvoicePdfService } from './invoice-pdf.service';

@Controller('invoices')
export class InvoiceController {
  private readonly auditSecret: string;

  constructor(
    private readonly invoices: InvoiceService,
    private readonly invoicePdfs: InvoicePdfService,
    @Inject(API_ENVIRONMENT) environment: ApiEnvironment,
  ) {
    this.auditSecret = environment.SESSION_SECRET;
  }

  @Get('settings/business-identity')
  @Roles('ADMIN')
  async getBusinessIdentity() {
    return createApiSuccessResponse(await this.invoices.getBusinessIdentity());
  }

  @Patch('settings/business-identity')
  @Roles('ADMIN')
  async updateBusinessIdentity(
    @Body(new ZodValidationPipe(businessIdentitySchema))
    input: BusinessIdentity,
    @CurrentAuth() auth: AuthRequestContext,
    @Req() request: Request,
  ) {
    return createApiSuccessResponse(
      await this.invoices.updateBusinessIdentity(
        input,
        auth,
        this.context(request),
      ),
    );
  }

  @Post()
  @Roles('ADMIN')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body(new ZodValidationPipe(createInvoiceRequestSchema))
    input: CreateInvoiceRequest,
    @CurrentAuth() auth: AuthRequestContext,
    @Req() request: Request,
  ) {
    return createApiSuccessResponse(
      await this.invoices.create(input, auth, this.context(request)),
    );
  }

  @Get('my')
  @Roles('CUSTOMER')
  async myInvoices(
    @Query(
      new ZodValidationPipe(invoiceListQuerySchema.omit({ customerId: true })),
    )
    query: Omit<InvoiceListQuery, 'customerId'>,
    @CurrentAuth() auth: AuthRequestContext,
  ) {
    if (auth.identity.role !== 'CUSTOMER') throw new Error('Unreachable role');
    const result = await this.invoices.list({
      ...query,
      customerId: auth.identity.customerId,
    });
    return createPaginatedApiSuccessResponse(result.data, result.pagination);
  }

  @Get()
  @Roles('ADMIN')
  async list(
    @Query(new ZodValidationPipe(invoiceListQuerySchema))
    query: InvoiceListQuery,
  ) {
    const result = await this.invoices.list(query);
    return createPaginatedApiSuccessResponse(result.data, result.pagination);
  }

  @Get(':invoiceId')
  @Roles('ADMIN', 'CUSTOMER')
  async detail(
    @Param('invoiceId', new ParseUUIDPipe()) invoiceId: string,
    @CurrentAuth() auth: AuthRequestContext,
  ) {
    return createApiSuccessResponse(await this.invoices.get(invoiceId, auth));
  }

  @Get(':invoiceId/pdf')
  @Roles('ADMIN', 'CUSTOMER')
  async pdf(
    @Param('invoiceId', new ParseUUIDPipe()) invoiceId: string,
    @CurrentAuth() auth: AuthRequestContext,
    @Res() response: Response,
  ) {
    const invoice = await this.invoices.get(invoiceId, auth);
    const pdf = await this.invoicePdfs.render(invoice);
    response
      .status(HttpStatus.OK)
      .set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${this.invoicePdfs.filename(invoice)}"`,
        'Content-Length': String(pdf.length),
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      })
      .send(pdf);
  }

  @Patch(':invoiceId/draft')
  @Roles('ADMIN')
  async updateDraft(
    @Param('invoiceId', new ParseUUIDPipe()) invoiceId: string,
    @Body(new ZodValidationPipe(updateDraftInvoiceRequestSchema))
    input: UpdateDraftInvoiceRequest,
    @CurrentAuth() auth: AuthRequestContext,
    @Req() request: Request,
  ) {
    return createApiSuccessResponse(
      await this.invoices.updateDraft(
        invoiceId,
        input,
        auth,
        this.context(request),
      ),
    );
  }

  @Patch(':invoiceId/action')
  @Roles('ADMIN')
  async applyAction(
    @Param('invoiceId', new ParseUUIDPipe()) invoiceId: string,
    @Body(new ZodValidationPipe(invoiceActionRequestSchema))
    input: InvoiceActionRequest,
    @CurrentAuth() auth: AuthRequestContext,
    @Req() request: Request,
  ) {
    return createApiSuccessResponse(
      await this.invoices.applyAction(
        invoiceId,
        input,
        auth,
        this.context(request),
      ),
    );
  }

  private context(request: Request) {
    return createSecurityRequestContext(request, this.auditSecret);
  }
}
