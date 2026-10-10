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
const testScope = process.env.WEBHOST_BROWSER_E2E_SCHEMA;
const schema = testScope ?? 'public';

const expectedTables = [
  'activity_logs',
  'admin_login_challenges',
  'admin_profiles',
  'admin_recovery_codes',
  'admin_totp_credentials',
  'auth_sessions',
  'automation_runs',
  'currency_controls',
  'currency_execution_domains',
  'currency_installations',
  'currency_policy_revisions',
  'currency_unit_definitions',
  'customers',
  'email_attempts',
  'email_logs',
  'email_verification_tokens',
  'hosting_panel_operations',
  'integration_credentials',
  'invoice_items',
  'invoices',
  'order_items',
  'orders',
  'outbox_events',
  'password_reset_tokens',
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
  'currency_installations_singleton_check',
  'currency_installations_time_check',
  'currency_execution_domains_database_name_check',
  'currency_execution_domains_schema_name_check',
  'currency_execution_domains_manifest_check',
  'currency_execution_domains_time_check',
  'currency_controls_singleton_check',
  'currency_controls_generation_check',
  'currency_controls_unassessed_check',
  'currency_policy_revisions_revision_check',
  'currency_policy_revisions_identity_check',
  'currency_unit_definitions_code_check',
  'currency_unit_definitions_version_check',
  'currency_unit_definitions_exponent_check',
  'currency_unit_definitions_provenance_check',
  'currency_unit_definitions_status_check',
  'auth_sessions_time_order_check',
  'auth_sessions_token_hash_format_check',
  'auth_sessions_two_factor_time_check',
  'admin_login_challenges_failed_attempts_check',
  'admin_login_challenges_hash_format_check',
  'admin_login_challenges_time_order_check',
  'admin_recovery_codes_hash_format_check',
  'admin_recovery_codes_time_order_check',
  'admin_totp_credentials_state_check',
  'automation_runs_counts_check',
  'customers_country_code_check',
  'invoice_items_total_check',
  'invoice_items_line_position_check',
  'invoices_balance_check',
  'invoices_settlement_limit_check',
  'invoices_total_check',
  'hosting_panel_operations_attempt_check',
  'hosting_panel_operations_fingerprint_check',
  'hosting_panel_operations_metadata_object_check',
  'hosting_panel_operations_requester_check',
  'hosting_panel_operations_retry_self_check',
  'hosting_panel_operations_service_scope_check',
  'hosting_panel_operations_status_evidence_check',
  'email_verification_tokens_hash_format_check',
  'email_verification_tokens_time_order_check',
  'email_attempts_failure_kind_check',
  'email_attempts_number_check',
  'email_attempts_state_check',
  'order_items_total_check',
  'orders_total_check',
  'password_reset_tokens_hash_format_check',
  'password_reset_tokens_time_order_check',
  'payments_adjustment_reference_check',
  'payments_amount_check',
  'payments_manual_method_check',
  'payments_manual_review_state_check',
  'payments_proof_metadata_object_check',
  'products_display_order_check',
  'servers_cpanel_configuration_check',
  'servers_credential_pair_check',
  'services_active_identity_check',
  'services_cancellation_metadata_check',
  'services_due_after_start_check',
  'services_failure_metadata_check',
  'services_suspension_metadata_check',
  'services_termination_metadata_check',
  'users_email_normalized_check',
] as const;

