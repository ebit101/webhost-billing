import assert from 'node:assert/strict';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';
import { createPrismaClient } from '../src/client';
import { snapshotInvoiceProduct } from '@webhost-billing/shared';

// Fictional recovery acceptance only. No gateway adapter or network client is loaded.
const databaseUrl = new URL(process.env.DATABASE_URL ?? '');
const mode = process.argv[2];
assert.equal(
  process.env.RECOVERY_FIXTURE_CONFIRMATION,
  'FICTIONAL_RECOVERY_ONLY',
);
assert.ok(mode === 'populate' || mode === 'verify');
assert.equal(databaseUrl.searchParams.get('schema') ?? 'public', 'public');
const databaseName = databaseUrl.pathname.slice(1);
assert.equal(
  databaseName,
  mode === 'populate'
    ? 'webhost_billing_backup_source_command28'
    : 'webhost_billing_restore_command28',
);
const prisma = createPrismaClient(databaseUrl.toString());
const ids = {
  invoice: '22500000-0000-4000-8000-000000000001',
  charge: '22500000-0000-4000-8000-000000000002',
  checkout: '22500000-0000-4000-8000-000000000003',
  refundPayment: '22500000-0000-4000-8000-000000000004',
  refund: '22500000-0000-4000-8000-000000000005',
  pendingRefund: '22500000-0000-4000-8000-000000000006',
};
const account = {
  storeId: 'fictional-recovery-store',
  storePassword: 'fictional-recovery-password',
};
const keyVersion = 'integration-credential-v1';
const key = createHash('sha256')
  .update('webhost-billing:integration-credential:v1\0')
  .update('fictional-command225-encryption-key-only')
  .digest();
const aad = Buffer.from(`${keyVersion}:sslcommerz`);
const moment = new Date('2026-11-07T00:00:00Z');
const reference = 'WHBfictionalRecovery225';
const bankReference = 'fictional-bank-recovery225';
const accountHash = createHash('sha256')
  .update(`sslcommerz:SANDBOX:${account.storeId}`)
  .digest('hex');

