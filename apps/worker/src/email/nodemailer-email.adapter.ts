import { createHash } from 'node:crypto';
import { chmod, mkdir, open } from 'node:fs/promises';
import { join } from 'node:path';
import type { WorkerEnvironment } from '@webhost-billing/config';
import nodemailer, { type Transporter } from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';
import { classifySmtpError, EmailProviderError } from './email-provider.error';
import type {
  EmailAdapter,
  EmailSendRequest,
  EmailSendResult,
} from './email.types';

export class SmtpEmailAdapter implements EmailAdapter {
  readonly key = 'smtp';
  private readonly transporter: Transporter<SMTPTransport.SentMessageInfo>;

  constructor(private readonly environment: WorkerEnvironment) {
    this.transporter = nodemailer.createTransport({
      host: environment.SMTP_HOST,
      port: environment.SMTP_PORT,
      secure: environment.SMTP_SECURE,
      requireTLS: environment.SMTP_REQUIRE_TLS,
      connectionTimeout: environment.SMTP_CONNECTION_TIMEOUT_MS,
      greetingTimeout: environment.SMTP_CONNECTION_TIMEOUT_MS,
      socketTimeout: environment.SMTP_SOCKET_TIMEOUT_MS,
      tls: { rejectUnauthorized: true, minVersion: 'TLSv1.2' },
      ...(environment.SMTP_USERNAME && environment.SMTP_PASSWORD
        ? {
            auth: {
              user: environment.SMTP_USERNAME,
              pass: environment.SMTP_PASSWORD,
            },
          }
        : {}),
    });
  }

  async send(message: EmailSendRequest): Promise<EmailSendResult> {
    try {
      const result = await this.transporter.sendMail(mailOptions(message));
      if (!result.messageId || result.rejected.length > 0) {
        throw new EmailProviderError('PERMANENT', 'SMTP_RECIPIENT_REJECTED');
      }
      return { provider: this.key, providerMessageId: result.messageId };
    } catch (error) {
      if (error instanceof EmailProviderError) throw error;
      throw classifySmtpError(error);
    }
  }

  close(): Promise<void> {
    this.transporter.close();
    return Promise.resolve();
  }
}

export class PreviewEmailAdapter implements EmailAdapter {
  readonly key = 'preview';
  private readonly transporter = nodemailer.createTransport({
    streamTransport: true,
    buffer: true,
    newline: 'unix',
  });

  constructor(private readonly environment: WorkerEnvironment) {}

  async send(message: EmailSendRequest): Promise<EmailSendResult> {
    const result: unknown = await this.transporter.sendMail(
      mailOptions(message),
    );
    if (!isRecord(result) || !Buffer.isBuffer(result.message)) {
      throw new EmailProviderError(
        'PERMANENT',
        'EMAIL_PREVIEW_GENERATION_FAILED',
      );
    }
    const providerMessageId =
      typeof result.messageId === 'string'
        ? result.messageId
        : message.messageId;
    await mkdir(this.environment.EMAIL_PREVIEW_DIRECTORY, {
      recursive: true,
      mode: 0o700,
    });
    await chmod(this.environment.EMAIL_PREVIEW_DIRECTORY, 0o700);
    const filename = `${createHash('sha256').update(message.messageId).digest('hex')}.eml`;
    const path = join(this.environment.EMAIL_PREVIEW_DIRECTORY, filename);
    try {
      const file = await open(path, 'wx', 0o600);
      try {
        await file.writeFile(result.message);
      } finally {
        await file.close();
      }
    } catch (error) {
      if (!isRecord(error) || error.code !== 'EEXIST') {
        throw new EmailProviderError(
          'TEMPORARY',
          'EMAIL_PREVIEW_STORAGE_UNAVAILABLE',
        );
      }
    }
    return { provider: this.key, providerMessageId };
  }

  close(): Promise<void> {
    this.transporter.close();
    return Promise.resolve();
  }
}

function mailOptions(message: EmailSendRequest) {
  return {
    from: {
      name: message.fromName,
      address: message.fromAddress,
    },
    to: message.recipientEmail,
    ...(message.replyToAddress ? { replyTo: message.replyToAddress } : {}),
    subject: message.subject,
    text: message.text,
    html: message.html,
    messageId: message.messageId,
    disableFileAccess: true,
    disableUrlAccess: true,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
