import { createHash, randomUUID } from 'node:crypto';
import { chmod, mkdir, open, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import type { NotificationKey } from '@webhost-billing/shared';

export const WHATSAPP_NOTIFICATION_ADAPTER = Symbol(
  'WHATSAPP_NOTIFICATION_ADAPTER',
);
export interface WhatsAppNotificationAdapter {
  readonly key: string;
  send(message: {
    id: string;
    key: NotificationKey;
    recipient: string;
    text: string;
  }): Promise<void>;
}

/** A filesystem preview only; this adapter has no network client or credentials. */
export class WhatsAppPreviewAdapter implements WhatsAppNotificationAdapter {
  readonly key = 'preview';
  constructor(private readonly directory: string) {}
  async send(message: {
    id: string;
    key: NotificationKey;
    recipient: string;
    text: string;
  }) {
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
          }),
        );
        await file.sync();
      } finally {
        await file.close();
      }
      // Only a complete artifact becomes visible at the deterministic path.
      // A crash before this rename leaves a private temporary file, not success.
      await rename(temporary, destination);
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
