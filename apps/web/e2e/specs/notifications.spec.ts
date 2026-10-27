import { test, expect, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { hash } from 'argon2';
import { createPrismaClient } from '@webhost-billing/database';
import { DEFAULT_RENEWAL_AUTOMATION_POLICY } from '@webhost-billing/shared';
import {
  parseApiEnvironment,
  parseWorkerEnvironment,
} from '@webhost-billing/config';
import { TokenCipherService } from '../../../api/dist/modules/auth/services/token-cipher.service';
import { NotificationProjectionService } from '../../../worker/dist/notifications/notification-projection.service';
import { NotificationDeliveryService } from '../../../worker/dist/notifications/notification-delivery.service';
import { WhatsAppPreviewAdapter } from '../../../worker/dist/notifications/whatsapp-preview.adapter';
import { notificationDestinationFingerprint } from '../../../worker/dist/notifications/notification-projection.service';
import { assertBrowserDatabaseScope } from '../database-scope';
import {
  E2E_API_ORIGIN,
  E2E_DATABASE_URL,
  E2E_SCHEMA,
  e2eApiEnvironment,
} from '../environment';
import { E2E_ADMIN, E2E_PRODUCT, E2E_SERVER } from '../fixtures';
import { expectRecordPageFits } from '../assert-record-layout';

const prisma = createPrismaClient(E2E_DATABASE_URL);
const output = resolve(
  process.cwd(),
  '../../release-artifacts/command137-notifications',
);
const environment = parseWorkerEnvironment({
  ...e2eApiEnvironment,
  NOTIFICATION_DELIVERY_MODE: 'preview',
  EMAIL_PREVIEW_DIRECTORY: output,
});
const projector = new NotificationProjectionService(prisma, environment);
const delivery = new NotificationDeliveryService(
  prisma,
  environment,
  new WhatsAppPreviewAdapter(output),
);
const suffix = randomUUID();
const adminEmail = `notifications-admin-${suffix}@example.test`;
const clientEmail = `notifications-client-${suffix}@example.test`;
const secondEmail = `notifications-other-${suffix}@example.test`;

test.afterAll(async () => prisma.$disconnect());

test('notification plan: automatic important WhatsApp, own history, previews, stale state and responsive tables', async ({
  page,
  browser,
}) => {
  test.setTimeout(180000);
  await assertBrowserDatabaseScope(prisma, E2E_DATABASE_URL, E2E_SCHEMA);
  await mkdir(output, { recursive: true });
  const passwordHash = await hash(E2E_ADMIN.password, {
    type: 2,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });
  const admin = await prisma.user.create({
    data: {
      email: adminEmail,
      passwordHash,
      role: 'ADMIN',
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
      adminProfile: {
        create: { displayName: 'Fictional Notification Administrator' },
      },
    },
  });
  async function client(email: string, phone: string) {
    return prisma.user.create({
      data: {
        email,
        passwordHash,
        role: 'CUSTOMER',
        status: 'ACTIVE',
        emailVerifiedAt: new Date(),
        customer: {
          create: {
            customerNumber: `N137-${randomUUID().slice(0, 8)}`,
            firstName: 'Fictional',
            lastName: 'Notification Customer',
            phone,
            addressLine1: '137 Fictional Road',
            city: 'Dhaka',
            countryCode: 'BD',
          },
        },
      },
      include: { customer: true },
    });
  }
  const customer = await client(clientEmail, '01700000001');
  const other = await client(secondEmail, '+8801700000002');
  expect(
    await prisma.notificationPreference.count({
      where: { userId: customer.id },
    }),
  ).toBe(0);
  const customerId = customer.customer!.id;
  async function createInvoice(ownerId: string, email: string) {
    return prisma.invoice.create({
      data: {
        invoiceNumber: `N137-${randomUUID().slice(0, 8)}`,
        submissionKey: `notification-test:${randomUUID()}`,
        customerId: ownerId,
        status: 'UNPAID',
        currency: 'BDT',
        subtotal: 9007199254740993n,
        total: 9007199254740993n,
        balanceDue: 9007199254740993n,
        customerNameSnapshot: 'Fictional Customer',
        customerEmailSnapshot: email,
        customerAddressSnapshot: { countryCode: 'BD' },
        businessIdentitySnapshot: { name: 'Fictional Speed Host' },
        issuedAt: new Date(Date.now() - 2 * 86400000),
        dueAt: new Date(Date.now() - 86400000),
      },
    });
  }
  const invoice = await createInvoice(customerId, clientEmail);
  const event = await prisma.outboxEvent.create({
    data: {
      aggregateType: 'INVOICE',
      aggregateId: invoice.id,
      eventType: 'EMAIL_INVOICE_CREATED',
      idempotencyKey: `test-invoice:${invoice.id}`,
      payload: { schemaVersion: 1, invoiceId: invoice.id },
    },
  });
  await Promise.all([projector.projectOnce(), projector.projectOnce()]);
  const issued = await prisma.notificationEntry.findMany({
    where: {
      key: 'client-invoice-issued',
      sourceKey: `EMAIL_INVOICE_CREATED:${invoice.id}`,
    },
  });
  expect(issued).toHaveLength(1);
  expect(issued[0]).toMatchObject({
    userId: customer.id,
    channel: 'WHATSAPP',
    status: 'QUEUED',
  });
  expect(
    await prisma.notificationEntry.count({
      where: {
        userId: other.id,
        sourceKey: `EMAIL_INVOICE_CREATED:${invoice.id}`,
      },
    }),
  ).toBe(0);
  expect(
    await prisma.outboxEvent.count({
      where: { eventType: 'EMAIL_INVOICE_CREATED', aggregateId: invoice.id },
    }),
  ).toBe(1);
  expect(
    (await prisma.outboxEvent.findUniqueOrThrow({ where: { id: event.id } }))
      .status,
  ).toBe('PENDING');
  // A distinct outbox UUID for the same issued invoice must not duplicate WhatsApp.
  await prisma.outboxEvent.create({
    data: {
      aggregateType: 'INVOICE',
      aggregateId: invoice.id,
      eventType: 'EMAIL_INVOICE_CREATED',
      idempotencyKey: `duplicate-invoice:${event.id}`,
      payload: { schemaVersion: 1, invoiceId: invoice.id },
    },
  });
  await projector.projectOnce();
  expect(
    await prisma.notificationEntry.count({
      where: {
        userId: customer.id,
        key: 'client-invoice-issued',
        sourceKey: `EMAIL_INVOICE_CREATED:${invoice.id}`,
      },
    }),
  ).toBe(1);
  expect(
    await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } }),
  ).toMatchObject({
    total: 9007199254740993n,
    balanceDue: 9007199254740993n,
    status: 'UNPAID',
  });

  async function deliverEntry(id: string) {
    const outbox = await prisma.outboxEvent.findFirstOrThrow({
      where: { eventType: 'NOTIFICATION_DELIVERY_REQUESTED', aggregateId: id },
    });
    await prisma.outboxEvent.update({
      where: { id: outbox.id },
      data: { status: 'PUBLISHED', publishedAt: new Date() },
    });
    const job = {
      schemaVersion: 1 as const,
      outboxEventId: outbox.id,
      aggregateType: 'NOTIFICATION',
      aggregateId: id,
      eventType: outbox.eventType,
      correlationId: outbox.id,
    };
    await Promise.all([delivery.deliver(job), delivery.deliver(job)]);
  }
  await deliverEntry(issued[0]!.id);
  expect(
    await prisma.notificationEntry.findUniqueOrThrow({
      where: { id: issued[0]!.id },
    }),
  ).toMatchObject({ status: 'PREVIEWED', attemptCount: 1 });
  const previews = await readdir(resolve(output, 'whatsapp'));
  expect(previews.length).toBeGreaterThan(0);
  const texts = await Promise.all(
    previews.map((file) => readFile(resolve(output, 'whatsapp', file), 'utf8')),
  );
  expect(texts.join('')).toContain('An invoice is available');
  expect(texts.join('')).not.toContain('+8801700000001');
  expect(texts.join('')).not.toContain('9007199254740993');

  const overdue = await prisma.outboxEvent.create({
    data: {
      aggregateType: 'INVOICE',
      aggregateId: invoice.id,
      eventType: 'EMAIL_OVERDUE_NOTICE',
      idempotencyKey: `test-overdue:${invoice.id}`,
      payload: { schemaVersion: 1, invoiceId: invoice.id },
    },
  });
  await projector.projectOnce();
  const overdueEntry = await prisma.notificationEntry.findFirstOrThrow({
    where: {
      sourceKey: `EMAIL_OVERDUE_NOTICE:${invoice.id}`,
      userId: customer.id,
      channel: 'WHATSAPP',
    },
  });
  expect(
    (await prisma.outboxEvent.findUniqueOrThrow({ where: { id: overdue.id } }))
      .status,
  ).toBe('PENDING');
  expect(overdueEntry.status).toBe('QUEUED');
  await prisma.invoice.update({
    where: { id: invoice.id },
    data: {
      status: 'PAID',
      amountPaid: invoice.total,
      balanceDue: 0n,
      paidAt: new Date(),
    },
  });
  await deliverEntry(overdueEntry.id);
  expect(
    (
      await prisma.notificationEntry.findUniqueOrThrow({
        where: { id: overdueEntry.id },
      })
    ).status,
  ).toBe('SUPPRESSED');

  await signIn(page, adminEmail);
  await page.goto('/admin/notifications');
  await expect(
    page.getByRole('table', { name: 'Notification list', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('cell', { name: 'Daily operations summary', exact: true }),
  ).toBeVisible();
  const customerContext = await browser.newContext();
  const customerPage = await customerContext.newPage();
  try {
    await signIn(customerPage, clientEmail);
    await customerPage.goto('/portal/notifications');
    await expect(
      customerPage.getByRole('cell', { name: 'Invoice issued', exact: true }),
    ).toBeVisible();
    const invoiceRow = customerPage.getByRole('row').filter({
      has: customerPage.getByRole('cell', {
        name: 'Invoice issued',
        exact: true,
      }),
    });
    await expect(invoiceRow.getByText('Important alert')).toBeVisible();
    const preferences = await customerPage.request.get(
      `${E2E_API_ORIGIN}/notifications/preferences`,
    );
    expect(await preferences.json()).toMatchObject({
      data: { whatsAppEnabled: true, maskedPhone: '••••0001' },
    });
    expect(JSON.stringify(await preferences.json())).not.toContain('consent');
    await customerPage
      .getByRole('button', { name: 'Alert history', exact: true })
      .click();
    await expect(
      customerPage.getByRole('table', { name: 'Alert history', exact: true }),
    ).toBeVisible();
    await expect(
      customerPage.getByRole('cell', {
        name: 'Local preview saved',
        exact: true,
      }),
    ).toBeVisible();
    const history = await customerPage.request.get(
      `${E2E_API_ORIGIN}/notifications`,
    );
    const historyText = await history.text();
    expect(historyText).not.toContain(admin.id);
    expect(historyText).not.toContain(other.id);
    expect(historyText).not.toContain('destinationFingerprint');
    expect(historyText).not.toContain('phoneCiphertext');
    expect(
      (
        await customerPage.request.get(
          `${E2E_API_ORIGIN}/notifications?userId=${other.id}`,
        )
      ).status(),
    ).toBe(400);
    expect(
      (
        await customerPage.request.patch(
          `${E2E_API_ORIGIN}/notifications/preferences`,
          { data: { whatsAppEnabled: false } },
        )
      ).status(),
    ).toBe(403);

    // Turning automatic alerts off cancels a queued alert and does not resend it.
    const anotherInvoice = await createInvoice(customerId, clientEmail);
    await prisma.outboxEvent.create({
      data: {
        aggregateType: 'INVOICE',
        aggregateId: anotherInvoice.id,
        eventType: 'EMAIL_INVOICE_CREATED',
        idempotencyKey: `test-invoice-again:${anotherInvoice.id}`,
        payload: { schemaVersion: 1, invoiceId: anotherInvoice.id },
      },
    });
    await projector.projectOnce();
    const nextEntry = await prisma.notificationEntry.findFirstOrThrow({
      where: {
        sourceKey: `EMAIL_INVOICE_CREATED:${anotherInvoice.id}`,
        userId: customer.id,
      },
    });
    await customerPage
      .getByRole('button', { name: 'Notification preferences', exact: true })
      .click();
    const dialog = customerPage.getByRole('dialog', {
      name: 'Notification preferences',
      exact: true,
    });
    await expect(dialog.getByRole('checkbox')).toBeChecked();
    await dialog.getByRole('checkbox').uncheck();
    await dialog
      .getByRole('button', { name: 'Save preferences', exact: true })
      .click();
    await expect(
      dialog.getByText(
        'Notification preferences saved. Live delivery remains disabled.',
      ),
    ).toBeVisible();
    expect(
      (
        await prisma.notificationEntry.findUniqueOrThrow({
          where: { id: nextEntry.id },
        })
      ).status,
    ).toBe('SUPPRESSED');
    await deliverEntry(nextEntry.id);
    await dialog.getByRole('button', { name: 'Close', exact: true }).click();
    const csrf = await customerPage.request.get(`${E2E_API_ORIGIN}/auth/csrf`);
    const csrfBody = (await csrf.json()) as { data: { csrfToken: string } };
    const headers = {
      'X-CSRF-Token': csrfBody.data.csrfToken,
      Origin: 'http://127.0.0.1:3200',
    };
    // A separate number stays encrypted and survives muting; no opt-in is required.
    expect(
      (
        await customerPage.request.patch(
          `${E2E_API_ORIGIN}/notifications/preferences`,
          {
            headers,
            data: { whatsAppEnabled: true, phone: '+8801700000037' },
          },
        )
      ).status(),
    ).toBe(200);
    const saved = await prisma.notificationPreference.findUniqueOrThrow({
      where: { userId: customer.id },
    });
    expect(saved.phoneCiphertext).not.toContain('+8801700000037');
    expect(saved.phoneLastFour).toBe('0037');
    expect(
      (
        await customerPage.request.patch(
          `${E2E_API_ORIGIN}/notifications/preferences`,
          {
            headers,
            data: { whatsAppEnabled: false },
          },
        )
      ).status(),
    ).toBe(200);
    expect(
      (
        await prisma.notificationPreference.findUniqueOrThrow({
          where: { userId: customer.id },
        })
      ).phoneCiphertext,
    ).toBe(saved.phoneCiphertext);
    // Matching recipient text is insufficient: historical mail must also belong to this customer.
    await prisma.emailLog.createMany({
      data: [
        {
          customerId,
          recipientEmail: clientEmail,
          templateKey: 'invoice-created',
          subjectSnapshot: 'Own fictional invoice',
        },
        {
          customerId: other.customer!.id,
          recipientEmail: clientEmail,
          templateKey: 'invoice-created',
          subjectSnapshot: 'Another account historical invoice',
        },
        {
          customerId,
          recipientEmail: clientEmail,
          templateKey: 'invoice-created',
          subjectSnapshot: 'Predates this account',
          queuedAt: new Date(customer.createdAt.getTime() - 86400000),
        },
      ],
    });
    const emailHistory = await customerPage.request.get(
      `${E2E_API_ORIGIN}/notifications/email-history`,
    );
    const emailHistoryText = await emailHistory.text();
    expect(emailHistoryText).toContain('Own fictional invoice');
    expect(emailHistoryText).not.toContain(
      'Another account historical invoice',
    );
    expect(emailHistoryText).not.toContain('Predates this account');
    for (const width of [1440, 375]) {
      await customerPage.setViewportSize({ width, height: 1000 });
      await expectRecordPageFits(customerPage, `command137-client-${width}`);
      await customerPage.screenshot({
        path: resolve(output, `client-${width}.png`),
        animations: 'disabled',
      });
      await page.setViewportSize({ width, height: 1000 });
      await expectRecordPageFits(page, `command137-admin-${width}`);
      await page.screenshot({
        path: resolve(output, `admin-${width}.png`),
        animations: 'disabled',
      });
    }
  } finally {
    await customerContext.close();
  }

  // New account-security messages use a local email preview, never SMTP.
  const security = await prisma.activityLog.create({
    data: {
      actorUserId: admin.id,
      entityType: 'USER',
      entityId: admin.id,
      action: 'AUTH_TWO_FACTOR_ENABLED',
    },
  });
  await projector.projectOnce();
  const email = await prisma.notificationEntry.findFirstOrThrow({
    where: {
      sourceKey: `audit:${security.id}`,
      key: 'admin-security-alert',
      userId: admin.id,
      channel: 'EMAIL',
    },
  });
  await deliverEntry(email.id);
  expect(
    (
      await prisma.notificationEntry.findUniqueOrThrow({
        where: { id: email.id },
      })
    ).status,
  ).toBe('PREVIEWED');
  expect((await readdir(output)).some((file) => file.endsWith('.eml'))).toBe(
    true,
  );
  // A queued important alert is suppressed when its account is disabled.
  const later = await prisma.activityLog.create({
    data: {
      actorUserId: admin.id,
      entityType: 'USER',
      entityId: admin.id,
      action: 'AUTH_TWO_FACTOR_DISABLED',
    },
  });
  await projector.projectOnce();
  const disabled = await prisma.notificationEntry.findFirstOrThrow({
    where: {
      sourceKey: `audit:${later.id}`,
      userId: admin.id,
      channel: 'EMAIL',
    },
  });
  await prisma.user.update({
    where: { id: admin.id },
    data: { status: 'DISABLED' },
  });
  await deliverEntry(disabled.id);
  expect(
    (
      await prisma.notificationEntry.findUniqueOrThrow({
        where: { id: disabled.id },
      })
    ).status,
  ).toBe('SUPPRESSED');
});

