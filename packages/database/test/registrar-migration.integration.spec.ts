import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { Client } from 'pg';
import { createPrismaClient } from '../src/client';
import { loadPinnedMigrations } from './currency-privilege-harness.fixtures';
import {
  assertBrowserDatabaseScope,
  browserDatabaseUrl,
  validateBrowserDatabaseUrl,
} from '../../../apps/web/e2e/database-scope';

test('registrar migration preserves all historical hosting and financial rows and leaves registrar stores empty', async () => {
  const parentSchema = process.env.WEBHOST_BROWSER_E2E_SCHEMA ?? '';
  const parentUrl = process.env.DATABASE_URL ?? '';
  validateBrowserDatabaseUrl(parentUrl, parentSchema);
  const parent = createPrismaClient(parentUrl);
  await assertBrowserDatabaseScope(parent, parentUrl, parentSchema);
  const schema = `command26_e2e_${randomUUID().replaceAll('-', '')}`;
  const url = browserDatabaseUrl(parentUrl, schema);
  const adminUrl = new URL(parentUrl);
  adminUrl.searchParams.delete('options');
  adminUrl.searchParams.set('schema', 'public');
  const admin = createPrismaClient(adminUrl.toString());
  let created = false;
  const raw = new Client({ connectionString: url });
  try {
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    created = true;
    await raw.connect();
    assert.equal(
      (await raw.query('SELECT current_schema() AS name')).rows[0]?.name,
      schema,
    );
    const migrations = loadPinnedMigrations();
    assert.equal(migrations.length, 28);
    for (const migration of migrations) await raw.query(migration.sql);
    await raw.query('CREATE TABLE __browser_e2e_scope(owner text NOT NULL)');
    await raw.query('INSERT INTO __browser_e2e_scope VALUES($1)', [schema]);
    const user = randomUUID(),
      customer = randomUUID(),
      product = randomUUID(),
      price = randomUUID(),
      order = randomUUID(),
      item = randomUUID(),
      invoice = randomUUID();
    await raw.query(
      "INSERT INTO users(id,email,role,status,updated_at) VALUES($1,'historical@example.test','CUSTOMER','ACTIVE',now())",
      [user],
    );
    await raw.query(
      "INSERT INTO customers(id,user_id,customer_number,first_name,last_name,address_line_1,city,country_code,updated_at) VALUES($1,$2,'FICTIONAL-REG-50','Fictional','History','1 Test Street','Dhaka','BD',now())",
      [customer, user],
    );
    await raw.query(
      "INSERT INTO products(id,slug,name,updated_at) VALUES($1,'fictional-history-50','Fictional historical hosting',now())",
      [product],
    );
    await raw.query(
      "INSERT INTO product_prices(id,product_id,billing_period,currency,amount,updated_at) VALUES($1,$2,'ANNUAL','BDT',9007199254740993,now())",
      [price, product],
    );
    await raw.query(
      "INSERT INTO orders(id,order_number,submission_key,customer_id,currency,subtotal,total,customer_email_snapshot,updated_at) VALUES($1,'FICTIONAL-ORDER-50','fictional-order-50',$2,'BDT',9007199254740993,9007199254740993,'historical@example.test',now())",
      [order, customer],
    );
    await raw.query(
      "INSERT INTO order_items(id,order_id,product_id,product_price_id,product_name_snapshot,billing_period,currency,unit_amount,line_total) VALUES($1,$2,$3,$4,'Fictional hosting','ANNUAL','BDT',9007199254740993,9007199254740993)",
      [item, order, product, price],
    );
    await raw.query(
      `INSERT INTO invoices(id,invoice_number,submission_key,customer_id,order_id,status,currency,subtotal,total,balance_due,customer_name_snapshot,customer_email_snapshot,customer_address_snapshot,business_identity_snapshot,issued_at,due_at,updated_at)
      VALUES($1,'FICTIONAL-INVOICE-50','fictional-invoice-50',$2,$3,'UNPAID','BDT',9007199254740993,9007199254740993,9007199254740993,'Fictional History','historical@example.test','{"city":"Dhaka"}','{"name":"Fictional business"}',now(),now()+interval '7 days',now())`,
      [invoice, customer, order],
    );
    await raw.query(
      "INSERT INTO invoice_items(id,invoice_id,line_position,order_item_id,description_snapshot,currency,unit_amount,line_total) VALUES($1,$2,1,$3,'Fictional hosting','BDT',9007199254740993,9007199254740993)",
      [randomUUID(), invoice, item],
    );
    await raw.query(
      "INSERT INTO payments(id,invoice_id,provider,idempotency_key,amount,currency,updated_at) VALUES($1,$2,'fake','fictional-pending-payment-50',9007199254740993,'BDT',now())",
      [randomUUID(), invoice],
    );
    const tables = (
      await raw.query<{ table_name: string }>(
        "SELECT table_name FROM information_schema.tables WHERE table_schema=$1 AND table_type='BASE TABLE' ORDER BY table_name",
        [schema],
      )
    ).rows.map((r) => r.table_name);
    const snapshot = async (after = false) => {
      const rows: Record<string, string[]> = {};
      for (const table of tables) {
        assert.match(table, /^[a-z_][a-z0-9_]*$/);
        const projection =
          after && ['products', 'order_items'].includes(table)
            ? "to_jsonb(t)-'kind'"
            : 'to_jsonb(t)';
        rows[table] = (
          await raw.query<{ row: string }>(
            `SELECT (${projection})::text AS row FROM "${table}" t ORDER BY (${projection})::text`,
          )
        ).rows.map((r) => r.row);
      }
      return rows;
    };
    const before = await snapshot();
    await raw.query(
      readFileSync(
        resolve(
          'prisma/migrations/20261012000100_domain_registrar/migration.sql',
        ),
        'utf8',
      ),
    );
    assert.deepEqual(await snapshot(true), before);
    // Additive live rollout must leave every prior business row unchanged too.
    const fakeId = randomUUID(),
      credentialId = randomUUID();
    await raw.query(
      'INSERT INTO registrar_accounts(id,enabled) VALUES($1,true)',
      [fakeId],
    );
    await raw.query(
      "INSERT INTO registrar_credentials(id,account_id,version,ciphertext) VALUES($1,$2,1,'fictional-historical-ciphertext')",
      [credentialId, fakeId],
    );
    const fakeBefore = (
      await raw.query(
        'SELECT to_jsonb(t)::text AS row FROM registrar_accounts t',
      )
    ).rows[0]?.row;
    const credentialBefore = (
      await raw.query(
        'SELECT to_jsonb(t)::text AS row FROM registrar_credentials t',
      )
    ).rows[0]?.row;
    const beforeLive = await snapshot(true);
    await raw.query(
      readFileSync(
        resolve(
          process.cwd(),
          'prisma/migrations/20261012000200_resellbiz_live_registration/migration.sql',
        ),
        'utf8',
      ),
    );
    assert.deepEqual(await snapshot(true), beforeLive);
    assert.equal(
      (
        await raw.query(
          "SELECT (to_jsonb(t)-'configuration')::text AS row FROM registrar_accounts t",
        )
      ).rows[0]?.row,
      fakeBefore,
    );
    assert.equal(
      (
        await raw.query(
          'SELECT to_jsonb(t)::text AS row FROM registrar_credentials t',
        )
      ).rows[0]?.row,
      credentialBefore,
    );
    // A populated legacy request/approval proves nullable additions do not
    // silently adopt the catalogue, change ownership or reset an old intent.
    const legacyProduct = randomUUID(),
      legacyPrice = randomUUID(),
      legacyOffer = randomUUID(),
      legacyQuote = randomUUID(),
      legacyOrder = randomUUID(),
      legacyItem = randomUUID(),
      legacyInvoice = randomUUID(),
      legacyDomain = randomUUID();
    await raw.query(
      "INSERT INTO products(id,slug,name,kind,updated_at) VALUES($1,'fictional-legacy-domain','Fictional domain','DOMAIN',now())",
      [legacyProduct],
    );
    await raw.query(
      "INSERT INTO product_prices(id,product_id,billing_period,currency,amount,updated_at) VALUES($1,$2,'ANNUAL','BDT',150000,now())",
      [legacyPrice, legacyProduct],
    );
    await raw.query(
      'INSERT INTO domain_offers(id,account_id,product_id,price_id,tld,nameservers) VALUES($1,$2,$3,$4,\'com\',\'["ns1.example.test","ns2.example.test"]\')',
      [legacyOffer, fakeId, legacyProduct, legacyPrice],
    );
    await raw.query(
      "INSERT INTO domain_quotes(id,customer_id,account_id,offer_id,domain_name,selling_amount,cost_amount,cost_currency,contact_ciphertext,fingerprint,nameservers,agreement,expires_at) VALUES($1,$2,$3,$4,'fictional-legacy.com',150000,1000,'USD','fictional-retained-ciphertext',$5,'[\"ns1.example.test\",\"ns2.example.test\"]','fictional-registration-v1',now()+interval '10 minutes')",
      [legacyQuote, customer, fakeId, legacyOffer, 'a'.repeat(64)],
    );
    await raw.query(
      "INSERT INTO orders(id,order_number,submission_key,customer_id,currency,subtotal,total,customer_email_snapshot,updated_at) VALUES($1,'FICTIONAL-LEGACY-118','fictional-legacy-118',$2,'BDT',150000,150000,'historical@example.test',now())",
      [legacyOrder, customer],
    );
    await raw.query(
      "INSERT INTO order_items(id,order_id,product_id,product_price_id,product_name_snapshot,kind,requested_domain,billing_period,currency,unit_amount,line_total) VALUES($1,$2,$3,$4,'Fictional domain','DOMAIN','fictional-legacy.com','ANNUAL','BDT',150000,150000)",
      [legacyItem, legacyOrder, legacyProduct, legacyPrice],
    );
    await raw.query(
      `INSERT INTO invoices(id,invoice_number,submission_key,customer_id,order_id,status,currency,subtotal,total,balance_due,customer_name_snapshot,customer_email_snapshot,customer_address_snapshot,business_identity_snapshot,issued_at,due_at,updated_at)
      VALUES($1,'FICTIONAL-LEGACY-INVOICE-118','fictional-legacy-invoice-118',$2,$3,'UNPAID','BDT',150000,150000,150000,'Fictional History','historical@example.test','{"city":"Dhaka"}','{"name":"Fictional business"}',now(),now()+interval '7 days',now())`,
      [legacyInvoice, customer, legacyOrder],
    );
    await raw.query(
      "INSERT INTO domains(id,quote_id,customer_id,account_id,order_item_id,invoice_id,domain_name,submission_key) VALUES($1,$2,$3,$4,$5,$6,'fictional-legacy.com',$7)",
      [
        legacyDomain,
        legacyQuote,
        customer,
        fakeId,
        legacyItem,
        legacyInvoice,
        randomUUID(),
      ],
    );
    await raw.query(
      'INSERT INTO registrar_operations(id,domain_id,customer_id,account_id,credential_id,actor_user_id,cost_ceiling) VALUES($1,$2,$3,$4,$5,$6,1000)',
      [randomUUID(), legacyDomain, customer, fakeId, credentialId, user],
    );
    const priorTables = (
      await raw.query<{ table_name: string }>(
        "SELECT table_name FROM information_schema.tables WHERE table_schema=$1 AND table_type='BASE TABLE' ORDER BY table_name",
        [schema],
      )
    ).rows.map((row) => row.table_name);
    const beforeCatalogue: Record<string, string[]> = {};
    for (const table of priorTables) {
      assert.match(table, /^[a-z_][a-z0-9_]*$/);
      beforeCatalogue[table] = (
        await raw.query<{ row: string }>(
          `SELECT to_jsonb(t)::text AS row FROM "${table}" t ORDER BY to_jsonb(t)::text`,
        )
      ).rows.map((row) => row.row);
    }
    await raw.query(
      readFileSync(
        resolve(
          'prisma/migrations/20261012000300_domain_catalogue_registrar_selection/migration.sql',
        ),
        'utf8',
      ),
    );
    for (const table of priorTables) {
      const added =
        table === 'domain_quotes'
          ? "-'selection_snapshot'"
          : table === 'domains'
            ? "-'execution_account_id'"
            : table === 'registrar_operations'
              ? "-'selected_account_id'-'selected_credential_id'-'selection_fingerprint'"
              : '';
      const projection = `to_jsonb(t)${added}`;
      const after = (
        await raw.query<{ row: string }>(
          `SELECT (${projection})::text AS row FROM "${table}" t ORDER BY (${projection})::text`,
        )
      ).rows.map((row) => row.row);
      assert.deepEqual(
        after,
        beforeCatalogue[table],
        `Catalogue migration preserved ${table}`,
      );
    }
    for (const table of ['registrar_profiles', 'domain_catalogue_tlds'])
      assert.equal(
        (await raw.query(`SELECT count(*)::text AS count FROM ${table}`))
          .rows[0]?.count,
        '0',
      );
    assert.equal(
      (await raw.query('SELECT kind FROM products WHERE id=$1', [product]))
        .rows[0]?.kind,
      'HOSTING',
    );
    assert.equal(
      (await raw.query('SELECT kind FROM order_items WHERE id=$1', [item]))
        .rows[0]?.kind,
      'HOSTING',
    );
    for (const table of [
      'registrar_accounts',
      'registrar_credentials',
      'domain_offers',
      'domain_actions',
      'domain_quotes',
      'domains',
      'registrar_operations',
      'registrar_evidence',
      'registrar_mappings',
      'registrar_preparations',
      'fake_registrar_registrations',
    ])
      assert.equal(
        (await raw.query(`SELECT count(*)::text AS count FROM "${table}"`))
          .rows[0]?.count,
        [
          'registrar_accounts',
          'registrar_credentials',
          'domain_offers',
          'domain_quotes',
          'domains',
          'registrar_operations',
        ].includes(table)
          ? '1'
          : '0',
      );
  } finally {
    await raw.end();
    if (created) {
      assert.match(schema, /^command26_e2e_[a-f0-9]{32}$/);
      await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
    }
    await admin.$disconnect();
    await parent.$disconnect();
  }
});
