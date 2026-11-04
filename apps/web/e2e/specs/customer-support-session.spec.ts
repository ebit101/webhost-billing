import { expect, test } from '@playwright/test';
import { e2ePrisma } from '../database';
import { assertBrowserDatabaseScope } from '../database-scope';
import { E2E_API_ORIGIN, E2E_DATABASE_URL, E2E_SCHEMA } from '../environment';
import {
  E2E_ADMIN,
  E2E_HEALTHY_CUSTOMER,
  E2E_HISTORY_CUSTOMER,
} from '../fixtures';

test.afterAll(async () => e2ePrisma.$disconnect());

test('support mode scopes portal access, expires and restores the original administrator', async ({
  page,
}) => {
  await assertBrowserDatabaseScope(e2ePrisma, E2E_DATABASE_URL, E2E_SCHEMA);
  const { passwordHash } = await e2ePrisma.user.findUniqueOrThrow({
    where: { id: E2E_ADMIN.userId },
    select: { passwordHash: true },
  });
  const admin = await e2ePrisma.adminProfile.create({
    data: {
      displayName: 'Fictional support administrator',
      user: {
        create: {
          email: 'command188-admin@example.test',
          passwordHash,
          role: 'ADMIN',
          status: 'ACTIVE',
          emailVerifiedAt: new Date(),
        },
      },
    },
    include: { user: true },
  });
  const { customerId } = E2E_HEALTHY_CUSTOMER;
  const recordPath = `/admin/customers/${customerId}`;
  const startPath = `/auth/customer-support-sessions/${customerId}`;
  const reason = 'Verify the fictional customer portal';
  const request = page.context().request;
  const csrf = async () => {
    const response = await request.get(`${E2E_API_ORIGIN}/auth/csrf`);
    expect(response.ok()).toBe(true);
    const body: unknown = await response.json();
    if (
      typeof body !== 'object' ||
      body === null ||
      !('data' in body) ||
      typeof body.data !== 'object' ||
      body.data === null ||
      !('csrfToken' in body.data) ||
      typeof body.data.csrfToken !== 'string'
    ) {
      throw new Error('Expected a CSRF token from the test API.');
    }
    return { 'X-CSRF-Token': body.data.csrfToken };
  };

  await page.goto('/admin');
  await page.getByLabel('Email address').fill(admin.user.email);
  await page.getByLabel('Password', { exact: true }).fill(E2E_ADMIN.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Business overview' }),
  ).toBeVisible();
  await page.goto(recordPath);

  const sessionCookie = async () =>
    (await page.context().cookies()).find(
      ({ name }) => name === 'webhost_session',
    )?.value;
  const originalSession = await sessionCookie();
  expect(originalSession).toBeTruthy();
  expect(
    (
      await request.post(`${E2E_API_ORIGIN}${startPath}`, {
        headers: await csrf(),
        data: { reason: ' ' },
      })
    ).status(),
  ).toBe(400);

  const start = async () => {
    await page.getByRole('button', { name: 'Sign in as customer' }).click();
    const dialog = page.getByRole('dialog', { name: 'Sign in as customer' });
    await dialog.getByLabel('Support reason').fill(reason);
    await dialog
      .getByRole('button', { name: 'Start read-only session' })
      .click();
    await expect(
      page
        .getByRole('complementary', { name: 'Customer support session' })
        .getByText('Read-only support session', { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: /Welcome, Healthy/ }),
    ).toBeVisible();
  };

  await start();
  expect(
    (
      await request.get(
        `${E2E_API_ORIGIN}/customers/${E2E_HISTORY_CUSTOMER.customerId}`,
      )
    ).status(),
  ).toBe(403);
  expect(
    (
      await request.patch(
        `${E2E_API_ORIGIN}/auth/customer-security-preferences`,
        { headers: await csrf(), data: { marketingConsent: true } },
      )
    ).status(),
  ).toBe(403);
  await page.getByRole('button', { name: 'End session' }).click();
  await expect(page).toHaveURL(new RegExp(`${recordPath}$`));
  await expect(
    page.getByRole('button', { name: 'Sign in as customer' }),
  ).toBeVisible();
  expect(await sessionCookie()).toBe(originalSession);

  await start();
  const active = await e2ePrisma.customerSupportSession.findFirstOrThrow({
    where: {
      customerId,
      endedAt: null,
      adminSession: { userId: admin.userId },
    },
  });
  const remaining = active.expiresAt.getTime() - Date.now();
  expect(remaining).toBeGreaterThan(14 * 60_000);
  expect(remaining).toBeLessThanOrEqual(15 * 60_000);
  await e2ePrisma.customerSupportSession.update({
    where: { id: active.id },
    data: { expiresAt: new Date(Date.now() - 1_000) },
  });
  expect((await request.get(`${E2E_API_ORIGIN}/auth/me`)).status()).toBe(401);
  await page.reload();
  await expect(
    page.getByText('Support session is no longer active'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'End session' }).click();
  await expect(page).toHaveURL(new RegExp(`${recordPath}$`));
  expect(await sessionCookie()).toBe(originalSession);

  const audit = await e2ePrisma.activityLog.findMany({
    where: {
      actorUserId: admin.userId,
      entityId: customerId,
      action: {
        in: [
          'CUSTOMER_SUPPORT_SESSION_STARTED',
          'CUSTOMER_SUPPORT_SESSION_ENDED',
        ],
      },
    },
  });
  expect(
    audit.filter(({ action }) => action.endsWith('_STARTED')),
  ).toHaveLength(2);
  expect(audit.filter(({ action }) => action.endsWith('_ENDED'))).toHaveLength(
    2,
  );
  expect(audit).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        metadata: expect.objectContaining({
          reason,
          supportSessionId: active.id,
        }),
      }),
    ]),
  );

  try {
    await e2ePrisma.adminProfile.update({
      where: { id: admin.id },
      data: { staffRole: 'SUPPORT_OPERATOR' },
    });
    expect(
      (
        await request.post(`${E2E_API_ORIGIN}${startPath}`, {
          headers: await csrf(),
          data: { reason },
        })
      ).status(),
    ).toBe(403);
  } finally {
    await e2ePrisma.adminProfile.update({
      where: { id: admin.id },
      data: { staffRole: 'FULL_ADMINISTRATOR' },
    });
  }
});
