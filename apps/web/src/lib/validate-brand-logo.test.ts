import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  symlinkSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, basename, dirname, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { webBrandingSchema } from '@webhost-billing/shared';
import { validateBrandLogo } from './validate-brand-logo';

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'web-branding-test-'));
  mkdirSync(join(root, 'branding'));
});
afterEach(() => {
  if (
    dirname(resolve(root)) !== resolve(tmpdir()) ||
    !basename(root).startsWith('web-branding-test-')
  ) {
    throw new Error('Refusing unsafe temporary fixture cleanup.');
  }
  rmSync(root, { recursive: true, force: true });
});
const brand = webBrandingSchema.parse({
  name: 'Example',
  logoPath: '/branding/logo.png',
});
function header(width = 285, height = 63) {
  const bytes = Buffer.alloc(24);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(bytes);
  bytes.writeUInt32BE(13, 8);
  bytes.write('IHDR', 12);
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return bytes;
}
describe('build-time local logo metadata validation', () => {
  it('needs no asset or public directory for the generic installation', () => {
    expect(() =>
      validateBrandLogo(
        webBrandingSchema.parse({ name: 'Example' }),
        join(root, 'absent'),
      ),
    ).not.toThrow();
  });
  it('accepts only matching PNG metadata and rejects missing or mismatched assets', () => {
    expect(() => validateBrandLogo(brand, root)).toThrow(
      'Brand logo must be a local PNG',
    );
    const path = join(root, 'branding/logo.png');
    writeFileSync(path, header());
    expect(() => validateBrandLogo(brand, root)).not.toThrow();
    for (const bytes of [
      header(300),
      header(285, 70),
      Buffer.alloc(24),
      Buffer.alloc(23),
      Buffer.alloc(2_000_001),
    ]) {
      writeFileSync(path, bytes);
      expect(() => validateBrandLogo(brand, root)).toThrow(
        'Brand logo must be a local PNG',
      );
    }
  });
  it('rejects a directory at the configured filename', () => {
    mkdirSync(join(root, 'branding/logo.png'));
    expect(() => validateBrandLogo(brand, root)).toThrow(
      'Brand logo must be a local PNG',
    );
  });
  it('rejects a parent directory junction escaping the public root', () => {
    const outside = join(root, 'outside');
    mkdirSync(outside);
    writeFileSync(join(outside, 'logo.png'), header());
    const publicRoot = join(root, 'public');
    mkdirSync(publicRoot);
    symlinkSync(
      outside,
      join(publicRoot, 'branding'),
      process.platform === 'win32' ? 'junction' : 'dir',
    );
    expect(() => validateBrandLogo(brand, publicRoot)).toThrow(
      'Brand logo must be a local PNG',
    );
  });
});
