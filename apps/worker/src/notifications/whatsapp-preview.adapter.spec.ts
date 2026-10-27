import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WhatsAppPreviewAdapter } from './whatsapp-preview.adapter';

describe('private WhatsApp preview adapter', () => {
  it('atomically replaces one deterministic preview and masks the destination', async () => {
    const directory = await mkdtemp(
      join(tmpdir(), 'webhost-notification-test-'),
    );
    try {
      const adapter = new WhatsAppPreviewAdapter(directory);
      const message = {
        id: '80000000-0000-4000-8000-000000000137',
        key: 'client-invoice-issued' as const,
        recipient: '+8801700000137',
        text: 'Fictional invoice available',
      };
      await adapter.send(message);
      await adapter.send(message);
      const files = await readdir(join(directory, 'whatsapp'));
      expect(files).toHaveLength(1);
      expect(files[0]).toMatch(/^[a-f0-9]{64}\.json$/);
      const file = join(directory, 'whatsapp', files[0]);
      expect(JSON.parse(await readFile(file, 'utf8'))).toEqual({
        key: message.key,
        recipient: '••••0137',
        text: message.text,
      });
      if (process.platform !== 'win32')
        expect((await stat(file)).mode & 0o777).toBe(0o600);
    } finally {
      // Only this test's newly created temporary directory is disposable.
      await rm(directory, { recursive: true, force: true });
    }
  });
});
