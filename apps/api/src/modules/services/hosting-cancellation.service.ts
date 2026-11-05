import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type {
  HostingCancellationRequest,
  Prisma,
  PrismaClient,
} from '@webhost-billing/database';
import {
  createPaginationMeta,
  type HostingCancellation,
  type HostingCancellationInput,
  type PaginationQuery,
} from '@webhost-billing/shared';
import { ApplicationException } from '../../common/errors/application.exception';
import type { SecurityRequestContext } from '../../common/http/request-context';
import { PRISMA_CLIENT } from '../../infrastructure/database/database.module';
import type { AuthRequestContext } from '../auth/auth.types';

@Injectable()
export class HostingCancellationService {
  constructor(@Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient) {}

  async detail(serviceId: string, actor: AuthRequestContext) {
    await this.ownedService(this.prisma, serviceId, actor);
    const request = await this.prisma.hostingCancellationRequest.findFirst({
      where: { serviceId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    return request ? this.serialize(request) : null;
  }

  async list({ page, pageSize }: PaginationQuery) {
    const where = { status: 'OPEN' } as const;
    const [rows, count] = await this.prisma.$transaction([
      this.prisma.hostingCancellationRequest.findMany({
        where,
        include: {
          service: { select: { productNameSnapshot: true, domain: true } },
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.hostingCancellationRequest.count({ where }),
    ]);
    return {
      data: rows.map((row) => ({
        ...this.serialize(row),
        productName: row.service.productNameSnapshot,
        domain: row.service.domain,
      })),
      pagination: createPaginationMeta(page, pageSize, count),
    };
  }

  async request(
    serviceId: string,
    input: HostingCancellationInput,
    actor: AuthRequestContext,
    context: SecurityRequestContext,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx, serviceId);
      const service = await this.ownedService(tx, serviceId, actor);
      if (
        await tx.serviceUpgrade.count({
          where: {
            serviceId,
            status: {
              in: ['REQUESTED', 'SCHEDULED', 'APPLYING', 'REVIEW_REQUIRED'],
            },
          },
        })
      )
        throw this.invalid(
          'Resolve the pending hosting upgrade before requesting cancellation.',
        );
      const existing = await tx.hostingCancellationRequest.findFirst({
        where: { serviceId, status: { in: ['OPEN', 'COMPLETED'] } },
      });
      const reason = input.reason || null;
      if (existing) {
        if (
          existing.status === 'OPEN' &&
          existing.timing === input.timing &&
          existing.reason === reason
        )
          return this.serialize(existing);
        throw this.invalid('This service already has a cancellation request.');
      }
      if (service.status !== 'ACTIVE' && service.status !== 'SUSPENDED')
        throw this.invalid(
          'This service cannot be cancelled in its current state.',
        );
      const effectiveAt =
        input.timing === 'END_OF_PERIOD' ? service.nextDueAt : null;
      if (
        input.timing === 'END_OF_PERIOD' &&
        Date.parse(input.expectedEffectiveAt) !== service.nextDueAt.getTime()
      )
        throw this.invalid(
          'The billing date changed. Reload the service and review the new date.',
        );
      if (effectiveAt && effectiveAt <= new Date())
        throw this.invalid(
          'This billing period has ended. Select immediate review.',
        );
      const request = await tx.hostingCancellationRequest.create({
        data: { serviceId, timing: input.timing, reason, effectiveAt },
      });
      await tx.outboxEvent.create({
        data: {
          aggregateType: 'SERVICE',
          aggregateId: serviceId,
          eventType: 'EMAIL_HOSTING_CANCELLATION_REQUESTED',
          idempotencyKey: `email:hosting-cancellation:${request.id}`,
          payload: { schemaVersion: 1, cancellationId: request.id },
        },
      });
      if (effectiveAt) await this.queueSuspension(tx, request, effectiveAt);
      await this.audit(tx, request, 'REQUESTED', actor, context);
      return this.serialize(request);
    });
  }

  async withdraw(
    serviceId: string,
    cancellationId: string,
    actor: AuthRequestContext,
    context: SecurityRequestContext,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx, serviceId);
      await this.ownedService(tx, serviceId, actor);
      const request = await this.findRequest(tx, serviceId, cancellationId);
      if (request.status === 'WITHDRAWN') return this.serialize(request);
      const now = new Date();
      if (
        request.status !== 'OPEN' ||
        request.approvedAt ||
        (request.effectiveAt && request.effectiveAt <= now)
      ) {
        throw this.invalid('This cancellation can no longer be withdrawn.');
      }
      const withdrawn = await tx.hostingCancellationRequest.update({
        where: { id: request.id },
        data: { status: 'WITHDRAWN', resolvedAt: now },
      });
      await this.audit(tx, withdrawn, 'WITHDRAWN', actor, context);
      return this.serialize(withdrawn);
    });
  }

