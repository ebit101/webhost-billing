import { resolve } from 'node:path';
import { createPrismaClient } from '../src/client';
import {
  BillingPeriod,
  ProductStatus,
  ServerStatus,
} from '../src/generated/prisma/enums';

process.loadEnvFile(resolve(process.cwd(), '../../.env'));

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required.');
const target = new URL(databaseUrl);
if (
  process.env.NODE_ENV !== 'development' ||
  !['localhost', '127.0.0.1', '[::1]'].includes(target.hostname) ||
  target.pathname !== '/webhost_billing' ||
  ![null, 'public'].includes(target.searchParams.get('schema')) ||
  process.env.BKASH_ENABLED !== 'false' ||
  process.env.SSLCOMMERZ_ENABLED !== 'false' ||
  process.env.RESELLBIZ_LIVE_ENABLED === 'true'
) {
  throw new Error(
    'Shared-hosting test plans require the local fake-only development database.',
  );
}

const plans = [
  {
    slug: 'local-shared-starter',
    name: 'Starter',
    amount: 150_000n,
    storage: '1 GB NVMe SSD',
    websites: '1 website',
    email: '5 email accounts',
    bandwidth: '100 GB monthly',
    package: 'test_shared_starter',
  },
  {
    slug: 'local-shared-standard',
    name: 'Standard',
    amount: 350_000n,
    storage: '5 GB NVMe SSD',
    websites: '3 websites',
    email: '10 email accounts',
    bandwidth: '300 GB monthly',
    package: 'test_shared_standard',
  },
  {
    slug: 'local-shared-premium',
    name: 'Premium',
    amount: 500_000n,
    storage: '10 GB NVMe SSD',
    websites: '5 websites',
    email: '15 email accounts',
    bandwidth: '500 GB monthly',
    package: 'test_shared_premium',
  },
  {
    slug: 'local-shared-maximum',
    name: 'Maximum',
    amount: 800_000n,
    storage: '20 GB NVMe SSD',
    websites: '10 websites',
    email: 'Unlimited email accounts',
    bandwidth: '1,000 GB monthly',
    package: 'test_shared_maximum',
  },
] as const;

const prisma = createPrismaClient(databaseUrl);
async function seedSharedHosting(): Promise<void> {
  try {
    await prisma.$transaction(async (tx) => {
      const fakeServer = await tx.server.findFirst({
        where: {
          adapterKey: 'fake-panel',
          status: ServerStatus.ACTIVE,
          deletedAt: null,
        },
      });
      if (!fakeServer)
        throw new Error('An active fictional fake-panel server is required.');

      for (const [index, plan] of plans.entries()) {
        const existing = await tx.product.findUnique({
          where: { slug: plan.slug },
          include: { prices: true },
        });
        if (existing) {
          if (
            existing.provisioningAdapter !== 'fake-panel' ||
            existing.hostingPackageIdentifier !== plan.package ||
            existing.status !== ProductStatus.ACTIVE ||
            !existing.publicVisible ||
            !existing.prices.some(
              (price) =>
                price.billingPeriod === BillingPeriod.ANNUAL &&
                price.currency === 'BDT' &&
                price.amount === plan.amount &&
                price.setupFee === 0n &&
                price.isActive &&
                price.deletedAt === null,
            )
          )
            throw new Error(
              `The local test product ${plan.slug} differs from the reference catalogue. Review it without overwriting existing edits.`,
            );
          continue;
        }
        await tx.product.create({
          data: {
            slug: plan.slug,
            name: plan.name,
            description:
              'Fictional local test version of the public Speed Host shared-hosting plan.',
            status: ProductStatus.ACTIVE,
            publicVisible: true,
            displayOrder: 100 + index,
            hostingPackageIdentifier: plan.package,
            provisioningAdapter: 'fake-panel',
            provisioningConfig: { packageName: plan.package },
            storageFeature: plan.storage,
            websiteFeature: plan.websites,
            emailFeature: plan.email,
            bandwidthFeature: plan.bandwidth,
            prices: {
              create: {
                billingPeriod: BillingPeriod.ANNUAL,
                currency: 'BDT',
                amount: plan.amount,
                setupFee: 0n,
                isActive: true,
                validFrom: new Date(),
              },
            },
          },
        });
      }

      const legacy = await tx.product.findUnique({
        where: { id: '10000000-0000-4000-8000-000000000006' },
        include: { prices: true },
      });
      if (
        legacy?.slug === 'starter-hosting' &&
        legacy.publicVisible &&
        legacy.prices.length === 1 &&
        legacy.prices[0]?.billingPeriod === BillingPeriod.MONTHLY &&
        legacy.prices[0].amount === 120_000n
      ) {
        await tx.product.update({
          where: { id: legacy.id },
          data: { publicVisible: false },
        });
      }
    });
    console.log('Four fictional annual BDT shared-hosting plans are ready.');
  } finally {
    await prisma.$disconnect();
  }
}

void seedSharedHosting().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : 'Shared-hosting seed failed.',
  );
  process.exitCode = 1;
});
