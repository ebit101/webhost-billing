import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  BillingPeriod,
  ProductStatus,
  type Prisma,
  type PrismaClient,
} from '@webhost-billing/database';
import {
  productSchema,
  hostingAddOnSchema,
  type HostingAddOn,
  type HostingAddOnInput,
  productGroupSchema,
  type ProductGroupInput,
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

export function availableAddOnPrice(now: Date, currency?: string) {
  return {
    billingPeriod: BillingPeriod.ONE_TIME,
    ...(currency ? { currency } : {}),
    isActive: true,
    deletedAt: null,
    AND: [
      { OR: [{ validFrom: null }, { validFrom: { lte: now } }] },
      { OR: [{ validUntil: null }, { validUntil: { gt: now } }] },
    ],
  } satisfies Prisma.ProductPriceWhereInput;
}

const addOnInclude = {
  prices: {
    where: {
      isActive: true,
      deletedAt: null,
      billingPeriod: BillingPeriod.ONE_TIME,
    },
  },
  eligibleHostingPlans: { select: { hostingProductId: true } },
} satisfies Prisma.ProductInclude;

function toAddOn(
  product: Prisma.ProductGetPayload<{ include: typeof addOnInclude }>,
): HostingAddOn {
  const price = product.prices[0];
  if (!price) throw new Error('Hosting add-on is missing an active price');
  return hostingAddOnSchema.parse({
    id: product.id,
    priceId: price.id,
    name: product.name,
    description: product.description,
    amount: serializeMoney(price.amount, price.currency),
    hostingProductIds: product.eligibleHostingPlans.map(
      (plan) => plan.hostingProductId,
    ),
    enabled: product.status === ProductStatus.ACTIVE,
  });
}

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
      message: 'Enter the cPanel package identifier in Details.',
    });
  }
  for (const [field, label] of [
    ['storageFeature', 'Storage display'],
    ['websiteFeature', 'Websites display'],
    ['emailFeature', 'Email display'],
    ['bandwidthFeature', 'Bandwidth display'],
  ] as const) {
    if (!product[field]) {
      issues.push({
        field,
        message: `Fill in ${label} in Details.`,
      });
    }
  }
  if (product.activePriceCount === 0) {
    issues.push({
      field: 'prices',
      message: 'Add at least one active price in Pricing.',
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

  async listAddOns(): Promise<HostingAddOn[]> {
    const products = await this.prisma.product.findMany({
      where: { kind: 'ADD_ON', deletedAt: null },
      include: addOnInclude,
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
    return products.map(toAddOn);
  }

  async saveAddOn(
    id: string | undefined,
    input: HostingAddOnInput,
    actor: AuthRequestContext,
    context: SecurityRequestContext,
  ): Promise<HostingAddOn> {
    return this.prisma.$transaction(async (transaction) => {
      if (id)
        await transaction.$queryRaw`SELECT id FROM products WHERE id=${id}::uuid FOR UPDATE`;
      const current = id
        ? await transaction.product.findFirst({
            where: { id, kind: 'ADD_ON', deletedAt: null },
            include: addOnInclude,
          })
        : null;
      if (id && !current)
        throw new ApplicationException({
          status: HttpStatus.NOT_FOUND,
          code: 'RESOURCE_NOT_FOUND',
          message: 'Hosting add-on was not found.',
        });
      const eligibleCount = await transaction.product.count({
        where: {
          id: { in: input.hostingProductIds },
          kind: 'HOSTING',
          deletedAt: null,
        },
      });
      if (eligibleCount !== input.hostingProductIds.length)
        throw new ApplicationException({
          status: HttpStatus.UNPROCESSABLE_ENTITY,
          code: 'UNPROCESSABLE_ENTITY',
          message: 'Choose available hosting plans for this add-on.',
        });
      const fields = {
        name: input.name,
        description: input.description,
        status: input.enabled ? ProductStatus.ACTIVE : ProductStatus.ARCHIVED,
      };
      const product = id
        ? await transaction.product.update({ where: { id }, data: fields })
        : await transaction.product.create({
            data: {
              ...fields,
              kind: 'ADD_ON',
              slug: `hosting-add-on-${randomUUID()}`,
            },
          });
      const activePrice = current?.prices[0];
      const amount = BigInt(input.amount);
      if (
        !activePrice ||
        activePrice.amount !== amount ||
        activePrice.currency !== input.currency
      ) {
        if (activePrice)
          await transaction.productPrice.update({
            where: { id: activePrice.id },
            data: { isActive: false, validUntil: new Date() },
          });
        await transaction.productPrice.create({
          data: {
            productId: product.id,
            billingPeriod: BillingPeriod.ONE_TIME,
            amount,
            currency: input.currency,
          },
        });
      }
      await transaction.productAddOnEligibility.deleteMany({
        where: {
          addOnProductId: product.id,
          hostingProductId: { notIn: input.hostingProductIds },
        },
      });
      await transaction.productAddOnEligibility.createMany({
        data: input.hostingProductIds.map((hostingProductId) => ({
          addOnProductId: product.id,
          hostingProductId,
        })),
        skipDuplicates: true,
      });
      await transaction.activityLog.create({
        data: {
          actorUserId: actor.identity.userId,
          action: id ? 'HOSTING_ADD_ON_UPDATED' : 'HOSTING_ADD_ON_CREATED',
          entityType: 'PRODUCT',
          entityId: product.id,
          ipAddressHash: context.ipAddressHash,
          metadata: {
            enabled: input.enabled,
            hostingProductIds: input.hostingProductIds,
          },
        },
      });
      return toAddOn(
        await transaction.product.findUniqueOrThrow({
          where: { id: product.id },
          include: addOnInclude,
        }),
      );
    });
  }

  async create(
    input: CreateProductRequest,
    actor: AuthRequestContext,
    context: SecurityRequestContext,
  ): Promise<Product> {
    const { prices = [], ...fields } = input;
    await this.assertGroupExists(input.groupId);
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
      where: { deletedAt: null, kind: 'HOSTING' },
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
        kind: 'HOSTING',
        deletedAt: null,
        status: ProductStatus.ACTIVE,
        publicVisible: true,
      },
      orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
      include: {
        eligibleAddOns: {
          where: {
            addOnProduct: {
              kind: 'ADD_ON',
              deletedAt: null,
              status: ProductStatus.ACTIVE,
            },
          },
          include: {
            addOnProduct: {
              include: {
                prices: { where: availableAddOnPrice(now, query.currency) },
              },
            },
          },
          orderBy: [
            { addOnProduct: { name: 'asc' } },
            { addOnProductId: 'asc' },
          ],
        },
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
          addOns: product.eligibleAddOns.flatMap(({ addOnProduct }) =>
            addOnProduct.prices.map((price) => ({
              id: addOnProduct.id,
              priceId: price.id,
              name: addOnProduct.name,
              description: addOnProduct.description,
              amount: serializeMoney(price.amount, price.currency),
            })),
          ),
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
    await this.assertGroupExists(input.groupId);
    const current = await this.prisma.product.findFirst({
      where: { id: productId, deletedAt: null, kind: 'HOSTING' },
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
      where: { id: productId, deletedAt: null, kind: 'HOSTING' },
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
      where: { id: productId, deletedAt: null, kind: 'HOSTING' },
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
      where: { id: productId, deletedAt: null, kind: 'HOSTING' },
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
      groupId: product.groupId,
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
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'P2003'
    ) {
      throw new ApplicationException({
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        code: 'UNPROCESSABLE_ENTITY',
        message: 'Choose an existing product group.',
      });
    }
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

  async listGroups() {
    const groups = await this.prisma.productGroup.findMany({
      orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }, { id: 'asc' }],
    });
    return groups.map((group) =>
      productGroupSchema.parse({
        ...group,
        createdAt: group.createdAt.toISOString(),
        updatedAt: group.updatedAt.toISOString(),
      }),
    );
  }

  async saveGroup(
    id: string | undefined,
    input: ProductGroupInput,
    actor: AuthRequestContext,
    context: SecurityRequestContext,
  ) {
    try {
      return await this.prisma.$transaction(async (transaction) => {
        if (
          id &&
          !(await transaction.productGroup.findUnique({ where: { id } }))
        ) {
          throw new ApplicationException({
            status: HttpStatus.NOT_FOUND,
            code: 'RESOURCE_NOT_FOUND',
            message: 'Product group was not found.',
          });
        }
        const group = id
          ? await transaction.productGroup.update({
              where: { id },
              data: input,
            })
          : await transaction.productGroup.create({ data: input });
        await transaction.activityLog.create({
          data: {
            actorUserId: actor.identity.userId,
            action: id
              ? 'PRODUCT_GROUP_UPDATED_BY_ADMIN'
              : 'PRODUCT_GROUP_CREATED_BY_ADMIN',
            entityType: 'PRODUCT_GROUP',
            entityId: group.id,
            ipAddressHash: context.ipAddressHash,
            metadata: { changedFields: Object.keys(input).sort() },
          },
        });
        return productGroupSchema.parse({
          ...group,
          createdAt: group.createdAt.toISOString(),
          updatedAt: group.updatedAt.toISOString(),
        });
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ApplicationException({
          status: HttpStatus.CONFLICT,
          code: 'CONFLICT',
          message: 'A product group with this name already exists.',
        });
      }
      throw error;
    }
  }

  private async assertGroupExists(groupId: string | null | undefined) {
    if (!groupId) return;
    if (
      !(await this.prisma.productGroup.findUnique({
        where: { id: groupId },
        select: { id: true },
      }))
    ) {
      throw new ApplicationException({
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        code: 'UNPROCESSABLE_ENTITY',
        message: 'Choose an existing product group.',
      });
    }
  }
}