test('notification boundaries: disabled mode, invalid numbers, calendar coverage, restricted roles and bounded retries', async () => {
  test.setTimeout(180000);
  await assertBrowserDatabaseScope(prisma, E2E_DATABASE_URL, E2E_SCHEMA);
  const user = await prisma.user.create({
    data: {
      email: `notification-boundary-${randomUUID()}@example.test`,
      passwordHash: 'unused-fictional-hash',
      role: 'CUSTOMER',
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
      customer: {
        create: {
          customerNumber: `N137-${randomUUID().slice(0, 8)}`,
          firstName: 'Fictional',
          lastName: 'Boundary',
          phone: 'invalid',
          countryCode: 'BD',
          addressLine1: '137 Fictional Road',
          city: 'Dhaka',
        },
      },
    },
    include: { customer: true },
  });
  const administrator = await prisma.user.create({
    data: {
      email: `notification-boundary-admin-${randomUUID()}@example.test`,
      passwordHash: 'unused-fictional-hash',
      role: 'ADMIN',
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
      adminProfile: {
        create: {
          displayName: 'Fictional boundary admin',
          staffRole: 'FULL_ADMINISTRATOR',
        },
      },
    },
  });
  const restricted = await prisma.user.create({
    data: {
      email: `notification-restricted-${randomUUID()}@example.test`,
      passwordHash: 'unused-fictional-hash',
      role: 'ADMIN',
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
      adminProfile: {
        create: {
          displayName: 'Fictional support',
          staffRole: 'SUPPORT_OPERATOR',
        },
      },
    },
  });
  const verified = await prisma.activityLog.create({
    data: {
      action: 'AUTH_EMAIL_VERIFIED',
      entityType: 'USER',
      entityId: user.id,
      actorUserId: user.id,
    },
  });
  const disabledEnvironment = {
    ...environment,
    NOTIFICATION_DELIVERY_MODE: 'disabled' as const,
  };
  await new NotificationProjectionService(
    prisma,
    disabledEnvironment,
  ).projectOnce();
  expect(
    await prisma.notificationEntry.findMany({
      where: { sourceKey: `audit:${verified.id}`, userId: user.id },
    }),
  ).toMatchObject([
    { key: 'client-welcome', channel: 'EMAIL', status: 'DISABLED' },
  ]);
  expect(
    await prisma.notificationEntry.count({
      where: { sourceKey: `audit:${verified.id}`, userId: restricted.id },
    }),
  ).toBe(0);
  expect(
    await prisma.outboxEvent.count({
      where: {
        aggregateId: {
          in: (
            await prisma.notificationEntry.findMany({
              where: { sourceKey: `audit:${verified.id}` },
              select: { id: true },
            })
          ).map((entry) => entry.id),
        },
        eventType: 'NOTIFICATION_DELIVERY_REQUESTED',
      },
    }),
  ).toBe(0);

  // More than one keyset page, both reminder windows, one final alert across day 1/0.
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 86400000);
  await createCalendarDomains(user.customer!.id, user.email, expiresAt);
  await projector.projectOnce(now);
  expect(
    await prisma.notificationEntry.count({
      where: {
        userId: user.id,
        key: 'client-domain-expiry-warning',
        channel: 'EMAIL',
      },
    }),
  ).toBe(101);
  expect(
    await prisma.notificationEntry.count({
      where: {
        userId: user.id,
        key: 'client-domain-expiry-warning',
        channel: 'WHATSAPP',
        status: 'SUPPRESSED',
      },
    }),
  ).toBe(101);
  await projector.projectOnce(expiresAt);
  expect(
    await prisma.notificationEntry.count({
      where: { userId: user.id, key: 'client-domain-expiry-warning' },
    }),
  ).toBe(202);
  const email = await prisma.notificationEntry.findFirstOrThrow({
    where: {
      userId: user.id,
      key: 'client-domain-expiry-warning',
      channel: 'EMAIL',
    },
  });
  await prisma.domain.update({
    where: { id: (email.metadata as { domainId: string }).domainId },
    data: { expiresAt: new Date(now.getTime() + 365 * 86400000) },
  });
  const publish = async (id: string) => {
    const outbox = await prisma.outboxEvent.findFirstOrThrow({
      where: { aggregateId: id, eventType: 'NOTIFICATION_DELIVERY_REQUESTED' },
    });
    await prisma.outboxEvent.update({
      where: { id: outbox.id },
      data: { status: 'PUBLISHED', publishedAt: new Date() },
    });
    return {
      schemaVersion: 1 as const,
      outboxEventId: outbox.id,
      eventType: outbox.eventType,
      aggregateType: 'NOTIFICATION',
      aggregateId: id,
      correlationId: outbox.id,
    };
  };
  await delivery.deliver(await publish(email.id));
  expect(
    (
      await prisma.notificationEntry.findUniqueOrThrow({
        where: { id: email.id },
      })
    ).status,
  ).toBe('SUPPRESSED');
  // A forged routine event cannot widen the WhatsApp allowlist.
  const routine = await prisma.notificationEntry.create({
    data: {
      userId: user.id,
      key: 'client-password-reset',
      sourceKey: `test-routine:${randomUUID()}`,
      channel: 'WHATSAPP',
      status: 'QUEUED',
      metadata: {
        destinationFingerprint: notificationDestinationFingerprint(
          '',
          environment.CREDENTIAL_ENCRYPTION_KEY,
        ),
      },
    },
  });
  await prisma.outboxEvent.create({
    data: {
      aggregateType: 'NOTIFICATION',
      aggregateId: routine.id,
      eventType: 'NOTIFICATION_DELIVERY_REQUESTED',
      idempotencyKey: `test-notification:${routine.id}`,
      payload: { schemaVersion: 1, notificationId: routine.id },
    },
  });
  const routineJob = await publish(routine.id);
  await delivery.deliver(routineJob);
  expect(
    (
      await prisma.notificationEntry.findUniqueOrThrow({
        where: { id: routine.id },
      })
    ).status,
  ).toBe('SUPPRESSED');
  await expect(
    delivery.deliver({ ...routineJob, aggregateId: randomUUID() }),
  ).rejects.toMatchObject({ code: 'NOTIFICATION_REFERENCE_INVALID' });

  // Current role is checked at delivery, not only during projection.
  const failedEmail = await prisma.emailLog.create({
    data: {
      recipientEmail: 'fictional-failure@example.test',
      templateKey: 'invoice-created',
      subjectSnapshot: 'Fictional failure',
      status: 'FAILED',
      failedAt: new Date(),
      attemptCount: 5,
    },
  });
  await projector.projectOnce();
  const restrictedEntry = await prisma.notificationEntry.findFirstOrThrow({
    where: {
      sourceKey: `email:${failedEmail.id}`,
      userId: administrator.id,
      channel: 'EMAIL',
    },
  });
  await prisma.adminProfile.update({
    where: { userId: administrator.id },
    data: { staffRole: 'SUPPORT_OPERATOR' },
  });
  await delivery.deliver(await publish(restrictedEntry.id));
  expect(
    (
      await prisma.notificationEntry.findUniqueOrThrow({
        where: { id: restrictedEntry.id },
      })
    ).status,
  ).toBe('SUPPRESSED');

  // Transient failures get five attempts; only explicit trusted retry metadata reopens failure.
  await prisma.notificationPreference.create({
    data: { userId: restricted.id, phoneLastFour: '0037' },
  });
  const retry = await prisma.notificationEntry.create({
    data: {
      userId: restricted.id,
      key: 'admin-security-alert',
      sourceKey: `test-retry:${randomUUID()}`,
      channel: 'WHATSAPP',
      status: 'QUEUED',
      metadata: {
        destinationFingerprint: notificationDestinationFingerprint(
          '+8801700000037',
          environment.CREDENTIAL_ENCRYPTION_KEY,
        ),
      },
    },
  });
  // The admin has no account phone: use the same authenticated encryption format as the API.
  await prisma.notificationPreference.update({
    where: { userId: restricted.id },
    data: {
      phoneCiphertext: new TokenCipherService(
        parseApiEnvironment({ ...e2eApiEnvironment, PORT: '3201' }),
      ).encrypt('+8801700000037'),
    },
  });
  await prisma.outboxEvent.create({
    data: {
      aggregateType: 'NOTIFICATION',
      aggregateId: retry.id,
      eventType: 'NOTIFICATION_DELIVERY_REQUESTED',
      idempotencyKey: `test-notification:${retry.id}`,
      payload: { schemaVersion: 1, notificationId: retry.id },
    },
  });
  const retryJob = await publish(retry.id);
  const failing = new NotificationDeliveryService(prisma, environment, {
    key: 'preview',
    send: async () => {
      throw new Error('fictional sensitive provider detail');
    },
  });
  for (let attempt = 1; attempt <= 5; attempt++)
    await expect(failing.deliver(retryJob)).rejects.toMatchObject({
      code: 'NOTIFICATION_PREVIEW_UNAVAILABLE',
    });
  expect(
    await prisma.notificationEntry.findUniqueOrThrow({
      where: { id: retry.id },
    }),
  ).toMatchObject({
    status: 'FAILED',
    attemptCount: 5,
    failureCode: 'NOTIFICATION_PREVIEW_UNAVAILABLE',
  });
  await delivery.deliver(retryJob);
  expect(
    (
      await prisma.notificationEntry.findUniqueOrThrow({
        where: { id: retry.id },
      })
    ).status,
  ).toBe('FAILED');
  await delivery.deliver({
    ...retryJob,
    failureKind: 'TEMPORARY',
    manualRetryAllowed: true,
  });
  expect(
    await prisma.notificationEntry.findUniqueOrThrow({
      where: { id: retry.id },
    }),
  ).toMatchObject({ status: 'PREVIEWED', attemptCount: 6, failureCode: null });
});

