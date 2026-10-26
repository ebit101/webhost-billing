import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { Client } from 'pg';
import { createPrismaClient } from '../src/client';
import {
  assertBrowserDatabaseScope,
  browserDatabaseUrl,
  validateBrowserDatabaseUrl,
} from '../../../apps/web/e2e/database-scope';

test('product groups migration preserves existing product, price, order, invoice, payment and service rows', async () => {
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
    const directory = resolve('prisma/migrations');
    const migrations = readdirSync(directory)
      .filter(
        (name) =>
          /^\d{14}_/.test(name) && name < '20261026140000_product_groups',
      )
      .sort();
    assert.equal(migrations.length, 34);
    for (const name of migrations)
      await raw.query(
        readFileSync(resolve(directory, name, 'migration.sql'), 'utf8'),
      );
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
    const server = randomUUID();
    await raw.query(
      "INSERT INTO servers(id,name,hostname,adapter_key,updated_at) VALUES($1,'Fictional historical server','command133.example.test','fake-panel',now())",
      [server],
    );
    await raw.query(
      "INSERT INTO services(id,customer_id,product_id,product_price_id,server_id,product_name_snapshot,billing_period,recurring_amount,currency,started_at,next_due_at,updated_at) VALUES($1,$2,$3,$4,$5,'Fictional historical hosting','ANNUAL',9007199254740993,'BDT',now(),now()+interval '1 year',now())",
      [randomUUID(), customer, product, price, server],
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
          after && table === 'products'
            ? "to_jsonb(t)-'group_id'"
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
          'prisma/migrations/20261026140000_product_groups/migration.sql',
        ),
        'utf8',
      ),
    );
    assert.deepEqual(await snapshot(true), before);
    assert.equal(
      (await raw.query('SELECT count(*)::text AS count FROM product_groups'))
        .rows[0]?.count,
      '0',
    );
    assert.equal(
      (await raw.query('SELECT group_id FROM products WHERE id=$1', [product]))
        .rows[0]?.group_id,
      null,
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
