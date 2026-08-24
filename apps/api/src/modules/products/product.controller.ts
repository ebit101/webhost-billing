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
} from '@nestjs/common';
import type { ApiEnvironment } from '@webhost-billing/config';
import {
  createApiSuccessResponse,
  createProductRequestSchema,
  productPriceInputSchema,
  publicProductQuerySchema,
  updateProductRequestSchema,
  updateProductStatusRequestSchema,
  type CreateProductRequest,
  type ProductPriceInput,
  type PublicProductQuery,
  type UpdateProductRequest,
  type UpdateProductStatusRequest,
} from '@webhost-billing/shared';
import type { Request } from 'express';
import { createSecurityRequestContext } from '../../common/http/request-context';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe';
import { API_ENVIRONMENT } from '../../infrastructure/environment/environment.module';
import type { AuthRequestContext } from '../auth/auth.types';
import { CurrentAuth } from '../auth/decorators/current-auth.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { ProductService } from './product.service';

@Controller('products')
export class ProductController {
  private readonly auditSecret: string;

  constructor(
    private readonly products: ProductService,
    @Inject(API_ENVIRONMENT) environment: ApiEnvironment,
  ) {
    this.auditSecret = environment.SESSION_SECRET;
  }

  @Public()
  @Get('public')
  async publicCatalog(
    @Query(new ZodValidationPipe(publicProductQuerySchema))
    query: PublicProductQuery,
  ) {
    return createApiSuccessResponse(await this.products.listPublic(query));
  }

  @Get()
  @Roles('ADMIN')
  async list() {
    return createApiSuccessResponse(await this.products.listAdmin());
  }

  @Get(':productId')
  @Roles('ADMIN')
  async detail(@Param('productId', new ParseUUIDPipe()) productId: string) {
    return createApiSuccessResponse(await this.products.getAdmin(productId));
  }

  @Post()
  @Roles('ADMIN')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body(new ZodValidationPipe(createProductRequestSchema))
    input: CreateProductRequest,
    @CurrentAuth() auth: AuthRequestContext,
    @Req() request: Request,
  ) {
    return createApiSuccessResponse(
      await this.products.create(input, auth, this.context(request)),
    );
  }

  @Patch(':productId')
  @Roles('ADMIN')
  async update(
    @Param('productId', new ParseUUIDPipe()) productId: string,
    @Body(new ZodValidationPipe(updateProductRequestSchema))
    input: UpdateProductRequest,
    @CurrentAuth() auth: AuthRequestContext,
    @Req() request: Request,
  ) {
    return createApiSuccessResponse(
      await this.products.update(productId, input, auth, this.context(request)),
    );
  }

  @Patch(':productId/status')
  @Roles('ADMIN')
  async updateStatus(
    @Param('productId', new ParseUUIDPipe()) productId: string,
    @Body(new ZodValidationPipe(updateProductStatusRequestSchema))
    input: UpdateProductStatusRequest,
    @CurrentAuth() auth: AuthRequestContext,
    @Req() request: Request,
  ) {
    return createApiSuccessResponse(
      await this.products.updateStatus(
        productId,
        input,
        auth,
        this.context(request),
      ),
    );
  }

  @Post(':productId/prices')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.CREATED)
  async definePrice(
    @Param('productId', new ParseUUIDPipe()) productId: string,
    @Body(new ZodValidationPipe(productPriceInputSchema))
    input: ProductPriceInput,
    @CurrentAuth() auth: AuthRequestContext,
    @Req() request: Request,
  ) {
    return createApiSuccessResponse(
      await this.products.definePrice(
        productId,
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
