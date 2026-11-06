import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { ticketAttachmentFilenameSchema } from './contracts/tickets';

export const SUPPORT_EMAIL_MAX_BYTES = 9 * 1024 * 1024;
const address = z
  .email()
  .max(320)
  .transform((value) => value.toLowerCase());
export const inboundSupportEmailSchema = z
  .object({
    messageId: z
      .string()
      .min(5)
      .max(255)
      .regex(/^<[^\s<>@]+@[^\s<>@]+>$/),
    recipient: z.email().max(320),
    from: address,
    envelopeFrom: address.nullable(),
    senderVerification: z
      .object({
        // Trusted gateway evidence, never copied from sender-supplied headers.
        dmarc: z.enum(['pass', 'fail', 'none']),
        alignedDkim: z.boolean(),
        verifiedAddress: address.nullable(),
      })
      .strict(),
    autoSubmitted: z.enum(['no', 'auto-generated', 'auto-replied', 'other']),
    bulk: z.boolean(),
    deliveryReport: z.boolean(),
    text: z.string().max(50_000).optional(),
    html: z.string().max(50_000).optional(),
    attachments: z
      .array(
        z
          .object({
            filename: ticketAttachmentFilenameSchema,
            mediaType: z.enum(['text/plain', 'image/png', 'image/jpeg']),
            contentBase64: z
              .string()
              .min(4)
              .max(2_796_204)
              .regex(
                /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/,
              ),
          })
          .strict(),
      )
      .max(3),
  })
  .strict();
export type InboundSupportEmail = z.infer<typeof inboundSupportEmailSchema>;

export function supportEmailHash(value: string | Buffer) {
  return createHash('sha256').update(value).digest('hex');
}
export function supportReplyAddress(
  id: string,
  secret: string,
  domain: string,
) {
  const token = createHmac('sha256', secret)
    .update(`support-thread:v1:${id}`)
    .digest('base64url')
    .slice(0, 22);
  return `r-${id.replaceAll('-', '')}.${token}@${domain}`;
}
export function supportThreadId(
  recipient: string,
  secret: string,
  domain: string,
): string | undefined {
  const match = /^r-([a-f0-9]{32})\.[A-Za-z0-9_-]{22}@/.exec(recipient);
  if (!match) return undefined;
  const raw = match[1]!;
  const id = `${raw.slice(0, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}-${raw.slice(16, 20)}-${raw.slice(20)}`;
  const expected = Buffer.from(supportReplyAddress(id, secret, domain));
  const actual = Buffer.from(recipient);
  return expected.length === actual.length && timingSafeEqual(expected, actual)
    ? id
    : undefined;
}
export function signSupportDelivery(
  bytes: Buffer,
  timestamp: string,
  secret: string,
) {
  return createHmac('sha256', secret)
    .update(`support-delivery:v1:${timestamp}:`)
    .update(bytes)
    .digest('hex');
}
export function verifySupportDelivery(
  bytes: Buffer,
  timestamp: string,
  signature: string,
  secret: string,
  now = Date.now(),
) {
  if (
    !/^\d{13}$/.test(timestamp) ||
    Math.abs(now - Number(timestamp)) > 300_000 ||
    !/^[a-f0-9]{64}$/.test(signature)
  )
    return false;
  return timingSafeEqual(
    Buffer.from(signature, 'hex'),
    Buffer.from(signSupportDelivery(bytes, timestamp, secret), 'hex'),
  );
}

/** Discard active HTML entirely. Persist plain text only; never render incoming HTML. */
export function supportEmailText(
  email: Pick<InboundSupportEmail, 'text' | 'html'>,
): string {
  let value = email.text;
  if (!value?.trim()) {
    value = (email.html ?? '')
      .replace(/<!--[\s\S]*?(?:-->|$)/g, '')
      .replace(
        /<(script|style|iframe|object|svg|head)\b[^>]*>[\s\S]*?(?:<\/\1\s*>|$)/gi,
        '',
      )
      .replace(/<\s*(?:br|\/p|\/div|\/li)\b[^>]*>/gi, '\n')
      .replace(/<[^>]*>/g, '')
      .replace(
        /&(amp|lt|gt|quot|apos|nbsp);/gi,
        (_, name: string) =>
          ({ amp: '&', lt: ' ', gt: ' ', quot: '"', apos: "'", nbsp: ' ' })[
            name.toLowerCase()
          ] ?? ' ',
      )
      .replace(/&#(?:x[0-9a-f]+|\d+);/gi, ' ');
  }
  // Quoted history is never imported as a new customer contribution.
  return value
    .split(/\r?\n/)
    .filter((line) => !/^\s*>/.test(line))
    .join('\n')
    .split(/\n(?:On .{1,200}wrote:|[- ]*Original Message[- ]*)\n/i)[0]!
    .replace(/[<>]/g, ' ')
    .trim();
}
