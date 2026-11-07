import assert from 'node:assert/strict';
import type { PrismaClient } from '@webhost-billing/database';
import { z } from 'zod';
import { assertBrowserDatabaseScope } from '../../../web/e2e/database-scope';

const id = (n: number) =>
  `23000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const seed = (n: number) =>
  `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export const alpha4FixtureSchema = z.object({
  serviceId: z.uuid(),
  addOnId: z.uuid(),
  pendingInvoiceId: z.uuid(),
  pendingPaymentId: z.uuid(),
  outboxId: z.uuid(),
  noteId: z.uuid(),
  addedCash: z.literal('145000'),
});
export type Alpha4Fixture = z.infer<typeof alpha4FixtureSchema>;

/** Old-column SQL only; copied seed rows and all values are fictional. */
export async function populateAlpha4Fixture(
  db: PrismaClient,
  url: string,
  schema: string,
) {
  await assertBrowserDatabaseScope(db, url, schema);
  const migrations = await db.$queryRaw<
    Array<{ count: bigint }>
  >`SELECT count(*) AS count FROM _prisma_migrations WHERE finished_at IS NOT NULL`;
  assert.equal(migrations[0].count, 46n);
  const state = alpha4FixtureSchema.parse({
    serviceId: id(6),
    addOnId: id(5),
    pendingInvoiceId: id(11),
    pendingPaymentId: id(13),
    outboxId: id(14),
    noteId: id(15),
    addedCash: '145000',
  });
  const oldColumns = await db.$queryRaw<
    Array<{ table: string; column: string }>
  >`SELECT table_name AS table, column_name AS column FROM information_schema.columns WHERE table_schema=current_schema()`;
  const allowed = new Map<string, Set<string>>();
  for (const row of oldColumns) {
    if (!allowed.has(row.table)) allowed.set(row.table, new Set());
    allowed.get(row.table)!.add(row.column);
  }
  await db.$transaction(
    async (tx) => {
      const clone = async (
        table: string,
        sourceId: string,
        changes: Record<string, unknown>,
      ) => {
        assert.ok(
          [
            'products',
            'product_prices',
            'orders',
            'order_items',
            'services',
            'invoices',
            'invoice_items',
            'payments',
            'outbox_events',
            'ticket_messages',
          ].includes(table),
        );
        for (const key of Object.keys(changes))
          assert.ok(
            allowed.get(table)?.has(key),
            `Not an alpha.4 column: ${key}`,
          );
        assert.equal(
          await tx.$executeRawUnsafe(
            `INSERT INTO "${table}" SELECT (jsonb_populate_record(NULL::"${table}",to_jsonb(source)||$1::jsonb)).* FROM "${table}" source WHERE id=$2::uuid`,
            JSON.stringify(changes),
            sourceId,
          ),
          1,
        );
      };
      await clone('products', seed(6), {
        id: id(1),
        kind: 'ADD_ON',
        slug: 'fictional-alpha4-backup',
        name: 'Fictional alpha.4 managed backup',
        hosting_package_identifier: null,
        provisioning_adapter: null,
        provisioning_config: null,
      });
      await clone('product_prices', seed(7), {
        id: id(2),
        product_id: id(1),
        amount: '25000',
      });
      await tx.$executeRaw`INSERT INTO product_add_on_eligibility(hosting_product_id,add_on_product_id) VALUES (${seed(6)}::uuid,${id(1)}::uuid)`;
      await clone('orders', seed(8), {
        id: id(3),
        order_number: 'FICTIONAL-230-ORDER',
        submission_key: 'fictional230:order',
        subtotal: '145000',
        total: '145000',
        notes: 'Fictional alpha.4 purchase.',
      });
      await clone('order_items', seed(9), {
        id: id(4),
        order_id: id(3),
        requested_domain: 'alpha4.example.test',
      });
      await clone('order_items', seed(9), {
        id: id(5),
        order_id: id(3),
        product_id: id(1),
        product_price_id: id(2),
        kind: 'ADD_ON',
        product_name_snapshot: 'Fictional alpha.4 managed backup',
        description_snapshot: 'Fictional manually delivered backup.',
        unit_amount: '25000',
        line_total: '25000',
        requested_domain: null,
        provisioning_snapshot: null,
        fulfilled_at: '2026-08-02T05:30:00.000Z',
        renewal_ends_at: '2026-09-01T03:00:00.000Z',
      });
      await clone('services', seed(10), {
        id: id(6),
        order_item_id: id(4),
        domain: 'alpha4.example.test',
        control_panel_username: 'fictional230',
        external_account_id: 'fake-alpha4-account',
      });
      await clone('invoices', seed(11), {
        id: id(7),
        invoice_number: 'FICTIONAL-230-PAID',
        submission_key: 'fictional230:paid',
        order_id: id(3),
        subtotal: '145000',
        total: '145000',
        amount_paid: '145000',
      });
      await clone('invoice_items', seed(12), {
        id: id(8),
        invoice_id: id(7),
        order_item_id: id(4),
        service_id: id(6),
      });
      await clone('invoice_items', seed(12), {
        id: id(9),
        invoice_id: id(7),
        line_position: 2,
        order_item_id: id(5),
        service_id: null,
        description_snapshot: 'Fictional alpha.4 managed backup',
        unit_amount: '25000',
        line_total: '25000',
      });
      await clone('payments', seed(13), {
        id: id(10),
        invoice_id: id(7),
        provider_transaction_id: 'FICTIONAL-230-PAID',
        idempotency_key: 'fictional230:paid-payment',
        amount: '145000',
        reference: 'Fictional alpha.4 receipt',
      });
      await clone('invoices', seed(11), {
        id: id(11),
        invoice_number: 'FICTIONAL-230-RENEWAL',
        submission_key: 'fictional230:renewal',
        order_id: null,
        status: 'UNPAID',
        amount_paid: '0',
        balance_due: '120000',
        paid_at: null,
        issued_at: '2026-08-25T03:00:00.000Z',
        due_at: '2026-09-01T03:00:00.000Z',
      });
      await clone('invoice_items', seed(12), {
        id: id(12),
        invoice_id: id(11),
        order_item_id: null,
        service_id: id(6),
        description_snapshot: 'Fictional alpha.4 hosting-only renewal',
        service_period_start: '2026-09-01T03:00:00.000Z',
        service_period_end: '2026-10-01T03:00:00.000Z',
      });
      await clone('payments', seed(13), {
        id: id(13),
        invoice_id: id(11),
        created_by_user_id: seed(3),
        reviewed_by_user_id: null,
        status: 'PENDING',
        provider_transaction_id: null,
        idempotency_key: 'fictional230:pending-payment',
        manual_method: 'BANK_TRANSFER',
        reference: 'FICTIONAL-230-PENDING',
        received_at: '2026-08-25T03:00:00.000Z',
        reviewed_at: null,
        verified_at: null,
      });
      await clone('outbox_events', seed(21), {
        id: id(14),
        aggregate_type: 'INVOICE',
        aggregate_id: id(11),
        event_type: 'EMAIL_INVOICE_CREATED',
        idempotency_key: 'fictional230:pending-email',
        payload: { schemaVersion: 1, invoiceId: id(11) },
        status: 'PENDING',
        published_at: null,
        attempt_count: 0,
      });
      await clone('ticket_messages', seed(16), {
        id: id(15),
        author_user_id: seed(1),
        kind: 'SYSTEM',
        body: 'Fictional alpha.4 staff-only context; preserve through migration.',
      });
      await tx.$executeRaw`UPDATE __browser_e2e_scope SET alpha4_fixture=${JSON.stringify(state)}::jsonb`;
    },
    { timeout: 30000 },
  );
  return state;
}

