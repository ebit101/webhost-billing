import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expect, test, type Page, type Download } from '@playwright/test';
import { e2ePrisma } from '../database';
import { assertBrowserDatabaseScope } from '../database-scope';
import {
  E2E_API_ORIGIN,
  E2E_DATABASE_URL,
  E2E_SCHEMA,
  E2E_WEB_ORIGIN,
} from '../environment';
import { E2E_ADMIN, E2E_HEALTHY_CUSTOMER } from '../fixtures';

test.use({ trace: 'off', screenshot: 'off', video: 'off' });
test.afterAll(async () => e2ePrisma.$disconnect());

test('customer and administrator exchange screened private attachments through owned ticket messages', async ({
  page,
  browser,
}) => {
  page.setDefaultTimeout(20000);
  await assertBrowserDatabaseScope(e2ePrisma, E2E_DATABASE_URL, E2E_SCHEMA);
  await login(
    page,
    E2E_HEALTHY_CUSTOMER.email,
    E2E_HEALTHY_CUSTOMER.password,
    '/portal',
  );
  await page.goto('/portal/support');
  await page.getByRole('button', { name: 'Open ticket', exact: true }).click();
  const create = page.getByRole('dialog');
  await create
    .getByRole('textbox', { name: 'Subject', exact: true })
    .fill('Fictional attachment browser request');
  await create
    .getByLabel('What can we help with?')
    .fill('Please review the fictional log file.');
  const input = create.locator('input[type="file"]');
  await expect(input).toBeEnabled();
  const customerBytes = Buffer.from(
    'Fictional browser log evidence for Command 217.',
  );
  await input.setInputFiles({
    name: 'fictional-browser.log',
    mimeType: 'text/plain',
    buffer: customerBytes,
  });
  await create
    .getByRole('button', { name: 'Open support ticket', exact: true })
    .click();
  await expect(
    page
      .getByRole('dialog')
      .getByRole('button', { name: 'fictional-browser.log', exact: true }),
  ).toBeVisible();
  const ticket = await e2ePrisma.ticket.findFirstOrThrow({
    where: {
      customerId: E2E_HEALTHY_CUSTOMER.customerId,
      subject: 'Fictional attachment browser request',
    },
    include: { messages: { include: { attachments: true } } },
  });
  expect(ticket.messages[0]?.attachments[0]?.status).toBe('ATTACHED');
  const download = page.waitForEvent('download');
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'fictional-browser.log', exact: true })
    .click();
  expect(await bytes(await download)).toEqual(customerBytes);

  const adminContext = await browser.newContext({ baseURL: E2E_WEB_ORIGIN });
  try {
    const adminPage = await adminContext.newPage();
    adminPage.setDefaultTimeout(20000);
    await login(adminPage, E2E_ADMIN.email, E2E_ADMIN.password, '/admin');
    await adminPage.goto('/admin/support');
    await adminPage
      .getByRole('table', { name: 'Filtered support tickets' })
      .getByRole('button', { name: /Fictional attachment browser request/ })
      .click();
    const dialog = adminPage.getByRole('dialog');
    const staffRead = adminPage.waitForEvent('download');
    await dialog
      .getByRole('button', { name: 'fictional-browser.log', exact: true })
      .click();
    expect(await bytes(await staffRead)).toEqual(customerBytes);
    await dialog
      .getByLabel('Reply in plain text')
      .fill('The fictional log was reviewed. See the attached note.');
    const replyInput = dialog.locator('input[type="file"]');
    await expect(replyInput).toBeEnabled();
    const adminBytes = Buffer.from(
      'Fictional staff review, with no credentials.',
    );
    await replyInput.setInputFiles({
      name: 'fictional-admin-note.txt',
      mimeType: 'text/plain',
      buffer: adminBytes,
    });
    await dialog
      .getByRole('button', { name: 'Send reply', exact: true })
      .click();
    await expect(
      dialog.getByRole('button', {
        name: 'fictional-admin-note.txt',
        exact: true,
      }),
    ).toBeVisible();
    const history = await e2ePrisma.ticketMessage.findMany({
      where: { ticketId: ticket.id },
      include: { attachments: true },
    });
    expect(history).toHaveLength(2);
    expect(history.flatMap((message) => message.attachments)).toHaveLength(2);
    await page.reload();
    await page
      .getByRole('button', { name: ticket.ticketNumber, exact: true })
      .click();
    const customerRead = page.waitForEvent('download');
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'fictional-admin-note.txt', exact: true })
      .click();
    expect(await bytes(await customerRead)).toEqual(adminBytes);
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(
      page
        .getByRole('dialog')
        .getByRole('button', { name: 'fictional-admin-note.txt', exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.setViewportSize({ width: 1440, height: 1000 });
    const directory = resolve('test-results/command217');
    await mkdir(directory, { recursive: true });
    await page.screenshot({
      path: resolve(directory, 'private-ticket-attachments.png'),
    });
  } finally {
    await adminContext.close();
  }
});

async function bytes(download: Download) {
  const stream = await download.createReadStream();
  if (!stream) throw new Error('Missing fictional download');
  const parts: Buffer[] = [];
  for await (const part of stream as AsyncIterable<unknown>) {
    if (!Buffer.isBuffer(part)) throw new Error('Invalid fictional bytes');
    parts.push(part);
  }
  return Buffer.concat(parts);
}

async function login(
  page: Page,
  email: string,
  password: string,
  destination: '/portal' | '/admin',
) {
  await page.goto(destination === '/admin' ? '/admin' : '/login');
  await page.getByLabel('Email address', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect
    .poll(async () =>
      (await page.context().cookies(E2E_API_ORIGIN)).some(
        (cookie) =>
          cookie.name === 'webhost_session' ||
          cookie.name === '__Host-webhost_session',
      ),
    )
    .toBe(true);
  await expect(page).toHaveURL(new RegExp(`${destination}$`));
  await expect(
    page.getByRole('button', { name: 'Sign in', exact: true }),
  ).toBeHidden();
}
