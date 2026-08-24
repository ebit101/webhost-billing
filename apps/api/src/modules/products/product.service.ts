import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  BillingPeriod,
  ProductStatus,
  type PrismaClient,
} from '@webhost-billing/database';
import {
  productSchema,
  publicProductSchema,
  serializeMoney,
  type CreateProductRequest,
  type Product,
  type ProductPriceInput,
  type PublicProduct,
  type PublicProductQuery,
  type UpdateProductRequest,
  type UpdateProductStatusRequest,
} from '@webhost-billing/shared';
import { ApplicationException } from '../../common/errors/application.exception';
import type { SecurityRequestContext } from '../../common/http/request-context';
import { PRISMA_CLIENT } from '../../infrastructure/database/database.module';
import type { AuthRequestContext } from '../auth/auth.types';

const PUBLIC_BILLING_PERIODS = [
  BillingPeriod.MONTHLY,
  BillingPeriod.QUARTERLY,
  BillingPeriod.ANNUAL,
] as const;

interface ActivatableProduct {
  hostingPackageIdentifier: string | null;
  storageFeature: string | null;
  websiteFeature: string | null;
  emailFeature: string | null;
  bandwidthFeature: string | null;
  activePriceCount: number;
}

export function activationValidationIssues(product: ActivatableProduct) {
  const issues: { field: string; message: string }[] = [];
  if (!product.hostingPackageIdentifier) {
    issues.push({
      field: 'hostingPackageIdentifier',
      message: 'A hosting package identifier is required before activation.',
    });
  }
  for (const [field, value] of [
    ['storageFeature', product.storageFeature],
    ['websiteFeature', product.websiteFeature],
    ['emailFeature', product.emailFeature],
    ['bandwidthFeature', product.bandwidthFeature],
  ] as const) {
    if (!value) {
      issues.push({
        field,
        message: 'Every public hosting feature is required before activation.',
      });
    }
  }
  if (product.activePriceCount === 0) {
    issues.push({
      field: 'prices',
      message: 'At least one active price is required before activation.',
    });
  }
  return issues;
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'P2002'
  );
}

@Injectable()
export class ProductService {
  constructor(@Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient) {}

  async create(
    input: CreateProductRequest,
    actor: AuthRequestContext,
    context: SecurityRequestContext,
  ): Promise<Product> {
    const { prices = [], ...fields } = input;
    try {
      const product = await this.prisma.$transaction(async (transaction) => {
        const created = await transaction.product.create({
          data: {
            ...fields,
            description: fields.description ?? null,
            hostingPackageIdentifier: fields.hostingPackageIdentifier ?? null,
            storageFeature: fields.storageFeature ?? null,
            websiteFeature: fields.websiteFeature ?? null,
            emailFeature: fields.emailFeature ?? null,
            bandwidthFeature: fields.bandwidthFeature ?? null,
            status: ProductStatus.DRAFT,
            ...(prices.length
              ? {
                  prices: {
                    create: prices.map((price) => this.priceCreateData(price)),
                  },
                }
              : {}),
          },
          include: { prices: { orderBy: { createdAt: 'desc' } } },
        });
        await transaction.activityLog.create({
          data: {
            actorUserId: actor.identity.userId,
            action: 'PRODUCT_CREATED_BY_ADMIN',
            entityType: 'PRODUCT',
            entityId: created.id,
            ipAddressHash: context.ipAddressHash,
            metadata: { initialPriceCount: prices.length },
          },
        });
        return created;
      });
      return this.toProduct(product);
    } catch (error) {
      this.rethrowConflict(error);
    }
  }

