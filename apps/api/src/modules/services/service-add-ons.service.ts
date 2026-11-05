import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type {
  OrderItem,
  Prisma,
  PrismaClient,
  Service,
} from '@webhost-billing/database';
import { serializeMoney, type ServiceAddOn } from '@webhost-billing/shared';
import { ApplicationException } from '../../common/errors/application.exception';
import type { SecurityRequestContext } from '../../common/http/request-context';
import { PRISMA_CLIENT } from '../../infrastructure/database/database.module';
import type { AuthRequestContext } from '../auth/auth.types';

type AddOnService = Pick<
  Service,
  'id' | 'status' | 'billingPeriod' | 'currency' | 'nextDueAt'
> & {
  orderItem: { orderId: string } | null;
};

@Injectable()
export class ServiceAddOnsService {
  constructor(@Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient) {}

  async list(
    serviceId: string,
    actor: AuthRequestContext,
    customerId?: string,
  ): Promise<ServiceAddOn[]> {
    if (
      actor.identity.role === 'ADMIN' &&
      actor.identity.staffRole !== 'FULL_ADMINISTRATOR'
    )
      throw this.forbidden();
    const service = await this.ownedService(
      this.prisma,
      serviceId,
      actor.identity.role === 'CUSTOMER' ? this.customerId(actor) : customerId,
    );
    if (
      customerId !== undefined &&
      service.customerId.toLowerCase() !== customerId.toLowerCase()
    )
      throw this.forbidden();
    const rows = await this.findAddOns(this.prisma, service);
    return rows.map((item) =>
      this.serialize(
        item,
        actor.identity.role === 'ADMIN' || actor.supportAdministratorId
          ? null
          : this.availableEndAt(service, item),
      ),
    );
  }

  async cancel(
    serviceId: string,
    addOnId: string,
    expectedEndAt: string,
    actor: AuthRequestContext,
    context: SecurityRequestContext,
  ): Promise<ServiceAddOn> {
    if (actor.supportAdministratorId) throw this.forbidden();
    const customerId = this.customerId(actor);
    return this.prisma.$transaction(async (tx) => {
      // Serialize with renewal issuance and settlement before reading the period.
      await tx.$queryRaw`
        SELECT id FROM services
        WHERE id = ${serviceId}::uuid AND customer_id = ${customerId}::uuid
        FOR UPDATE
      `;
      const service = await this.ownedService(tx, serviceId, customerId);
      const [item] = await this.findAddOns(tx, service, addOnId);
      if (!item) throw this.forbidden();
      if (item.renewalEndsAt) return this.serialize(item, null);

      const endAt = this.availableEndAt(service, item);
      if (!endAt || endAt.getTime() !== Date.parse(expectedEndAt)) {
        throw new ApplicationException({
          status: HttpStatus.CONFLICT,
          code: 'CONFLICT',
          message:
            'The billing period changed. Reload the service and review the cancellation date.',
        });
      }
      const cancelled = await tx.orderItem.update({
        where: { id: item.id },
        data: { renewalEndsAt: endAt },
      });
      await tx.activityLog.create({
        data: {
          actorUserId: actor.identity.userId,
          ipAddressHash: context.ipAddressHash,
          action: 'HOSTING_ADD_ON_RENEWAL_CANCELLED',
          entityType: 'SERVICE',
          entityId: serviceId,
          metadata: {
            orderItemId: item.id,
            renewalEndsAt: endAt.toISOString(),
          },
        },
      });
      return this.serialize(cancelled, null);
    });
  }

  private customerId(actor: AuthRequestContext) {
    if (actor.identity.role !== 'CUSTOMER') throw this.forbidden();
    return actor.identity.customerId;
  }

  private async ownedService(
    db: Pick<Prisma.TransactionClient, 'service'>,
    id: string,
    customerId?: string,
  ): Promise<AddOnService & { customerId: string }> {
    const service = await db.service.findFirst({
      where: { id, ...(customerId ? { customerId } : {}) },
      select: {
        id: true,
        customerId: true,
        status: true,
        billingPeriod: true,
        currency: true,
        nextDueAt: true,
        orderItem: { select: { orderId: true } },
      },
    });
    if (!service) throw this.forbidden();
    return service;
  }

  private async findAddOns(
    db: Pick<Prisma.TransactionClient, 'orderItem'>,
    service: AddOnService,
    id?: string,
  ) {
    if (!service.orderItem) return [];
    return db.orderItem.findMany({
      where: {
        ...(id ? { id } : {}),
        orderId: service.orderItem.orderId,
        kind: 'ADD_ON',
        billingPeriod: service.billingPeriod,
        currency: service.currency,
        fulfilledAt: { not: null },
      },
      orderBy: [{ productNameSnapshot: 'asc' }, { id: 'asc' }],
      include: {
        invoiceItems: {
          where: {
            servicePeriodStart: service.nextDueAt,
            servicePeriodEnd: { not: null },
            invoice: {
              issuedAt: { not: null },
              status: { not: 'CANCELLED' },
              items: {
                some: {
                  serviceId: service.id,
                  servicePeriodStart: service.nextDueAt,
                },
              },
            },
          },
          select: { servicePeriodEnd: true },
          orderBy: { servicePeriodEnd: 'desc' },
          take: 1,
        },
      },
    });
  }

  private availableEndAt(
    service: AddOnService,
    item: Pick<OrderItem, 'renewalEndsAt'> & {
      invoiceItems: { servicePeriodEnd: Date | null }[];
    },
  ): Date | null {
    if (
      item.renewalEndsAt ||
      (service.status !== 'ACTIVE' && service.status !== 'SUSPENDED')
    ) {
      return null;
    }
    return item.invoiceItems[0]?.servicePeriodEnd ?? service.nextDueAt;
  }

  private serialize(
    item: Pick<
      OrderItem,
      'id' | 'productNameSnapshot' | 'currency' | 'lineTotal' | 'renewalEndsAt'
    >,
    availableEndAt: Date | null,
  ): ServiceAddOn {
    return {
      id: item.id,
      name: item.productNameSnapshot,
      recurringAmount: serializeMoney(item.lineTotal, item.currency),
      renewalEndsAt: item.renewalEndsAt?.toISOString() ?? null,
      availableEndAt: availableEndAt?.toISOString() ?? null,
    };
  }

  private forbidden() {
    return new ApplicationException({
      status: HttpStatus.FORBIDDEN,
      code: 'FORBIDDEN',
      message: 'You do not have access to this hosting add-on.',
    });
  }
}
