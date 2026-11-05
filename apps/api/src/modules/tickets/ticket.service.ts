import { randomUUID } from 'node:crypto';
import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  Prisma,
  supportDepartmentAccess,
  supportStaffWhere,
  TicketMessageKind,
  TicketPriority,
  TicketStatus,
  type PrismaClient,
} from '@webhost-billing/database';
import {
  createPaginationMeta,
  defaultSupportDepartmentId,
  supportDepartmentSchema,
  supportDepartmentOptionSchema,
  type SaveSupportDepartment,
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
  department: true,
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
  _count: { select: { messages: { where: { kind: { not: 'SYSTEM' } } } } },
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

  async list(
    query: TicketListQuery,
    actor: AuthRequestContext,
  ): Promise<{
    data: TicketSummary[];
    pagination: PaginationMeta;
  }> {
    this.assertTicketRole(actor);
    const identity = actor.identity;
    const where: Prisma.TicketWhereInput = {
      ...(identity.role === 'CUSTOMER'
        ? { customerId: identity.customerId }
        : identity.staffRole !== 'FULL_ADMINISTRATOR'
          ? { department: supportDepartmentAccess(identity.userId) }
          : {}),
      ...(query.departmentId ? { departmentId: query.departmentId } : {}),
      ...(identity.role === 'ADMIN' && query.customerId
        ? { customerId: query.customerId }
        : {}),
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

  async setupOptions(actor: AuthRequestContext): Promise<TicketSetupOptions> {
    this.assertStaffActor(actor);
    const admins = await this.prisma.user.findMany({
      where: supportStaffWhere(defaultSupportDepartmentId, false),
      include: { adminProfile: true },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    return ticketSetupOptionsSchema.parse({
      departments: await this.departments(actor),
      canManageDepartments:
        actor.identity.role === 'ADMIN' &&
        actor.identity.staffRole === 'FULL_ADMINISTRATOR' &&
        actor.identity.twoFactorEnabled,
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
        const department = await this.lockDepartment(
          transaction,
          input.departmentId ?? defaultSupportDepartmentId,
        );
        if (!department.enabled || !department.customerVisible)
          throw this.invalid(
            'This department is not open for new customer tickets.',
          );
        const now = new Date();
        await transaction.ticket.create({
          data: {
            id: input.submissionKey,
            ticketNumber: createHumanReadableNumber('TKT', now),
            customerId,
            departmentId: department.id,
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
        const initial = await transaction.ticketMessage.findFirstOrThrow({
          where: { ticketId: input.submissionKey },
          select: { id: true },
        });
        await transaction.outboxEvent.create({
          data: {
            aggregateType: 'TICKET',
            aggregateId: input.submissionKey,
            eventType: 'EMAIL_TICKET_REPLY',
            idempotencyKey: `email:ticket-created:${input.submissionKey}`,
            payload: {
              schemaVersion: 1,
              ticketId: input.submissionKey,
              messageId: initial.id,
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
              departmentId: department.id,
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
    customerId?: string,
  ): Promise<TicketDetail> {
    const ticket = await this.getRecord(ticketId);
    if (
      customerId &&
      ticket.customerId.toLowerCase() !== customerId.toLowerCase()
    )
      throw this.notFound();
    await this.assertAccess(this.prisma, ticket, actor);
    return this.toDetail(ticket, actor);
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
        await this.lockDepartment(transaction, ticket.departmentId);
        await this.assertAccess(transaction, ticket, actor);
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
    this.assertStaffActor(actor);
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
      for (const id of [
        ...new Set([
          ticket.departmentId,
          input.departmentId ?? ticket.departmentId,
        ]),
      ].sort())
        await this.lockDepartment(transaction, id);
      const department = await transaction.supportDepartment.findUniqueOrThrow({
        where: { id: input.departmentId ?? ticket.departmentId },
      });
      await this.assertAccess(transaction, ticket, actor);
      if (input.departmentId && input.departmentId !== ticket.departmentId) {
        if (!input.routingReason)
          throw this.invalid(
            'A support reason is required to change the department.',
          );
        if (!department.enabled)
          throw this.invalid('The target department is disabled.');
        await this.assertAccess(
          transaction,
          { ...ticket, departmentId: department.id },
          actor,
        );
      }
      let assignedAdminId =
        input.assignedAdminId === undefined
          ? ticket.assignedAdminId
          : input.assignedAdminId;
      if (
        assignedAdminId &&
        !(await transaction.user.findFirst({
          where: {
            id: assignedAdminId,
            ...supportStaffWhere(department.id, department.restricted),
          },
          select: { id: true },
        }))
      ) {
        if (input.assignedAdminId)
          throw this.invalid(
            'The selected administrator does not have department access.',
          );
        assignedAdminId = null;
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
          departmentId: department.id,
          assignedAdminId,
        },
      });
      if (department.id !== ticket.departmentId) {
        const latestCustomerMessage = await transaction.ticketMessage.findFirst(
          {
            where: { ticketId, kind: 'CUSTOMER' },
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            select: { id: true },
          },
        );
        if (latestCustomerMessage)
          await transaction.outboxEvent.create({
            data: {
              aggregateType: 'TICKET',
              aggregateId: ticketId,
              eventType: 'EMAIL_TICKET_REPLY',
              idempotencyKey: `email:ticket-routed:${randomUUID()}`,
              payload: {
                schemaVersion: 1,
                ticketId,
                messageId: latestCustomerMessage.id,
              },
            },
          });
      }
      await transaction.activityLog.create({
        data: {
          actorUserId: actor.identity.userId,
          action: 'TICKET_UPDATED_BY_ADMIN',
          entityType: 'TICKET',
          entityId: ticketId,
          ipAddressHash: context.ipAddressHash,
          metadata: {
            changedFields: Object.keys(input).sort(),
            previousDepartmentId: ticket.departmentId,
            departmentId: department.id,
            routingReason: input.routingReason ?? null,
            previousStatus: ticket.status,
            status: input.status ?? ticket.status,
            previousPriority: ticket.priority,
            priority: input.priority ?? ticket.priority,
            previousAssignedAdminId: ticket.assignedAdminId,
            assignedAdminId,
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
      ticket.departmentId !==
        (input.departmentId ?? defaultSupportDepartmentId) ||
      initial?.authorUserId !== identity.userId ||
      initial.body !== input.body
    ) {
      throw this.conflict('This ticket submission key was already used.');
    }
    return this.toDetail(ticket, actor);
  }

  private async getRecord(ticketId: string): Promise<TicketRecord> {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
      include: ticketInclude,
    });
    if (!ticket) throw this.notFound();
    return ticket;
  }

  private assertStaffActor(actor: AuthRequestContext) {
    this.assertTicketRole(actor);
    if (actor.identity.role !== 'ADMIN')
      throw new ApplicationException({
        status: HttpStatus.FORBIDDEN,
        code: 'FORBIDDEN',
        message: 'Support staff access is required.',
      });
  }

  private assertTicketRole(actor: AuthRequestContext) {
    if (
      actor.identity.role === 'ADMIN' &&
      (!['FULL_ADMINISTRATOR', 'SUPPORT_OPERATOR'].includes(
        actor.identity.staffRole,
      ) ||
        (actor.identity.staffRole === 'SUPPORT_OPERATOR' &&
          !actor.identity.twoFactorEnabled))
    )
      throw new ApplicationException({
        status: HttpStatus.FORBIDDEN,
        code: 'FORBIDDEN',
        message: 'Support access is required.',
      });
  }

  private async assertAccess(
    db: Prisma.TransactionClient,
    ticket: { customerId: string; departmentId: string },
    actor: AuthRequestContext,
  ): Promise<void> {
    this.assertTicketRole(actor);
    const identity = actor.identity;
    const allowed =
      identity.role === 'CUSTOMER'
        ? identity.customerId === ticket.customerId
        : !!(await db.user.findFirst({
            where: {
              id: identity.userId,
              ...supportStaffWhere(
                ticket.departmentId,
                (
                  await db.supportDepartment.findUniqueOrThrow({
                    where: { id: ticket.departmentId },
                  })
                ).restricted,
              ),
            },
            select: { id: true },
          }));
    if (!allowed)
      throw new ApplicationException({
        status: HttpStatus.FORBIDDEN,
        code: 'FORBIDDEN',
        message: 'You do not have access to this ticket.',
      });
  }

  private async lockDepartment(db: Prisma.TransactionClient, id: string) {
    await db.$queryRaw`SELECT id FROM support_departments WHERE id = ${id}::uuid FOR UPDATE`;
    const department = await db.supportDepartment.findUnique({ where: { id } });
    if (!department)
      throw this.invalid('The selected department is unavailable.');
    return department;
  }

  async departments(actor: AuthRequestContext) {
    this.assertTicketRole(actor);
    const identity = actor.identity;
    const departments = await this.prisma.supportDepartment.findMany({
      where:
        identity.role === 'CUSTOMER'
          ? { enabled: true, customerVisible: true }
          : identity.staffRole === 'FULL_ADMINISTRATOR'
            ? {}
            : supportDepartmentAccess(identity.userId),
      include: { members: true },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    return departments.map((department) =>
      identity.role === 'CUSTOMER'
        ? supportDepartmentOptionSchema.parse(this.departmentOption(department))
        : supportDepartmentSchema.parse({
            ...this.departmentOption(department),
            restricted: department.restricted,
            revision: department.revision,
            memberUserIds: department.members.map((member) => member.userId),
          }),
    );
  }

  async saveDepartment(
    id: string | undefined,
    input: SaveSupportDepartment,
    actor: AuthRequestContext,
    context: SecurityRequestContext,
  ) {
    if (
      actor.identity.role !== 'ADMIN' ||
      actor.identity.staffRole !== 'FULL_ADMINISTRATOR' ||
      !actor.identity.twoFactorEnabled
    )
      throw new ApplicationException({
        status: HttpStatus.FORBIDDEN,
        code: 'FORBIDDEN',
        message: 'A full administrator with two-step verification is required.',
      });
    try {
      return await this.prisma.$transaction(async (tx) => {
        const previous = id ? await this.lockDepartment(tx, id) : null;
        if (previous && previous.revision !== input.revision)
          throw this.conflict('The department changed. Reload before saving.');
        const count = await tx.user.count({
          where: {
            id: { in: input.memberUserIds },
            role: 'ADMIN',
            status: 'ACTIVE',
            deletedAt: null,
            adminProfile: {
              is: {
                staffRole: { in: ['FULL_ADMINISTRATOR', 'SUPPORT_OPERATOR'] },
              },
            },
          },
        });
        if (count !== input.memberUserIds.length)
          throw this.invalid('Choose active staff with support access.');
        const data = {
          name: input.name,
          enabled: input.enabled,
          customerVisible: input.customerVisible,
          restricted: input.restricted,
        };
        const department = previous
          ? await tx.supportDepartment.update({
              where: { id: previous.id },
              data: { ...data, revision: { increment: 1 } },
            })
          : await tx.supportDepartment.create({ data });
        const previousMembers = await tx.supportDepartmentMember.findMany({
          where: { departmentId: department.id },
          select: { userId: true },
        });
        await tx.supportDepartmentMember.deleteMany({
          where: { departmentId: department.id },
        });
        await tx.supportDepartmentMember.createMany({
          data: input.memberUserIds.map((userId) => ({
            userId,
            departmentId: department.id,
          })),
        });
        await tx.activityLog.create({
          data: {
            actorUserId: actor.identity.userId,
            action: previous
              ? 'SUPPORT_DEPARTMENT_UPDATED'
              : 'SUPPORT_DEPARTMENT_CREATED',
            entityType: 'SUPPORT_DEPARTMENT',
            entityId: department.id,
            ipAddressHash: context.ipAddressHash,
            metadata: {
              reason: input.reason,
              previous: previous
                ? {
                    ...this.departmentOption(previous),
                    restricted: previous.restricted,
                    memberUserIds: previousMembers.map(
                      (member) => member.userId,
                    ),
                  }
                : null,
              current: { ...data, memberUserIds: input.memberUserIds },
              revision: department.revision,
            },
          },
        });
        return supportDepartmentSchema.parse({
          ...this.departmentOption(department),
          restricted: department.restricted,
          revision: department.revision,
          memberUserIds: input.memberUserIds,
        });
      });
    } catch (error) {
      if (this.isUniqueConstraintError(error))
        throw this.conflict('A department already uses this name.');
      throw error;
    }
  }

  private departmentOption(department: {
    id: string;
    name: string;
    enabled: boolean;
    customerVisible: boolean;
  }) {
    return {
      id: department.id,
      name: department.name,
      enabled: department.enabled,
      customerVisible: department.customerVisible,
    };
  }

  private toSummary(ticket: TicketSummaryRecord): TicketSummary {
    return ticketSummarySchema.parse({
      id: ticket.id,
      ticketNumber: ticket.ticketNumber,
      department: this.departmentOption(ticket.department),
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

  private toDetail(
    ticket: TicketRecord,
    actor: AuthRequestContext,
  ): TicketDetail {
    const messages =
      actor.identity.role === 'CUSTOMER'
        ? ticket.messages.filter((message) => message.kind !== 'SYSTEM')
        : ticket.messages;
    return ticketDetailSchema.parse({
      ...this.toSummary(ticket),
      messageCount: messages.length,
      messages: messages.map((message) => ({
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