  async approve(
    serviceId: string,
    cancellationId: string,
    actor: AuthRequestContext,
    context: SecurityRequestContext,
  ) {
    if (
      actor.identity.role !== 'ADMIN' ||
      actor.identity.staffRole !== 'FULL_ADMINISTRATOR'
    )
      throw this.forbidden();
    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx, serviceId);
      const request = await this.findRequest(tx, serviceId, cancellationId);
      if (request.approvedAt) return this.serialize(request);
      if (request.status !== 'OPEN' || request.timing !== 'IMMEDIATE')
        throw this.invalid('Only a pending immediate request can be approved.');
      const now = new Date();
      const approved = await tx.hostingCancellationRequest.update({
        where: { id: request.id },
        data: { approvedAt: now },
      });
      await this.queueSuspension(tx, approved, now);
      await this.audit(tx, approved, 'APPROVED', actor, context);
      return this.serialize(approved);
    });
  }

  private async ownedService(
    db: Pick<PrismaClient, 'service'>,
    serviceId: string,
    actor: AuthRequestContext,
  ) {
    const service = await db.service.findUnique({ where: { id: serviceId } });
    if (
      !service ||
      actor.identity.role !== 'CUSTOMER' ||
      service.customerId !== actor.identity.customerId
    )
      throw this.forbidden();
    return service;
  }

  private async findRequest(
    tx: Prisma.TransactionClient,
    serviceId: string,
    id: string,
  ) {
    const request = await tx.hostingCancellationRequest.findFirst({
      where: { id, serviceId },
    });
    if (!request) throw this.invalid('Cancellation request was not found.');
    return request;
  }

  private async lock(tx: Prisma.TransactionClient, serviceId: string) {
    await tx.$queryRaw`SELECT id FROM services WHERE id = ${serviceId}::uuid FOR UPDATE`;
  }

  private async queueSuspension(
    tx: Prisma.TransactionClient,
    request: HostingCancellationRequest,
    availableAt: Date,
  ) {
    await tx.outboxEvent.create({
      data: {
        aggregateType: 'SERVICE',
        aggregateId: request.serviceId,
        eventType: 'HOSTING_CANCELLATION_SUSPENSION_REQUESTED',
        availableAt,
        idempotencyKey: `hosting-cancellation:${request.id}`,
        payload: {
          schemaVersion: 1,
          serviceId: request.serviceId,
          cancellationId: request.id,
        },
      },
    });
  }

  private async audit(
    tx: Prisma.TransactionClient,
    request: HostingCancellationRequest,
    action: 'REQUESTED' | 'WITHDRAWN' | 'APPROVED',
    actor: AuthRequestContext,
    context: SecurityRequestContext,
  ) {
    await tx.activityLog.create({
      data: {
        actorUserId: actor.identity.userId,
        ipAddressHash: context.ipAddressHash,
        action: `HOSTING_CANCELLATION_${action}`,
        entityType: 'SERVICE',
        entityId: request.serviceId,
        metadata: { cancellationId: request.id, timing: request.timing },
      },
    });
  }

  private serialize(request: HostingCancellationRequest): HostingCancellation {
    return {
      ...request,
      effectiveAt: request.effectiveAt?.toISOString() ?? null,
      approvedAt: request.approvedAt?.toISOString() ?? null,
      createdAt: request.createdAt.toISOString(),
      resolvedAt: request.resolvedAt?.toISOString() ?? null,
    };
  }

  private forbidden() {
    return new ApplicationException({
      status: HttpStatus.FORBIDDEN,
      code: 'FORBIDDEN',
      message: 'You do not have access to this service.',
    });
  }

  private invalid(message: string) {
    return new ApplicationException({
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      code: 'UNPROCESSABLE_ENTITY',
      message,
    });
  }
}
