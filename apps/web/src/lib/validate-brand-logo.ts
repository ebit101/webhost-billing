import {
  lstatSync,
  openSync,
  readSync,
  closeSync,
  realpathSync,
} from 'node:fs';
import { resolve, relative, isAbsolute } from 'node:path';
import type { WebBranding } from '@webhost-billing/shared';

// Build-time only. Local PNGs avoid remote dependencies, tracking and CSP exceptions.
export function validateBrandLogo(
  branding: WebBranding,
  publicDirectory: string,
): void {
  if (!branding.logoPath) return;
  const fail = () =>
    new Error(
      'Brand logo must be a local PNG matching the configured dimensions.',
    );
  try {
    const root = realpathSync(publicDirectory);
    const path = resolve(root, `.${branding.logoPath}`);
    const stat = lstatSync(path);
    const confined = relative(root, realpathSync(path));
    if (
      !stat.isFile() ||
      stat.isSymbolicLink() ||
      isAbsolute(confined) ||
      confined.startsWith('..') ||
      stat.size < 24 ||
      stat.size > 2_000_000
    )
      throw fail();
    const descriptor = openSync(path, 'r');
    const header = Buffer.alloc(24);
    try {
      if (readSync(descriptor, header, 0, 24, 0) !== 24) throw fail();
    } finally {
      closeSync(descriptor);
    }
    if (
      !header
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
      header.readUInt32BE(8) !== 13 ||
      header.toString('ascii', 12, 16) !== 'IHDR' ||
      header.readUInt32BE(16) !== branding.logoWidth ||
      header.readUInt32BE(20) !== branding.logoHeight
    )
      throw fail();
  } catch {
    throw fail();
  }
}
