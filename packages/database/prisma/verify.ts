import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createPrismaClient } from '../src/client';

const repositoryEnvironmentPath = resolve(process.cwd(), '../../.env');

if (existsSync(repositoryEnvironmentPath)) {
  process.loadEnvFile(repositoryEnvironmentPath);
}

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    'DATABASE_URL is required to verify the development database',
  );
}

const prisma = createPrismaClient(databaseUrl);

const expectedTables = [
  'activity_logs',
  'admin_profiles',
  'automation_runs',
  'customers',
  'email_logs',
  'invoice_items',
  'invoices',
  'order_items',
  'orders',
  'outbox_events',
  'payment_events',
  'payments',
  'product_prices',
  'products',
  'servers',
  'services',
  'settings',
  'ticket_messages',
  'tickets',
  'users',
] as const;

const requiredCustomConstraints = [
  'automation_runs_counts_check',
  'customers_country_code_check',
  'invoice_items_total_check',
  'invoices_balance_check',
  'invoices_total_check',
  'order_items_total_check',
  'orders_total_check',
  'payments_adjustment_reference_check',
  'payments_amount_check',
  'users_email_normalized_check',
] as const;

const expectedMoneyColumns = [
  'invoice_items.discount_amount',
  'invoice_items.line_total',
  'invoice_items.tax_amount',
  'invoice_items.unit_amount',
  'invoices.amount_paid',
  'invoices.balance_due',
  'invoices.discount_total',
  'invoices.subtotal',
  'invoices.tax_total',
  'invoices.total',
  'order_items.line_total',
  'order_items.setup_fee',
  'order_items.unit_amount',
  'orders.discount_total',
  'orders.setup_total',
  'orders.subtotal',
  'orders.tax_total',
  'orders.total',
  'payments.amount',
  'product_prices.amount',
  'product_prices.setup_fee',
  'services.recurring_amount',
] as const;

async function verify(): Promise<void> {
  const tables = await prisma.$queryRaw<Array<{ table_name: string }>>`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
      AND table_name <> '_prisma_migrations'
    ORDER BY table_name
  `;

  assert.deepEqual(
    tables.map(({ table_name: tableName }) => tableName),
    [...expectedTables],
  );

  const idColumnTypes = await prisma.$queryRaw<
    Array<{ table_name: string; data_type: string }>
  >`
    SELECT table_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND column_name = 'id'
      AND table_name <> '_prisma_migrations'
    ORDER BY table_name
  `;

  assert.equal(idColumnTypes.length, expectedTables.length);
  assert.ok(
    idColumnTypes.every(({ data_type: dataType }) => dataType === 'uuid'),
  );

  const moneyColumns = await prisma.$queryRaw<
    Array<{ table_name: string; column_name: string }>
  >`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND data_type = 'bigint'
    ORDER BY table_name, column_name
  `;

  assert.deepEqual(
    moneyColumns.map(
      ({ table_name: tableName, column_name: columnName }) =>
        `${tableName}.${columnName}`,
    ),
    [...expectedMoneyColumns],
  );

  const timezoneUnsafeTimestamps = await prisma.$queryRaw<
    Array<{ table_name: string; column_name: string }>
  >`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND data_type = 'timestamp without time zone'
  `;
  assert.deepEqual(timezoneUnsafeTimestamps, []);

  const customConstraints = await prisma.$queryRaw<
    Array<{ constraint_name: string }>
  >`
    SELECT constraint_name
    FROM information_schema.table_constraints
    WHERE constraint_schema = 'public'
      AND constraint_type = 'CHECK'
  `;
  const customConstraintNames = new Set(
    customConstraints.map(
      ({ constraint_name: constraintName }) => constraintName,
    ),
  );

  for (const constraintName of requiredCustomConstraints) {
    assert.ok(
      customConstraintNames.has(constraintName),
      `Missing custom constraint ${constraintName}`,
    );
  }

  const partialPriceIndexes = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*)::bigint AS count
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'product_prices_one_active_key'
      AND indexdef LIKE '%WHERE ((is_active = true) AND (deleted_at IS NULL))%'
  `;
  assert.equal(partialPriceIndexes[0]?.count, 1n);

  const foreignKeyDeleteRules = await prisma.$queryRaw<
    Array<{ delete_rule: string }>
  >`
    SELECT DISTINCT delete_rule
    FROM information_schema.referential_constraints
    WHERE constraint_schema = 'public'
    ORDER BY delete_rule
  `;
  assert.deepEqual(foreignKeyDeleteRules, [{ delete_rule: 'RESTRICT' }]);

  const seededInvoice = await prisma.invoice.findUnique({
    where: { invoiceNumber: 'DEV-INV-0001' },
    include: { items: true, payments: true },
  });

  assert.ok(seededInvoice);
  assert.equal(seededInvoice.currency, 'BDT');
  assert.equal(seededInvoice.total, 120_000n);
  assert.equal(seededInvoice.balanceDue, 0n);
  assert.equal(seededInvoice.items.length, 1);
  assert.equal(seededInvoice.payments.length, 1);
  assert.equal(seededInvoice.dueAt.toISOString(), '2026-08-08T03:00:00.000Z');

  const seededService = await prisma.service.findUnique({
    where: { orderItemId: '10000000-0000-4000-8000-000000000009' },
    include: { customer: true, product: true, server: true },
  });

  assert.ok(seededService);
  assert.equal(seededService.customer.customerNumber, 'DEV-CUST-0001');
  assert.equal(seededService.product.slug, 'starter-hosting');
  assert.equal(seededService.server?.hostname, 'cpanel.example.test');
}

verify()
  .then(async () => {
    await prisma.$disconnect();
    process.stdout.write(
      'Verified schema invariants and fictional seed data.\n',
    );
  })
  .catch(async (error: unknown) => {
    await prisma.$disconnect();
    const message =
      error instanceof Error ? (error.stack ?? error.message) : 'Unknown error';
    process.stderr.write(`Database verification failed: ${message}\n`);
    process.exitCode = 1;
  });
