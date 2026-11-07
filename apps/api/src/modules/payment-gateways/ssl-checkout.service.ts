import { Inject, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import {
  Prisma,
  type PrismaClient,
  type SslCheckout,
} from '@webhost-billing/database';
import {
  createPaymentSessionRequestSchema,
  paymentSessionSchema,
  paymentWebhookResultSchema,
  serializeMoney,
  sslCheckoutSchema,
  type CreatePaymentSessionRequest,
} from '@webhost-billing/shared';
import { PRISMA_CLIENT } from '../../infrastructure/database/database.module';
import { ApplicationException } from '../../common/errors/application.exception';
import type { AuthRequestContext } from '../auth/auth.types';
import { IntegrationCredentialService } from '../settings/integration-credential.service';
import { IntegrationCredentialCipher } from '../settings/integration-credential.cipher';
import { SettingsService } from '../settings/settings.service';
import {
  SslCommerzPaymentGateway,
  sslMerchantReference,
} from './sslcommerz-payment.gateway';
import {
  sslForm,
  sslObservationKey,
  type SslObservation,
  type SslAccount,
} from './ssl-provider.protocol';
import { PaymentProviderError } from './payment-provider.error';

const include = {
  payment: true,
  invoice: true,
  refunds: { orderBy: { createdAt: 'asc' as const } },
};
export type BoundSslCheckout = Prisma.SslCheckoutGetPayload<{
  include: typeof include;
}>;
const unresolved = ['CREATING', 'OPEN', 'UNKNOWN'];
@Injectable()
export class SslCheckoutService {
  constructor(
    @Inject(PRISMA_CLIENT) readonly prisma: PrismaClient,
    readonly gateway: SslCommerzPaymentGateway,
    private readonly credentials: IntegrationCredentialService,
    private readonly cipher: IntegrationCredentialCipher,
    private readonly settings: SettingsService,
  ) {}

  async create(input: CreatePaymentSessionRequest, actor: AuthRequestContext) {
    input = createPaymentSessionRequestSchema.parse(input);
    this.assertActor(actor);
    if ((await this.settings.activeGateway()) !== 'sslcommerz')
      throw sslProblem('Online checkout is not selected.', 404);
    const credentials = await this.credentials.sslCommerz();
    if (!credentials)
      throw sslProblem('SSLCOMMERZ sandbox is not configured.', 422);
    const key = `gateway-session:sslcommerz:${input.submissionKey}`;
    const result = await this.prisma.$transaction(async (tx) => {
      await lockSslInvoice(tx, input.invoiceId);
      const invoice = await tx.invoice.findUnique({
        where: { id: input.invoiceId },
        include: { customer: { include: { user: true } } },
      });
      if (
        !invoice ||
        (actor.identity.role === 'CUSTOMER' &&
          actor.identity.customerId !== invoice.customerId)
      )
        throw sslProblem('Invoice was not found.', 404);
      if (
        !['UNPAID', 'OVERDUE'].includes(invoice.status) ||
        invoice.balanceDue <= 0n
      )
        throw sslProblem('This invoice is not payable.', 422);
      const reused = await tx.payment.findUnique({
        where: { idempotencyKey: key },
      });
      if (
        reused &&
        (reused.invoiceId !== invoice.id || reused.provider !== 'sslcommerz')
      )
        throw sslProblem('This payment attempt key was already used.', 409);
      const existing = await tx.sslCheckout.findFirst({
        where: {
          invoiceId: invoice.id,
          OR: [
            { state: { in: unresolved } },
            { reviewReason: { startsWith: 'Captured payment' } },
          ],
        },
        include,
      });
      if (existing) return { checkout: existing, fresh: false, phone: '' };
      if (reused)
        throw sslProblem(
          'This attempt has ended. Reconcile it before starting another.',
          409,
        );
      const legacy = await tx.payment.findFirst({
        where: {
          invoiceId: invoice.id,
          provider: 'sslcommerz',
          status: 'PENDING',
          sslCheckout: null,
        },
      });
      if (legacy)
        throw sslProblem(
          'A legacy checkout requires administrator review before another payment.',
          409,
        );
      const competing = await tx.payment.findFirst({
        where: {
          invoiceId: invoice.id,
          kind: 'CHARGE',
          status: 'PENDING',
          provider: { in: ['bkash', 'fake'] },
        },
      });
      if (competing)
        throw sslProblem(
          'Another online payment attempt requires reconciliation before switching providers.',
          409,
        );
      const phone = invoice.customer.phone;
      if (!phone || !/^\+?[0-9]{8,15}$/.test(phone))
        throw sslProblem(
          'Add a valid phone number in Profile & security before online checkout.',
          422,
        );
      if (
        invoice.currency !== 'BDT' ||
        invoice.balanceDue < 1000n ||
        invoice.balanceDue > 50000000n
      )
        throw sslProblem(
          'Online checkout requires BDT 10.00 to BDT 500,000.00.',
          422,
        );
      if (
        invoice.customer.status !== 'ACTIVE' ||
        invoice.customer.user.status !== 'ACTIVE' ||
        invoice.customer.user.deletedAt ||
        !invoice.customer.user.emailVerifiedAt
      )
        throw sslProblem(
          'The customer account is not eligible for online checkout.',
          422,
        );
      const payment = await tx.payment.create({
        data: {
          invoiceId: invoice.id,
          createdByUserId: actor.identity.userId,
          provider: 'sslcommerz',
          kind: 'CHARGE',
          status: 'PENDING',
          amount: invoice.balanceDue,
          currency: 'BDT',
          idempotencyKey: key,
        },
      });
      const checkout = await tx.sslCheckout.create({
        data: {
          paymentId: payment.id,
          invoiceId: invoice.id,
          merchantReference: sslMerchantReference(payment.id),
          environment: 'SANDBOX',
          accountHash: sslAccountHash(credentials.value.storeId),
          credentialCiphertext: this.cipher.encrypt(
            'sslcommerz',
            credentials.value,
          ),
          credentialKeyVersion: this.cipher.keyVersion,
          credentialRevision: credentials.revision,
        },
        include,
      });
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          reference: checkout.merchantReference,
          failureReason:
            'Checkout creation is in progress. Reconcile this attempt if interrupted.',
        },
      });
      await sslAudit(
        tx,
        'SSL_CHECKOUT_RESERVED',
        checkout.id,
        actor.identity.userId,
        { paymentId: payment.id, invoiceId: invoice.id },
      );
      return { checkout, fresh: true, phone };
    });
    if (!result.fresh) return this.session(result.checkout, true);
    const checkout = result.checkout;
    try {
      const address = checkout.invoice.customerAddressSnapshot;
      if (!address || typeof address !== 'object' || Array.isArray(address))
        throw sslProblem('The invoice billing address is unavailable.', 422);
      const value = await this.gateway.createBoundSession(
        {
          paymentId: checkout.paymentId,
          invoiceId: checkout.invoiceId,
          invoiceNumber: checkout.invoice.invoiceNumber,
          amount: checkout.payment.amount,
          currency: checkout.payment.currency,
          customerName: checkout.invoice.customerNameSnapshot,
          customerEmail: checkout.invoice.customerEmailSnapshot,
          customerPhone: result.phone,
          customerAddress: {
            line1:
              field(address, 'line1') ?? field(address, 'addressLine1') ?? '',
            line2: field(address, 'line2') ?? field(address, 'addressLine2'),
            city: field(address, 'city') ?? '',
            region: field(address, 'region'),
            postalCode: field(address, 'postalCode'),
            countryCode: field(address, 'countryCode') ?? '',
          },
          idempotencyKey: key,
        },
        this.account(checkout),
        checkout.merchantReference,
      );
      await this.prisma.$transaction(async (tx) => {
        await lockSslInvoice(tx, checkout.invoiceId);
        const current = await tx.sslCheckout.findUniqueOrThrow({
          where: { id: checkout.id },
        });
        if (current.state !== 'CREATING') return;
        await tx.sslCheckout.update({
          where: { id: checkout.id },
          data: {
            state: 'OPEN',
            sessionKey: value.providerSessionKey,
            reviewReason: null,
          },
        });
        await tx.payment.update({
          where: { id: checkout.paymentId },
          data: {
            providerCheckoutUrl: value.checkoutUrl,
            providerSessionExpiresAt: value.expiresAt,
            failureReason: null,
          },
        });
      });
    } catch (caught) {
      await this.issue(
        checkout,
        caught instanceof PaymentProviderError && caught.outcome === 'FAILED'
          ? 'FAILED'
          : 'UNKNOWN',
      );
      throw sslProblem(
        'Checkout could not be confirmed. Reconcile the saved attempt before retrying.',
        503,
      );
    }
    return this.session(await this.getBound(checkout.paymentId), false);
  }
  private session(checkout: BoundSslCheckout, duplicate: boolean) {
    if (checkout.invoice.balanceDue !== checkout.payment.amount)
      throw sslProblem(
        'The invoice balance changed. Reconcile this checkout before continuing.',
        409,
      );
    if (
      checkout.state !== 'OPEN' ||
      !checkout.payment.providerCheckoutUrl ||
      !checkout.payment.providerSessionExpiresAt ||
      checkout.payment.providerSessionExpiresAt <= new Date()
    )
      throw sslProblem(
        'This checkout is not reusable. Ask an administrator to reconcile the saved attempt.',
        409,
      );
    return paymentSessionSchema.parse({
      paymentId: checkout.paymentId,
      invoiceId: checkout.invoiceId,
      provider: 'sslcommerz',
      providerSessionId: checkout.merchantReference,
      checkoutUrl: checkout.payment.providerCheckoutUrl,
      amount: serializeMoney(
        checkout.payment.amount,
        checkout.payment.currency,
      ),
      expiresAt: checkout.payment.providerSessionExpiresAt.toISOString(),
      duplicate,
    });
  }
  async webhook(raw: Buffer) {
    let form: Record<string, string>;
    try {
      form = sslForm(raw);
    } catch {
      throw sslProblem('The payment notification is invalid.', 422);
    }
    const checkout = await this.prisma.sslCheckout.findUnique({
      where: { merchantReference: form.tran_id },
      include,
    });
    if (!checkout)
      throw sslProblem(
        'This checkout is unknown or requires legacy review.',
        422,
      );
    try {
      const account = this.account(checkout);
      if (form.store_id && form.store_id !== account.storeId)
        throw sslProblem('The payment merchant does not match.', 422);
      const proof = ['VALID', 'VALIDATED'].includes(form.status ?? '')
        ? await this.gateway.validateBound(raw, account)
        : await this.gateway.queryBound(checkout.merchantReference, account);
      return await this.observe(checkout, proof);
    } catch (caught) {
      if (caught instanceof ApplicationException) throw caught;
      await this.issue(checkout);
      throw sslProblem(
        'The payment could not be verified. Reconciliation is required.',
        caught instanceof PaymentProviderError &&
          caught.safeMessage.includes('does not match')
          ? 422
          : 503,
      );
    }
  }
  async reconcile(paymentId: string, actor: AuthRequestContext) {
    this.assertAdmin(actor);
    const checkout = await this.getBound(paymentId);
    try {
      const proof = await this.gateway.queryBound(
        checkout.merchantReference,
        this.account(checkout),
      );
      const result = await this.observe(checkout, proof);
      await this.prisma.activityLog.create({
        data: {
          actorUserId: actor.identity.userId,
          action: 'SSL_CHECKOUT_RECONCILED',
          entityType: 'PAYMENT',
          entityId: paymentId,
          metadata: { providerEventId: result.providerEventId },
        },
      });
      return result;
    } catch (caught) {
      if (caught instanceof ApplicationException) throw caught;
      await this.issue(checkout);
      throw sslProblem(
        'The provider outcome is uncertain. No replacement checkout was created.',
        503,
      );
    }
  }
  private async observe(saved: BoundSslCheckout, proof: SslObservation) {
    if (
      proof.merchantReference !== saved.merchantReference ||
      proof.amount !== saved.payment.amount ||
      proof.currency !== saved.payment.currency ||
      (proof.paymentId && proof.paymentId !== saved.paymentId) ||
      (proof.invoiceId && proof.invoiceId !== saved.invoiceId)
    )
      throw sslProblem(
        'The payment identity, amount or currency does not match.',
        422,
      );
    const eventId = `ssl:${saved.id}:${sslObservationKey(proof)}`;
    return this.prisma.$transaction(async (tx) => {
      await lockSslInvoice(tx, saved.invoiceId);
      const checkout = await tx.sslCheckout.findUniqueOrThrow({
        where: { id: saved.id },
        include,
      });
      const duplicate = await tx.paymentEvent.findUnique({
        where: {
          provider_providerEventId: {
            provider: 'sslcommerz',
            providerEventId: eventId,
          },
        },
      });
      if (duplicate)
        return paymentWebhookResultSchema.parse({
          accepted: true,
          duplicate: true,
          providerEventId: eventId,
          status: duplicate.status === 'PROCESSED' ? 'PROCESSED' : 'IGNORED',
        });
      const event = await tx.paymentEvent.create({
        data: {
          paymentId: checkout.paymentId,
          provider: 'sslcommerz',
          providerEventId: eventId,
          idempotencyKey: eventId,
          eventType: 'payment.observed',
          status: 'RECEIVED',
          payloadHash: sslObservationKey(proof),
          normalizedPayload: {
            schemaVersion: 1,
            paymentId: checkout.paymentId,
            invoiceId: checkout.invoiceId,
            amount: proof.amount.toString(),
            currency: proof.currency,
            bankReference: proof.bankReference,
            status: proof.status,
            risk: proof.risk,
            dateValid: !!proof.occurredAt,
          },
        },
      });
      if (checkout.state === 'CAPTURED') {
        if (
          proof.status === 'SUCCEEDED' &&
          proof.bankReference !== checkout.bankReference
        )
          throw sslProblem(
            'A different captured transaction requires manual investigation.',
            422,
          );
        await tx.paymentEvent.update({
          where: { id: event.id },
          data: { status: 'IGNORED', processedAt: new Date() },
        });
        return paymentWebhookResultSchema.parse({
          accepted: true,
          duplicate: false,
          providerEventId: eventId,
          status: 'IGNORED',
        });
      }
      const confirmed =
        proof.status === 'SUCCEEDED' &&
        proof.risk === 'SAFE' &&
        !!proof.occurredAt &&
        !!proof.bankReference;
      if (!confirmed) {
        const failed = proof.status === 'FAILED';
        const reason =
          proof.status === 'SUCCEEDED'
            ? 'Captured payment requires verified risk and completion-time review.'
            : failed
              ? 'The provider reports this attempt failed. Reconcile again if a delayed payment appears.'
              : 'The payment is pending provider confirmation.';
        await tx.sslCheckout.update({
          where: { id: checkout.id },
          data: {
            state: failed
              ? 'FAILED'
              : checkout.state === 'FAILED'
                ? 'FAILED'
                : 'UNKNOWN',
            reviewReason: reason,
          },
        });
        await tx.payment.update({
          where: { id: checkout.paymentId },
          data: {
            status: failed ? 'FAILED' : 'PENDING',
            failureReason: reason,
          },
        });
        await tx.paymentEvent.update({
          where: { id: event.id },
          data: {
            status: failed ? 'PROCESSED' : 'IGNORED',
            processedAt: new Date(),
          },
        });
        if (failed && checkout.payment.status !== 'FAILED')
          await tx.outboxEvent.create({
            data: {
              aggregateType: 'PAYMENT',
              aggregateId: checkout.paymentId,
              eventType: 'GATEWAY_PAYMENT_FAILED',
              idempotencyKey: `payment-webhook:${event.id}`,
              payload: {
                paymentId: checkout.paymentId,
                invoiceId: checkout.invoiceId,
                provider: 'sslcommerz',
                providerEventId: eventId,
                providerTransactionId: proof.bankReference,
                amount: proof.amount.toString(),
                currency: proof.currency,
              },
            },
          });
        await sslAudit(tx, 'SSL_PAYMENT_OBSERVED', checkout.id, null, {
          paymentId: checkout.paymentId,
          status: proof.status,
          risk: proof.risk,
        });
        return paymentWebhookResultSchema.parse({
          accepted: true,
          duplicate: false,
          providerEventId: eventId,
          status: failed ? 'PROCESSED' : 'IGNORED',
        });
      }
      const reused = await tx.payment.findFirst({
        where: {
          provider: 'sslcommerz',
          providerTransactionId: proof.bankReference,
          id: { not: checkout.paymentId },
        },
      });
      if (reused)
        throw sslProblem('This bank transaction was already recorded.', 422);
      const invoice = checkout.invoice;
      const apply =
        ['UNPAID', 'OVERDUE'].includes(invoice.status) &&
        invoice.balanceDue === proof.amount;
      await tx.payment.update({
        where: { id: checkout.paymentId },
        data: {
          status: 'SUCCEEDED',
          providerTransactionId: proof.bankReference,
          receivedAt: proof.occurredAt!,
          verifiedAt: new Date(),
          failureReason: apply
            ? null
            : 'Captured payment was not credited to this invoice. Refund review is required.',
        },
      });
      await tx.sslCheckout.update({
        where: { id: checkout.id },
        data: {
          state: 'CAPTURED',
          bankReference: proof.bankReference,
          capturedAt: proof.occurredAt!,
          appliedToInvoice: apply,
          reviewReason: apply
            ? null
            : 'Captured payment was not credited. Review and refund the unapplied amount.',
        },
      });
      await tx.paymentEvent.update({
        where: { id: event.id },
        data: { status: 'PROCESSED', processedAt: new Date() },
      });
      if (apply) {
        await tx.invoice.update({
          where: { id: invoice.id },
          data: {
            amountPaid: invoice.amountPaid + proof.amount,
            balanceDue: 0n,
            status: 'PAID',
            paidAt: new Date(),
          },
        });
        if (invoice.orderId)
          await tx.order.updateMany({
            where: { id: invoice.orderId, status: 'AWAITING_PAYMENT' },
            data: { status: 'PAID' },
          });
        const payload = {
          paymentId: checkout.paymentId,
          invoiceId: invoice.id,
          provider: 'sslcommerz',
          providerEventId: eventId,
          providerTransactionId: proof.bankReference,
          amount: proof.amount.toString(),
          currency: proof.currency,
        };
        await tx.outboxEvent.create({
          data: {
            aggregateType: 'PAYMENT',
            aggregateId: checkout.paymentId,
            eventType: 'GATEWAY_PAYMENT_SUCCEEDED',
            idempotencyKey: `payment-webhook:${event.id}`,
            payload,
          },
        });
        await tx.outboxEvent.create({
          data: {
            aggregateType: 'PAYMENT',
            aggregateId: checkout.paymentId,
            eventType: 'EMAIL_PAYMENT_RECEIVED',
            idempotencyKey: `email:payment-received:${checkout.paymentId}`,
            payload: {
              schemaVersion: 1,
              paymentId: checkout.paymentId,
              invoiceId: invoice.id,
            },
          },
        });
        if (
          await tx.invoiceItem.count({
            where: {
              invoiceId: invoice.id,
              serviceId: { not: null },
              servicePeriodStart: { not: null },
              servicePeriodEnd: { not: null },
            },
          })
        )
          await tx.outboxEvent.create({
            data: {
              aggregateType: 'PAYMENT',
              aggregateId: checkout.paymentId,
              eventType: 'RENEWAL_PAYMENT_COMPLETED',
              idempotencyKey: `renewal-payment:${checkout.paymentId}`,
              payload: {
                schemaVersion: 1,
                paymentId: checkout.paymentId,
                invoiceId: invoice.id,
              },
            },
          });
      }
      await sslAudit(
        tx,
        apply ? 'SSL_CAPTURE_APPLIED' : 'SSL_CAPTURE_NEEDS_REVIEW',
        checkout.id,
        null,
        {
          paymentId: checkout.paymentId,
          invoiceId: invoice.id,
          appliedToInvoice: apply,
        },
      );
      return paymentWebhookResultSchema.parse({
        accepted: true,
        duplicate: false,
        providerEventId: eventId,
        status: 'PROCESSED',
      });
    });
  }
  async getBound(paymentId: string): Promise<BoundSslCheckout> {
    const result = await this.prisma.sslCheckout.findUnique({
      where: { paymentId },
      include,
    });
    if (!result)
      throw sslProblem('Checkout was not found or needs legacy review.', 404);
    return result;
  }
  account(checkout: SslCheckout): SslAccount {
    if (checkout.environment !== 'SANDBOX')
      throw sslProblem('Only sandbox checkout recovery is supported.', 422);
    const value = this.cipher.decrypt(
      'sslcommerz',
      checkout.credentialKeyVersion,
      checkout.credentialCiphertext,
    );
    if (
      !value ||
      typeof value !== 'object' ||
      !('storeId' in value) ||
      !('storePassword' in value) ||
      typeof value.storeId !== 'string' ||
      typeof value.storePassword !== 'string' ||
      sslAccountHash(value.storeId) !== checkout.accountHash
    )
      throw sslProblem('The checkout account snapshot is unavailable.', 503);
    return { storeId: value.storeId, storePassword: value.storePassword };
  }
  async list(actor: AuthRequestContext) {
    this.assertAdmin(actor);
    return (
      await this.prisma.sslCheckout.findMany({
        include,
        orderBy: { createdAt: 'desc' },
        take: 50,
      })
    ).map((value) => this.public(value));
  }
  public(value: BoundSslCheckout) {
    return sslCheckoutSchema.parse({
      paymentId: value.paymentId,
      invoiceId: value.invoiceId,
      invoiceNumber: value.invoice.invoiceNumber,
      state: value.state,
      merchantReference: value.merchantReference,
      bankReference: value.bankReference,
      appliedToInvoice: value.appliedToInvoice,
      amount: serializeMoney(value.payment.amount, value.payment.currency),
      reviewReason: value.reviewReason,
      refunds: value.refunds.map((refund) => ({
        id: refund.id,
        state: refund.state,
        amount: serializeMoney(refund.amount, value.payment.currency),
        providerReference: refund.providerReference,
      })),
    });
  }
  async issue(checkout: SslCheckout, state: 'UNKNOWN' | 'FAILED' = 'UNKNOWN') {
    await this.prisma.$transaction(async (tx) => {
      await lockSslInvoice(tx, checkout.invoiceId);
      const row = await tx.sslCheckout.findUniqueOrThrow({
        where: { id: checkout.id },
      });
      if (row.state === 'CAPTURED' || row.state === 'FAILED') return;
      await tx.sslCheckout.update({
        where: { id: row.id },
        data: {
          state,
          reviewReason:
            'The provider outcome requires reconciliation. No replacement checkout was created.',
        },
      });
      await tx.payment.updateMany({
        where: { id: row.paymentId, status: 'PENDING' },
        data: {
          failureReason: 'The provider outcome requires reconciliation.',
          ...(state === 'FAILED' ? { status: 'FAILED' } : {}),
        },
      });
    });
  }
  assertAdmin(actor: AuthRequestContext) {
    if (
      actor.identity.role !== 'ADMIN' ||
      actor.identity.staffRole !== 'FULL_ADMINISTRATOR' ||
      actor.supportAdministratorId
    )
      throw sslProblem('A full administrator is required.', 403);
  }
  private assertActor(actor: AuthRequestContext) {
    if (
      actor.supportAdministratorId ||
      (actor.identity.role === 'CUSTOMER' && actor.identity.supportSession)
    )
      throw sslProblem('Customer support sessions are read-only.', 403);
    if (actor.identity.role === 'ADMIN') this.assertAdmin(actor);
  }
}
export function sslAccountHash(storeId: string) {
  return createHash('sha256')
    .update(`sslcommerz:SANDBOX:${storeId}`)
    .digest('hex');
}
export async function lockSslInvoice(tx: Prisma.TransactionClient, id: string) {
  await tx.$queryRaw`SELECT id FROM invoices WHERE id=${id}::uuid FOR UPDATE`;
}
export function sslProblem(message: string, status: number = 422) {
  return new ApplicationException({
    status,
    code:
      status === 403
        ? 'FORBIDDEN'
        : status === 409
          ? 'CONFLICT'
          : status === 404
            ? 'RESOURCE_NOT_FOUND'
            : status === 503
              ? 'SERVICE_UNAVAILABLE'
              : 'UNPROCESSABLE_ENTITY',
    message,
  });
}
export function sslAudit(
  tx: Prisma.TransactionClient,
  action: string,
  id: string,
  actorUserId: string | null,
  metadata: Prisma.InputJsonValue,
) {
  return tx.activityLog.create({
    data: {
      action,
      actorUserId,
      entityType: 'SSL_CHECKOUT',
      entityId: id,
      metadata,
    },
  });
}
function field(value: Prisma.JsonObject, key: string) {
  return typeof value[key] === 'string' ? value[key] : null;
}
