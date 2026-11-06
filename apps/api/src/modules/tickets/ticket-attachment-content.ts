import sharp from 'sharp';
import { createConnection } from 'node:net';
import { TICKET_ATTACHMENT_MAX_BYTES } from '@webhost-billing/shared';

export type AttachmentScan = 'CLEAN' | 'MALWARE' | 'UNAVAILABLE';

export async function scanAttachment(
  bytes: Buffer,
  mode: 'disabled' | 'fake' | 'clamav',
  production: boolean,
  host: string,
  port: number,
): Promise<AttachmentScan> {
  if (mode === 'disabled' || (production && mode === 'fake'))
    return 'UNAVAILABLE';
  if (mode === 'fake')
    return bytes.includes(Buffer.from('FICTIONAL_INFECTED_ATTACHMENT'))
      ? 'MALWARE'
      : bytes.includes(Buffer.from('FICTIONAL_SCANNER_UNAVAILABLE'))
        ? 'UNAVAILABLE'
        : 'CLEAN';
  return new Promise((resolve) => {
    const socket = createConnection({ host, port });
    let response = Buffer.alloc(0);
    let settled = false;
    const finish = (result: AttachmentScan) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      resolve(result);
    };
    const timer = setTimeout(() => finish('UNAVAILABLE'), 10000);
    socket.on('error', () => finish('UNAVAILABLE'));
    socket.on('close', () => finish('UNAVAILABLE'));
    socket.on('connect', () => {
      const parts: Buffer[] = [Buffer.from('zINSTREAM\0')];
      for (let offset = 0; offset < bytes.length; offset += 65536) {
        const chunk = bytes.subarray(offset, offset + 65536);
        const size = Buffer.alloc(4);
        size.writeUInt32BE(chunk.length);
        parts.push(size, chunk);
      }
      parts.push(Buffer.alloc(4));
      socket.write(Buffer.concat(parts));
    });
    socket.on('data', (chunk) => {
      if (response.length + chunk.length > 2048) return finish('UNAVAILABLE');
      response = Buffer.concat([response, chunk]);
      const end = response.indexOf(0);
      if (end < 0) return;
      const text = response.subarray(0, end).toString('ascii');
      finish(
        text === 'stream: OK'
          ? 'CLEAN'
          : /^stream: .+ FOUND$/.test(text)
            ? 'MALWARE'
            : 'UNAVAILABLE',
      );
    });
  });
}

/** Decode and re-encode raster files; never retain user metadata or active formats. */
export async function normalizeTicketAttachment(
  bytes: Buffer,
  mediaType: string,
  filename: string,
): Promise<Buffer> {
  if (!bytes.length || bytes.length > TICKET_ATTACHMENT_MAX_BYTES)
    throw new Error('INVALID_ATTACHMENT');
  const extension = filename.split('.').pop()?.toLowerCase();
  if (mediaType === 'text/plain') {
    if (extension !== 'txt' && extension !== 'log')
      throw new Error('INVALID_ATTACHMENT');
    let text: string;
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
      throw new Error('INVALID_ATTACHMENT');
    }
    if (
      [...text].some((character) => {
        const code = character.codePointAt(0)!;
        return (code < 32 && ![9, 10, 13].includes(code)) || code === 127;
      }) ||
      /<\s*(?:[a-z][^>]*>|!doctype|\?php)/i.test(text) ||
      /^\s*(?:#!|MZ)/.test(text)
    )
      throw new Error('INVALID_ATTACHMENT');
    return bytes;
  }
  const png =
    mediaType === 'image/png' &&
    extension === 'png' &&
    bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')) &&
    bytes.subarray(-12).equals(Buffer.from('0000000049454e44ae426082', 'hex'));
  const jpeg =
    mediaType === 'image/jpeg' &&
    ['jpg', 'jpeg'].includes(extension ?? '') &&
    bytes.subarray(0, 3).equals(Buffer.from('ffd8ff', 'hex')) &&
    bytes.subarray(-2).equals(Buffer.from('ffd9', 'hex'));
  if (!png && !jpeg) throw new Error('INVALID_ATTACHMENT');
  try {
    const image = sharp(bytes, {
      limitInputPixels: 4_000_000,
      failOn: 'warning',
    }).timeout({ seconds: 5 });
    const metadata = await image.metadata();
    if (
      (metadata.pages ?? 1) !== 1 ||
      metadata.format !== (png ? 'png' : 'jpeg')
    )
      throw new Error('INVALID_ATTACHMENT');
    const normalized = png
      ? await image.png().toBuffer()
      : await image.jpeg({ quality: 90 }).toBuffer();
    if (normalized.length > TICKET_ATTACHMENT_MAX_BYTES)
      throw new Error('INVALID_ATTACHMENT');
    return normalized;
  } catch {
    throw new Error('INVALID_ATTACHMENT');
  }
}