const expectedMoneyColumns = [
  'invoice_items.discount_amount',
  'invoice_items.line_total',
  'invoice_items.tax_amount',
  'invoice_items.unit_amount',
  'invoices.amount_paid',
  'invoices.balance_due',
  'invoices.credit_total',
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
  if (testScope !== undefined) {
    const { assertBrowserDatabaseScope } =
      await import('../../../apps/web/e2e/database-scope.js');
    await assertBrowserDatabaseScope(prisma, databaseUrl!, testScope);
  }
  const tables = await prisma.$queryRaw<Array<{ table_name: string }>>`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = ${schema}
      AND table_type = 'BASE TABLE'
      AND table_name <> '_prisma_migrations'
      AND (table_name <> '__browser_e2e_scope' OR ${testScope === undefined})
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
    WHERE table_schema = ${schema}
      AND column_name = 'id'
      AND table_name <> '_prisma_migrations'
      AND table_name <> 'currency_controls'
      AND table_name <> 'currency_installations'
    ORDER BY table_name
  `;

  const uuidTables = expectedTables.filter(
    (name) =>
      name !== 'currency_unit_definitions' &&
      name !== 'currency_policy_revisions' &&
      name !== 'currency_controls' &&
      name !== 'currency_installations',
  );
  assert.equal(idColumnTypes.length, uuidTables.length);
  assert.deepEqual(
    idColumnTypes.map((row) => row.table_name),
    uuidTables,
  );
  assert.ok(
    idColumnTypes.every(({ data_type: dataType }) => dataType === 'uuid'),
  );

  const unitKeyColumns = await prisma.$queryRaw<{ column_name: string }[]>`
    SELECT column_name FROM information_schema.key_column_usage
    WHERE constraint_schema = ${schema}
      AND constraint_name = 'currency_unit_definitions_pkey'
    ORDER BY ordinal_position
  `;
  assert.deepEqual(unitKeyColumns, [
    { column_name: 'code' },
    { column_name: 'metadata_version' },
  ]);
  const unitTriggers = await prisma.$queryRaw<{ event_manipulation: string }[]>`
    SELECT event_manipulation FROM information_schema.triggers
    WHERE trigger_schema = ${schema}
      AND trigger_name = 'currency_unit_definitions_immutable'
      AND action_timing = 'BEFORE' AND action_orientation = 'STATEMENT'
    ORDER BY event_manipulation
  `;
  assert.deepEqual(unitTriggers, [
    { event_manipulation: 'DELETE' },
    { event_manipulation: 'UPDATE' },
  ]);
  // information_schema.triggers omits TRUNCATE; inspect its PostgreSQL event bit.
  const truncateTriggers = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT count(*) AS count FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = ${schema} AND c.relname = 'currency_unit_definitions'
      AND t.tgname = 'currency_unit_definitions_immutable'
      AND (t.tgtype & 32) = 32 AND t.tgenabled = 'O'
  `;
  assert.equal(truncateTriggers[0]?.count, 1n);

  const policyKey = await prisma.$queryRaw<{ column_name: string }[]>`
    SELECT column_name FROM information_schema.key_column_usage
    WHERE constraint_schema = ${schema} AND constraint_name = 'currency_policy_revisions_pkey'
    ORDER BY ordinal_position
  `;
  assert.deepEqual(policyKey, [{ column_name: 'revision' }]);
  const policyColumns = await prisma.$queryRaw<
    { column_name: string; data_type: string }[]
  >`
    SELECT column_name, data_type FROM information_schema.columns
    WHERE table_schema = ${schema} AND table_name = 'currency_policy_revisions'
    ORDER BY ordinal_position
  `;
  assert.deepEqual(policyColumns, [
    { column_name: 'revision', data_type: 'character varying' },
    { column_name: 'policy', data_type: 'jsonb' },
    { column_name: 'created_at', data_type: 'timestamp with time zone' },
  ]);
  const policyTriggers = await prisma.$queryRaw<
    { name: string; type: number }[]
  >`
    SELECT t.tgname AS name, t.tgtype::integer AS type FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = ${schema} AND c.relname = 'currency_policy_revisions'
      AND NOT t.tgisinternal AND t.tgenabled = 'O' ORDER BY t.tgname
  `;
  // BEFORE statement UPDATE/DELETE/TRUNCATE = 58; BEFORE row INSERT = 7.
  assert.deepEqual(policyTriggers, [
    { name: 'currency_policy_revisions_immutable', type: 58 },
    { name: 'currency_policy_revisions_validate', type: 7 },
  ]);

  const controlColumns = await prisma.$queryRaw<
    { column_name: string; data_type: string; is_nullable: string }[]
  >`
    SELECT column_name, data_type, is_nullable FROM information_schema.columns
    WHERE table_schema = ${schema} AND table_name = 'currency_controls'
    ORDER BY ordinal_position
  `;
  assert.deepEqual(controlColumns, [
    { column_name: 'id', data_type: 'smallint', is_nullable: 'NO' },
    { column_name: 'generation', data_type: 'bigint', is_nullable: 'NO' },
    {
      column_name: 'selected_policy_revision',
      data_type: 'character varying',
      is_nullable: 'YES',
    },
    {
      column_name: 'history_latched',
      data_type: 'boolean',
      is_nullable: 'YES',
    },
    {
      column_name: 'base_code',
      data_type: 'character varying',
      is_nullable: 'YES',
    },
    {
      column_name: 'base_metadata_version',
      data_type: 'character varying',
      is_nullable: 'YES',
    },
    {
      column_name: 'base_minor_unit_exponent',
      data_type: 'smallint',
      is_nullable: 'YES',
    },
    {
      column_name: 'created_at',
      data_type: 'timestamp with time zone',
      is_nullable: 'NO',
    },
  ]);
  const controlTriggers = await prisma.$queryRaw<
    { name: string; type: number }[]
  >`
    SELECT t.tgname AS name, t.tgtype::integer AS type FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = ${schema} AND c.relname = 'currency_controls'
      AND NOT t.tgisinternal AND t.tgenabled = 'O' ORDER BY t.tgname
  `;
  assert.deepEqual(controlTriggers, [
    { name: 'currency_controls_no_delete', type: 10 },
    { name: 'currency_controls_no_truncate', type: 34 },
    { name: 'currency_controls_no_update', type: 18 },
  ]);
  // The unchanged fictional seed must not initialize authority or even uncertainty.
  assert.equal(await prisma.currencyControl.count(), 0);
  assert.equal(await prisma.currencyInstallation.count(), 0);
  assert.equal(await prisma.currencyExecutionDomain.count(), 0);

  const moneyColumns = await prisma.$queryRaw<
    Array<{ table_name: string; column_name: string }>
  >`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = ${schema}
      AND data_type = 'bigint'
      AND NOT (
        table_name = 'admin_totp_credentials'
        AND column_name = 'last_used_time_step'
      )
      AND NOT (table_name = 'currency_controls' AND column_name = 'generation')
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
    WHERE table_schema = ${schema}
      AND data_type = 'timestamp without time zone'
  `;
  assert.deepEqual(timezoneUnsafeTimestamps, []);

  const customConstraints = await prisma.$queryRaw<
    Array<{ constraint_name: string }>
  >`
    SELECT constraint_name
    FROM information_schema.table_constraints
    WHERE constraint_schema = ${schema}
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
    WHERE schemaname = ${schema}
      AND indexname = 'product_prices_one_active_key'
      AND indexdef LIKE '%WHERE ((is_active = true) AND (deleted_at IS NULL))%'
  `;
  assert.equal(partialPriceIndexes[0]?.count, 1n);

  const publicCatalogIndexes = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*)::bigint AS count
    FROM pg_indexes
    WHERE schemaname = ${schema}
      AND indexname = 'products_public_catalog_idx'
  `;
  assert.equal(publicCatalogIndexes[0]?.count, 1n);

  const invoiceItemPositionIndexes = await prisma.$queryRaw<
    Array<{ count: bigint }>
  >`
    SELECT COUNT(*)::bigint AS count
    FROM pg_indexes
    WHERE schemaname = ${schema}
      AND indexname = 'invoice_items_invoice_id_line_position_key'
  `;
  assert.equal(invoiceItemPositionIndexes[0]?.count, 1n);

  const renewalPeriodIndexes = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*)::bigint AS count
    FROM pg_indexes
    WHERE schemaname = ${schema}
      AND indexname = 'invoice_items_service_period_key'
      AND indexdef LIKE 'CREATE UNIQUE INDEX%'
      AND indexdef LIKE '%WHERE%service_id IS NOT NULL%'
  `;
  assert.equal(renewalPeriodIndexes[0]?.count, 1n);

  const hostingRetryIndexes = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*)::bigint AS count
    FROM pg_indexes
    WHERE schemaname = ${schema}
      AND indexname = 'hosting_panel_operations_retry_of_operation_id_key'
      AND indexdef LIKE 'CREATE UNIQUE INDEX%'
  `;
  assert.equal(hostingRetryIndexes[0]?.count, 1n);

  const cascadingForeignKeys = await prisma.$queryRaw<
    Array<{ constraint_name: string }>
  >`
    SELECT constraint_name
    FROM information_schema.referential_constraints
    WHERE constraint_schema = ${schema}
      AND delete_rule = 'CASCADE'
    ORDER BY constraint_name
  `;
  assert.deepEqual(cascadingForeignKeys, [
    { constraint_name: 'admin_recovery_codes_credential_id_fkey' },
  ]);

  const seededInvoice = await prisma.invoice.findUnique({
    where: { invoiceNumber: 'DEV-INV-0001' },
    include: { items: true, payments: true },
  });

  assert.ok(seededInvoice);
  assert.equal(seededInvoice.currency, 'BDT');
  assert.equal(seededInvoice.total, 120_000n);
  assert.equal(seededInvoice.balanceDue, 0n);
  assert.equal(seededInvoice.items.length, 1);
  assert.equal(seededInvoice.items[0]?.linePosition, 1);
  assert.equal(seededInvoice.payments.length, 1);
  assert.equal(
    seededInvoice.payments[0]?.manualMethod,
    'MOBILE_FINANCIAL_SERVICE',
  );
  assert.equal(
    seededInvoice.payments[0]?.reviewedByUserId,
    '10000000-0000-4000-8000-000000000001',
  );
  assert.equal(seededInvoice.dueAt.toISOString(), '2026-08-08T03:00:00.000Z');

  const seededService = await prisma.service.findUnique({
    where: { orderItemId: '10000000-0000-4000-8000-000000000009' },
    include: { customer: true, product: true, server: true },
  });

  assert.ok(seededService);
  assert.equal(seededService.customer.customerNumber, 'DEV-CUST-0001');
  assert.equal(seededService.product.slug, 'starter-hosting');
  assert.equal(seededService.product.publicVisible, true);
  assert.equal(seededService.product.displayOrder, 10);
  assert.equal(seededService.product.hostingPackageIdentifier, 'dev_starter');
  assert.equal(seededService.product.storageFeature, '10 GB SSD');
  assert.equal(seededService.server.hostname, 'cpanel.example.test');
  assert.equal(seededService.server.adapterKey, 'fake-panel');
  assert.equal(
    seededService.productPriceId,
    '10000000-0000-4000-8000-000000000007',
  );
  assert.equal(seededService.productNameSnapshot, 'Starter Hosting');
  assert.equal(
    seededService.startedAt.toISOString(),
    '2026-08-02T05:30:00.000Z',
  );
  assert.equal(
    seededService.nextDueAt.toISOString(),
    '2026-09-01T03:00:00.000Z',
  );

  const seededEmailLog = await prisma.emailLog.findUnique({
    where: { id: '10000000-0000-4000-8000-000000000017' },
    include: { attempts: true },
  });
  assert.ok(seededEmailLog);
  assert.equal(seededEmailLog.status, 'SENT');
  assert.equal(seededEmailLog.attempts.length, 1);
  assert.equal(seededEmailLog.attempts[0]?.status, 'SENT');
  assert.equal(seededEmailLog.attempts[0]?.failureCode, null);
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
