import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  OrderStatus,
  Prisma,
  ServerStatus,
  ServiceStatus,
  type PrismaClient,
} from '@webhost-billing/database';
import {
  createPaginationMeta,
  hostingBillingPeriodSchema,
  serializeMoney,
  serviceCreationResultSchema,
  serviceSchema,
  serviceSetupOptionsSchema,
  type CreateServiceRequest,
  type PaginationMeta,
  type Service,
  type ServiceCreationResult,
  type ServiceListQuery,
  type ServiceSetupOptions,
  type ServiceStatus as SharedServiceStatus,
  type TransitionServiceRequest,
} from '@webhost-billing/shared';
import { ApplicationException } from '../../common/errors/application.exception';
import type { SecurityRequestContext } from '../../common/http/request-context';
import { PRISMA_CLIENT } from '../../infrastructure/database/database.module';
import type { AuthRequestContext } from '../auth/auth.types';
import { SettingsService } from '../settings/settings.service';
import { nextServiceDueAt } from './service-period';

const serviceInclude = {
  customer: { include: { user: { select: { email: true } } } },
  orderItem: {
    include: { order: { select: { id: true, orderNumber: true } } },
  },
  server: true,
} satisfies Prisma.ServiceInclude;

type ServiceRecord = Prisma.ServiceGetPayload<{
  include: typeof serviceInclude;
}>;

const allowedTransitions: Record<SharedServiceStatus, SharedServiceStatus[]> = {
  PENDING: ['PROVISIONING', 'CANCELLED'],
  PROVISIONING: ['ACTIVE', 'PROVISION_FAILED', 'CANCELLED'],
  ACTIVE: ['SUSPENDED', 'TERMINATED'],
  SUSPENDED: ['ACTIVE', 'TERMINATED'],
  PROVISION_FAILED: ['PROVISIONING', 'CANCELLED'],
  CANCELLED: [],
  TERMINATED: [],
};

export function isServiceTransitionAllowed(
  current: SharedServiceStatus,
  next: SharedServiceStatus,
): boolean {
  return allowedTransitions[current].includes(next);
}

