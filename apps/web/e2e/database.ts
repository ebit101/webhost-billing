import { createDecipheriv, createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { createPrismaClient } from '@webhost-billing/database';
import { E2E_DATABASE_URL, E2E_ENCRYPTION_KEY } from './environment';
import { E2E_CUSTOMER } from './fixtures';

export const e2ePrisma = createPrismaClient(E2E_DATABASE_URL);
const webDirectory = resolve(process.cwd());

export async function customerVerificationToken(): Promise<string> {
  const user = await e2ePrisma.user.findUniqueOrThrow({
    where: { email: E2E_CUSTOMER.email },
    include: {
      emailVerificationTokens: {
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
  });
  const encrypted = user.emailVerificationTokens[0]?.deliveryCiphertext;
  if (!encrypted) throw new Error('Verification token was not created.');
  return decryptToken(encrypted);
}

export async function lifecycleRecord() {
  return e2ePrisma.order.findFirstOrThrow({
    where: { customer: { user: { email: E2E_CUSTOMER.email } } },
    orderBy: { createdAt: 'desc' },
    include: {
      items: { include: { service: true } },
      invoices: { orderBy: { createdAt: 'asc' } },
    },
  });
}

export async function createRenewalInvoice(serviceId: string) {
  runAutomation('create-renewal', serviceId);
  return e2ePrisma.invoice.findFirstOrThrow({
    where: { items: { some: { serviceId } } },
    orderBy: { createdAt: 'desc' },
  });
}

export async function suspendOverdueService(
  serviceId: string,
  invoiceId: string,
): Promise<void> {
  runAutomation('suspend-overdue', serviceId, invoiceId);
}

export async function applyRenewalPaymentAndUnsuspend(
  serviceId: string,
  invoiceId: string,
): Promise<void> {
  runAutomation('apply-payment', serviceId, invoiceId);
}

function runAutomation(action: string, ...identifiers: string[]): void {
  execFileSync(
    'pnpm',
    [
      'exec',
      'tsx',
      '--tsconfig',
      'e2e/tsconfig.json',
      'e2e/automation-runner.ts',
      action,
      ...identifiers,
    ],
    {
      cwd: webDirectory,
      env: process.env,
      stdio: 'inherit',
    },
  );
}

function decryptToken(encryptedToken: string): string {
  const [version, encodedIv, encodedTag, encodedCiphertext] =
    encryptedToken.split('.');
  if (version !== 'v1' || !encodedIv || !encodedTag || !encodedCiphertext) {
    throw new Error('Unexpected verification token format.');
  }
  const key = createHash('sha256').update(E2E_ENCRYPTION_KEY).digest();
  const decipher = createDecipheriv(
    'aes-256-gcm',
    key,
    Buffer.from(encodedIv, 'base64url'),
  );
  decipher.setAuthTag(Buffer.from(encodedTag, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(encodedCiphertext, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}
