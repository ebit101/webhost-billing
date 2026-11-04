import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  CustomerStatus,
  InvoiceStatus,
  OrderStatus,
  orderFulfillmentComplete,
  Prisma,
  ProductStatus,
  UserStatus,
  type PrismaClient,
} from '@webhost-billing/database';
import {
  readHostingProvisioningMode,
  adminDomainOrderSnapshotSchema,
  POSTGRES_BIGINT_MAX,
  PROJECT_NAME,
  createPaginationMeta,
  orderCreationResultSchema,
  checkoutTermsAcceptanceSchema,
  orderSchema,
  serializeMoney,
  type CreateAdminOrderRequest,
  type CreateCustomerOrderRequest,
  type GuestHostingCheckoutRequest,
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
import { DomainService } from '../domains/domain.service';
import { availableAddOnPrice } from '../products/product.service';
import { AdminOrderDomainService } from './admin-order-domain.service';

import { requireCheckoutTerms } from '../settings/checkout-terms';

type CreateOrderInput = (
  CreateAdminOrderRequest | CreateCustomerOrderRequest
) & { customerId: string };

const orderInclude = {
  customer: {
    include: { user: { select: { email: true } } },
  },
  items: {
    orderBy: [
      { kind: 'asc' as const },
      { createdAt: 'asc' as const },
      { id: 'asc' as const },
    ],
  },
  invoices: { orderBy: { createdAt: 'asc' as const }, take: 1 },
} satisfies Prisma.OrderInclude;

type OrderRecord = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;

function matchesAddOns(items: OrderRecord['items'], priceIds: string[] = []) {
  const purchased = items.filter((item) => item.kind === 'ADD_ON');
  return (
    purchased.length === priceIds.length &&
    purchased.every((item) => priceIds.includes(item.productPriceId))
  );
}

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
  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient,
    private readonly domains: DomainService,
    private readonly adminDomains: AdminOrderDomainService,
  ) {}

  async create(
    input: CreateOrderInput,
    actor: {
      identity: {
        userId: string;
        role?: string;
        staffRole?: string;
        twoFactorEnabled?: boolean;
      };
    },
    context: SecurityRequestContext,
    source: 'ADMIN' | 'CUSTOMER',
    options?: {
      transaction?: Prisma.TransactionClient;
      allowPendingVerification?: boolean;
    },
  ): Promise<OrderCreationResult> {
    const adminDomain = 'domainOrder' in input ? input.domainOrder : undefined;
    if (adminDomain) {
      if (source !== 'ADMIN')
        throw new ApplicationException({
          status: HttpStatus.FORBIDDEN,
          code: 'FORBIDDEN',
          message: 'Only administrators can choose domain order actions.',
        });
      this.adminDomains.authorize(actor);
    }
    if ('hostingProvisioningMode' in input && source !== 'ADMIN') {
      throw new ApplicationException({
        status: HttpStatus.FORBIDDEN,
        code: 'FORBIDDEN',
        message: 'Only administrators can choose hosting preservation.',
      });
    }
    const duplicate = await this.findBySubmissionKey(input.submissionKey);
    if (duplicate) return this.duplicateResult(duplicate, input);

    try {
      const persist = async (transaction: Prisma.TransactionClient) => {
        if (adminDomain) {
          // Match the registrar paths: quote (when present), catalogue, then
          // actor/client. Ownership linking locks catalogue before its actor;
          // taking the client first can deadlock with linking or quote creation.
          if (adminDomain.mode === 'REGISTRATION')
            await transaction.$queryRaw`SELECT id FROM domain_quotes WHERE id=${adminDomain.quoteId}::uuid FOR UPDATE`;
          await transaction.$queryRaw`SELECT pg_advisory_xact_lock(510118)::text`;
          await this.adminDomains.lockActor(transaction, actor.identity.userId);
          await transaction.$queryRaw`SELECT u.id FROM users u JOIN customers c ON c.user_id=u.id WHERE c.id=${input.customerId}::uuid FOR UPDATE OF u,c`;
        }
        const customer = await transaction.customer.findFirst({
          where: {
            id: input.customerId,
            deletedAt: null,
            status: CustomerStatus.ACTIVE,
            user: {
              ...(adminDomain ? { emailVerifiedAt: { not: null } } : {}),
              status: options?.allowPendingVerification
                ? { in: [UserStatus.ACTIVE, UserStatus.PENDING_VERIFICATION] }
                : UserStatus.ACTIVE,
              deletedAt: null,
            },
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

        if (adminDomain) {
          // Another request may have committed while this one waited for the
          // catalogue lock. Resolve an exact replay before testing availability
          // of the domain/quote that the winning request has now consumed.
          const persisted = await transaction.order.findUnique({
            where: { submissionKey: input.submissionKey },
            include: orderInclude,
          });
          if (persisted)
            return {
              orderId: persisted.id,
              replay: await this.duplicateResult(persisted, input),
            };
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
              kind: 'HOSTING',
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

        const addOnPriceIds =
          'addOnPriceIds' in input ? (input.addOnPriceIds ?? []) : [];
        const addOnPrices =
          addOnPriceIds.length === 0
            ? []
            : await transaction.productPrice.findMany({
                where: {
                  ...availableAddOnPrice(now, price.currency),
                  id: { in: addOnPriceIds },
                  product: {
                    kind: 'ADD_ON',
                    status: ProductStatus.ACTIVE,
                    deletedAt: null,
                    eligibleHostingPlans: {
                      some: { hostingProductId: input.productId },
                    },
                  },
                },
                include: { product: true },
                orderBy: { productId: 'asc' },
              });
        if (
          addOnPrices.length !== addOnPriceIds.length ||
          new Set(addOnPrices.map((addOn) => addOn.productId)).size !==
            addOnPrices.length
        ) {
          throw new ApplicationException({
            status: HttpStatus.UNPROCESSABLE_ENTITY,
            code: 'UNPROCESSABLE_ENTITY',
            message:
              'A selected add-on is no longer available for this plan or price.',
          });
        }

        const domainQuoteId =
          adminDomain?.mode === 'REGISTRATION'
            ? adminDomain.quoteId
            : source === 'CUSTOMER' && 'domainQuoteId' in input
              ? input.domainQuoteId
              : undefined;
        const domain = domainQuoteId
          ? await this.domains.quoteForHostingOrder(
              transaction,
              domainQuoteId,
              customer.id,
              input.requestedDomain,
              { adminAssisted: Boolean(adminDomain) },
            )
          : null;
        const existingDomain =
          adminDomain?.mode === 'EXISTING'
            ? await this.adminDomains.existingSelection(
                transaction,
                adminDomain.domainId,
                adminDomain.priceId,
                customer.id,
                input.requestedDomain,
              )
            : null;
        const domainAmount =
          existingDomain?.price.amount ?? domain?.quote.sellingAmount ?? 0n;
        const domainPrice = existingDomain?.price ?? domain?.price;
        const domainRecordId = existingDomain?.domain.id ?? randomUUID();
        const domainDescription = existingDomain
          ? `Annual domain service for ${input.requestedDomain}; existing registration, no registration or renewal submitted.`
          : domain?.account.mode === 'LIVE'
            ? `Registration of ${input.requestedDomain} for one year; separate approval required.`
            : 'Simulated one-year domain registration; no external calls or charges.';
        if ((domain || existingDomain) && price.currency !== 'BDT') {
          throw new ApplicationException({
            status: HttpStatus.UNPROCESSABLE_ENTITY,
            code: 'UNPROCESSABLE_ENTITY',
            message: 'Combined hosting and domain orders require BDT pricing.',
          });
        }
        const hostingTotal = price.amount + price.setupFee;
        const addOnTotal = addOnPrices.reduce(
          (sum, addOn) => sum + addOn.amount,
          0n,
        );
        const total = hostingTotal + domainAmount + addOnTotal;
        if (total > POSTGRES_BIGINT_MAX) {
          throw new ApplicationException({
            status: HttpStatus.UNPROCESSABLE_ENTITY,
            code: 'UNPROCESSABLE_ENTITY',
            message: 'The combined order total exceeds the supported range.',
          });
        }
        const termsAcceptance =
          source === 'CUSTOMER'
            ? await requireCheckoutTerms(
                transaction,
                'acceptedTermsVersion' in input
                  ? input.acceptedTermsVersion
                  : undefined,
                now,
              )
            : undefined;
        const order = await transaction.order.create({
          data: {
            orderNumber: createHumanReadableNumber('ORD', now),
            submissionKey: input.submissionKey,
            customerId: customer.id,
            status: OrderStatus.AWAITING_PAYMENT,
            currency: price.currency,
            subtotal: price.amount + domainAmount + addOnTotal,
            setupTotal: price.setupFee,
            total,
            customerEmailSnapshot: customer.user.email,
            notes: 'notes' in input ? (input.notes ?? null) : null,
            placedAt: now,
            termsAcceptance,
            items: {
              create: [
                {
                  kind: 'HOSTING',
                  productId: price.product.id,
                  productPriceId: price.id,
                  productNameSnapshot: price.product.name,
                  descriptionSnapshot: price.product.description,
                  billingPeriod: price.billingPeriod,
                  currency: price.currency,
                  unitAmount: price.amount,
                  setupFee: price.setupFee,
                  quantity: 1,
                  lineTotal: hostingTotal,
                  requestedDomain: input.requestedDomain,
                  provisioningSnapshot: {
                    productSlug: price.product.slug,
                    hostingProvisioningMode:
                      'hostingProvisioningMode' in input
                        ? (input.hostingProvisioningMode ?? 'STANDARD')
                        : 'STANDARD',
                    hostingPackageIdentifier:
                      price.product.hostingPackageIdentifier,
                  },
                },
                ...(domainPrice
                  ? [
                      {
                        kind: 'DOMAIN' as const,
                        productId: domainPrice.productId,
                        productPriceId: domainPrice.id,
                        productNameSnapshot: domainPrice.product.name,
                        descriptionSnapshot: domainDescription,
                        billingPeriod: 'ANNUAL' as const,
                        currency: 'BDT',
                        unitAmount: domainAmount,
                        lineTotal: domainAmount,
                        requestedDomain: input.requestedDomain,
                        ...(adminDomain
                          ? {
                              provisioningSnapshot: {
                                adminDomainAction: adminDomain.mode,
                                sendToRegistrar: adminDomain.sendToRegistrar,
                                domainRecordId,
                              },
                            }
                          : {}),
                      },
                    ]
                  : []),
                ...addOnPrices.map((addOn) => ({
                  kind: 'ADD_ON' as const,
                  productId: addOn.productId,
                  productPriceId: addOn.id,
                  productNameSnapshot: addOn.product.name,
                  descriptionSnapshot: addOn.product.description,
                  billingPeriod: 'ONE_TIME' as const,
                  currency: price.currency,
                  unitAmount: addOn.amount,
                  lineTotal: addOn.amount,
                  requestedDomain: input.requestedDomain,
                })),
              ],
            },
          },
          include: { items: true },
        });
        const orderItem = order.items.find((item) => item.kind === 'HOSTING');
        if (!orderItem) throw new Error('Order item creation failed');
        const domainItem = order.items.find((item) => item.kind === 'DOMAIN');
        const firstAddOnPosition =
          2 + Number(price.setupFee > 0n) + Number(Boolean(domainItem));

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
                ...(domainPrice && domainItem
                  ? [
                      {
                        orderItemId: domainItem.id,
                        linePosition: price.setupFee > 0n ? 3 : 2,
                        descriptionSnapshot: adminDomain
                          ? domainDescription
                          : `Simulated registration of ${input.requestedDomain} for one year`,
                        currency: 'BDT',
                        quantity: 1,
                        unitAmount: domainAmount,
                        lineTotal: domainAmount,
                      },
                    ]
                  : []),
                ...order.items
                  .filter((item) => item.kind === 'ADD_ON')
                  .map((item, index) => ({
                    orderItemId: item.id,
                    linePosition: firstAddOnPosition + index,
                    descriptionSnapshot: `${item.productNameSnapshot} — one-time add-on for ${input.requestedDomain}`,
                    currency: item.currency,
                    quantity: 1,
                    unitAmount: item.unitAmount,
                    lineTotal: item.lineTotal,
                  })),
              ],
            },
          },
        });
        if (domain) {
          if (!domainItem) throw new Error('Domain order item creation failed');
          const registration = await transaction.domain.create({
            data: {
              id: domainRecordId,
              quoteId: domain.quote.id,
              customerId: customer.id,
              accountId: domain.account.id,
              orderItemId: domainItem.id,
              invoiceId: invoice.id,
              domainName: domain.quote.domainName,
              submissionKey: input.submissionKey,
            },
          });
          await transaction.activityLog.create({
            data: {
              actorUserId: actor.identity.userId,
              action:
                domain.account.mode === 'LIVE'
                  ? 'DOMAIN_ORDER_CREATED'
                  : 'SIMULATED_DOMAIN_ORDER_CREATED',
              entityType: 'DOMAIN',
              entityId: registration.id,
              metadata: { orderId: order.id, invoiceId: invoice.id },
            },
          });
        }
        if (existingDomain && domainItem) {
          await transaction.existingDomainOrder.create({
            data: {
              domainId: existingDomain.domain.id,
              orderItemId: domainItem.id,
              invoiceId: invoice.id,
              customerId: customer.id,
            },
          });
          await transaction.activityLog.create({
            data: {
              actorUserId: actor.identity.userId,
              action: 'EXISTING_DOMAIN_ORDER_CREATED',
              entityType: 'DOMAIN',
              entityId: existingDomain.domain.id,
              metadata: { orderId: order.id, invoiceId: invoice.id },
            },
          });
        }
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
        return { orderId: order.id, replay: undefined };
      };
      const created = options?.transaction
        ? await persist(options.transaction)
        : await this.prisma.$transaction(persist);
      return (
        created.replay ??
        orderCreationResultSchema.parse({
          order: await this.getUnchecked(created.orderId, options?.transaction),
          duplicate: false,
        })
      );
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

  async get(
    orderId: string,
    actor: AuthRequestContext,
    customerId?: string,
  ): Promise<Order> {
    const order = await this.getRecord(orderId);
    if (
      customerId &&
      order.customerId.toLowerCase() !== customerId.toLowerCase()
    )
      throw this.notFound();
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
      const domain = await transaction.domain.findFirst({
        where: {
          orderItemId: {
            in: (
              await transaction.orderItem.findMany({
                where: { orderId },
                select: { id: true },
              })
            ).map((item) => item.id),
          },
        },
      });
      if (domain) {
        await transaction.$queryRaw`SELECT id FROM invoices WHERE id=${domain.invoiceId}::uuid FOR UPDATE`;
        await transaction.$queryRaw`SELECT id FROM domains WHERE id=${domain.id}::uuid FOR UPDATE`;
        const operation = await transaction.registrarOperation.findUnique({
          where: { domainId: domain.id },
        });
        if (input.status === OrderStatus.PROCESSING)
          throw new ApplicationException({
            status: HttpStatus.CONFLICT,
            code: 'CONFLICT',
            message:
              'Use the domain registration review to approve this order.',
          });
        if (
          input.status === 'COMPLETED' ||
          (operation?.claimedAt &&
            ['CANCELLED', 'REJECTED', 'FAILED'].includes(input.status))
        ) {
          throw new ApplicationException({
            status: HttpStatus.CONFLICT,
            code: 'CONFLICT',
            message:
              'Use the domain registration review; a claimed registration requires reconciliation.',
          });
        }
      }
      if (
        input.status === OrderStatus.COMPLETED &&
        (await transaction.orderItem.count({
          where: { orderId, kind: 'ADD_ON' },
        })) &&
        !(await orderFulfillmentComplete(transaction, orderId))
      ) {
        throw new ApplicationException({
          status: HttpStatus.CONFLICT,
          code: 'CONFLICT',
          message:
            'Finish hosting and add-on fulfillment before completing this order.',
        });
      }
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

  async fulfillAddOn(
    orderId: string,
    itemId: string,
    actor: AuthRequestContext,
    context: SecurityRequestContext,
  ): Promise<Order> {
    return this.prisma.$transaction(async (transaction) => {
      // Follow payment settlement's invoice-to-order lock order.
      await transaction.$queryRaw`SELECT id FROM invoices WHERE order_id=${orderId}::uuid FOR UPDATE`;
      await transaction.$queryRaw`SELECT id FROM orders WHERE id=${orderId}::uuid FOR UPDATE`;
      const order = await this.getRecord(orderId, transaction);
      const item = order.items.find(
        (entry) => entry.id === itemId && entry.kind === 'ADD_ON',
      );
      if (!item) throw this.notFound();
      if (item.fulfilledAt) return this.toOrder(order);
      const invoice = order.invoices[0];
      if (
        invoice?.status !== InvoiceStatus.PAID ||
        invoice.balanceDue !== 0n ||
        (order.status !== OrderStatus.PAID &&
          order.status !== OrderStatus.PROCESSING)
      ) {
        throw new ApplicationException({
          status: HttpStatus.CONFLICT,
          code: 'CONFLICT',
          message: 'Verify full payment before completing this add-on.',
        });
      }
      const now = new Date();
      await transaction.orderItem.update({
        where: { id: itemId },
        data: { fulfilledAt: now },
      });
      await transaction.activityLog.create({
        data: {
          actorUserId: actor.identity.userId,
          action: 'HOSTING_ADD_ON_FULFILLED',
          entityType: 'ORDER',
          entityId: orderId,
          ipAddressHash: context.ipAddressHash,
          metadata: { orderItemId: itemId },
        },
      });
      if (
        order.status === OrderStatus.PROCESSING &&
        (await orderFulfillmentComplete(transaction, orderId))
      ) {
        await transaction.order.update({
          where: { id: orderId },
          data: { status: OrderStatus.COMPLETED, completedAt: now },
        });
      }
      return this.getUnchecked(orderId, transaction);
    });
  }

  private async findBySubmissionKey(
    submissionKey: string,
  ): Promise<OrderRecord | null> {
    return this.prisma.order.findUnique({
      where: { submissionKey },
      include: orderInclude,
    });
  }

  async guestDuplicate(
    input: GuestHostingCheckoutRequest,
  ): Promise<OrderCreationResult | null> {
    const existing = await this.findBySubmissionKey(input.submissionKey);
    if (!existing) return null;
    const item = existing.items.find((entry) => entry.kind === 'HOSTING');
    if (
      existing.customerEmailSnapshot !== input.email ||
      !item ||
      item.productId !== input.productId ||
      item.productPriceId !== input.priceId ||
      item.requestedDomain !== input.requestedDomain ||
      readHostingProvisioningMode(item.provisioningSnapshot) !== 'STANDARD' ||
      existing.items.some((entry) => entry.kind === 'DOMAIN') ||
      !matchesAddOns(existing.items, input.addOnPriceIds)
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

  private async duplicateResult(
    existing: OrderRecord,
    input: CreateOrderInput,
  ): Promise<OrderCreationResult> {
    const item = existing.items.find((entry) => entry.kind === 'HOSTING');
    const domainItem = existing.items.find((entry) => entry.kind === 'DOMAIN');
    const requestedQuoteId =
      'domainOrder' in input && input.domainOrder?.mode === 'REGISTRATION'
        ? input.domainOrder.quoteId
        : 'domainQuoteId' in input
          ? input.domainQuoteId
          : undefined;
    const selection = 'domainOrder' in input ? input.domainOrder : undefined;
    const snapshot = adminDomainOrderSnapshotSchema.safeParse(
      domainItem?.provisioningSnapshot,
    );
    const domainMode = snapshot.success
      ? snapshot.data.adminDomainAction
      : undefined;
    const registration = domainItem
      ? await this.prisma.domain.findUnique({
          where: { orderItemId: domainItem.id },
        })
      : null;
    if (
      existing.customerId !== input.customerId ||
      item?.productId !== input.productId ||
      item.productPriceId !== input.priceId ||
      item.requestedDomain !== input.requestedDomain ||
      readHostingProvisioningMode(item.provisioningSnapshot) !==
        ('hostingProvisioningMode' in input
          ? (input.hostingProvisioningMode ?? 'STANDARD')
          : 'STANDARD') ||
      (registration?.quoteId ?? undefined) !== requestedQuoteId ||
      domainMode !== selection?.mode ||
      !matchesAddOns(
        existing.items,
        'addOnPriceIds' in input ? input.addOnPriceIds : undefined,
      ) ||
      (selection?.mode === 'EXISTING' &&
        (!snapshot.success ||
          snapshot.data.domainRecordId !== selection.domainId ||
          domainItem?.productPriceId !== selection.priceId))
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

  private async getUnchecked(
    orderId: string,
    transaction?: Prisma.TransactionClient,
  ): Promise<Order> {
    return this.toOrder(await this.getRecord(orderId, transaction));
  }

  private async getRecord(
    orderId: string,
    transaction?: Prisma.TransactionClient,
  ): Promise<OrderRecord> {
    const order = await (transaction ?? this.prisma).order.findUnique({
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
      termsAcceptance:
        order.termsAcceptance == null
          ? undefined
          : checkoutTermsAcceptanceSchema.parse(order.termsAcceptance),
      completedAt: order.completedAt?.toISOString() ?? null,
      cancelledAt: order.cancelledAt?.toISOString() ?? null,
      items: order.items.map((item) => ({
        id: item.id,
        kind: item.kind,
        productId: item.productId,
        productPriceId: item.productPriceId,
        productName: item.productNameSnapshot,
        ...(item.kind === 'DOMAIN' &&
        adminDomainOrderSnapshotSchema.safeParse(item.provisioningSnapshot)
          .success
          ? {
              domainAction: adminDomainOrderSnapshotSchema.parse(
                item.provisioningSnapshot,
              ).adminDomainAction,
              domainId: adminDomainOrderSnapshotSchema.parse(
                item.provisioningSnapshot,
              ).domainRecordId,
            }
          : {}),
        ...(item.kind === 'HOSTING' &&
        readHostingProvisioningMode(item.provisioningSnapshot) ===
          'PRESERVE_EXISTING'
          ? { hostingProvisioningMode: 'PRESERVE_EXISTING' }
          : {}),
        description: item.descriptionSnapshot,
        billingPeriod: item.billingPeriod,
        ...(item.kind === 'ADD_ON'
          ? { fulfilledAt: item.fulfilledAt?.toISOString() ?? null }
          : {}),
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