test('final suspension notices respect current policy and never change hosting or invoice state', async () => {
  await assertBrowserDatabaseScope(prisma, E2E_DATABASE_URL, E2E_SCHEMA);
  const user = await prisma.user.create({
    data: {
      email: `notification-final-${randomUUID()}@example.test`,
      passwordHash: 'unused-fictional-hash',
      role: 'CUSTOMER',
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
      customer: {
        create: {
          customerNumber: `N137-${randomUUID().slice(0, 8)}`,
          firstName: 'Fictional',
          lastName: 'Final warning',
          phone: '+8801700000137',
          countryCode: 'BD',
          addressLine1: '137 Fictional Road',
          city: 'Dhaka',
        },
      },
    },
    include: { customer: true },
  });
  const now = new Date();
  const dueAt = new Date(now.getTime() - 3 * 86400000);
  const service = await prisma.service.create({
    data: {
      customerId: user.customer!.id,
      productId: E2E_PRODUCT.id,
      productPriceId: E2E_PRODUCT.priceId,
      serverId: E2E_SERVER.id,
      status: 'ACTIVE',
      productNameSnapshot: 'Fictional final warning service',
      billingPeriod: 'MONTHLY',
      currency: 'BDT',
      recurringAmount: 100000n,
      startedAt: new Date(now.getTime() - 30 * 86400000),
      nextDueAt: dueAt,
      activatedAt: new Date(now.getTime() - 30 * 86400000),
      externalAccountId: randomUUID(),
      controlPanelUsername: `n137${randomUUID().replaceAll('-', '').slice(0, 8)}`,
    },
  });
  const invoice = await prisma.invoice.create({
    data: {
      invoiceNumber: `N137-${randomUUID().slice(0, 8)}`,
      submissionKey: randomUUID(),
      customerId: user.customer!.id,
      status: 'UNPAID',
      currency: 'BDT',
      subtotal: 100000n,
      total: 100000n,
      balanceDue: 100000n,
      customerNameSnapshot: 'Fictional final warning',
      customerEmailSnapshot: user.email,
      customerAddressSnapshot: { countryCode: 'BD' },
      businessIdentitySnapshot: { name: 'Fictional Speed Host' },
      issuedAt: new Date(now.getTime() - 4 * 86400000),
      dueAt,
      items: {
        create: {
          linePosition: 1,
          serviceId: service.id,
          descriptionSnapshot: 'Fictional renewal',
          currency: 'BDT',
          unitAmount: 100000n,
          lineTotal: 100000n,
        },
      },
    },
  });
  const prior = await prisma.setting.findUnique({
    where: { key: 'automation.renewal-policy' },
  });
  await prisma.setting.upsert({
    where: { key: 'automation.renewal-policy' },
    create: {
      key: 'automation.renewal-policy',
      category: 'AUTOMATION',
      value: DEFAULT_RENEWAL_AUTOMATION_POLICY,
    },
    update: { value: DEFAULT_RENEWAL_AUTOMATION_POLICY },
  });
  try {
    await projector.projectOnce(now);
    const entries = await prisma.notificationEntry.findMany({
      where: { userId: user.id, key: 'client-final-warning' },
    });
    expect(entries).toHaveLength(2);
    expect(entries.every((entry) => entry.status === 'QUEUED')).toBe(true);
    await projector.projectOnce(now);
    expect(
      await prisma.notificationEntry.count({
        where: { userId: user.id, key: 'client-final-warning' },
      }),
    ).toBe(2);
    await prisma.setting.update({
      where: { key: 'automation.renewal-policy' },
      data: { value: { ...DEFAULT_RENEWAL_AUTOMATION_POLICY, enabled: false } },
    });
    for (const entry of entries) {
      const event = await prisma.outboxEvent.findFirstOrThrow({
        where: {
          aggregateId: entry.id,
          eventType: 'NOTIFICATION_DELIVERY_REQUESTED',
        },
      });
      await prisma.outboxEvent.update({
        where: { id: event.id },
        data: { status: 'PUBLISHED', publishedAt: now },
      });
      await delivery.deliver({
        schemaVersion: 1,
        outboxEventId: event.id,
        eventType: event.eventType,
        aggregateType: 'NOTIFICATION',
        aggregateId: entry.id,
        correlationId: event.id,
      });
      expect(
        (
          await prisma.notificationEntry.findUniqueOrThrow({
            where: { id: entry.id },
          })
        ).status,
      ).toBe('SUPPRESSED');
    }
    expect(
      await prisma.service.findUniqueOrThrow({ where: { id: service.id } }),
    ).toMatchObject({ status: 'ACTIVE', nextDueAt: dueAt });
    expect(
      await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } }),
    ).toMatchObject({ status: 'UNPAID', balanceDue: 100000n });
  } finally {
    if (prior)
      await prisma.setting.update({
        where: { key: prior.key },
        data: { value: prior.value ?? DEFAULT_RENEWAL_AUTOMATION_POLICY },
      });
    else
      await prisma.setting.delete({
        where: { key: 'automation.renewal-policy' },
      });
  }
});

