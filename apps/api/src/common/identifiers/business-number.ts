import { randomBytes } from 'node:crypto';

export function createHumanReadableNumber(
  prefix: 'ORD' | 'INV',
  now = new Date(),
  entropy: Uint8Array = randomBytes(8),
): string {
  const date = now.toISOString().slice(0, 10).replaceAll('-', '');
  return `${prefix}-${date}-${Buffer.from(entropy).toString('hex').toUpperCase()}`;
}
