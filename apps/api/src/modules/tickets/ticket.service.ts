import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  Prisma,
  TicketMessageKind,
  TicketPriority,
  TicketStatus,
  UserRole,
  UserStatus,
  type PrismaClient,
} from '@webhost-billing/database';
import {
  createPaginationMeta,
  ticketDetailSchema,
  ticketSetupOptionsSchema,
  ticketSummarySchema,
  type CreateTicketRequest,
  type PaginationMeta,
  type ReplyToTicketRequest,
  type TicketDetail,
  type TicketListQuery,
  type TicketSetupOptions,
  type TicketSummary,
  type UpdateTicketRequest,
} from '@webhost-billing/shared';
import { ApplicationException } from '../../common/errors/application.exception';
import { createHumanReadableNumber } from '../../common/identifiers/business-number';
import type { SecurityRequestContext } from '../../common/http/request-context';
import { PRISMA_CLIENT } from '../../infrastructure/database/database.module';
import type { AuthRequestContext } from '../auth/auth.types';

const ticketSummaryInclude = {
  customer: true,
  service: {
    select: {
      id: true,
      productNameSnapshot: true,
      domain: true,
      status: true,
    },
  },
  assignedAdmin: { include: { adminProfile: true } },
  _count: { select: { messages: true } },
} satisfies Prisma.TicketInclude;

const ticketInclude = {
  ...ticketSummaryInclude,
  messages: {
    include: {
      author: { include: { adminProfile: true, customer: true } },
    },
    orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }],
  },
} satisfies Prisma.TicketInclude;

type TicketSummaryRecord = Prisma.TicketGetPayload<{
  include: typeof ticketSummaryInclude;
}>;

type TicketRecord = Prisma.TicketGetPayload<{ include: typeof ticketInclude }>;

@Injectable()
export class TicketService {
  constructor(@Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient) {}

