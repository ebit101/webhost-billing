import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createPrismaClient } from '../src/client';
import {
  AutomationStatus,
  BillingPeriod,
  CustomerStatus,
  EmailStatus,
  InvoiceStatus,
  OrderStatus,
  OutboxStatus,
  PaymentEventStatus,
  PaymentKind,
  PaymentStatus,
  ProductStatus,
  ServerStatus,
  ServiceStatus,
  SettingCategory,
  TicketMessageKind,
  TicketPriority,
  TicketStatus,
  UserRole,
  UserStatus,
} from '../src/generated/prisma/enums';

const repositoryEnvironmentPath = resolve(process.cwd(), '../../.env');

if (existsSync(repositoryEnvironmentPath)) {
  process.loadEnvFile(repositoryEnvironmentPath);
}

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required to seed development data');
}

const prisma = createPrismaClient(databaseUrl);

const ids = {
  adminUser: '10000000-0000-4000-8000-000000000001',
  adminProfile: '10000000-0000-4000-8000-000000000002',
  customerUser: '10000000-0000-4000-8000-000000000003',
  customer: '10000000-0000-4000-8000-000000000004',
  server: '10000000-0000-4000-8000-000000000005',
  product: '10000000-0000-4000-8000-000000000006',
  productPrice: '10000000-0000-4000-8000-000000000007',
  order: '10000000-0000-4000-8000-000000000008',
  orderItem: '10000000-0000-4000-8000-000000000009',
  service: '10000000-0000-4000-8000-000000000010',
  invoice: '10000000-0000-4000-8000-000000000011',
  invoiceItem: '10000000-0000-4000-8000-000000000012',
  payment: '10000000-0000-4000-8000-000000000013',
  paymentEvent: '10000000-0000-4000-8000-000000000014',
  ticket: '10000000-0000-4000-8000-000000000015',
  ticketMessage: '10000000-0000-4000-8000-000000000016',
  emailLog: '10000000-0000-4000-8000-000000000017',
  activityLog: '10000000-0000-4000-8000-000000000018',
  automationRun: '10000000-0000-4000-8000-000000000019',
  setting: '10000000-0000-4000-8000-000000000020',
  outboxEvent: '10000000-0000-4000-8000-000000000021',
} as const;

const placedAt = new Date('2026-08-01T03:00:00.000Z');
const dueAt = new Date('2026-08-08T03:00:00.000Z');
const paidAt = new Date('2026-08-02T05:30:00.000Z');
const nextDueAt = new Date('2026-09-01T03:00:00.000Z');
const monthlyAmount = 120_000n;

