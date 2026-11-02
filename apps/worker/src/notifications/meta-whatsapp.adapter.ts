import type { PrismaClient } from '@webhost-billing/database';
import {
  normalizeNotificationPhone,
  type MetaWhatsAppConfiguration,
} from '@webhost-billing/shared';
import { MetaWhatsAppConfigurationCipher } from './meta-whatsapp-configuration-cipher';
import type { WhatsAppNotificationAdapter } from './whatsapp-preview.adapter';
import {
  whatsAppTemplateBody,
  WhatsAppProviderError,
  type WhatsAppNotificationMessage,
  type WhatsAppSendResult,
} from './whatsapp-message';

export const META_WHATSAPP_PROVIDER_KEY = 'whatsapp.meta';

/** One submission only. Timeouts and ambiguous replies are never retried here. */
export class MetaWhatsAppAdapter implements WhatsAppNotificationAdapter {
  readonly key = 'meta';
  constructor(
    private readonly prisma: Pick<PrismaClient, 'integrationCredential'>,
    private readonly encryptionKey: string,
    private readonly liveEnabled = false,
    private readonly request: typeof fetch = fetch,
  ) {}

  async send(
    message: WhatsAppNotificationMessage,
  ): Promise<WhatsAppSendResult> {
    if (!this.liveEnabled) return { status: 'DISABLED' };
    let config: MetaWhatsAppConfiguration;
    try {
      const row = await this.prisma.integrationCredential.findUnique({
        where: { providerKey: META_WHATSAPP_PROVIDER_KEY },
        select: { ciphertext: true, keyVersion: true },
      });
      if (!row) throw new Error();
      config = new MetaWhatsAppConfigurationCipher(this.encryptionKey).decrypt(
        row.keyVersion,
        row.ciphertext,
      );
    } catch {
      throw new WhatsAppProviderError('CONFIGURATION');
    }
    if (!config.enabled) return { status: 'DISABLED' };
    const template = config.templates[message.key];
    let body: ReturnType<typeof whatsAppTemplateBody>;
    try {
      if (!template || new URL(message.publicWebUrl).protocol !== 'https:')
        throw new Error();
      body = whatsAppTemplateBody(message);
    } catch {
      throw new WhatsAppProviderError('CONFIGURATION');
    }
    // A phone-number ID determines the sender. Verify its public phone instead
    // of treating a locally entered sender label as proof of the binding.
    try {
      const senderResponse = await this.request(
        `https://graph.facebook.com/${config.apiVersion}/${config.phoneNumberId}?fields=id,display_phone_number`,
        {
          method: 'GET',
          redirect: 'error',
          signal: AbortSignal.timeout(10_000),
          headers: { Authorization: `Bearer ${config.accessToken}` },
        },
      );
      if (!senderResponse.ok) {
        await senderResponse.body?.cancel().catch(() => undefined);
        throw new Error();
      }
      const sender = await boundedJson(senderResponse);
      if (
        !isRecord(sender) ||
        sender.id !== config.phoneNumberId ||
        typeof sender.display_phone_number !== 'string' ||
        normalizeNotificationPhone(
          sender.display_phone_number.startsWith('+')
            ? sender.display_phone_number
            : '+' + sender.display_phone_number,
        ) !== config.senderPhoneNumber
      )
        throw new Error();
    } catch {
      throw new WhatsAppProviderError('CONFIGURATION');
    }
    let response: Response;
    try {
      response = await this.request(
        `https://graph.facebook.com/${config.apiVersion}/${config.phoneNumberId}/messages`,
        {
          method: 'POST',
          redirect: 'error',
          signal: AbortSignal.timeout(10_000),
          headers: {
            Authorization: `Bearer ${config.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: body.to,
            type: 'template',
            template: {
              name: template.name,
              language: { code: template.language },
              components: [body.component],
            },
            biz_opaque_callback_data: message.id,
          }),
        },
      );
    } catch {
      throw new WhatsAppProviderError('UNKNOWN');
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw new WhatsAppProviderError(
        [400, 401, 403, 404, 422].includes(response.status)
          ? 'REJECTED'
          : 'UNKNOWN',
      );
    }
    try {
      const result = await boundedJson(response);
      if (
        !isRecord(result) ||
        result.messaging_product !== 'whatsapp' ||
        !Array.isArray(result.contacts) ||
        result.contacts.length !== 1 ||
        !isRecord(result.contacts[0]) ||
        result.contacts[0].input !== body.to ||
        result.contacts[0].wa_id !== body.to ||
        !Array.isArray(result.messages) ||
        result.messages.length !== 1 ||
        !isRecord(result.messages[0]) ||
        typeof result.messages[0].id !== 'string' ||
        !/^wamid\.[A-Za-z0-9._=-]{1,500}$/.test(result.messages[0].id)
      )
        throw new Error();
      return { status: 'ACCEPTED', providerMessageId: result.messages[0].id };
    } catch {
      throw new WhatsAppProviderError('UNKNOWN');
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
async function boundedJson(response: Response): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const item = await reader.read();
      if (item.done) break;
      size += item.value.byteLength;
      if (size > 16384) throw new Error();
      chunks.push(item.value);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } finally {
    await reader.cancel();
  }
}
