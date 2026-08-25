import { Inject, Injectable } from '@nestjs/common';
import type { PrismaClient } from '@webhost-billing/database';
import {
  emailLogSummarySchema,
  type EmailLogSummary,
} from '@webhost-billing/shared';
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
    return logs.map((log) =>
      emailLogSummarySchema.parse({
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
      }),
    );
  }
}
