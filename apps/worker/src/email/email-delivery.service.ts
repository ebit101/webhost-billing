import { Inject, Injectable } from '@nestjs/common';
import {
  EmailAttemptStatus,
  EmailStatus,
  type PrismaClient,
} from '@webhost-billing/database';
import { BackgroundJobError } from '@webhost-billing/queue';
import type {
  BackgroundFailureKind,
  BackgroundJobData,
} from '@webhost-billing/shared';
import { WORKER_PRISMA } from '../infrastructure/database.module';
import { EMAIL_ADAPTER } from './email.module.tokens';
import { EmailMessageResolver } from './email-message.resolver';
import { EmailProviderError } from './email-provider.error';
import type { EmailAdapter } from './email.types';

@Injectable()
export class EmailDeliveryService {
  constructor(
    @Inject(WORKER_PRISMA) private readonly prisma: PrismaClient,
    @Inject(EMAIL_ADAPTER) private readonly adapter: EmailAdapter,
    private readonly resolver: EmailMessageResolver,
  ) {}

  async deliver(
    data: BackgroundJobData,
    signal: AbortSignal | undefined,
  ): Promise<void> {
    if (signal?.aborted) throw temporary('EMAIL_DELIVERY_ABORTED');
    const message = await this.resolver.resolve(data);
    const claim = await this.claimAttempt(data, message);
    if (claim === 'SENT') return;
    if (claim === 'INCONSISTENT') {
      throw inconsistent('EMAIL_PREVIOUS_ATTEMPT_OUTCOME_UNKNOWN');
    }
    if (signal?.aborted) {
      await this.recordFailure(
        claim.emailLogId,
        claim.attemptId,
        'TEMPORARY',
        'EMAIL_DELIVERY_ABORTED',
      );
      throw temporary('EMAIL_DELIVERY_ABORTED');
    }
    try {
      const result = await this.adapter.send({
        ...message,
        messageId: deterministicMessageId(
          data.outboxEventId,
          message.recipientEmail,
        ),
      });
      const now = new Date();
      await this.prisma.$transaction([
        this.prisma.emailAttempt.update({
          where: { id: claim.attemptId },
          data: {
            status: EmailAttemptStatus.SENT,
            providerMessageId: result.providerMessageId,
            completedAt: now,
          },
        }),
        this.prisma.emailLog.update({
          where: { id: claim.emailLogId },
          data: {
            status: EmailStatus.SENT,
            provider: result.provider,
            providerMessageId: result.providerMessageId,
            lastError: null,
            sentAt: now,
            failedAt: null,
          },
        }),
      ]);
    } catch (error) {
      const classified =
        error instanceof EmailProviderError
          ? error
          : new EmailProviderError(
              'INCONSISTENT',
              'EMAIL_DELIVERY_OUTCOME_UNKNOWN',
            );
      await this.recordFailure(
        claim.emailLogId,
        claim.attemptId,
        classified.kind,
        classified.code,
      );
      throw new BackgroundJobError(
        classified.kind,
        classified.code,
        'Email delivery failed.',
      );
    }
  }

  private async claimAttempt(
    data: BackgroundJobData,
    message: Awaited<ReturnType<EmailMessageResolver['resolve']>>,
  ): Promise<
    'SENT' | 'INCONSISTENT' | { emailLogId: string; attemptId: string }
  > {
    return this.prisma.$transaction(async (transaction) => {
      const emailLog = await transaction.emailLog.upsert({
        where: { outboxEventId: data.outboxEventId },
        update: {},
        create: {
          outboxEventId: data.outboxEventId,
          templateKey: message.templateKey,
          recipientEmail: message.recipientEmail,
          subjectSnapshot: message.subject,
          status: EmailStatus.QUEUED,
          provider: this.adapter.key,
          ...(message.customerId ? { customerId: message.customerId } : {}),
          ...(message.invoiceId ? { invoiceId: message.invoiceId } : {}),
          ...(message.ticketId ? { ticketId: message.ticketId } : {}),
        },
      });
      if (emailLog.status === EmailStatus.SENT) return 'SENT';
      if (emailLog.status === EmailStatus.SENDING) {
        const now = new Date();
        await transaction.emailAttempt.updateMany({
          where: {
            emailLogId: emailLog.id,
            status: EmailAttemptStatus.STARTED,
          },
          data: {
            status: EmailAttemptStatus.INCONSISTENT,
            failureKind: 'INCONSISTENT',
            failureCode: 'EMAIL_PREVIOUS_ATTEMPT_OUTCOME_UNKNOWN',
            completedAt: now,
          },
        });
        await transaction.emailLog.update({
          where: { id: emailLog.id },
          data: {
            status: EmailStatus.FAILED,
            lastError: 'EMAIL_PREVIOUS_ATTEMPT_OUTCOME_UNKNOWN',
            failedAt: now,
          },
        });
        return 'INCONSISTENT';
      }
      const attemptNumber = emailLog.attemptCount + 1;
      const attempt = await transaction.emailAttempt.create({
        data: {
          emailLogId: emailLog.id,
          attemptNumber,
          provider: this.adapter.key,
        },
      });
      await transaction.emailLog.update({
        where: { id: emailLog.id },
        data: {
          status: EmailStatus.SENDING,
          provider: this.adapter.key,
          attemptCount: attemptNumber,
          lastError: null,
          failedAt: null,
        },
      });
      return { emailLogId: emailLog.id, attemptId: attempt.id };
    });
  }

  private async recordFailure(
    emailLogId: string,
    attemptId: string,
    kind: BackgroundFailureKind,
    code: string,
  ): Promise<void> {
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.emailAttempt.update({
        where: { id: attemptId },
        data: {
          status:
            kind === 'INCONSISTENT'
              ? EmailAttemptStatus.INCONSISTENT
              : EmailAttemptStatus.FAILED,
          failureKind: kind,
          failureCode: code,
          completedAt: now,
        },
      }),
      this.prisma.emailLog.update({
        where: { id: emailLogId },
        data: {
          status: EmailStatus.FAILED,
          lastError: code,
          failedAt: now,
        },
      }),
    ]);
  }
}

function deterministicMessageId(
  outboxEventId: string,
  recipient: string,
): string {
  const domain =
    recipient.split('@')[1]?.replace(/[^A-Za-z0-9.-]/g, '') || 'localhost';
  return `<outbox.${outboxEventId}@${domain}>`;
}

function temporary(code: string): BackgroundJobError {
  return new BackgroundJobError(
    'TEMPORARY',
    code,
    'Email delivery is temporarily unavailable.',
  );
}

function inconsistent(code: string): BackgroundJobError {
  return new BackgroundJobError(
    'INCONSISTENT',
    code,
    'Email delivery outcome is unknown.',
  );
}