function encrypt(): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(aad);
  const value = Buffer.concat([
    cipher.update(JSON.stringify(account)),
    cipher.final(),
  ]);
  return [
    'v1',
    iv.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
    value.toString('base64url'),
  ].join('.');
}
function decrypt(value: string): unknown {
  const [version, iv, tag, body] = value.split('.');
  assert.equal(version, 'v1');
  assert.ok(iv && tag && body);
  const cipher = createDecipheriv(
    'aes-256-gcm',
    key,
    Buffer.from(iv, 'base64url'),
  );
  cipher.setAAD(aad);
  cipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return JSON.parse(
    Buffer.concat([
      cipher.update(Buffer.from(body, 'base64url')),
      cipher.final(),
    ]).toString(),
  ) as unknown;
}
async function main(): Promise<void> {
  const actual = await prisma.$queryRaw<
    Array<{ name: string }>
  >`SELECT current_database() AS name`;
  assert.equal(actual[0]?.name, databaseName);
  if (mode === 'populate') {
    const customer = await prisma.customer.findUniqueOrThrow({
      where: { id: '10000000-0000-4000-8000-000000000004' },
      include: { user: true },
    });
    assert.ok(customer.user.email.endsWith('@example.test'));
    const admin = await prisma.user.findUniqueOrThrow({
      where: { id: '10000000-0000-4000-8000-000000000001' },
    });
    assert.ok(admin.email.endsWith('@example.test'));
    const hosting = await prisma.service.findFirstOrThrow({
      where: { customerId: customer.id },
    });
    await prisma.$transaction(async (tx) => {
      await tx.invoice.create({
        data: {
          id: ids.invoice,
          invoiceNumber: 'FICTIONAL-RECOVERY-225',
          submissionKey: 'fictional-recovery-225',
          customerId: customer.id,
          status: 'PARTIALLY_REFUNDED',
          currency: 'BDT',
          subtotal: 10000n,
          total: 10000n,
          amountPaid: 9000n,
          balanceDue: 1000n,
          customerNameSnapshot: 'Fictional recovery customer',
          customerEmailSnapshot: customer.user.email,
          customerAddressSnapshot: {
            line1: '225 Fictional Road',
            city: 'Dhaka',
            countryCode: 'BD',
          },
          businessIdentitySnapshot: { name: 'Fictional recovery business' },
          issuedAt: moment,
          dueAt: moment,
          paidAt: moment,
          items: {
            create: {
              linePosition: 1,
              descriptionSnapshot: 'Fictional hosting recovery',
              serviceId: hosting.id,
              productAttributionSnapshot: snapshotInvoiceProduct({
                productId: hosting.productId,
                productPriceId: hosting.productPriceId,
                name: hosting.productNameSnapshot,
                kind: 'HOSTING',
                source: 'HOSTING_RENEWAL',
              }),
              servicePeriodStart: moment,
              servicePeriodEnd: new Date(moment.getTime() + 86400000),
              currency: 'BDT',
              quantity: 1,
              unitAmount: 10000n,
              lineTotal: 10000n,
            },
          },
        },
      });
      await tx.payment.create({
        data: {
          id: ids.charge,
          invoiceId: ids.invoice,
          createdByUserId: admin.id,
          kind: 'CHARGE',
          status: 'SUCCEEDED',
          provider: 'sslcommerz',
          providerTransactionId: bankReference,
          reference,
          amount: 10000n,
          currency: 'BDT',
          idempotencyKey: 'fictional-recovery-charge225',
          receivedAt: moment,
          verifiedAt: moment,
        },
      });
      await tx.sslCheckout.create({
        data: {
          id: ids.checkout,
          paymentId: ids.charge,
          invoiceId: ids.invoice,
          merchantReference: reference,
          environment: 'SANDBOX',
          accountHash,
          credentialCiphertext: encrypt(),
          credentialKeyVersion: keyVersion,
          credentialRevision: 'fictional-command225',
          state: 'CAPTURED',
          sessionKey: 'fictional-session225',
          bankReference,
          capturedAt: moment,
          appliedToInvoice: true,
        },
      });
      await tx.paymentEvent.create({
        data: {
          paymentId: ids.charge,
          provider: 'sslcommerz',
          providerEventId: 'fictional-recovery-event225',
          idempotencyKey: 'fictional-recovery-event225',
          eventType: 'payment.observed',
          status: 'PROCESSED',
          payloadHash: createHash('sha256')
            .update('fictional-recovery225')
            .digest('hex'),
          normalizedPayload: {
            paymentId: ids.charge,
            invoiceId: ids.invoice,
            amount: '10000',
            currency: 'BDT',
            bankReference,
            status: 'SUCCEEDED',
          },
          processedAt: moment,
        },
      });
      await tx.payment.create({
        data: {
          id: ids.refundPayment,
          invoiceId: ids.invoice,
          originalPaymentId: ids.charge,
          createdByUserId: admin.id,
          kind: 'REFUND',
          status: 'SUCCEEDED',
          provider: 'sslcommerz',
          providerTransactionId: 'refund:fictional-recovery225',
          reference: 'fictional-refund225',
          idempotencyKey: 'fictional-refund225',
          amount: 1000n,
          currency: 'BDT',
          receivedAt: moment,
          verifiedAt: moment,
        },
      });
      await tx.sslRefund.create({
        data: {
          id: ids.refund,
          checkoutId: ids.checkout,
          submissionKey: ids.refund,
          amount: 1000n,
          reason: 'Fictional confirmed recovery refund',
          actorUserId: admin.id,
          state: 'SUCCEEDED',
          providerReference: 'fictional-refund225',
          paymentId: ids.refundPayment,
        },
      });
      await tx.sslRefund.create({
        data: {
          id: ids.pendingRefund,
          checkoutId: ids.checkout,
          submissionKey: ids.pendingRefund,
          amount: 500n,
          reason: 'Fictional uncertain recovery refund',
          actorUserId: admin.id,
          state: 'UNKNOWN',
        },
      });
      await tx.activityLog.create({
        data: {
          actorUserId: admin.id,
          action: 'FICTIONAL_RECOVERY_FIXTURE',
          entityType: 'SSL_CHECKOUT',
          entityId: ids.checkout,
          metadata: { fictional: true, command: 225 },
        },
      });
    });
    process.stdout.write(
      'Created fictional capture, callback, confirmed/unknown refunds and encrypted snapshot for recovery.\n',
    );
    return;
  }
  const checkout = await prisma.sslCheckout.findUniqueOrThrow({
    where: { id: ids.checkout },
    include: {
      payment: { include: { events: true, adjustments: true } },
      refunds: true,
      invoice: { include: { items: true } },
    },
  });
  assert.equal(checkout.state, 'CAPTURED');
  assert.equal(checkout.environment, 'SANDBOX');
  assert.equal(checkout.accountHash, accountHash);
  assert.equal(checkout.credentialRevision, 'fictional-command225');
  assert.equal(checkout.credentialKeyVersion, keyVersion);
  assert.ok(!checkout.credentialCiphertext.includes(account.storePassword));
  assert.deepEqual(decrypt(checkout.credentialCiphertext), account);
  assert.equal(checkout.bankReference, bankReference);
  assert.equal(checkout.merchantReference, reference);
  assert.equal(checkout.appliedToInvoice, true);
  assert.equal(checkout.payment.amount, 10000n);
  assert.equal(checkout.payment.status, 'SUCCEEDED');
  assert.equal(checkout.payment.events.length, 1);
  assert.equal(checkout.payment.events[0]?.status, 'PROCESSED');
  assert.equal(
    checkout.payment.events[0]?.providerEventId,
    'fictional-recovery-event225',
  );
  assert.equal(checkout.payment.adjustments.length, 1);
  assert.equal(checkout.payment.adjustments[0]?.amount, 1000n);
  assert.equal(checkout.payment.adjustments[0]?.originalPaymentId, ids.charge);
  assert.equal(checkout.invoice.status, 'PARTIALLY_REFUNDED');
  assert.equal(checkout.invoice.amountPaid, 9000n);
  assert.equal(checkout.invoice.balanceDue, 1000n);
  const line = checkout.invoice.items[0];
  assert.ok(line?.serviceId);
  const hosting = await prisma.service.findUniqueOrThrow({
    where: { id: line.serviceId },
  });
  assert.deepEqual(
    line.productAttributionSnapshot,
    snapshotInvoiceProduct({
      productId: hosting.productId,
      productPriceId: hosting.productPriceId,
      name: hosting.productNameSnapshot,
      kind: 'HOSTING',
      source: 'HOSTING_RENEWAL',
    }),
  );
  await assert.rejects(
    prisma.invoiceItem.update({
      where: { id: line.id },
      data: {
        productAttributionSnapshot: {
          version: 1,
          productId: hosting.productId,
          productPriceId: hosting.productPriceId,
          name: 'Rewritten',
          kind: 'HOSTING',
          source: 'HOSTING_RENEWAL',
        },
      },
    }),
  );
  await assert.rejects(prisma.invoiceItem.delete({ where: { id: line.id } }));
  assert.equal(checkout.refunds.length, 2);
  assert.equal(
    checkout.refunds.find((value) => value.id === ids.refund)?.paymentId,
    ids.refundPayment,
  );
  assert.equal(
    checkout.refunds.find((value) => value.id === ids.pendingRefund)?.state,
    'UNKNOWN',
  );
  assert.equal(
    checkout.refunds.find((value) => value.id === ids.pendingRefund)?.amount,
    500n,
  );
  const pendingRefund = checkout.refunds.find(
    (value) => value.id === ids.pendingRefund,
  );
  assert.equal(pendingRefund?.state, 'UNKNOWN');
  assert.equal(pendingRefund?.paymentId, null);
  assert.equal(pendingRefund?.providerReference, null);
  await assert.rejects(
    prisma.sslCheckout.update({
      where: { id: ids.checkout },
      data: { state: 'FAILED' },
    }),
  );
  await assert.rejects(
    prisma.sslCheckout.delete({ where: { id: ids.checkout } }),
  );
  await assert.rejects(
    prisma.sslRefund.update({
      where: { id: ids.refund },
      data: { state: 'PENDING' },
    }),
  );
  await assert.rejects(
    prisma.sslRefund.delete({ where: { id: ids.pendingRefund } }),
  );
  process.stdout.write(
    'Verified restored fictional financial history, pending refund reservation, usable encrypted snapshot and immutable guards.\n',
  );
}
main()
  .finally(() => prisma.$disconnect())
  .catch(() => {
    process.stderr.write('Fictional recovery fixture failed verification.\n');
    process.exitCode = 1;
  });