  async list(query: TicketListQuery): Promise<{
    data: TicketSummary[];
    pagination: PaginationMeta;
  }> {
    const where: Prisma.TicketWhereInput = {
      ...(query.customerId ? { customerId: query.customerId } : {}),
      ...(query.serviceId ? { serviceId: query.serviceId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.priority ? { priority: query.priority } : {}),
      ...(query.assignedAdminId
        ? { assignedAdminId: query.assignedAdminId }
        : query.unassigned
          ? { assignedAdminId: null }
          : {}),
      ...(query.search
        ? {
            OR: [
              {
                ticketNumber: {
                  contains: query.search,
                  mode: 'insensitive',
                },
              },
              { subject: { contains: query.search, mode: 'insensitive' } },
              {
                customer: {
                  user: {
                    email: { contains: query.search, mode: 'insensitive' },
                  },
                },
              },
              {
                customer: {
                  companyName: { contains: query.search, mode: 'insensitive' },
                },
              },
              {
                service: {
                  is: {
                    domain: { contains: query.search, mode: 'insensitive' },
                  },
                },
              },
            ],
          }
        : {}),
    };
    const [records, totalItems] = await this.prisma.$transaction([
      this.prisma.ticket.findMany({
        where,
        include: ticketSummaryInclude,
        orderBy: [
          { status: 'asc' },
          { priority: 'desc' },
          { updatedAt: 'desc' },
          { id: 'desc' },
        ],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.ticket.count({ where }),
    ]);
    return {
      data: records.map((record) => this.toSummary(record)),
      pagination: createPaginationMeta(query.page, query.pageSize, totalItems),
    };
  }

  async setupOptions(): Promise<TicketSetupOptions> {
    const admins = await this.prisma.user.findMany({
      where: {
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
        deletedAt: null,
        adminProfile: { isNot: null },
      },
      include: { adminProfile: true },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    return ticketSetupOptionsSchema.parse({
      admins: admins.map((admin) => ({
        userId: admin.id,
        displayName: admin.adminProfile?.displayName ?? 'Administrator',
      })),
    });
  }

  async create(
    input: CreateTicketRequest,
    actor: AuthRequestContext,
    context: SecurityRequestContext,
  ): Promise<TicketDetail> {
    if (actor.identity.role !== 'CUSTOMER') throw new Error('Unreachable role');
    const customerId = actor.identity.customerId;
    const userId = actor.identity.userId;
    const existing = await this.prisma.ticket.findUnique({
      where: { id: input.submissionKey },
      include: ticketInclude,
    });
    if (existing) return this.duplicateCreate(existing, input, actor);

    try {
      await this.prisma.$transaction(async (transaction) => {
        if (input.serviceId) {
          const service = await transaction.service.findFirst({
            where: {
              id: input.serviceId,
              customerId,
            },
            select: { id: true },
          });
          if (!service) {
            throw this.invalid(
              'The selected hosting service is not available to this customer.',
            );
          }
        }
        const now = new Date();
        await transaction.ticket.create({
          data: {
            id: input.submissionKey,
            ticketNumber: createHumanReadableNumber('TKT', now),
            customerId,
            serviceId: input.serviceId ?? null,
            subject: input.subject,
            status: TicketStatus.OPEN,
            priority: TicketPriority.NORMAL,
            lastReplyAt: now,
            messages: {
              create: {
                authorUserId: userId,
                kind: TicketMessageKind.CUSTOMER,
                body: input.body,
                createdAt: now,
              },
            },
          },
        });
        await transaction.activityLog.create({
          data: {
            actorUserId: userId,
            action: 'TICKET_CREATED_BY_CUSTOMER',
            entityType: 'TICKET',
            entityId: input.submissionKey,
            ipAddressHash: context.ipAddressHash,
            metadata: {
              status: TicketStatus.OPEN,
              priority: TicketPriority.NORMAL,
              serviceId: input.serviceId ?? null,
            },
          },
        });
      });
    } catch (error) {
      if (!this.isUniqueConstraintError(error)) throw error;
      const raced = await this.prisma.ticket.findUnique({
        where: { id: input.submissionKey },
        include: ticketInclude,
      });
      if (raced) return this.duplicateCreate(raced, input, actor);
      throw this.conflict('The ticket could not be created safely.');
    }
    return this.get(input.submissionKey, actor);
  }

  async get(
    ticketId: string,
    actor: AuthRequestContext,
  ): Promise<TicketDetail> {
    const ticket = await this.getRecord(ticketId);
    this.assertOwnership(ticket, actor);
    return this.toDetail(ticket);
  }

  async reply(
    ticketId: string,
    input: ReplyToTicketRequest,
    actor: AuthRequestContext,
    context: SecurityRequestContext,
  ): Promise<TicketDetail> {
    const existing = await this.prisma.ticketMessage.findUnique({
      where: { id: input.submissionKey },
    });
    if (existing) {
      if (
        existing.ticketId !== ticketId ||
        existing.authorUserId !== actor.identity.userId ||
        existing.body !== input.body
      ) {
        throw this.conflict('This reply submission key was already used.');
      }
      return this.get(ticketId, actor);
    }

    try {
      await this.prisma.$transaction(async (transaction) => {
        await transaction.$queryRaw`
          SELECT "id"
          FROM "tickets"
          WHERE "id" = ${ticketId}::uuid
          FOR UPDATE
        `;
        const ticket = await transaction.ticket.findUnique({
          where: { id: ticketId },
        });
        if (!ticket) throw this.notFound();
        this.assertOwnership(ticket, actor);
        if (ticket.status === TicketStatus.CLOSED) {
          throw this.invalid(
            'A closed ticket must be reopened by an administrator before replying.',
          );
        }
        const kind =
          actor.identity.role === 'ADMIN'
            ? TicketMessageKind.ADMIN
            : TicketMessageKind.CUSTOMER;
        const status =
          actor.identity.role === 'ADMIN'
            ? TicketStatus.WAITING_FOR_CUSTOMER
            : TicketStatus.WAITING_FOR_STAFF;
        const now = new Date();
        await transaction.ticketMessage.create({
          data: {
            id: input.submissionKey,
            ticketId,
            authorUserId: actor.identity.userId,
            kind,
            body: input.body,
            createdAt: now,
          },
        });
        await transaction.ticket.update({
          where: { id: ticketId },
          data: { status, lastReplyAt: now, closedAt: null },
        });
        await transaction.outboxEvent.create({
          data: {
            aggregateType: 'TICKET',
            aggregateId: ticketId,
            eventType: 'EMAIL_TICKET_REPLY',
            idempotencyKey: `email:ticket-reply:${input.submissionKey}`,
            payload: {
              schemaVersion: 1,
              ticketId,
              messageId: input.submissionKey,
            },
          },
        });
        await transaction.activityLog.create({
          data: {
            actorUserId: actor.identity.userId,
            action:
              actor.identity.role === 'ADMIN'
                ? 'TICKET_REPLIED_BY_ADMIN'
                : 'TICKET_REPLIED_BY_CUSTOMER',
            entityType: 'TICKET',
            entityId: ticketId,
            ipAddressHash: context.ipAddressHash,
            metadata: {
              messageId: input.submissionKey,
              previousStatus: ticket.status,
              status,
            },
          },
        });
      });
    } catch (error) {
      if (!this.isUniqueConstraintError(error)) throw error;
      const raced = await this.prisma.ticketMessage.findUnique({
        where: { id: input.submissionKey },
      });
      if (
        raced?.ticketId === ticketId &&
        raced.authorUserId === actor.identity.userId &&
        raced.body === input.body
      ) {
        return this.get(ticketId, actor);
      }
      throw this.conflict('The ticket reply could not be recorded safely.');
    }
    return this.get(ticketId, actor);
  }

  async update(
    ticketId: string,
    input: UpdateTicketRequest,
    actor: AuthRequestContext,
    context: SecurityRequestContext,
  ): Promise<TicketDetail> {
    await this.prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`
        SELECT "id"
        FROM "tickets"
        WHERE "id" = ${ticketId}::uuid
        FOR UPDATE
      `;
      const ticket = await transaction.ticket.findUnique({
        where: { id: ticketId },
      });
      if (!ticket) throw this.notFound();
      if (input.assignedAdminId) {
        const admin = await transaction.user.findFirst({
          where: {
            id: input.assignedAdminId,
            role: UserRole.ADMIN,
            status: UserStatus.ACTIVE,
            deletedAt: null,
            adminProfile: { isNot: null },
          },
          select: { id: true },
        });
        if (!admin)
          throw this.invalid('The selected administrator is inactive.');
      }
      const now = new Date();
      await transaction.ticket.update({
        where: { id: ticketId },
        data: {
          ...(input.status
            ? {
                status: input.status,
                closedAt: input.status === TicketStatus.CLOSED ? now : null,
              }
            : {}),
          ...(input.priority ? { priority: input.priority } : {}),
          ...(input.assignedAdminId !== undefined
            ? {
                assignedAdmin: input.assignedAdminId
                  ? { connect: { id: input.assignedAdminId } }
                  : { disconnect: true },
              }
            : {}),
        },
      });
      await transaction.activityLog.create({
        data: {
          actorUserId: actor.identity.userId,
          action: 'TICKET_UPDATED_BY_ADMIN',
          entityType: 'TICKET',
          entityId: ticketId,
          ipAddressHash: context.ipAddressHash,
          metadata: {
            changedFields: Object.keys(input).sort(),
            previousStatus: ticket.status,
            status: input.status ?? ticket.status,
            previousPriority: ticket.priority,
            priority: input.priority ?? ticket.priority,
            previousAssignedAdminId: ticket.assignedAdminId,
            assignedAdminId:
              input.assignedAdminId === undefined
                ? ticket.assignedAdminId
                : input.assignedAdminId,
          },
        },
      });
    });
    return this.get(ticketId, actor);
  }

  private duplicateCreate(
    ticket: TicketRecord,
    input: CreateTicketRequest,
    actor: AuthRequestContext,
  ): TicketDetail {
    if (actor.identity.role !== 'CUSTOMER') throw new Error('Unreachable role');
    const identity = actor.identity;
    const initial = ticket.messages[0];
    if (
      ticket.customerId !== identity.customerId ||
      ticket.subject !== input.subject ||
      ticket.serviceId !== (input.serviceId ?? null) ||
      initial?.authorUserId !== identity.userId ||
      initial.body !== input.body
    ) {
      throw this.conflict('This ticket submission key was already used.');
    }
    return this.toDetail(ticket);
  }

  private async getRecord(ticketId: string): Promise<TicketRecord> {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
      include: ticketInclude,
    });
    if (!ticket) throw this.notFound();
    return ticket;
  }

  private assertOwnership(
    ticket: { customerId: string },
    actor: AuthRequestContext,
  ): void {
    const identity = actor.identity;
    if (
      identity.role === 'CUSTOMER' &&
      identity.customerId !== ticket.customerId
    ) {
      throw new ApplicationException({
        status: HttpStatus.FORBIDDEN,
        code: 'FORBIDDEN',
        message: 'You do not have access to this ticket.',
      });
    }
  }

  private toSummary(ticket: TicketSummaryRecord): TicketSummary {
    return ticketSummarySchema.parse({
      id: ticket.id,
      ticketNumber: ticket.ticketNumber,
      customer: {
        id: ticket.customer.id,
        customerNumber: ticket.customer.customerNumber,
        name: this.customerName(ticket.customer),
      },
      service: ticket.service
        ? {
            id: ticket.service.id,
            productName: ticket.service.productNameSnapshot,
            domain: ticket.service.domain,
            status: ticket.service.status,
          }
        : null,
      assignee: ticket.assignedAdmin
        ? {
            userId: ticket.assignedAdmin.id,
            displayName:
              ticket.assignedAdmin.adminProfile?.displayName ?? 'Administrator',
          }
        : null,
      subject: ticket.subject,
      status: ticket.status,
      priority: ticket.priority,
      messageCount: ticket._count.messages,
      lastReplyAt: ticket.lastReplyAt?.toISOString() ?? null,
      closedAt: ticket.closedAt?.toISOString() ?? null,
      createdAt: ticket.createdAt.toISOString(),
      updatedAt: ticket.updatedAt.toISOString(),
    });
  }

  private toDetail(ticket: TicketRecord): TicketDetail {
    return ticketDetailSchema.parse({
      ...this.toSummary(ticket),
      messages: ticket.messages.map((message) => ({
        id: message.id,
        ticketId: message.ticketId,
        authorUserId: message.authorUserId,
        authorName:
          message.author.adminProfile?.displayName ??
          (message.author.customer
            ? this.customerName(message.author.customer)
            : 'System'),
        kind: message.kind,
        body: message.body,
        createdAt: message.createdAt.toISOString(),
      })),
    });
  }

  private customerName(customer: {
    firstName: string;
    lastName: string;
    companyName: string | null;
  }): string {
    return customer.companyName ?? `${customer.firstName} ${customer.lastName}`;
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
      message: 'Ticket was not found.',
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
