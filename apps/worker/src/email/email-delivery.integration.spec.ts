import {
  createCipheriv,
  createHash,
  randomBytes,
  randomUUID,
} from 'node:crypto';
import {
  loadEnvironmentFiles,
  parseWorkerEnvironment,
} from '@webhost-billing/config';
import {
  createPrismaClient,
  EmailStatus,
  OutboxStatus,
  UserRole,
  UserStatus,
} from '@webhost-billing/database';
import type { BackgroundJobData } from '@webhost-billing/shared';
import { EmailDeliveryService } from './email-delivery.service';
import { EmailMessageResolver } from './email-message.resolver';
import { EmailProviderError } from './email-provider.error';
import { EmailTemplateCatalog } from './email-template.catalog';
import type {
  EmailAdapter,
  EmailSendRequest,
  EmailSendResult,
} from './email.types';

loadEnvironmentFiles();
const environment = parseWorkerEnvironment(process.env);
const prisma = createPrismaClient(environment.DATABASE_URL);

class SequencedAdapter implements EmailAdapter {
  readonly key = 'test-smtp';
  readonly messages: EmailSendRequest[] = [];

  send(message: EmailSendRequest): Promise<EmailSendResult> {
    this.messages.push(message);
    if (this.messages.length === 1) {
      return Promise.reject(
        new EmailProviderError('TEMPORARY', 'SMTP_CONNECTION_UNAVAILABLE'),
      );
    }
    return Promise.resolve({
      provider: this.key,
      providerMessageId: message.messageId,
    });
  }

  close(): Promise<void> {
    return Promise.resolve();
  }
}

describe('EmailDeliveryService integration', () => {
  const ids = {
    user: randomUUID(),
    customer: randomUUID(),
    token: randomUUID(),
    outbox: randomUUID(),
  };
  const recipientEmail = `command18-${ids.user}@example.test`;
  const rawToken = `command18-token-${randomUUID()}`;

  beforeAll(async () => {
    await prisma.user.create({
      data: {
        id: ids.user,
        email: recipientEmail,
        role: UserRole.CUSTOMER,
        status: UserStatus.PENDING_VERIFICATION,
        customer: {
          create: {
            id: ids.customer,
            customerNumber: `C18-${ids.customer.slice(0, 8)}`,
            firstName: 'Fictional',
            lastName: 'Recipient',
            addressLine1: '18 Example Road',
            city: 'Dhaka',
            countryCode: 'BD',
          },
        },
      },
    });
    await prisma.emailVerificationToken.create({
      data: {
        id: ids.token,
        userId: ids.user,
        tokenHash: createHash('sha256').update(rawToken).digest('hex'),
        deliveryCiphertext: encryptToken(
          rawToken,
          environment.CREDENTIAL_ENCRYPTION_KEY,
        ),
        expiresAt: new Date(Date.now() + 600_000),
      },
    });
    await prisma.outboxEvent.create({
      data: {
        id: ids.outbox,
        aggregateType: 'USER',
        aggregateId: ids.user,
        eventType: 'AUTH_EMAIL_VERIFICATION_REQUESTED',
        idempotencyKey: `command18:${ids.outbox}`,
        payload: {
          schemaVersion: 1,
          recipientEmail,
          tokenRecordId: ids.token,
          purpose: 'EMAIL_VERIFICATION',
        },
        status: OutboxStatus.PUBLISHED,
        publishedAt: new Date(),
      },
    });
  });

  afterAll(async () => {
    const log = await prisma.emailLog.findUnique({
      where: { outboxEventId: ids.outbox },
      select: { id: true },
    });
    if (log) {
      await prisma.emailAttempt.deleteMany({ where: { emailLogId: log.id } });
      await prisma.emailLog.delete({ where: { id: log.id } });
    }
    await prisma.outboxEvent.deleteMany({ where: { id: ids.outbox } });
    await prisma.emailVerificationToken.deleteMany({
      where: { id: ids.token },
    });
    await prisma.customer.deleteMany({ where: { id: ids.customer } });
    await prisma.user.deleteMany({ where: { id: ids.user } });
    await prisma.$disconnect();
  });

  it('logs bounded attempts, retries a temporary failure, and skips an already sent event', async () => {
    const adapter = new SequencedAdapter();
    const resolver = new EmailMessageResolver(
      prisma,
      environment,
      new EmailTemplateCatalog(),
    );
    const delivery = new EmailDeliveryService(prisma, adapter, resolver);
    const data: BackgroundJobData = {
      schemaVersion: 1,
      outboxEventId: ids.outbox,
      aggregateType: 'USER',
      aggregateId: ids.user,
      eventType: 'AUTH_EMAIL_VERIFICATION_REQUESTED',
      correlationId: ids.outbox,
    };

    await expect(delivery.deliver(data, undefined)).rejects.toMatchObject({
      kind: 'TEMPORARY',
      code: 'SMTP_CONNECTION_UNAVAILABLE',
    });
    await expect(delivery.deliver(data, undefined)).resolves.toBeUndefined();
    await expect(delivery.deliver(data, undefined)).resolves.toBeUndefined();

    const log = await prisma.emailLog.findUniqueOrThrow({
      where: { outboxEventId: ids.outbox },
      include: { attempts: { orderBy: { attemptNumber: 'asc' } } },
    });
    expect(adapter.messages).toHaveLength(2);
    expect(adapter.messages[0]?.messageId).toBe(adapter.messages[1]?.messageId);
    expect(adapter.messages[1]?.html).toContain(encodeURIComponent(rawToken));
    expect(log.status).toBe(EmailStatus.SENT);
    expect(log.attemptCount).toBe(2);
    expect(log.attempts.map((attempt) => attempt.status)).toEqual([
      'FAILED',
      'SENT',
    ]);
    expect(JSON.stringify(log)).not.toContain(rawToken);
  });
});

function encryptToken(token: string, encryptionKey: string): string {
  const key = createHash('sha256').update(encryptionKey, 'utf8').digest();
  const initializationVector = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, initializationVector);
  const ciphertext = Buffer.concat([
    cipher.update(token, 'utf8'),
    cipher.final(),
  ]);
  return [
    'v1',
    initializationVector.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
    ciphertext.toString('base64url'),
  ].join('.');
}
