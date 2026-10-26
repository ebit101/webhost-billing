import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { parseApiEnvironment } from '@webhost-billing/config';
import { TotpService } from '../../../api/dist/modules/auth/services/totp.service';
import { e2ePrisma } from '../database';
import { assertBrowserDatabaseScope } from '../database-scope';
import {
  E2E_DATABASE_URL,
  E2E_SCHEMA,
  E2E_WEB_ORIGIN,
  e2eApiEnvironment,
} from '../environment';

// Fictional credentials and session cookies must never enter browser artifacts.
test.use({ trace: 'off', screenshot: 'off', video: 'off' });
test.afterAll(async () => e2ePrisma.$disconnect());
for (const width of [390, 1280]) {
  test(`Separate domain administration is actionable at ${width}px without provider calls`, async ({
    page,
    context,
  }) => {
    await assertBrowserDatabaseScope(e2ePrisma, E2E_DATABASE_URL, E2E_SCHEMA);
    const userId = randomUUID(),
      now = new Date();
    const totp = new TotpService(
      parseApiEnvironment({ ...e2eApiEnvironment, PORT: '3201' }),
    );
    await e2ePrisma.user.create({
      data: {
        id: userId,
        email: `${userId}@example.test`,
        role: 'ADMIN',
        status: 'ACTIVE',
        emailVerifiedAt: now,
        adminProfile: {
          create: {
            displayName: 'Fictional catalogue administrator',
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
    const token = randomBytes(32).toString('hex');
    await e2ePrisma.authSession.create({
      data: {
        userId,
        tokenHash: createHash('sha256').update(token).digest('hex'),
        createdAt: now,
        expiresAt: new Date(Date.now() + 3600000),
        twoFactorVerifiedAt: now,
      },
    });
    await context.addCookies([
      {
        name: 'webhost_session',
        value: token,
        url: E2E_WEB_ORIGIN,
        httpOnly: true,
        sameSite: 'Lax',
      },
    ]);
    const fake = await e2ePrisma.registrarAccount.create({
      data: {
        mode: 'FAKE',
        enabled: true,
      },
    });
    await e2ePrisma.registrarProfile.create({
      data: {
        accountId: fake.id,
        name: `Fictional registrar ${width}`,
        nativeCostConfirmed: true,
      },
    });
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/admin/settings/registrars');
    await expect(
      page.getByRole('heading', { name: 'Domain registrars', exact: true }),
    ).toBeVisible();
    await page
      .getByRole('button', {
        name: 'Manage Fictional registrar ' + width,
        exact: true,
      })
      .click();
    await page
      .getByRole('dialog', {
        name: 'Fictional registrar ' + width,
        exact: true,
      })
      .getByRole('button', { name: 'Set as default' })
      .click();
    await expect(page.getByRole('alertdialog')).toContainText(
      'Existing quotes, approvals and domains will not be rerouted',
    );
    await page
      .getByRole('alertdialog')
      .getByRole('button', { name: 'Confirm' })
      .click();
    await expect(page.getByRole('status')).toContainText(
      'Installation default saved',
    );
    expect(
      await e2ePrisma.registrarProfile.count({ where: { isDefault: true } }),
    ).toBe(1);
    expect(
      (
        await e2ePrisma.registrarProfile.findUniqueOrThrow({
          where: { accountId: fake.id },
        })
      ).isDefault,
    ).toBe(true);
    await page
      .getByRole('dialog', {
        name: 'Fictional registrar ' + width,
        exact: true,
      })
      .getByRole('button', { name: 'Close', exact: true })
      .click();
    await page
      .getByRole('button', { name: 'Add registrar connection', exact: true })
      .click();
    await page
      .getByLabel('Connection name')
      .fill(`Fictional disabled connection ${width}`);
    await page
      .getByLabel('Reseller ID', { exact: true })
      .fill(String(70000 + width));
    await page
      .getByLabel('API key', { exact: true })
      .fill('fictionalOnlyKey123456'.repeat(2));
    await page
      .getByRole('button', { name: 'Save connection', exact: true })
      .click();
    await expect(page.getByRole('status')).toContainText('disabled');
    await expect(page.getByLabel('API key', { exact: true })).toHaveValue('');
    await expect(page.getByLabel('Nameservers')).toHaveCount(0);
    await expect(page.getByLabel('Customer terms')).toHaveCount(0);
    await page.goto('/admin/settings/domain-defaults');
    await page
      .getByLabel('Nameservers, separated by commas')
      .fill('ns1.fictional-host.com, ns2.fictional-host.com');
    await page.getByRole('button', { name: 'Save DNS defaults' }).click();
    await expect(page.getByRole('status')).toContainText('Defaults saved');
    await page
      .getByLabel('Domain-registration policy')
      .fill('https://fictional-host.com/domain-policy');
    await page
      .getByLabel('Customer terms')
      .fill('https://fictional-host.com/terms');
    await page
      .getByLabel('Privacy policy')
      .fill('https://fictional-host.com/privacy');
    await page.getByRole('button', { name: 'Save reviewed policies' }).click();
    await expect(page.getByRole('status')).toContainText('Defaults saved');
    await page.goto('/admin/domain-pricing');
    // This isolated schema is shared only by this serial browser run.
    const existing = await e2ePrisma.domainCatalogueTld.findUnique({
      where: { tld: 'com' },
    });
    if (existing)
      await page
        .getByRole('row')
        .filter({ has: page.getByText('.com', { exact: true }) })
        .getByRole('button', { name: 'Pricing for .com' })
        .click();
    else
      await page.getByRole('button', { name: 'Add TLD', exact: true }).click();
    if (!existing) await page.getByLabel('TLD', { exact: true }).fill('com');
    await page.getByLabel('One-year registration price (BDT)').fill('1500.25');
    await page.getByLabel('One-year renewal price (BDT)').fill('1700.50');
    await page
      .getByLabel('Preferred registrar', { exact: true })
      .selectOption(fake.id);
    await page.getByLabel('Offer registration', { exact: true }).check();
    await page.getByLabel('Featured extension').check();
    await page.getByRole('button', { name: 'Save TLD pricing' }).click();
    await expect(page.getByRole('status')).toContainText('TLD revision saved');
    const row = page
      .getByRole('row')
      .filter({ has: page.getByText('.com', { exact: true }) });
    await expect(row).toContainText('1500.25');
    await expect(row).toContainText(`Fictional registrar ${width}`);
    await row.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Review selected TLDs' }).click();
    await expect(page.getByRole('alertdialog')).toContainText('.com');
    await page
      .getByRole('alertdialog')
      .getByRole('button', { name: 'Confirm' })
      .click();
    await expect(page.getByRole('status')).toContainText(
      'Reviewed TLD batch applied',
    );
    const catalogue = await e2ePrisma.domainCatalogueTld.findUniqueOrThrow({
      where: { tld: 'com' },
    });
    expect(catalogue.enabled).toBe(false);
    expect(catalogue.renewalAmount).toBe(170050n);
    expect(
      (
        await e2ePrisma.productPrice.findUniqueOrThrow({
          where: { id: catalogue.registrationPriceId! },
        })
      ).amount,
    ).toBe(150025n);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      ),
    ).toBe(false);
    expect(await e2ePrisma.registrarOperation.count()).toBe(0);
    expect(await e2ePrisma.domainAction.count()).toBe(0);
  });
}