  async listAdmin(): Promise<Product[]> {
    const products = await this.prisma.product.findMany({
      where: { deletedAt: null },
      orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
      include: {
        prices: { orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }] },
      },
    });
    return products.map((product) => this.toProduct(product));
  }

  async getAdmin(productId: string): Promise<Product> {
    const product = await this.findProduct(productId);
    return this.toProduct(product);
  }

  async listPublic(query: PublicProductQuery): Promise<PublicProduct[]> {
    const now = new Date();
    const products = await this.prisma.product.findMany({
      where: {
        deletedAt: null,
        status: ProductStatus.ACTIVE,
        publicVisible: true,
      },
      orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
      include: {
        prices: {
          where: {
            deletedAt: null,
            isActive: true,
            billingPeriod: { in: [...PUBLIC_BILLING_PERIODS] },
            ...(query.currency ? { currency: query.currency } : {}),
            AND: [
              { OR: [{ validFrom: null }, { validFrom: { lte: now } }] },
              { OR: [{ validUntil: null }, { validUntil: { gt: now } }] },
            ],
          },
          orderBy: [{ currency: 'asc' }, { billingPeriod: 'asc' }],
        },
      },
    });
    return products
      .filter((product) => product.prices.length > 0)
      .map((product) =>
        publicProductSchema.parse({
          id: product.id,
          slug: product.slug,
          name: product.name,
          description: product.description,
          displayOrder: product.displayOrder,
          features: {
            storage: product.storageFeature,
            websites: product.websiteFeature,
            email: product.emailFeature,
            bandwidth: product.bandwidthFeature,
          },
          prices: product.prices.map((price) => ({
            id: price.id,
            billingPeriod: price.billingPeriod,
            amount: serializeMoney(price.amount, price.currency),
            setupFee: serializeMoney(price.setupFee, price.currency),
            validFrom: price.validFrom?.toISOString() ?? null,
            validUntil: price.validUntil?.toISOString() ?? null,
            createdAt: price.createdAt.toISOString(),
          })),
        }),
      );
  }

  async update(
    productId: string,
    input: UpdateProductRequest,
    actor: AuthRequestContext,
    context: SecurityRequestContext,
  ): Promise<Product> {
    const current = await this.prisma.product.findFirst({
      where: { id: productId, deletedAt: null },
      include: {
        _count: {
          select: {
            prices: {
              where: {
                isActive: true,
                deletedAt: null,
                billingPeriod: { in: [...PUBLIC_BILLING_PERIODS] },
              },
            },
          },
        },
      },
    });
    if (!current) throw this.notFound();
    if (current.status === ProductStatus.ACTIVE) {
      const issues = activationValidationIssues({
        ...current,
        ...input,
        activePriceCount: current._count.prices,
      });
      if (issues.length) {
        throw new ApplicationException({
          status: HttpStatus.UNPROCESSABLE_ENTITY,
          code: 'UNPROCESSABLE_ENTITY',
          message: 'An active product must remain ready for sale.',
          issues,
        });
      }
    }
    try {
      await this.prisma.$transaction([
        this.prisma.product.update({ where: { id: productId }, data: input }),
        this.prisma.activityLog.create({
          data: {
            actorUserId: actor.identity.userId,
            action: 'PRODUCT_UPDATED_BY_ADMIN',
            entityType: 'PRODUCT',
            entityId: productId,
            ipAddressHash: context.ipAddressHash,
            metadata: { changedFields: Object.keys(input).sort() },
          },
        }),
      ]);
      return this.getAdmin(productId);
    } catch (error) {
      this.rethrowConflict(error);
    }
  }

  async updateStatus(
    productId: string,
    input: UpdateProductStatusRequest,
    actor: AuthRequestContext,
    context: SecurityRequestContext,
  ): Promise<Product> {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, deletedAt: null },
      include: {
        _count: {
          select: {
            prices: {
              where: {
                isActive: true,
                deletedAt: null,
                billingPeriod: { in: [...PUBLIC_BILLING_PERIODS] },
              },
            },
          },
        },
      },
    });
    if (!product) throw this.notFound();
    if (input.status === 'ACTIVE') {
      const issues = activationValidationIssues({
        ...product,
        activePriceCount: product._count.prices,
      });
      if (issues.length) {
        throw new ApplicationException({
          status: HttpStatus.UNPROCESSABLE_ENTITY,
          code: 'UNPROCESSABLE_ENTITY',
          message: 'Product is not ready for activation.',
          issues,
        });
      }
    }
    await this.prisma.$transaction([
      this.prisma.product.update({
        where: { id: productId },
        data: {
          status: input.status,
          ...(input.status === 'ARCHIVED' ? { publicVisible: false } : {}),
        },
      }),
      this.prisma.activityLog.create({
        data: {
          actorUserId: actor.identity.userId,
          action: `PRODUCT_${input.status}_BY_ADMIN`,
          entityType: 'PRODUCT',
          entityId: productId,
          ipAddressHash: context.ipAddressHash,
          metadata: { previousStatus: product.status },
        },
      }),
    ]);
    return this.getAdmin(productId);
  }

  async definePrice(
    productId: string,
    input: ProductPriceInput,
    actor: AuthRequestContext,
    context: SecurityRequestContext,
  ): Promise<Product> {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, deletedAt: null },
      select: { id: true, status: true },
    });
    if (!product) throw this.notFound();
    if (product.status === ProductStatus.ARCHIVED) {
      throw new ApplicationException({
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        code: 'UNPROCESSABLE_ENTITY',
        message:
          'Move the product out of archived status before defining prices.',
      });
    }
    const now = new Date();
    try {
      await this.prisma.$transaction(async (transaction) => {
        await transaction.productPrice.updateMany({
          where: {
            productId,
            billingPeriod: input.billingPeriod,
            currency: input.currency,
            isActive: true,
            deletedAt: null,
          },
          data: { isActive: false, validUntil: now },
        });
        const price = await transaction.productPrice.create({
          data: {
            productId,
            ...this.priceCreateData(input),
            validFrom: now,
          },
        });
        await transaction.activityLog.create({
          data: {
            actorUserId: actor.identity.userId,
            action: 'PRODUCT_PRICE_DEFINED_BY_ADMIN',
            entityType: 'PRODUCT',
            entityId: productId,
            ipAddressHash: context.ipAddressHash,
            metadata: {
              priceId: price.id,
              billingPeriod: input.billingPeriod,
              currency: input.currency,
            },
          },
        });
      });
      return this.getAdmin(productId);
    } catch (error) {
      this.rethrowConflict(error);
    }
  }

  private priceCreateData(input: ProductPriceInput) {
    return {
      billingPeriod: input.billingPeriod,
      currency: input.currency,
      amount: BigInt(input.amount),
      setupFee: BigInt(input.setupFee),
      isActive: true,
    };
  }

  private async findProduct(productId: string) {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, deletedAt: null },
      include: {
        prices: { orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }] },
      },
    });
    if (!product) throw this.notFound();
    return product;
  }

  private toProduct(
    product: Awaited<ReturnType<ProductService['findProduct']>>,
  ) {
    return productSchema.parse({
      id: product.id,
      slug: product.slug,
      name: product.name,
      description: product.description,
      status: product.status,
      publicVisible: product.publicVisible,
      displayOrder: product.displayOrder,
      hostingPackageIdentifier: product.hostingPackageIdentifier,
      storageFeature: product.storageFeature,
      websiteFeature: product.websiteFeature,
      emailFeature: product.emailFeature,
      bandwidthFeature: product.bandwidthFeature,
      prices: product.prices.map((price) => ({
        id: price.id,
        billingPeriod: price.billingPeriod,
        amount: serializeMoney(price.amount, price.currency),
        setupFee: serializeMoney(price.setupFee, price.currency),
        isActive: price.isActive,
        validFrom: price.validFrom?.toISOString() ?? null,
        validUntil: price.validUntil?.toISOString() ?? null,
        createdAt: price.createdAt.toISOString(),
      })),
      createdAt: product.createdAt.toISOString(),
      updatedAt: product.updatedAt.toISOString(),
    });
  }

  private rethrowConflict(error: unknown): never {
    if (isUniqueConstraintError(error)) {
      throw new ApplicationException({
        status: HttpStatus.CONFLICT,
        code: 'CONFLICT',
        message:
          'A product or active price with these identifiers already exists.',
      });
    }
    throw error;
  }

  private notFound() {
    return new ApplicationException({
      status: HttpStatus.NOT_FOUND,
      code: 'RESOURCE_NOT_FOUND',
      message: 'Product was not found.',
    });
  }
}
