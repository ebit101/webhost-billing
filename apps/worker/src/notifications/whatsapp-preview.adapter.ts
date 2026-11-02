import { createHash, randomUUID } from 'node:crypto';
import { chmod, mkdir, open, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import {
  whatsAppTemplateBody,
  type WhatsAppNotificationMessage,
  type WhatsAppSendResult,
} from './whatsapp-message';

export const WHATSAPP_NOTIFICATION_ADAPTER = Symbol(
  'WHATSAPP_NOTIFICATION_ADAPTER',
);
export interface WhatsAppNotificationAdapter {
  readonly key: string;
  send(message: WhatsAppNotificationMessage): Promise<WhatsAppSendResult>;
}

/** A filesystem preview only; this adapter has no network client or credentials. */
export class WhatsAppPreviewAdapter implements WhatsAppNotificationAdapter {
  readonly key = 'preview';
  constructor(private readonly directory: string) {}
  async send(
    message: WhatsAppNotificationMessage,
  ): Promise<WhatsAppSendResult> {
    const body = whatsAppTemplateBody(message);
    const path = join(this.directory, 'whatsapp');
    await mkdir(path, { recursive: true, mode: 0o700 });
    await chmod(path, 0o700);
    const destination = join(
      path,
      createHash('sha256').update(message.id).digest('hex') + '.json',
    );
    const temporary = join(path, `.preview-${randomUUID()}.tmp`);
    try {
      const file = await open(temporary, 'wx', 0o600);
      try {
        await file.writeFile(
          JSON.stringify({
            key: message.key,
            recipient: `••••${message.recipient.slice(-4)}`,
            text: message.text,
            template: { key: message.key, body: body.component },
          }),
        );
        await file.sync();
      } finally {
        await file.close();
      }
      // Only a complete artifact becomes visible at the deterministic path.
      // A crash before this rename leaves a private temporary file, not success.
      await rename(temporary, destination);
      return { status: 'PREVIEWED' };
    } finally {
      await unlink(temporary).catch((error: unknown) => {
        if (
          typeof error !== 'object' ||
          error === null ||
          !('code' in error) ||
          error.code !== 'ENOENT'
        )
          throw error;
      });
    }
  }
}
