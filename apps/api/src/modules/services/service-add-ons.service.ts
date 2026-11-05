import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type {
  OrderItem,
  Prisma,
  PrismaClient,
  Service,
} from '@webhost-billing/database';
import {
  serializeMoney,
  type ServiceAddOn,
  type AdminServiceAddOn,
} from '@webhost-billing/shared';
import { z } from 'zod';
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

const completionAction = 'HOSTING_ADD_ON_CANCELLATION_COMPLETED';
const completionMetadataSchema = z
  .object({
    orderItemId: z.uuid(),
    renewalEndsAt: z.iso.datetime(),
    completedByUserId: z.uuid(),
    completedByName: z.string().min(1).max(150),
  })
  .strict();
type Completion = z.infer<typeof completionMetadataSchema> & {
  completedAt: string;
};

@Injectable()
export class ServiceAddOnsService {
  constructor(@Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient) {}

  async list(
    serviceId: string,
    actor: AuthRequestContext,
    customerId?: string,
  ): Promise<ServiceAddOn[] | AdminServiceAddOn[]> {
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
    if (actor.identity.role === 'ADMIN') {
      const completions = rows.some((item) => item.renewalEndsAt)
        ? await this.completions(this.prisma, serviceId)
        : new Map<string, Completion>();
      return rows.map((item) =>
        this.serializeAdmin(item, completions.get(item.id)),
      );
    }
    return rows.map((item) =>
      this.serialize(
        item,
        actor.supportAdministratorId
          ? null
          : this.availableEndAt(service, item),
      ),
    );
  }

  async completeCancellation(
    serviceId: string,
    addOnId: string,
    expectedEndAt: string,
    actor: AuthRequestContext,
    context: SecurityRequestContext,
    customerId?: string,
  ): Promise<AdminServiceAddOn> {
    if (
      actor.identity.role !== 'ADMIN' ||
      actor.identity.staffRole !== 'FULL_ADMINISTRATOR' ||
      actor.supportAdministratorId
    ) {
      throw this.forbidden();
    }
    const completedByUserId = actor.identity.userId;
    const completedByName =
      actor.identity.displayName ?? `Administrator (${completedByUserId})`;
    return this.prisma.$transaction(async (tx) => {
      // Share the service lock with customer cancellation, renewal and settlement.
      await tx.$queryRaw`SELECT id FROM services WHERE id = ${serviceId}::uuid FOR UPDATE`;
      const service = await this.ownedService(tx, serviceId, customerId);
      const [item] = await this.findAddOns(tx, service, addOnId);
      if (!item) throw this.forbidden();
      if (
        !item.renewalEndsAt ||
        item.renewalEndsAt.getTime() !== Date.parse(expectedEndAt)
      ) {
        throw this.conflict(
          'Reload the service and review the recorded add-on cancellation date.',
        );
      }
      const existing = (await this.completions(tx, serviceId)).get(item.id);
      if (existing) return this.serializeAdmin(item, existing);
      const now = new Date();
      if (item.renewalEndsAt > now) {
        throw this.conflict(
          'Completion can only be recorded once the add-on end date has arrived.',
        );
      }
      const metadata = {
        orderItemId: item.id,
        renewalEndsAt: item.renewalEndsAt.toISOString(),
        completedByUserId,
        completedByName,
      };
      const record = await tx.activityLog.create({
        data: {
          actorUserId: completedByUserId,
          ipAddressHash: context.ipAddressHash,
          action: completionAction,
          entityType: 'SERVICE',
          entityId: serviceId,
          createdAt: now,
          metadata,
        },
      });
      return this.serializeAdmin(item, {
        ...metadata,
        completedAt: record.createdAt.toISOString(),
      });
    });
  }

  private async completions(
    db: Pick<Prisma.TransactionClient, 'activityLog'>,
    serviceId: string,
  ) {
    const records = await db.activityLog.findMany({
      where: {
        action: completionAction,
        entityType: 'SERVICE',
        entityId: serviceId,
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { metadata: true, createdAt: true },
    });
    const result = new Map<string, Completion>();
    for (const record of records) {
      const metadata = completionMetadataSchema.parse(record.metadata);
      if (!result.has(metadata.orderItemId))
        result.set(metadata.orderItemId, {
          ...metadata,
          completedAt: record.createdAt.toISOString(),
        });
    }
    return result;
  }

  private serializeAdmin(
    item: Pick<
      OrderItem,
      'id' | 'productNameSnapshot' | 'currency' | 'lineTotal' | 'renewalEndsAt'
    >,
    completion?: Completion,
  ): AdminServiceAddOn {
    if (
      completion &&
      completion.renewalEndsAt !== item.renewalEndsAt?.toISOString()
    ) {
      throw this.conflict(
        'The completion record does not match the add-on cancellation date.',
      );
    }
    return {
      ...this.serialize(item, null),
      manualCompletion: completion
        ? {
            completedAt: completion.completedAt,
            completedByUserId: completion.completedByUserId,
            completedByName: completion.completedByName,
          }
        : null,
    };
  }

  private conflict(message: string) {
    return new ApplicationException({
      status: HttpStatus.CONFLICT,
      code: 'CONFLICT',
      message,
    });
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
