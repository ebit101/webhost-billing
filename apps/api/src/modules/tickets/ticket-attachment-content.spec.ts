import { createServer, type Server } from 'node:net';
import sharp from 'sharp';
import {
  normalizeTicketAttachment,
  scanAttachment,
} from './ticket-attachment-content';

describe('attachment validation and screening', () => {
  it('rejects active formats, broken rasters, binary text and mismatched MIME', async () => {
    for (const [filename, type, content] of [
      ['active.svg', 'image/png', '<svg/>'],
      ['wrong.png', 'image/png', 'fictional'],
      ['page.txt', 'text/plain', '<html>unsafe</html>'],
      ['script.log', 'text/plain', '#!/bin/sh\necho fictional'],
      ['utf8.txt', 'text/plain', Buffer.from([255, 255])],
    ] as const)
      await expect(
        normalizeTicketAttachment(
          Buffer.isBuffer(content) ? content : Buffer.from(content),
          type,
          filename,
        ),
      ).rejects.toThrow('INVALID_ATTACHMENT');
  });
  it('re-encodes raster screenshots without metadata and bounds decoded pixels', async () => {
    const bytes = await sharp({
      create: { width: 2, height: 2, channels: 3, background: 'white' },
    })
      .withMetadata()
      .png()
      .toBuffer();
    const cleaned = await normalizeTicketAttachment(
      bytes,
      'image/png',
      'screen.png',
    );
    expect((await sharp(cleaned).metadata()).exif).toBeUndefined();
    const large = await sharp({
      create: { width: 2001, height: 2000, channels: 3, background: 'white' },
    })
      .png()
      .toBuffer();
    await expect(
      normalizeTicketAttachment(large, 'image/png', 'large.png'),
    ).rejects.toThrow();
  });
  it('fails closed for disabled screening and simulated production screening', async () => {
    const bytes = Buffer.from('fictional');
    expect(
      await scanAttachment(bytes, 'disabled', false, '127.0.0.1', 3310),
    ).toBe('UNAVAILABLE');
    expect(await scanAttachment(bytes, 'fake', true, '127.0.0.1', 3310)).toBe(
      'UNAVAILABLE',
    );
    expect(
      await scanAttachment(
        Buffer.from('FICTIONAL_INFECTED_ATTACHMENT'),
        'fake',
        false,
        '127.0.0.1',
        3310,
      ),
    ).toBe('MALWARE');
  });
  it.each([
    ['stream: OK\0', 'CLEAN'],
    ['stream: Fictional.Test FOUND\0', 'MALWARE'],
    ['stream: ERROR\0', 'UNAVAILABLE'],
    ['x'.repeat(2050), 'UNAVAILABLE'],
  ])(
    'parses bounded local ClamAV protocol response %s',
    async (reply, expected) => {
      let observed: Buffer<ArrayBufferLike> = Buffer.alloc(0);
      const server: Server = createServer((socket) => {
        let received: Buffer<ArrayBufferLike> = Buffer.alloc(0);
        socket.on('data', (chunk) => {
          received = Buffer.concat([received, chunk]);
          const prefix = Buffer.from('zINSTREAM\0');
          if (received.length < prefix.length + 4) return;
          expect(received.subarray(0, prefix.length)).toEqual(prefix);
          let offset = prefix.length;
          const chunks: Buffer[] = [];
          while (offset + 4 <= received.length) {
            const size = received.readUInt32BE(offset);
            offset += 4;
            if (!size) {
              observed = Buffer.concat(chunks);
              socket.end(reply);
              return;
            }
            if (offset + size > received.length) return;
            chunks.push(received.subarray(offset, offset + size));
            offset += size;
          }
        });
      });
      await new Promise<void>((resolve) =>
        server.listen(0, '127.0.0.1', resolve),
      );
      const address = server.address();
      if (!address || typeof address === 'string')
        throw new Error('Missing fictional scanner port');
      try {
        const bytes = Buffer.alloc(70000, 65);
        expect(
          await scanAttachment(
            bytes,
            'clamav',
            false,
            '127.0.0.1',
            address.port,
          ),
        ).toBe(expected);
        expect(observed).toEqual(bytes);
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    },
  );
});