export async function verifyAlpha4Migration(
  db: PrismaClient,
  state: Alpha4Fixture,
) {
  const ticket = await db.ticket.findUniqueOrThrow({ where: { id: seed(15) } });
  assert.equal(ticket.departmentId, '21600000-0000-4000-8000-000000000001');
  const item = await db.orderItem.findUniqueOrThrow({
    where: { id: state.addOnId },
  });
  assert.equal(item.lineTotal, 25000n);
  assert.equal(item.renewalEndsAt?.toISOString(), '2026-09-01T03:00:00.000Z');
  assert.equal(item.provisioningSnapshot, null);
  assert.equal(
    (await db.service.findUniqueOrThrow({ where: { id: state.serviceId } }))
      .status,
    'ACTIVE',
  );
  assert.equal(
    (
      await db.payment.findUniqueOrThrow({
        where: { id: state.pendingPaymentId },
      })
    ).status,
    'PENDING',
  );
  assert.equal(
    (await db.outboxEvent.findUniqueOrThrow({ where: { id: state.outboxId } }))
      .status,
    'PENDING',
  );
  assert.equal(await db.serviceUpgrade.count(), 0);
  assert.equal(await db.sslCheckout.count(), 0);
  assert.equal(await db.ticketAttachment.count(), 0);
  assert.equal(await db.supportEmailReceipt.count(), 0);
}