async function seed(): Promise<void> {
  await prisma.$transaction(async (transaction) => {
    await transaction.user.upsert({
      where: { email: 'admin@example.test' },
      update: {
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
        emailVerifiedAt: placedAt,
      },
      create: {
        id: ids.adminUser,
        email: 'admin@example.test',
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
        emailVerifiedAt: placedAt,
      },
    });

    await transaction.adminProfile.upsert({
      where: { userId: ids.adminUser },
      update: { displayName: 'Development Administrator' },
      create: {
        id: ids.adminProfile,
        userId: ids.adminUser,
        displayName: 'Development Administrator',
        jobTitle: 'Owner',
        isSuperAdmin: true,
      },
    });

    await transaction.user.upsert({
      where: { email: 'customer@example.test' },
      update: {
        role: UserRole.CUSTOMER,
        status: UserStatus.ACTIVE,
        emailVerifiedAt: placedAt,
      },
      create: {
        id: ids.customerUser,
        email: 'customer@example.test',
        role: UserRole.CUSTOMER,
        status: UserStatus.ACTIVE,
        emailVerifiedAt: placedAt,
      },
    });

    await transaction.customer.upsert({
      where: { customerNumber: 'DEV-CUST-0001' },
      update: { status: CustomerStatus.ACTIVE },
      create: {
        id: ids.customer,
        userId: ids.customerUser,
        customerNumber: 'DEV-CUST-0001',
        status: CustomerStatus.ACTIVE,
        firstName: 'Fictional',
        lastName: 'Customer',
        companyName: 'Example Test Studio',
        phone: '+8801000000000',
        addressLine1: '1 Example Road',
        city: 'Dhaka',
        region: 'Dhaka',
        postalCode: '1000',
        countryCode: 'BD',
      },
    });

    await transaction.server.upsert({
      where: { hostname: 'cpanel.example.test' },
      update: { status: ServerStatus.ACTIVE },
      create: {
        id: ids.server,
        name: 'Fictional Development Server',
        hostname: 'cpanel.example.test',
        status: ServerStatus.ACTIVE,
        adapterKey: 'fake-cpanel',
        maxAccounts: 100,
      },
    });

    await transaction.product.upsert({
      where: { slug: 'starter-hosting' },
      update: { status: ProductStatus.ACTIVE },
      create: {
        id: ids.product,
        slug: 'starter-hosting',
        name: 'Starter Hosting',
        description: 'Fictional shared-hosting package for local development.',
        status: ProductStatus.ACTIVE,
        provisioningAdapter: 'fake-cpanel',
        provisioningConfig: { packageName: 'dev_starter' },
      },
    });

    await transaction.productPrice.upsert({
      where: { id: ids.productPrice },
      update: { amount: monthlyAmount, isActive: true },
      create: {
        id: ids.productPrice,
        productId: ids.product,
        billingPeriod: BillingPeriod.MONTHLY,
        currency: 'BDT',
        amount: monthlyAmount,
        isActive: true,
        validFrom: placedAt,
      },
    });

    await transaction.order.upsert({
      where: { orderNumber: 'DEV-ORD-0001' },
      update: { status: OrderStatus.COMPLETED },
      create: {
        id: ids.order,
        orderNumber: 'DEV-ORD-0001',
        customerId: ids.customer,
        status: OrderStatus.COMPLETED,
        currency: 'BDT',
        subtotal: monthlyAmount,
        total: monthlyAmount,
        customerEmailSnapshot: 'customer@example.test',
        notes: 'Fictional seed order.',
        placedAt,
        completedAt: paidAt,
      },
    });

    await transaction.orderItem.upsert({
      where: { id: ids.orderItem },
      update: {},
      create: {
        id: ids.orderItem,
        orderId: ids.order,
        productId: ids.product,
        productPriceId: ids.productPrice,
        productNameSnapshot: 'Starter Hosting',
        descriptionSnapshot: 'Monthly fictional shared-hosting service.',
        billingPeriod: BillingPeriod.MONTHLY,
        currency: 'BDT',
        unitAmount: monthlyAmount,
        quantity: 1,
        lineTotal: monthlyAmount,
        requestedDomain: 'customer-site.example.test',
        provisioningSnapshot: { packageName: 'dev_starter' },
      },
    });

    await transaction.service.upsert({
      where: { orderItemId: ids.orderItem },
      update: { status: ServiceStatus.ACTIVE, nextDueAt },
      create: {
        id: ids.service,
        customerId: ids.customer,
        orderItemId: ids.orderItem,
        productId: ids.product,
        serverId: ids.server,
        status: ServiceStatus.ACTIVE,
        domain: 'customer-site.example.test',
        controlPanelUsername: 'devcustomer',
        externalAccountId: 'fake-account-0001',
        billingPeriod: BillingPeriod.MONTHLY,
        recurringAmount: monthlyAmount,
        currency: 'BDT',
        nextDueAt,
        activatedAt: paidAt,
      },
    });

    await transaction.invoice.upsert({
      where: { invoiceNumber: 'DEV-INV-0001' },
      update: {
        status: InvoiceStatus.PAID,
        amountPaid: monthlyAmount,
        balanceDue: 0n,
        paidAt,
      },
      create: {
        id: ids.invoice,
        invoiceNumber: 'DEV-INV-0001',
        customerId: ids.customer,
        orderId: ids.order,
        status: InvoiceStatus.PAID,
        currency: 'BDT',
        subtotal: monthlyAmount,
        total: monthlyAmount,
        amountPaid: monthlyAmount,
        balanceDue: 0n,
        customerNameSnapshot: 'Fictional Customer',
        customerEmailSnapshot: 'customer@example.test',
        customerAddressSnapshot: {
          line1: '1 Example Road',
          city: 'Dhaka',
          region: 'Dhaka',
          postalCode: '1000',
          countryCode: 'BD',
        },
        businessIdentitySnapshot: {
          name: 'Webhost Billing Demo',
          address: 'Fictional development data only',
        },
        issuedAt: placedAt,
        dueAt,
        paidAt,
      },
    });

    await transaction.invoiceItem.upsert({
      where: { id: ids.invoiceItem },
      update: {},
      create: {
        id: ids.invoiceItem,
        invoiceId: ids.invoice,
        orderItemId: ids.orderItem,
        serviceId: ids.service,
        descriptionSnapshot: 'Starter Hosting — August 2026',
        currency: 'BDT',
        quantity: 1,
        unitAmount: monthlyAmount,
        lineTotal: monthlyAmount,
        servicePeriodStart: placedAt,
        servicePeriodEnd: nextDueAt,
      },
    });

    await transaction.payment.upsert({
      where: { idempotencyKey: 'seed:manual-payment:0001' },
      update: { status: PaymentStatus.SUCCEEDED },
      create: {
        id: ids.payment,
        invoiceId: ids.invoice,
        createdByUserId: ids.adminUser,
        kind: PaymentKind.CHARGE,
        status: PaymentStatus.SUCCEEDED,
        provider: 'manual',
        providerTransactionId: 'DEV-MANUAL-0001',
        idempotencyKey: 'seed:manual-payment:0001',
        amount: monthlyAmount,
        currency: 'BDT',
        reference: 'Fictional mobile-payment reference',
        receivedAt: paidAt,
        verifiedAt: paidAt,
      },
    });

    await transaction.paymentEvent.upsert({
      where: { idempotencyKey: 'seed:payment-event:0001' },
      update: { status: PaymentEventStatus.PROCESSED },
      create: {
        id: ids.paymentEvent,
        paymentId: ids.payment,
        provider: 'manual',
        providerEventId: 'DEV-EVENT-0001',
        idempotencyKey: 'seed:payment-event:0001',
        eventType: 'manual.payment.approved',
        status: PaymentEventStatus.PROCESSED,
        payloadHash:
          '0000000000000000000000000000000000000000000000000000000000000000',
        normalizedPayload: { fictional: true },
        receivedAt: paidAt,
        processedAt: paidAt,
      },
    });

    await transaction.ticket.upsert({
      where: { ticketNumber: 'DEV-TKT-0001' },
      update: { status: TicketStatus.WAITING_FOR_STAFF },
      create: {
        id: ids.ticket,
        ticketNumber: 'DEV-TKT-0001',
        customerId: ids.customer,
        serviceId: ids.service,
        assignedAdminId: ids.adminUser,
        subject: 'Fictional DNS question',
        status: TicketStatus.WAITING_FOR_STAFF,
        priority: TicketPriority.NORMAL,
        lastReplyAt: paidAt,
      },
    });

    await transaction.ticketMessage.upsert({
      where: { id: ids.ticketMessage },
      update: {},
      create: {
        id: ids.ticketMessage,
        ticketId: ids.ticket,
        authorUserId: ids.customerUser,
        kind: TicketMessageKind.CUSTOMER,
        body: 'This is fictional development-only ticket content.',
        createdAt: paidAt,
      },
    });

    await transaction.emailLog.upsert({
      where: { id: ids.emailLog },
      update: { status: EmailStatus.SENT },
      create: {
        id: ids.emailLog,
        customerId: ids.customer,
        invoiceId: ids.invoice,
        templateKey: 'invoice-paid',
        recipientEmail: 'customer@example.test',
        subjectSnapshot: 'Payment received for DEV-INV-0001',
        status: EmailStatus.SENT,
        provider: 'fake-smtp',
        providerMessageId: 'DEV-MESSAGE-0001',
        attemptCount: 1,
        queuedAt: paidAt,
        sentAt: paidAt,
      },
    });

    await transaction.activityLog.upsert({
      where: { id: ids.activityLog },
      update: {},
      create: {
        id: ids.activityLog,
        actorUserId: ids.adminUser,
        action: 'payment.manual.approved',
        entityType: 'Payment',
        entityId: ids.payment,
        metadata: { fictional: true },
        createdAt: paidAt,
      },
    });

    await transaction.automationRun.upsert({
      where: { idempotencyKey: 'seed:automation:0001' },
      update: { status: AutomationStatus.SUCCEEDED },
      create: {
        id: ids.automationRun,
        jobName: 'development-seed-check',
        idempotencyKey: 'seed:automation:0001',
        status: AutomationStatus.SUCCEEDED,
        startedAt: paidAt,
        completedAt: paidAt,
        processedCount: 1,
        succeededCount: 1,
        metadata: { fictional: true },
      },
    });

    await transaction.setting.upsert({
      where: { key: 'business.timezone' },
      update: { value: 'Asia/Dhaka', updatedByUserId: ids.adminUser },
      create: {
        id: ids.setting,
        key: 'business.timezone',
        category: SettingCategory.BUSINESS,
        value: 'Asia/Dhaka',
        description: 'Fictional development setting.',
        updatedByUserId: ids.adminUser,
      },
    });

    await transaction.outboxEvent.upsert({
      where: { idempotencyKey: 'seed:outbox:0001' },
      update: { status: OutboxStatus.PUBLISHED, publishedAt: paidAt },
      create: {
        id: ids.outboxEvent,
        aggregateType: 'Invoice',
        aggregateId: ids.invoice,
        eventType: 'invoice.paid',
        idempotencyKey: 'seed:outbox:0001',
        payload: { invoiceId: ids.invoice, fictional: true },
        status: OutboxStatus.PUBLISHED,
        publishedAt: paidAt,
      },
    });
  });
}

seed()
  .then(async () => {
    await prisma.$disconnect();
    process.stdout.write(
      'Seeded fictional Webhost Billing development data.\n',
    );
  })
  .catch(async (error: unknown) => {
    await prisma.$disconnect();
    const message =
      error instanceof Error ? error.message : 'Unknown seed error';
    process.stderr.write(`Development seed failed: ${message}\n`);
    process.exitCode = 1;
  });
