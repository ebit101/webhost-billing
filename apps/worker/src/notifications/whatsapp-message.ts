import {
  normalizeNotificationPhone,
  notificationDefinition,
  type NotificationKey,
} from '@webhost-billing/shared';

export interface WhatsAppNotificationMessage {
  id: string;
  key: NotificationKey;
  recipient: string;
  text: string;
  brandName: string;
  reference: string;
  detail: string;
  publicWebUrl: string;
}

/** Fixed body parameters; no caller-supplied URL, raw metadata, OTP or bank details. */
export function whatsAppTemplateBody(message: WhatsAppNotificationMessage) {
  const definition = notificationDefinition(message.key);
  const recipient = normalizeNotificationPhone(message.recipient);
  const origin = new URL(message.publicWebUrl);
  if (
    !definition?.whatsApp ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(
      message.id,
    ) ||
    !recipient ||
    origin.username ||
    origin.password ||
    origin.search ||
    origin.hash ||
    origin.pathname !== '/' ||
    (origin.protocol !== 'https:' &&
      !(
        origin.protocol === 'http:' &&
        ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname)
      ))
  )
    throw new Error('WhatsApp message is invalid.');
  const values = [
    message.brandName,
    message.reference,
    message.detail,
    new URL(definition.path, origin).toString(),
  ];
  if (
    values.some(
      (value) =>
        !value.trim() ||
        value.length > 512 ||
        [...value].some((character) => character.charCodeAt(0) < 32),
    )
  )
    throw new Error('WhatsApp message is invalid.');
  return {
    to: recipient.slice(1),
    component: {
      type: 'body' as const,
      parameters: values.map((text) => ({ type: 'text' as const, text })),
    },
  };
}

export type WhatsAppSendResult =
  | { status: 'PREVIEWED' }
  | { status: 'DISABLED' }
  | { status: 'ACCEPTED'; providerMessageId: string };

export class WhatsAppProviderError extends Error {
  constructor(readonly kind: 'CONFIGURATION' | 'REJECTED' | 'UNKNOWN') {
    super(`WhatsApp submission ${kind.toLowerCase()}.`);
  }
}
