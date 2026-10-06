import { expect, test, type Request } from '@playwright/test';
import { e2ePrisma } from '../database';
import { E2E_DATABASE_URL, E2E_SCHEMA } from '../environment';
import { assertBrowserDatabaseScope } from '../database-scope';
import { E2E_ADMIN, E2E_HISTORY_CUSTOMER } from '../fixtures';

test.use({ trace: 'off', screenshot: 'off', video: 'off' });
test.afterAll(async () => e2ePrisma.$disconnect());
const paymentId = '84000000-0000-4000-8000-000000000084';
const reference = 'COMMAND84-FICTIONAL-REFERENCE';

test('administrator inspects manual payment and follows context without business mutations', async ({
  page,
}) => {
  const database = new URL(E2E_DATABASE_URL);
  if (
    !/^command26_e2e_[a-f0-9]{32}$/.test(E2E_SCHEMA) ||
    database.searchParams.get('schema') !== E2E_SCHEMA ||
    !['127.0.0.1', 'localhost', '[::1]'].includes(database.hostname)
  )
    throw new Error(
      'Manual payment review requires the dedicated loopback fictional schema.',
    );
  await assertBrowserDatabaseScope(e2ePrisma, E2E_DATABASE_URL, E2E_SCHEMA);
  // One pending fictional reference, not a verified charge or invoice settlement.
  await e2ePrisma.payment.create({
    data: {
      id: paymentId,
      invoiceId: E2E_HISTORY_CUSTOMER.oldestInvoiceId,
      provider: 'manual',
      idempotencyKey: 'command84-fictional-browser-review',
      amount: 100n,
      currency: 'BDT',
      reference,
      manualMethod: 'BANK_TRANSFER',
      createdByUserId: E2E_HISTORY_CUSTOMER.userId,
      proofMetadata: {
        payerName: 'Fictional History Payer',
        note: '<b>Unverified fictional proof</b>',
      },
      receivedAt: new Date('2026-10-04T02:00:00.000Z'),
    },
  });
  await page.goto('/admin');
  await page.getByLabel('Email address').fill(E2E_ADMIN.email);
  await page.getByLabel('Password', { exact: true }).fill(E2E_ADMIN.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/admin$/);
  // The sign-in and authenticated dashboard share /admin. URL alone is not
  // evidence that the asynchronous login and server refresh have completed.
  await expect(
    page.getByRole('heading', { name: 'Business overview', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Sign in', exact: true }),
  ).toBeHidden();
  const before = await snapshot();
  const writes: string[] = [];
  const reads: string[] = [];
  const completedReads: string[] = [];
  const cancelledReads: boolean[] = [];
  const isSelectedRead = (request: Request) =>
    new URL(request.url()).pathname === `/payments/${paymentId}` &&
    request.method() === 'GET';
  const observe = (request: Request) => {
    const path = new URL(request.url()).pathname;
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method()))
      writes.push(path);
    if (isSelectedRead(request)) reads.push(path);
  };
  const finished = (request: Request) => {
    if (isSelectedRead(request))
      completedReads.push(new URL(request.url()).pathname);
  };
  const failed = (request: Request) => {
    if (isSelectedRead(request))
      cancelledReads.push(request.failure()?.errorText === 'net::ERR_ABORTED');
  };
  page.on('request', observe);
  page.on('requestfinished', finished);
  page.on('requestfailed', failed);
  const review = page.getByRole('region', { name: 'Payment review' });
  const trigger = page.getByRole('button', {
    name: `Review payment ${reference}`,
  });
  const open = async () => {
    await trigger.click();
    await expect(
      review.getByRole('heading', { name: reference, exact: true }),
    ).toBeVisible();
  };
  try {
    await page.goto(
      `/admin/payments?customerId=${E2E_HISTORY_CUSTOMER.customerId}`,
    );
    await expect(trigger).toBeVisible();
    expect(reads).toEqual([]);
    await expect(review).toHaveCount(0);
    await open();
    // Development Strict Mode may replay the effect once. Only one selected
    // read may complete; every extra request must be explicitly aborted.
    expect(completedReads).toHaveLength(1);
    expect(cancelledReads.length).toBeLessThanOrEqual(1);
    expect(cancelledReads.every((cancelled) => cancelled)).toBe(true);
    expect(reads).toHaveLength(1 + cancelledReads.length);
    await expect(
      review.getByRole('heading', { name: 'Payment review', exact: true }),
    ).toBeFocused();
    await expect(review).toContainText('Pending');
    await expect(review).toContainText('BDT 1.00');
    await expect(review).toContainText('BDT 0.00');
    await expect(review).toContainText('<b>Unverified fictional proof</b>');
    await expect(review.locator('b, script, form, input')).toHaveCount(0);
    await expect(review).toContainText(
      'Payment is not proof of hosting provisioning',
    );
    await expect(review).toContainText(
      'Refundable capacity is not invoice balance',
    );
    await expect(
      review.getByRole('link', { name: 'View customer' }),
    ).toHaveAttribute(
      'href',
      `/admin/customers/${E2E_HISTORY_CUSTOMER.customerId}`,
    );
    await expect(
      review.getByRole('link', { name: 'View invoice' }),
    ).toHaveAttribute(
      'href',
      `/admin/invoices/${E2E_HISTORY_CUSTOMER.oldestInvoiceId}`,
    );
    await expect(
      review.getByRole('button', { name: 'Verify', exact: true }),
    ).toHaveCount(0);
    await review.getByRole('link', { name: 'View customer' }).click();
    await expect(page).toHaveURL(
      new RegExp(`/admin/customers/${E2E_HISTORY_CUSTOMER.customerId}$`),
    );
    await expect(
      page.getByRole('heading', { name: 'History Customer', exact: true }),
    ).toBeVisible();
    await page.goBack();
    await expect(trigger).toBeVisible();
    if (!(await review.isVisible())) await open();
    await review.getByRole('link', { name: 'View invoice' }).click();
    await expect(page).toHaveURL(
      new RegExp(`/admin/invoices/${E2E_HISTORY_CUSTOMER.oldestInvoiceId}$`),
    );
    await expect(
      page.getByRole('heading', {
        name: E2E_HISTORY_CUSTOMER.oldestInvoiceNumber,
      }),
    ).toBeVisible();
    await page.goBack();
    await expect(trigger).toBeVisible();
    if (!(await review.isVisible())) await open();
    await page.setViewportSize({ width: 375, height: 812 });
    await expect(review).toBeVisible();
    expect(
      await review.evaluate(
        (element) => element.scrollWidth <= element.clientWidth,
      ),
    ).toBe(true);
    const close = review.getByRole('button', { name: 'Close payment review' });
    await close.focus();
    await page.keyboard.press('Enter');
    await expect(review).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(
      review.getByRole('heading', { name: reference }),
    ).toBeVisible();
    await close.focus();
    await page.keyboard.press('Enter');
    expect(await snapshot()).toEqual(before);
    expect(writes).toEqual([]);
  } finally {
    page.off('request', observe);
    page.off('requestfinished', finished);
    page.off('requestfailed', failed);
  }
});

async function snapshot() {
  return {
    payment: await e2ePrisma.payment.findUniqueOrThrow({
      where: { id: paymentId },
      select: {
        id: true,
        invoiceId: true,
        originalPaymentId: true,
        kind: true,
        status: true,
        amount: true,
        currency: true,
        reviewedAt: true,
        verifiedAt: true,
        updatedAt: true,
      },
    }),
    invoice: await e2ePrisma.invoice.findUniqueOrThrow({
      where: { id: E2E_HISTORY_CUSTOMER.oldestInvoiceId },
      select: {
        id: true,
        status: true,
        amountPaid: true,
        balanceDue: true,
        total: true,
        paidAt: true,
        updatedAt: true,
      },
    }),
    counts: await Promise.all([
      e2ePrisma.order.count(),
      e2ePrisma.invoice.count(),
      e2ePrisma.payment.count(),
      e2ePrisma.paymentEvent.count(),
      e2ePrisma.service.count(),
      e2ePrisma.hostingPanelOperation.count(),
      e2ePrisma.outboxEvent.count(),
      e2ePrisma.activityLog.count(),
    ]),
  };
}