@Injectable()
export class ServiceService {
  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient,
    private readonly settings: SettingsService,
  ) {}

  async list(query: ServiceListQuery): Promise<{
    data: Service[];
    pagination: PaginationMeta;
  }> {
    const where: Prisma.ServiceWhereInput = {
      ...(query.customerId ? { customerId: query.customerId } : {}),
      ...(query.serverId ? { serverId: query.serverId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              { domain: { contains: query.search, mode: 'insensitive' } },
              {
                productNameSnapshot: {
                  contains: query.search,
                  mode: 'insensitive',
                },
              },
              {
                customer: {
                  user: {
                    email: { contains: query.search, mode: 'insensitive' },
                  },
                },
              },
              {
                externalAccountId: {
                  contains: query.search,
                  mode: 'insensitive',
                },
              },
            ],
          }
        : {}),
    };
    const [records, totalItems] = await this.prisma.$transaction([
      this.prisma.service.findMany({
        where,
        include: serviceInclude,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.service.count({ where }),
    ]);
    return {
      data: records.map((record) => this.toService(record)),
      pagination: createPaginationMeta(query.page, query.pageSize, totalItems),
    };
  }

  async get(serviceId: string, actor: AuthRequestContext): Promise<Service> {
    const service = await this.getRecord(serviceId);
    if (
      actor.identity.role === 'CUSTOMER' &&
      actor.identity.customerId !== service.customerId
    ) {
      throw new ApplicationException({
        status: HttpStatus.FORBIDDEN,
        code: 'FORBIDDEN',
        message: 'You do not have access to this service.',
      });
    }
    return this.toService(service);
  }

  async setupOptions(): Promise<ServiceSetupOptions> {
    const activeAdapter = await this.settings.activeHostingPanelAdapter();
    const [servers, orderItems] = await this.prisma.$transaction([
      this.prisma.server.findMany({
        where: {
          status: ServerStatus.ACTIVE,
          adapterKey: activeAdapter,
          deletedAt: null,
        },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.orderItem.findMany({
        where: {
          requestedDomain: { not: null },
          billingPeriod: { in: ['MONTHLY', 'QUARTERLY', 'ANNUAL'] },
          service: { is: null },
          order: { status: { in: [OrderStatus.PAID, OrderStatus.PROCESSING] } },
        },
        include: {
          order: {
            include: {
              customer: true,
            },
          },
        },
        orderBy: { createdAt: 'asc' },
      }),
    ]);
    return serviceSetupOptionsSchema.parse({
      servers: servers.map((server) => this.serverSummary(server)),
      orderItems: orderItems.map((item) => ({
        orderItemId: item.id,
        orderId: item.orderId,
        orderNumber: item.order.orderNumber,
        customerId: item.order.customerId,
        customerName:
          item.order.customer.companyName ??
          `${item.order.customer.firstName} ${item.order.customer.lastName}`,
        productName: item.productNameSnapshot,
        domain: item.requestedDomain,
        billingPeriod: item.billingPeriod,
        recurringAmount: serializeMoney(item.unitAmount, item.currency),
      })),
    });
  }

  async create(
    input: CreateServiceRequest,
    actor: AuthRequestContext,
    context: SecurityRequestContext,
  ): Promise<ServiceCreationResult> {
    const activeAdapter = await this.settings.activeHostingPanelAdapter();
    const duplicate = await this.prisma.service.findUnique({
      where: { orderItemId: input.orderItemId },
      include: serviceInclude,
    });
    if (duplicate) return this.duplicateResult(duplicate, input);

    try {
      const serviceId = await this.prisma.$transaction(async (transaction) => {
        await transaction.$queryRaw`
          SELECT "id"
          FROM "order_items"
          WHERE "id" = ${input.orderItemId}::uuid
          FOR UPDATE
        `;
        const item = await transaction.orderItem.findUnique({
          where: { id: input.orderItemId },
          include: { order: true, service: true },
        });
        if (!item || item.service) {
          throw this.conflict(
            'This order item already has a service or is unavailable.',
          );
        }
        if (
          item.order.status !== OrderStatus.PAID &&
          item.order.status !== OrderStatus.PROCESSING
        ) {
          throw this.invalid(
            'A service can be created only from a paid order awaiting fulfilment.',
          );
        }
        if (!item.requestedDomain) {
          throw this.invalid('The order item does not have a hosting domain.');
        }
        await transaction.$queryRaw`
          SELECT "id"
          FROM "servers"
          WHERE "id" = ${input.serverId}::uuid
          FOR UPDATE
        `;
        const server = await transaction.server.findFirst({
          where: {
            id: input.serverId,
            adapterKey: activeAdapter,
            status: ServerStatus.ACTIVE,
            deletedAt: null,
          },
        });
        if (!server) throw this.invalid('The selected server is not active.');
        if (server.maxAccounts !== null) {
          const assigned = await transaction.service.count({
            where: {
              serverId: server.id,
              status: {
                notIn: [ServiceStatus.CANCELLED, ServiceStatus.TERMINATED],
              },
            },
          });
          if (assigned >= server.maxAccounts) {
            throw this.invalid(
              'The selected server has reached its account limit.',
            );
          }
        }
        const billingPeriod = hostingBillingPeriodSchema.parse(
          item.billingPeriod,
        );
        const startedAt = new Date();
        const nextDueAt = nextServiceDueAt(startedAt, billingPeriod);
        const created = await transaction.service.create({
          data: {
            customerId: item.order.customerId,
            orderItemId: item.id,
            productId: item.productId,
            productPriceId: item.productPriceId,
            serverId: server.id,
            status: ServiceStatus.PENDING,
            domain: item.requestedDomain,
            productNameSnapshot: item.productNameSnapshot,
            productDescriptionSnapshot: item.descriptionSnapshot,
            ...(item.provisioningSnapshot !== null
              ? {
                  provisioningSnapshot: item.provisioningSnapshot,
                }
              : {}),
            billingPeriod: item.billingPeriod,
            recurringAmount: item.unitAmount,
            currency: item.currency,
            startedAt,
            nextDueAt,
          },
        });
        if (item.order.status === OrderStatus.PAID) {
          await transaction.order.update({
            where: { id: item.orderId },
            data: { status: OrderStatus.PROCESSING },
          });
        }
        await transaction.activityLog.create({
          data: {
            actorUserId: actor.identity.userId,
            action: 'SERVICE_CREATED_FROM_PAID_ORDER',
            entityType: 'SERVICE',
            entityId: created.id,
            ipAddressHash: context.ipAddressHash,
            metadata: {
              orderId: item.orderId,
              orderItemId: item.id,
              customerId: item.order.customerId,
              productId: item.productId,
              productPriceId: item.productPriceId,
              serverId: server.id,
              status: ServiceStatus.PENDING,
            },
          },
        });
        return created.id;
      });
      return serviceCreationResultSchema.parse({
        service: this.toService(await this.getRecord(serviceId)),
        duplicate: false,
      });
    } catch (error) {
      if (!this.isUniqueConstraintError(error)) throw error;
      const raced = await this.prisma.service.findUnique({
        where: { orderItemId: input.orderItemId },
        include: serviceInclude,
      });
      if (raced) return this.duplicateResult(raced, input);
      throw this.conflict('The service could not be created safely.');
    }
  }

  async transition(
    serviceId: string,
    input: TransitionServiceRequest,
    actor: AuthRequestContext,
    context: SecurityRequestContext,
  ): Promise<Service> {
    await this.prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`
        SELECT "id"
        FROM "services"
        WHERE "id" = ${serviceId}::uuid
        FOR UPDATE
      `;
      const current = await transaction.service.findUnique({
        where: { id: serviceId },
        include: { server: true, orderItem: true },
      });
      if (!current) throw this.notFound();
      if (!isServiceTransitionAllowed(current.status, input.status)) {
        throw this.invalid(
          `Service cannot move from ${current.status} to ${input.status}.`,
        );
      }
      if (
        input.status === ServiceStatus.PROVISIONING &&
        (current.server.status !== ServerStatus.ACTIVE ||
          current.server.deletedAt !== null)
      ) {
        throw this.invalid('The assigned server is not active.');
      }

      const now = new Date();
      const data = this.transitionData(current, input, actor, now);
      await transaction.service.update({ where: { id: serviceId }, data });
      const emailEventType =
        input.status === ServiceStatus.SUSPENDED
          ? 'EMAIL_SERVICE_SUSPENDED'
          : input.status === ServiceStatus.ACTIVE
            ? current.status === ServiceStatus.SUSPENDED
              ? 'EMAIL_SERVICE_REACTIVATED'
              : 'EMAIL_SERVICE_PROVISIONED'
            : null;
      if (emailEventType) {
        await transaction.outboxEvent.create({
          data: {
            aggregateType: 'SERVICE',
            aggregateId: serviceId,
            eventType: emailEventType,
            idempotencyKey: `email:service-transition:${serviceId}:${current.updatedAt.toISOString()}:${input.status}`,
            payload: { schemaVersion: 1, serviceId },
          },
        });
      }
      if (input.status === ServiceStatus.ACTIVE && current.orderItem) {
        const remaining = await transaction.orderItem.count({
          where: {
            orderId: current.orderItem.orderId,
            OR: [
              { service: { is: null } },
              { service: { is: { status: { not: ServiceStatus.ACTIVE } } } },
            ],
          },
        });
        if (remaining === 0) {
          await transaction.order.updateMany({
            where: {
              id: current.orderItem.orderId,
              status: OrderStatus.PROCESSING,
            },
            data: { status: OrderStatus.COMPLETED, completedAt: now },
          });
        }
      }
      await transaction.activityLog.create({
        data: {
          actorUserId: actor.identity.userId,
          action: 'SERVICE_STATUS_CHANGED_BY_ADMIN',
          entityType: 'SERVICE',
          entityId: serviceId,
          ipAddressHash: context.ipAddressHash,
          metadata: {
            previousStatus: current.status,
            status: input.status,
            ...(input.status === 'SUSPENDED' ||
            input.status === 'PROVISION_FAILED' ||
            input.status === 'CANCELLED' ||
            input.status === 'TERMINATED'
              ? { reason: input.reason }
              : {}),
          },
        },
      });
    });
    return this.toService(await this.getRecord(serviceId));
  }

  private transitionData(
    current: {
      externalAccountId: string | null;
      controlPanelUsername: string | null;
      activatedAt: Date | null;
    },
    input: TransitionServiceRequest,
    actor: AuthRequestContext,
    now: Date,
  ): Prisma.ServiceUpdateInput {
    if (input.status === 'PROVISIONING') {
      return {
        status: ServiceStatus.PROVISIONING,
        provisioningFailureReason: null,
      };
    }
    if (input.status === 'ACTIVE') {
      const externalAccountId =
        input.externalAccountId ?? current.externalAccountId;
      const controlPanelUsername =
        input.controlPanelUsername ?? current.controlPanelUsername;
      if (!externalAccountId || !controlPanelUsername) {
        throw this.invalid(
          'Activation requires an external account ID and control-panel username.',
        );
      }
      return {
        status: ServiceStatus.ACTIVE,
        externalAccountId,
        controlPanelUsername,
        activatedAt: current.activatedAt ?? now,
        provisioningFailureReason: null,
        suspensionInvoice: { disconnect: true },
      };
    }
    if (input.status === 'SUSPENDED') {
      return {
        status: ServiceStatus.SUSPENDED,
        suspendedAt: now,
        suspensionReason: input.reason,
        suspensionInvoice: { disconnect: true },
      };
    }
    if (input.status === 'PROVISION_FAILED') {
      return {
        status: ServiceStatus.PROVISION_FAILED,
        provisioningFailureReason: input.reason,
      };
    }
    if (input.status === 'CANCELLED') {
      return {
        status: ServiceStatus.CANCELLED,
        cancelledAt: now,
        cancellationReason: input.reason,
      };
    }
    return {
      status: ServiceStatus.TERMINATED,
      terminatedAt: now,
      terminationReason: input.reason,
      terminatedBy: { connect: { id: actor.identity.userId } },
    };
  }

  private duplicateResult(
    existing: ServiceRecord,
    input: CreateServiceRequest,
  ): ServiceCreationResult {
    if (existing.serverId !== input.serverId) {
      throw this.conflict(
        'This order item already has a service on another server.',
      );
    }
    return serviceCreationResultSchema.parse({
      service: this.toService(existing),
      duplicate: true,
    });
  }

  private async getRecord(serviceId: string): Promise<ServiceRecord> {
    const service = await this.prisma.service.findUnique({
      where: { id: serviceId },
      include: serviceInclude,
    });
    if (!service) throw this.notFound();
    return service;
  }

  private toService(service: ServiceRecord): Service {
    const customerName =
      service.customer.companyName ??
      `${service.customer.firstName} ${service.customer.lastName}`;
    return serviceSchema.parse({
      id: service.id,
      customerId: service.customerId,
      customerName,
      customerEmail: service.customer.user.email,
      orderId: service.orderItem?.order.id ?? null,
      orderNumber: service.orderItem?.order.orderNumber ?? null,
      orderItemId: service.orderItemId,
      productId: service.productId,
      productPriceId: service.productPriceId,
      productName: service.productNameSnapshot,
      productDescription: service.productDescriptionSnapshot,
      server: this.serverSummary(service.server),
      status: service.status,
      domain: service.domain,
      controlPanelUsername: service.controlPanelUsername,
      externalAccountId: service.externalAccountId,
      billingPeriod: service.billingPeriod,
      recurringAmount: serializeMoney(
        service.recurringAmount,
        service.currency,
      ),
      startedAt: service.startedAt.toISOString(),
      nextDueAt: service.nextDueAt.toISOString(),
      activatedAt: service.activatedAt?.toISOString() ?? null,
      suspendedAt: service.suspendedAt?.toISOString() ?? null,
      suspensionReason: service.suspensionReason,
      provisioningFailureReason: service.provisioningFailureReason,
      cancelledAt: service.cancelledAt?.toISOString() ?? null,
      cancellationReason: service.cancellationReason,
      terminatedAt: service.terminatedAt?.toISOString() ?? null,
      terminationReason: service.terminationReason,
      createdAt: service.createdAt.toISOString(),
      updatedAt: service.updatedAt.toISOString(),
    });
  }

  private serverSummary(server: {
    id: string;
    name: string;
    hostname: string;
    status: ServerStatus;
    adapterKey: string;
  }) {
    return {
      id: server.id,
      name: server.name,
      hostname: server.hostname,
      status: server.status,
      adapterKey: server.adapterKey,
    };
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'P2002'
    );
  }

  private notFound(): ApplicationException {
    return new ApplicationException({
      status: HttpStatus.NOT_FOUND,
      code: 'RESOURCE_NOT_FOUND',
      message: 'Service was not found.',
    });
  }

  private invalid(message: string): ApplicationException {
    return new ApplicationException({
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      code: 'UNPROCESSABLE_ENTITY',
      message,
    });
  }

  private conflict(message: string): ApplicationException {
    return new ApplicationException({
      status: HttpStatus.CONFLICT,
      code: 'CONFLICT',
      message,
    });
  }
}
