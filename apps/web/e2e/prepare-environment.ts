import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { hash } from 'argon2';
import {
  BillingPeriod,
  InvoiceStatus,
  ProductStatus,
  ServerStatus,
  SettingCategory,
  UserRole,
  UserStatus,
  createPrismaClient,
} from '@webhost-billing/database';
import { E2E_DATABASE_URL, E2E_SCHEMA, e2eApiEnvironment } from './environment';
import {
  E2E_ADMIN,
  E2E_HEALTHY_CUSTOMER,
  E2E_HISTORY_CUSTOMER,
  E2E_PRODUCT,
  E2E_SERVER,
} from './fixtures';

async function main(): Promise<void> {
  if (E2E_SCHEMA !== 'command26_e2e') {
    throw new Error('Refusing to reset an unexpected database schema.');
  }
  const targetUrl = new URL(E2E_DATABASE_URL);
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(targetUrl.hostname)) {
    throw new Error('Browser tests require a loopback PostgreSQL connection.');
  }

  const repositoryRoot = resolve(
    dirname(fileURLToPath(import.meta.url)),
    '../../..',
  );
  const administrationUrl = new URL(E2E_DATABASE_URL);
  administrationUrl.searchParams.set('schema', 'public');
  const administration = createPrismaClient(administrationUrl.toString());

  await administration.$executeRawUnsafe(
    `DROP SCHEMA IF EXISTS "${E2E_SCHEMA}" CASCADE`,
  );
  await administration.$executeRawUnsafe(`CREATE SCHEMA "${E2E_SCHEMA}"`);
  await administration.$disconnect();

  const pnpmArguments = [
    '--filter',
    '@webhost-billing/database',
    'db:migrate:deploy',
  ];
  const isWindows = process.platform === 'win32';
  execFileSync(
    isWindows ? (process.env.ComSpec ?? 'cmd.exe') : 'pnpm',
    isWindows ? ['/d', '/s', '/c', 'pnpm', ...pnpmArguments] : pnpmArguments,
    {
      cwd: repositoryRoot,
      env: e2eApiEnvironment,
      stdio: 'inherit',
    },
  );

  const prisma = createPrismaClient(E2E_DATABASE_URL);
  const passwordHash = await hash(E2E_ADMIN.password, {
    type: 2,
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
  });

  await prisma.user.create({
    data: {
      id: E2E_ADMIN.userId,
      email: E2E_ADMIN.email,
      passwordHash,
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
      emailVerifiedAt: new Date(),
      adminProfile: {
        create: {
          id: E2E_ADMIN.profileId,
          displayName: 'Command 26 Administrator',
          jobTitle: 'Owner',
          isSuperAdmin: true,
        },
      },
    },
  });

  await prisma.user.create({
    data: {
      id: E2E_HEALTHY_CUSTOMER.userId,
      email: E2E_HEALTHY_CUSTOMER.email,
      passwordHash,
      role: UserRole.CUSTOMER,
      status: UserStatus.ACTIVE,
      emailVerifiedAt: new Date(),
      customer: {
        create: {
          id: E2E_HEALTHY_CUSTOMER.customerId,
          customerNumber: 'CUS-HEALTHY-78',
          firstName: E2E_HEALTHY_CUSTOMER.firstName,
          lastName: E2E_HEALTHY_CUSTOMER.lastName,
          addressLine1: '78 Fictional Healthy Road',
          city: 'Dhaka',
          countryCode: 'BD',
        },
      },
    },
  });

  await prisma.invoice.create({
    data: {
      id: E2E_HEALTHY_CUSTOMER.invoiceId,
      invoiceNumber: E2E_HEALTHY_CUSTOMER.invoiceNumber,
      submissionKey: 'command78-healthy-paid-invoice',
      customerId: E2E_HEALTHY_CUSTOMER.customerId,
      status: InvoiceStatus.PAID,
      currency: 'BDT',
      subtotal: 120_000n,
      total: 120_000n,
      amountPaid: 120_000n,
      balanceDue: 0n,
      customerNameSnapshot: `${E2E_HEALTHY_CUSTOMER.firstName} ${E2E_HEALTHY_CUSTOMER.lastName}`,
      customerEmailSnapshot: E2E_HEALTHY_CUSTOMER.email,
      customerAddressSnapshot: {
        line1: '78 Fictional Healthy Road',
        line2: null,
        city: 'Dhaka',
        region: null,
        postalCode: null,
        countryCode: 'BD',
      },
      businessIdentitySnapshot: { name: 'Fictional Webhost Billing' },
      issuedAt: new Date('2026-10-01T00:00:00.000Z'),
      dueAt: new Date('2026-10-02T00:00:00.000Z'),
      paidAt: new Date('2026-10-01T00:00:00.000Z'),
      items: {
        create: {
          linePosition: 1,
          descriptionSnapshot: 'Fictional healthy hosting',
          currency: 'BDT',
          quantity: 1,
          unitAmount: 120_000n,
          lineTotal: 120_000n,
        },
      },
    },
  });

  // Dedicated owned history; never changes the main lifecycle or healthy-home fixtures.
  await prisma.user.create({
    data: {
      id: E2E_HISTORY_CUSTOMER.userId,
      email: E2E_HISTORY_CUSTOMER.email,
      passwordHash,
      role: UserRole.CUSTOMER,
      status: UserStatus.ACTIVE,
      emailVerifiedAt: new Date(),
      customer: {
        create: {
          id: E2E_HISTORY_CUSTOMER.customerId,
          customerNumber: 'CUS-HISTORY-81',
          firstName: 'History',
          lastName: 'Customer',
          addressLine1: '81 Fictional Road',
          city: 'Dhaka',
          countryCode: 'BD',
        },
      },
    },
  });
  for (let index = 0; index < 105; index++) {
    const instant = new Date(Date.UTC(2026, 8, 1, 0, 0, index));
    const paid = index % 2 === 1;
    await prisma.invoice.create({
      data: {
        id: `81000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
        invoiceNumber: `INV-HISTORY-${String(index).padStart(4, '0')}`,
        submissionKey: `command81-browser-history-${index}`,
        customerId: E2E_HISTORY_CUSTOMER.customerId,
        status: paid ? InvoiceStatus.PAID : InvoiceStatus.UNPAID,
        currency: 'BDT',
        subtotal: 100n,
        total: 100n,
        amountPaid: paid ? 100n : 0n,
        balanceDue: paid ? 0n : 100n,
        customerNameSnapshot: 'History Customer',
        customerEmailSnapshot: E2E_HISTORY_CUSTOMER.email,
        customerAddressSnapshot: {
          line1: '81 Fictional Road',
          line2: null,
          city: 'Dhaka',
          region: null,
          postalCode: null,
          countryCode: 'BD',
        },
        businessIdentitySnapshot: { name: 'Fictional Webhost Billing' },
        issuedAt: instant,
        dueAt: new Date('2026-10-01T00:00:00.000Z'),
        paidAt: paid ? instant : null,
        createdAt: instant,
        updatedAt: instant,
        items: {
          create: {
            linePosition: 1,
            descriptionSnapshot: `Historical hosting ${index}`,
            currency: 'BDT',
            quantity: 1,
            unitAmount: 100n,
            lineTotal: 100n,
          },
        },
      },
    });
  }

  await prisma.product.create({
    data: {
      id: E2E_PRODUCT.id,
      slug: 'command-26-starter-hosting',
      name: E2E_PRODUCT.name,
      description: 'Fictional hosting used only by isolated browser tests.',
      status: ProductStatus.ACTIVE,
      publicVisible: true,
      displayOrder: 1,
      hostingPackageIdentifier: 'command26_starter',
      storageFeature: '10 GB SSD',
      websiteFeature: '1 website',
      emailFeature: '10 email accounts',
      bandwidthFeature: '100 GB monthly',
      provisioningAdapter: 'fake-panel',
      provisioningConfig: { packageName: 'command26_starter' },
      prices: {
        create: {
          id: E2E_PRODUCT.priceId,
          billingPeriod: BillingPeriod.MONTHLY,
          currency: 'BDT',
          amount: 120_000n,
          setupFee: 10_000n,
          isActive: true,
        },
      },
    },
  });

  await prisma.server.create({
    data: {
      id: E2E_SERVER.id,
      name: E2E_SERVER.name,
      hostname: 'command26-server.example.test',
      status: ServerStatus.ACTIVE,
      adapterKey: 'fake-panel',
      maxAccounts: 25,
    },
  });

  await prisma.setting.create({
    data: {
      key: 'integration.active-providers',
      category: SettingCategory.INTEGRATION,
      value: {
        activeGateway: 'fake',
        activeHostingPanelAdapter: 'fake-panel',
      },
      description: 'Command 26 isolated browser test providers.',
      updatedByUserId: E2E_ADMIN.userId,
    },
  });

  await prisma.$disconnect();
}

void main();
