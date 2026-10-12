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

// Never retain form credentials or session cookies in browser artifacts.
test.use({ trace: 'off', screenshot: 'off', video: 'off' });
test.afterAll(async () => e2ePrisma.$disconnect());
for (const width of [390, 1280]) {
  test(`SMTP configuration is actionable and responsive at ${width}px without sending`, async ({
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
            displayName: 'Fictional SMTP administrator',
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
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/admin/settings');
    const panel = page.getByRole('region', { name: 'SMTP email delivery' });
    await expect(panel.getByLabel('SMTP hostname')).toBeVisible();
    await panel.getByLabel('SMTP hostname').fill('smtp.provider.com');
    await panel.getByLabel('SMTP username').fill('fictional-browser-user');
    await panel.getByLabel('SMTP password').fill('fake'.repeat(8));
    await panel
      .getByRole('button', { name: 'Save SMTP configuration' })
      .click();
    await expect(panel.getByRole('status')).toContainText(
      'inactive until you activate',
    );
    await expect(panel.getByLabel('SMTP password')).toHaveValue('');
    await expect(panel.getByLabel('SMTP username')).toHaveValue('');
    await panel.getByRole('button', { name: 'Activate custom SMTP' }).click();
    await expect(page.getByRole('alertdialog')).toContainText(
      'Queued and future emails',
    );
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(
      panel.getByText(
        'Deployment transport in use (may be a test mail catcher)',
      ),
    ).toBeVisible();
    await panel.getByRole('button', { name: 'Activate custom SMTP' }).click();
    await page.getByRole('button', { name: 'Confirm SMTP activation' }).click();
    await expect(
      panel.getByText('Custom SMTP active', { exact: true }),
    ).toBeVisible();
    await panel
      .getByRole('button', { name: 'Use deployment transport' })
      .click();
    await page
      .getByRole('alertdialog')
      .getByRole('button', { name: 'Use deployment transport' })
      .click();
    await expect(panel.getByRole('status')).toContainText(
      'deployment email transport is now in use',
    );
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(overflow).toBe(false);
    // Direct fixtures do not emit emails and no worker transport is started in this test.
    expect(
      await e2ePrisma.emailLog.count({
        where: { recipientEmail: `${userId}@example.test` },
      }),
    ).toBe(0);
  });
}
