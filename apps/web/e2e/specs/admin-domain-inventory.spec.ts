import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { createPrismaClient } from '@webhost-billing/database';
import {
  RegistrarCipher,
  credentialBinding,
} from '@webhost-billing/database/registrar';
import { parseApiEnvironment } from '@webhost-billing/config';
import { TotpService } from '../../../api/dist/modules/auth/services/totp.service';
import {
  E2E_DATABASE_URL,
  E2E_SCHEMA,
  E2E_WEB_ORIGIN,
  E2E_API_ORIGIN,
  e2eApiEnvironment,
} from '../environment';
import { assertBrowserDatabaseScope } from '../database-scope';
import { expectRecordPageFits } from '../assert-record-layout';

const prisma = createPrismaClient(E2E_DATABASE_URL);
const id = (value: number) =>
  `16010000-0000-4000-8000-${String(value).padStart(12, '0')}`;
const oldest = 'inventory160-browser-0000.com';
let token = '';
let registrarId = '';
const counts = () =>
  Promise.all([
    prisma.registrarOperation.count(),
    prisma.domainAction.count(),
    prisma.outboxEvent.count(),
    prisma.emailLog.count(),
    prisma.payment.count(),
  ]);
function trackReads(page: Page) {
  const writes: string[] = [];
  const inventoryReads: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.origin !== E2E_API_ORIGIN) return;
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method()))
      writes.push(url.pathname);
    if (url.pathname === '/domains/inventory') inventoryReads.push(url.search);
  });
  return { writes, inventoryReads };
}
async function assertUnchanged(before: number[], writes: string[]) {
  expect(writes).toEqual([]);
  expect(await counts()).toEqual(before);
  expect(
    (
      await prisma.registrarAccount.findUniqueOrThrow({
        where: { id: registrarId },
      })
    ).enabled,
  ).toBe(false);
  expect(
    (await prisma.domain.findUniqueOrThrow({ where: { id: id(3000) } })).state,
  ).toBe('REGISTERED');
}
test.use({ trace: 'off', screenshot: 'off', video: 'off' });
test.afterAll(async () => prisma.$disconnect());
test.beforeAll(async () => {
  await assertBrowserDatabaseScope(prisma, E2E_DATABASE_URL, E2E_SCHEMA);
  for (const flag of [
    'BKASH_ENABLED',
    'SSLCOMMERZ_ENABLED',
    'RESELLBIZ_LIVE_ENABLED',
  ])
    expect(e2eApiEnvironment[flag]).toBe('false');
  const environment = parseApiEnvironment({
    ...e2eApiEnvironment,
    PORT: '3201',
  });
  const totp = new TotpService(environment);
  const now = new Date();
  const administrator = await prisma.user.create({
    data: {
      email: 'browser160-admin@example.test',
      role: 'ADMIN',
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
      adminProfile: {
        create: {
          displayName: 'Fictional inventory administrator',
          staffRole: 'FULL_ADMINISTRATOR',
        },
      },
      adminTotpCredential: {
        create: {
          secretCiphertext: totp.encryptSecret(totp.generateSecret()),
          keyVersion: 'mfa-v1',
          createdAt: now,
          enabledAt: now,
        },
      },
    },
  });
  token = randomBytes(32).toString('hex');
  await prisma.authSession.create({
    data: {
      userId: administrator.id,
      tokenHash: createHash('sha256').update(token).digest('hex'),
      createdAt: now,
      expiresAt: new Date(now.getTime() + 3600000),
      twoFactorVerifiedAt: now,
    },
  });
  await prisma.user.createMany({
    data: Array.from({ length: 70 }, (_, index) => ({
      id: id(1000 + index),
      email: `browser160-${index}@example.test`,
      role: 'CUSTOMER',
      status: 'ACTIVE',
      createdAt: new Date('2026-01-01T00:00:00Z'),
      emailVerifiedAt: new Date('2026-01-01T00:00:00Z'),
    })),
  });
  await prisma.customer.createMany({
    data: Array.from({ length: 70 }, (_, index) => ({
      // Historical inventory must not displace other journeys' recent-client fixtures.
      createdAt: new Date('2026-01-01T00:00:00Z'),
      id: id(2000 + index),
      userId: id(1000 + index),
      customerNumber: `CUS-BROWSER160-${index}`,
      firstName: 'Fictional',
      lastName: `Inventory ${index}`,
      addressLine1: '1 Fictional Road',
      city: 'Dhaka',
      countryCode: 'BD',
      status: 'ACTIVE',
    })),
  });
  const account = await prisma.registrarAccount.create({
    data: {
      mode: 'LIVE',
      enabled: false,
      configuration: { schemaVersion: 2, resellerId: '16000' },
    },
  });
  registrarId = account.id;
  await prisma.registrarProfile.create({
    data: {
      accountId: account.id,
      name: 'Fictional disabled browser registrar',
    },
  });
  const cipher = new RegistrarCipher(environment.CREDENTIAL_ENCRYPTION_KEY);
  const credential = await prisma.registrarCredential.create({
    data: {
      accountId: account.id,
      version: 1,
      ciphertext: cipher.encrypt(credentialBinding(account.id, 1, 'LIVE'), {
        resellerId: '16000',
        apiKey: 'fictional'.repeat(4),
      }),
    },
  });
  await prisma.domain.createMany({
    data: Array.from({ length: 140 }, (_, index) => ({
      id: id(3000 + index),
      customerId: id(2000 + Math.floor(index / 2)),
      accountId: account.id,
      executionAccountId: account.id,
      domainName: `inventory160-browser-${String(index).padStart(4, '0')}.com`,
      submissionKey: randomUUID(),
      origin: 'EXISTING',
      state: 'REGISTERED',
      providerOrderId: String(160000 + index),
      linkCredentialId: credential.id,
      ownershipVerifiedAt: new Date('2026-01-01T00:00:00Z'),
      expiresAt: new Date('2027-01-01T00:00:00Z'),
      createdAt: new Date('2026-01-01T00:00:00Z'),
      linkEvidenceCiphertext: cipher.encrypt(
        `resellbiz:existing-link:${id(3000 + index)}`,
        {
          remoteCustomerId: String(260000 + Math.floor(index / 2)),
          remoteContactId: String(360000 + index),
          nameservers: ['ns1.fictional-host.com', 'ns2.fictional-host.com'],
          contact: {
            name: 'Fictional registrant',
            company: 'Fictional company',
            address: '1 Fictional Road',
            city: 'Dhaka',
            region: 'Dhaka',
            postalCode: '1000',
            country: 'BD',
            email: 'browser160-registry@example.test',
            phoneCountryCode: '880',
            phone: '1700000000',
          },
        },
      ),
    })),
  });
});
test.beforeEach(async ({ context }) => {
  await context.addCookies([
    { name: 'webhost_session', value: token, url: E2E_WEB_ORIGIN },
  ]);
});
test('administrator finds an older domain with URL history and opens its owning client without mutations', async ({
  page,
}) => {
  const before = await counts();
  const { writes } = trackReads(page);
  await page.goto(
    '/admin/domains?search=inventory160-browser&page=7&pageSize=20',
  );
  const table = page.getByRole('table', {
    name: 'Domain inventory',
    exact: true,
  });
  await expect(table.locator('tbody tr')).toHaveCount(20);
  await expect(page.getByText(/140 matching domains/)).toContainText(
    'Page 7 of 7',
  );
  await expect(page.getByRole('button', { name: 'Next page' })).toBeDisabled();
  await expect(
    page.getByRole('link', { name: oldest, exact: true }),
  ).toHaveAttribute('href', `/admin/customers/${id(2000)}/domains/${id(3000)}`);
  await page.getByRole('button', { name: 'Previous page' }).click();
  await expect(page).toHaveURL(/page=6/);
  await expect(page.getByText(/140 matching domains/)).toContainText(
    'Page 6 of 7',
  );
  await expect(
    page.getByRole('heading', { name: 'Domain inventory', exact: true }),
  ).toBeFocused();
  await page.goBack();
  await expect(page.getByText(/140 matching domains/)).toContainText(
    'Page 7 of 7',
  );
  await page.getByRole('searchbox', { name: 'Search domains' }).fill(oldest);
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page).toHaveURL(/page=1.*search=inventory160-browser-0000.com/);
  await expect(page.getByText(/1 matching domains/)).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole('searchbox', { name: 'Search domains' }),
  ).toHaveValue(oldest);
  await page.getByRole('link', { name: oldest, exact: true }).click();
  await expect(
    page.getByRole('heading', { name: oldest, exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('combobox', { name: 'Client', exact: true }),
  ).toHaveValue(id(2000));
  await assertUnchanged(before, writes);
});
test('administrator filters the complete inventory with responsive scrolling and invalid-scope rejection', async ({
  page,
}) => {
  const before = await counts();
  const { writes, inventoryReads } = trackReads(page);
  await page.goto('/admin/domains?search=inventory160-browser');
  await page
    .getByRole('combobox', { name: 'Domain origin', exact: true })
    .selectOption('EXISTING');
  await page
    .getByRole('combobox', { name: 'Domain status', exact: true })
    .selectOption('REGISTERED');
  await expect(page).toHaveURL(/state=REGISTERED&origin=EXISTING/);
  await expect(page.getByText(/140 matching domains/)).toBeVisible();
  for (const width of [1440, 375]) {
    await page.setViewportSize({ width, height: 1000 });
    await expectRecordPageFits(page, 'command160-domains-' + width);
    const output = resolve(
      '../../release-artifacts/command160-domain-inventory',
    );
    await mkdir(output, { recursive: true });
    await page.screenshot({
      path: resolve(output, `inventory-${width}.png`),
      fullPage: true,
      animations: 'disabled',
    });
  }
  const scroll = page.getByRole('group', {
    name: 'Domain inventory — scroll horizontally',
    exact: true,
  });
  expect(
    await scroll.evaluate((node) => node.scrollWidth > node.clientWidth),
  ).toBe(true);
  await page.getByRole('button', { name: 'Clear inventory filters' }).click();
  await expect(page).toHaveURL(/\/admin\/domains\?page=1&pageSize=20$/);
  await expect(
    page.getByRole('searchbox', { name: 'Search domains' }),
  ).toHaveValue('');
  await expect(
    page.getByRole('table', { name: 'Domain inventory', exact: true }),
  ).toBeVisible();
  const readCount = inventoryReads.length;
  await page.goto('/admin/domains?customerId=invalid');
  await expect(
    page
      .getByRole('region', { name: 'Domain inventory', exact: true })
      .getByRole('alert'),
  ).toContainText('No inventory request');
  expect(inventoryReads).toHaveLength(readCount);
  await assertUnchanged(before, writes);
});
