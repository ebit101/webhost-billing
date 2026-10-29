import { Inject, Injectable, HttpStatus } from '@nestjs/common';
import type { Prisma, PrismaClient } from '@webhost-billing/database';
import {
  emailLogSummarySchema,
  type EmailLogSummary,
  clientEmailLogSummarySchema,
  createPaginationMeta,
  type ClientEmailHistoryQuery,
} from '@webhost-billing/shared';
import { ApplicationException } from '../../common/errors/application.exception';
import { PRISMA_CLIENT } from '../../infrastructure/database/database.module';

@Injectable()
export class EmailNotificationService {
  constructor(@Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient) {}

  async recent(): Promise<EmailLogSummary[]> {
    const logs = await this.prisma.emailLog.findMany({
      orderBy: [{ queuedAt: 'desc' }, { id: 'desc' }],
      take: 100,
      include: {
        attempts: {
          orderBy: { attemptNumber: 'desc' },
        },
      },
    });
    return logs.map((log) => this.summary(log));
  }

  async forCustomer(customerId: string, query: ClientEmailHistoryQuery) {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, deletedAt: null },
      select: { id: true },
    });
    if (!customer)
      throw new ApplicationException({
        status: HttpStatus.NOT_FOUND,
        code: 'RESOURCE_NOT_FOUND',
        message: 'Customer was not found.',
      });
    const where: Prisma.EmailLogWhereInput = {
      customerId: customer.id,
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              {
                subjectSnapshot: {
                  contains: query.search,
                  mode: 'insensitive',
                },
              },
              { templateKey: { contains: query.search, mode: 'insensitive' } },
              {
                recipientEmail: { contains: query.search, mode: 'insensitive' },
              },
            ],
          }
        : {}),
    };
    const [logs, total] = await this.prisma.$transaction([
      this.prisma.emailLog.findMany({
        where,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        orderBy: [{ queuedAt: 'desc' }, { id: 'desc' }],
        include: { attempts: { orderBy: { attemptNumber: 'desc' } } },
      }),
      this.prisma.emailLog.count({ where }),
    ]);
    return {
      data: logs.map((log) =>
        clientEmailLogSummarySchema.parse({
          ...this.summary(log),
          customerId: customer.id,
        }),
      ),
      pagination: createPaginationMeta(query.page, query.pageSize, total),
    };
  }

  private summary(
    log: Prisma.EmailLogGetPayload<{ include: { attempts: true } }>,
  ): EmailLogSummary {
    return emailLogSummarySchema.parse({
      id: log.id,
      templateKey: log.templateKey,
      recipientEmail: log.recipientEmail,
      subject: log.subjectSnapshot,
      status: log.status,
      provider: log.provider,
      attemptCount: log.attemptCount,
      queuedAt: log.queuedAt.toISOString(),
      sentAt: log.sentAt?.toISOString() ?? null,
      failedAt: log.failedAt?.toISOString() ?? null,
      attempts: log.attempts.map((attempt) => ({
        id: attempt.id,
        attemptNumber: attempt.attemptNumber,
        status: attempt.status,
        provider: attempt.provider,
        failureKind: attempt.failureKind,
        failureCode: attempt.failureCode,
        startedAt: attempt.startedAt.toISOString(),
        completedAt: attempt.completedAt?.toISOString() ?? null,
      })),
    });
  }
}
