import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  CustomerStatus,
  InvoiceStatus,
  OrderStatus,
  Prisma,
  ProductStatus,
  UserStatus,
  type PrismaClient,
} from '@webhost-billing/database';
import {
  POSTGRES_BIGINT_MAX,
  PROJECT_NAME,
  createPaginationMeta,
  orderCreationResultSchema,
  orderSchema,
  serializeMoney,
  type CreateAdminOrderRequest,
  type CreateCustomerOrderRequest,
  type Order,
  type OrderCreationResult,
  type OrderListQuery,
  type OrderStatus as SharedOrderStatus,
  type PaginationMeta,
  type UpdateOrderStatusRequest,
} from '@webhost-billing/shared';
import { ApplicationException } from '../../common/errors/application.exception';
import type { SecurityRequestContext } from '../../common/http/request-context';
import { createHumanReadableNumber } from '../../common/identifiers/business-number';
import { allocateInvoiceNumber } from '../../common/identifiers/invoice-number';
import { PRISMA_CLIENT } from '../../infrastructure/database/database.module';
import type { AuthRequestContext } from '../auth/auth.types';

type CreateOrderInput = (
  CreateAdminOrderRequest | CreateCustomerOrderRequest
) & { customerId: string };

const orderInclude = {
  customer: {
    include: { user: { select: { email: true } } },
  },
  items: { orderBy: { createdAt: 'asc' as const } },
  invoices: { orderBy: { createdAt: 'asc' as const }, take: 1 },
} satisfies Prisma.OrderInclude;

type OrderRecord = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;

const allowedTransitions: Record<SharedOrderStatus, SharedOrderStatus[]> = {
  PENDING: ['AWAITING_PAYMENT', 'REJECTED', 'CANCELLED', 'FAILED'],
  AWAITING_PAYMENT: ['PAID', 'REJECTED', 'CANCELLED', 'FAILED'],
  PAID: ['PROCESSING'],
  PROCESSING: ['COMPLETED', 'FAILED'],
  COMPLETED: [],
  REJECTED: [],
  CANCELLED: [],
  FAILED: ['PROCESSING', 'CANCELLED'],
};

export function isOrderTransitionAllowed(
  current: SharedOrderStatus,
  next: SharedOrderStatus,
): boolean {
  return allowedTransitions[current].includes(next);
}

@Injectable()
export class OrderService {
  constructor(@Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient) {}