async function signIn(page: Page, email: string) {
  await page.goto('http://127.0.0.1:3200/login');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(E2E_ADMIN.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/(admin|portal)$/);
}

async function createCalendarDomains(
  customerId: string,
  email: string,
  expiresAt: Date,
) {
  // Build real ownership/quote/order/invoice links; never disable database triggers.
  const product = await prisma.product.create({
    data: {
      slug: `notification-domain-${randomUUID()}`,
      name: 'Fictional notification domain',
      kind: 'DOMAIN',
      prices: {
        create: { billingPeriod: 'ANNUAL', currency: 'BDT', amount: 100000n },
      },
    },
    include: { prices: true },
  });
  const account = await prisma.registrarAccount.create({
    data: { mode: 'FAKE', enabled: false },
  });
  const offer = await prisma.domainOffer.create({
    data: {
      accountId: account.id,
      productId: product.id,
      priceId: product.prices[0]!.id,
      tld: 'com',
      nameservers: ['ns1.example.test', 'ns2.example.test'],
    },
  });
  const records = Array.from({ length: 101 }, () => ({
    orderId: randomUUID(),
    itemId: randomUUID(),
    invoiceId: randomUUID(),
    quoteId: randomUUID(),
    domainName: `notification-${randomUUID()}.com`,
  }));
  await prisma.$transaction(
    async (tx) => {
      await tx.order.createMany({
        data: records.map((row) => ({
          id: row.orderId,
          orderNumber: `N137-${row.orderId.slice(0, 8)}`,
          submissionKey: randomUUID(),
          customerId,
          currency: 'BDT',
          subtotal: 100000n,
          total: 100000n,
          customerEmailSnapshot: email,
        })),
      });
      await tx.orderItem.createMany({
        data: records.map((row) => ({
          id: row.itemId,
          orderId: row.orderId,
          kind: 'DOMAIN',
          productId: product.id,
          productPriceId: product.prices[0]!.id,
          productNameSnapshot: product.name,
          billingPeriod: 'ANNUAL',
          currency: 'BDT',
          unitAmount: 100000n,
          lineTotal: 100000n,
          requestedDomain: row.domainName,
        })),
      });
      await tx.invoice.createMany({
        data: records.map((row) => ({
          id: row.invoiceId,
          orderId: row.orderId,
          invoiceNumber: `N137-${row.invoiceId.slice(0, 8)}`,
          submissionKey: randomUUID(),
          customerId,
          status: 'UNPAID',
          currency: 'BDT',
          subtotal: 100000n,
          total: 100000n,
          balanceDue: 100000n,
          customerNameSnapshot: 'Fictional calendar customer',
          customerEmailSnapshot: email,
          customerAddressSnapshot: { countryCode: 'BD' },
          businessIdentitySnapshot: { name: 'Fictional Speed Host' },
          issuedAt: new Date(),
          dueAt: expiresAt,
        })),
      });
      await tx.invoiceItem.createMany({
        data: records.map((row) => ({
          invoiceId: row.invoiceId,
          orderItemId: row.itemId,
          linePosition: 1,
          descriptionSnapshot: row.domainName,
          currency: 'BDT',
          unitAmount: 100000n,
          lineTotal: 100000n,
        })),
      });
      await tx.domainQuote.createMany({
        data: records.map((row) => ({
          id: row.quoteId,
          customerId,
          accountId: account.id,
          offerId: offer.id,
          domainName: row.domainName,
          sellingAmount: 100000n,
          costAmount: 1000n,
          costCurrency: 'USD',
          contactCiphertext: 'fictional-unused-contact',
          fingerprint: 'a'.repeat(64),
          nameservers: ['ns1.example.test', 'ns2.example.test'],
          agreement: 'fictional-notification-test',
          expiresAt,
        })),
      });
      await tx.domain.createMany({
        data: records.map((row) => ({
          quoteId: row.quoteId,
          customerId,
          accountId: account.id,
          orderItemId: row.itemId,
          invoiceId: row.invoiceId,
          domainName: row.domainName,
          submissionKey: randomUUID(),
          state: 'REGISTERED',
          expiresAt,
        })),
      });
    },
    { timeout: 30000 },
  );
}
