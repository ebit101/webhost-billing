import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { hash } from 'argon2';
import {
  BillingPeriod,
  ProductStatus,
  ServerStatus,
  SettingCategory,
  UserRole,
  UserStatus,
  createPrismaClient,
} from '@webhost-billing/database';
import { E2E_DATABASE_URL, E2E_SCHEMA, e2eApiEnvironment } from './environment';
import { E2E_ADMIN, E2E_PRODUCT, E2E_SERVER } from './fixtures';

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

  execFileSync(
    'pnpm',
    ['--filter', '@webhost-billing/database', 'db:migrate:deploy'],
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