  async create(
    input: CreateOrderInput,
    actor: AuthRequestContext,
    context: SecurityRequestContext,
    source: 'ADMIN' | 'CUSTOMER',
  ): Promise<OrderCreationResult> {
    const duplicate = await this.findBySubmissionKey(input.submissionKey);
    if (duplicate) return this.duplicateResult(duplicate, input);

    try {
      const created = await this.prisma.$transaction(async (transaction) => {
        const customer = await transaction.customer.findFirst({
          where: {
            id: input.customerId,
            deletedAt: null,
            status: CustomerStatus.ACTIVE,
            user: { status: UserStatus.ACTIVE, deletedAt: null },
          },
          include: { user: { select: { email: true } } },
        });
        if (!customer) {
          throw new ApplicationException({
            status: HttpStatus.UNPROCESSABLE_ENTITY,
            code: 'UNPROCESSABLE_ENTITY',
            message: 'The selected customer account is not active.',
          });
        }

        const now = new Date();
        const price = await transaction.productPrice.findFirst({
          where: {
            id: input.priceId,
            productId: input.productId,
            isActive: true,
            deletedAt: null,
            AND: [
              { OR: [{ validFrom: null }, { validFrom: { lte: now } }] },
              { OR: [{ validUntil: null }, { validUntil: { gt: now } }] },
            ],
            product: {
              deletedAt: null,
              status: ProductStatus.ACTIVE,
              ...(source === 'CUSTOMER' ? { publicVisible: true } : {}),
            },
          },
          include: { product: true },
        });
        if (!price) {
          throw new ApplicationException({
            status: HttpStatus.UNPROCESSABLE_ENTITY,
            code: 'UNPROCESSABLE_ENTITY',
            message: 'The selected product price is not available for sale.',
          });
        }
        if (!price.product.hostingPackageIdentifier) {
          throw new ApplicationException({
            status: HttpStatus.UNPROCESSABLE_ENTITY,
            code: 'UNPROCESSABLE_ENTITY',
            message: 'The selected product is not ready for provisioning.',
          });
        }
        if (price.amount > POSTGRES_BIGINT_MAX - price.setupFee) {
          throw new ApplicationException({
            status: HttpStatus.UNPROCESSABLE_ENTITY,
            code: 'UNPROCESSABLE_ENTITY',
            message: 'The selected price total exceeds the supported range.',
          });
        }

        const total = price.amount + price.setupFee;
        const order = await transaction.order.create({
          data: {
            orderNumber: createHumanReadableNumber('ORD', now),
            submissionKey: input.submissionKey,
            customerId: customer.id,
            status: OrderStatus.AWAITING_PAYMENT,
            currency: price.currency,
            subtotal: price.amount,
            setupTotal: price.setupFee,
            total,
            customerEmailSnapshot: customer.user.email,
            notes: 'notes' in input ? (input.notes ?? null) : null,
            placedAt: now,
            items: {
              create: {
                productId: price.product.id,
                productPriceId: price.id,
                productNameSnapshot: price.product.name,
                descriptionSnapshot: price.product.description,
                billingPeriod: price.billingPeriod,
                currency: price.currency,
                unitAmount: price.amount,
                setupFee: price.setupFee,
                quantity: 1,
                lineTotal: total,
                requestedDomain: input.requestedDomain,
                provisioningSnapshot: {
                  productSlug: price.product.slug,
                  hostingPackageIdentifier:
                    price.product.hostingPackageIdentifier,
                },
              },
            },
          },
          include: { items: true },
        });
        const orderItem = order.items[0];
        if (!orderItem) throw new Error('Order item creation failed');

        const businessSetting = await transaction.setting.findUnique({
          where: { key: 'business.identity' },
          select: { value: true },
        });
        const invoice = await transaction.invoice.create({
          data: {
            invoiceNumber: await allocateInvoiceNumber(transaction),
            submissionKey: `invoice:${input.submissionKey}`,
            customerId: customer.id,
            orderId: order.id,
            status: InvoiceStatus.UNPAID,
            currency: price.currency,
            subtotal: total,
            total,
            balanceDue: total,
            customerNameSnapshot:
              customer.companyName ??
              `${customer.firstName} ${customer.lastName}`,
            customerEmailSnapshot: customer.user.email,
            customerAddressSnapshot: {
              line1: customer.addressLine1,
              line2: customer.addressLine2,
              city: customer.city,
              region: customer.region,
              postalCode: customer.postalCode,
              countryCode: customer.countryCode,
            },
            businessIdentitySnapshot:
              businessSetting?.value ?? ({ name: PROJECT_NAME } as const),
            ...(customer.taxIdentifier
              ? {
                  taxIdentitySnapshot: {
                    taxIdentifier: customer.taxIdentifier,
                  },
                }
              : {}),
            issuedAt: now,
            dueAt: now,
            items: {
              create: [
                {
                  orderItemId: orderItem.id,
                  linePosition: 1,
                  descriptionSnapshot: `${price.product.name} — ${price.billingPeriod.toLowerCase()} hosting for ${input.requestedDomain}`,
                  currency: price.currency,
                  quantity: 1,
                  unitAmount: price.amount,
                  lineTotal: price.amount,
                },
                ...(price.setupFee > 0n
                  ? [
                      {
                        orderItemId: orderItem.id,
                        linePosition: 2,
                        descriptionSnapshot: `${price.product.name} — one-time setup fee`,
                        currency: price.currency,
                        quantity: 1,
                        unitAmount: price.setupFee,
                        lineTotal: price.setupFee,
                      },
                    ]
                  : []),
              ],
            },
          },
        });
        await transaction.outboxEvent.createMany({
          data: [
            {
              aggregateType: 'ORDER',
              aggregateId: order.id,
              eventType: 'EMAIL_ORDER_RECEIVED',
              idempotencyKey: `email:order-received:${order.id}`,
              payload: { schemaVersion: 1, orderId: order.id },
            },
            {
              aggregateType: 'INVOICE',
              aggregateId: invoice.id,
              eventType: 'EMAIL_INVOICE_CREATED',
              idempotencyKey: `email:invoice-created:${invoice.id}`,
              payload: { schemaVersion: 1, invoiceId: invoice.id },
            },
          ],
        });
        await transaction.activityLog.create({
          data: {
            actorUserId: actor.identity.userId,
            action:
              source === 'ADMIN'
                ? 'ORDER_CREATED_BY_ADMIN'
                : 'ORDER_CREATED_BY_CUSTOMER',
            entityType: 'ORDER',
            entityId: order.id,
            ipAddressHash: context.ipAddressHash,
            metadata: {
              customerId: customer.id,
              productId: price.product.id,
              productPriceId: price.id,
              requestedDomain: input.requestedDomain,
            },
          },
        });
        return order.id;
      });
      return orderCreationResultSchema.parse({
        order: await this.getUnchecked(created),
        duplicate: false,
      });
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        const racedDuplicate = await this.findBySubmissionKey(
          input.submissionKey,
        );
        if (racedDuplicate) return this.duplicateResult(racedDuplicate, input);
        throw new ApplicationException({
          status: HttpStatus.CONFLICT,
          code: 'CONFLICT',
          message: 'Could not allocate a unique order number. Try again.',
        });
      }
      throw error;
    }
  }

  async list(query: OrderListQuery): Promise<{
    data: Order[];
    pagination: PaginationMeta;
  }> {
    const where: Prisma.OrderWhereInput = {
      ...(query.customerId ? { customerId: query.customerId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              { orderNumber: { contains: query.search, mode: 'insensitive' } },
              {
                customerEmailSnapshot: {
                  contains: query.search,
                  mode: 'insensitive',
                },
              },
              {
                items: {
                  some: {
                    requestedDomain: {
                      contains: query.search,
                      mode: 'insensitive',
                    },
                  },
                },
              },
            ],
          }
        : {}),
    };
    const [orders, totalItems] = await this.prisma.$transaction([
      this.prisma.order.findMany({
        where,
        include: orderInclude,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.order.count({ where }),
    ]);
    return {
      data: orders.map((order) => this.toOrder(order)),
      pagination: createPaginationMeta(query.page, query.pageSize, totalItems),
    };
  }

  async get(orderId: string, actor: AuthRequestContext): Promise<Order> {
    const order = await this.getRecord(orderId);
    if (
      actor.identity.role === 'CUSTOMER' &&
      actor.identity.customerId !== order.customerId
    ) {
      throw new ApplicationException({
        status: HttpStatus.FORBIDDEN,
        code: 'FORBIDDEN',
        message: 'You do not have access to this order.',
      });
    }
    return this.toOrder(order);
  }

  async updateStatus(
    orderId: string,
    input: UpdateOrderStatusRequest,
    actor: AuthRequestContext,
    context: SecurityRequestContext,
  ): Promise<Order> {
    const current = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, status: true, updatedAt: true },
    });
    if (!current) throw this.notFound();
    if (input.status === OrderStatus.PAID) {
      throw new ApplicationException({
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        code: 'UNPROCESSABLE_ENTITY',
        message:
          'An order can be marked paid only by a verified payment workflow.',
      });
    }
    if (!isOrderTransitionAllowed(current.status, input.status)) {
      throw new ApplicationException({
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        code: 'UNPROCESSABLE_ENTITY',
        message: `Order cannot move from ${current.status} to ${input.status}.`,
      });
    }
    const now = new Date();
    await this.prisma.$transaction(async (transaction) => {
      await transaction.order.update({
        where: { id: orderId },
        data: {
          status: input.status,
          ...(input.status === OrderStatus.COMPLETED
            ? { completedAt: now }
            : {}),
          ...(input.status === OrderStatus.CANCELLED ||
          input.status === OrderStatus.REJECTED
            ? { cancelledAt: now }
            : {}),
        },
      });
      if (
        input.status === OrderStatus.CANCELLED ||
        input.status === OrderStatus.REJECTED
      ) {
        await transaction.invoice.updateMany({
          where: {
            orderId,
            status: { in: [InvoiceStatus.DRAFT, InvoiceStatus.UNPAID] },
          },
          data: { status: InvoiceStatus.CANCELLED, cancelledAt: now },
        });
      }
      if (input.status === OrderStatus.PROCESSING) {
        await transaction.outboxEvent.create({
          data: {
            aggregateType: 'ORDER',
            aggregateId: orderId,
            eventType: 'EMAIL_ORDER_APPROVED',
            idempotencyKey: `email:order-approved:${orderId}:${current.updatedAt.toISOString()}`,
            payload: { schemaVersion: 1, orderId },
          },
        });
      }
      await transaction.activityLog.create({
        data: {
          actorUserId: actor.identity.userId,
          action: 'ORDER_STATUS_CHANGED_BY_ADMIN',
          entityType: 'ORDER',
          entityId: orderId,
          ipAddressHash: context.ipAddressHash,
          metadata: { previousStatus: current.status, status: input.status },
        },
      });
    });
    return this.getUnchecked(orderId);
  }

  private async findBySubmissionKey(
    submissionKey: string,
  ): Promise<OrderRecord | null> {
    return this.prisma.order.findUnique({
      where: { submissionKey },
      include: orderInclude,
    });
  }

  private duplicateResult(
    existing: OrderRecord,
    input: CreateOrderInput,
  ): OrderCreationResult {
    const item = existing.items[0];
    if (
      existing.customerId !== input.customerId ||
      item?.productId !== input.productId ||
      item.productPriceId !== input.priceId ||
      item.requestedDomain !== input.requestedDomain
    ) {
      throw new ApplicationException({
        status: HttpStatus.CONFLICT,
        code: 'CONFLICT',
        message: 'This submission key has already been used for another order.',
      });
    }
    return orderCreationResultSchema.parse({
      order: this.toOrder(existing),
      duplicate: true,
    });
  }

  private async getUnchecked(orderId: string): Promise<Order> {
    return this.toOrder(await this.getRecord(orderId));
  }

  private async getRecord(orderId: string): Promise<OrderRecord> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: orderInclude,
    });
    if (!order) throw this.notFound();
    return order;
  }

  private toOrder(order: OrderRecord): Order {
    const invoice = order.invoices[0];
    if (!invoice) throw new Error('Order is missing its invoice');
    const customerName =
      order.customer.companyName ??
      `${order.customer.firstName} ${order.customer.lastName}`;
    return orderSchema.parse({
      id: order.id,
      orderNumber: order.orderNumber,
      customerId: order.customerId,
      customerName,
      customerEmail: order.customerEmailSnapshot,
      status: order.status,
      subtotal: serializeMoney(order.subtotal, order.currency),
      setupTotal: serializeMoney(order.setupTotal, order.currency),
      total: serializeMoney(order.total, order.currency),
      notes: order.notes,
      placedAt: order.placedAt.toISOString(),
      completedAt: order.completedAt?.toISOString() ?? null,
      cancelledAt: order.cancelledAt?.toISOString() ?? null,
      items: order.items.map((item) => ({
        id: item.id,
        productId: item.productId,
        productPriceId: item.productPriceId,
        productName: item.productNameSnapshot,
        description: item.descriptionSnapshot,
        billingPeriod: item.billingPeriod,
        unitAmount: serializeMoney(item.unitAmount, item.currency),
        setupFee: serializeMoney(item.setupFee, item.currency),
        lineTotal: serializeMoney(item.lineTotal, item.currency),
        quantity: item.quantity,
        requestedDomain: item.requestedDomain,
      })),
      invoice: {
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        status: invoice.status,
        total: serializeMoney(invoice.total, invoice.currency),
        balanceDue: serializeMoney(invoice.balanceDue, invoice.currency),
        dueAt: invoice.dueAt.toISOString(),
      },
    });
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'P2002'
    );
  }

  private notFound() {
    return new ApplicationException({
      status: HttpStatus.NOT_FOUND,
      code: 'RESOURCE_NOT_FOUND',
      message: 'Order was not found.',
    });
  }
}
