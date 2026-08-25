import { createHash } from 'node:crypto';
import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  InvoiceStatus,
  OrderStatus,
  PaymentEventStatus,
  PaymentKind,
  PaymentStatus,
  Prisma,
  type Invoice,
  type Payment,
  type PrismaClient,
} from '@webhost-billing/database';
import {
  paymentSessionSchema,
  paymentWebhookResultSchema,
  serializeMoney,
  type CreatePaymentSessionRequest,
  type NormalizedPaymentEvent,
  type PaymentSession,
  type PaymentWebhookResult,
} from '@webhost-billing/shared';
import { ApplicationException } from '../../common/errors/application.exception';
import { PRISMA_CLIENT } from '../../infrastructure/database/database.module';
import type { AuthRequestContext } from '../auth/auth.types';
import type { PaymentGateway } from './payment-gateway.interface';
import { PaymentGatewayRegistry } from './payment-gateway.registry';

const MAX_WEBHOOK_BYTES = 256 * 1024;

interface SessionPaymentRecord {
  id: string;
  invoiceId: string;
  createdByUserId: string | null;
  status: PaymentStatus;
  provider: string;
  amount: bigint;
  currency: string;
  reference: string | null;
  invoice: {
    invoiceNumber: string;
    customerId: string;
    customerEmailSnapshot: string;
  };
}

type WebhookTransactionResult =
  | { outcome: 'processed' | 'ignored' }
  | { outcome: 'rejected'; message: string };

@Injectable()
export class PaymentGatewayService {
  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient,
    private readonly gateways: PaymentGatewayRegistry,
  ) {}

  async createSession(
    provider: string,
    input: CreatePaymentSessionRequest,
    actor: AuthRequestContext,
  ): Promise<PaymentSession> {
    const gateway = this.gateways.get(provider);
    const idempotencyKey = `gateway-session:${provider}:${input.submissionKey}`;
    let duplicate = false;
    let payment = await this.findSessionPayment(idempotencyKey);
    if (payment) {
      duplicate = true;
      this.assertMatchingSession(payment, gateway, input, actor);
    } else {
      try {
        payment = await this.prisma.$transaction(async (transaction) => {
          await this.lockInvoice(transaction, input.invoiceId);
          const invoice = await transaction.invoice.findUnique({
            where: { id: input.invoiceId },
          });
          if (!invoice || !this.canAccessInvoice(invoice.customerId, actor)) {
            throw this.notFound('Invoice was not found.');
          }
          if (
            invoice.status !== InvoiceStatus.UNPAID &&
            invoice.status !== InvoiceStatus.OVERDUE
          ) {
            throw this.invalid(
              'Only an unpaid or overdue invoice can start a payment session.',
            );
          }
          if (invoice.balanceDue <= 0n) {
            throw this.invalid('The invoice does not have a payable balance.');
          }
          const createdPayment = await transaction.payment.create({
            data: {
              invoiceId: invoice.id,
              createdByUserId: actor.identity.userId,
              kind: PaymentKind.CHARGE,
              status: PaymentStatus.PENDING,
              provider: gateway.key,
              idempotencyKey,
              amount: invoice.balanceDue,
              currency: invoice.currency,
            },
          });
          await transaction.activityLog.create({
            data: {
              actorUserId: actor.identity.userId,
              action: 'GATEWAY_PAYMENT_SESSION_CREATED',
              entityType: 'PAYMENT',
              entityId: createdPayment.id,
              metadata: {
                invoiceId: invoice.id,
                provider: gateway.key,
                amount: invoice.balanceDue.toString(),
                currency: invoice.currency,
              },
            },
          });
          const created = await transaction.payment.findUnique({
            where: { idempotencyKey },
            include: {
              invoice: {
                select: {
                  invoiceNumber: true,
                  customerId: true,
                  customerEmailSnapshot: true,
                },
              },
            },
          });
          if (!created) throw new Error('Created payment could not be loaded.');
          return created;
        });
      } catch (error) {
        if (!this.isUniqueConstraintError(error)) throw error;
        payment = await this.findSessionPayment(idempotencyKey);
        if (!payment) throw error;
        duplicate = true;
        this.assertMatchingSession(payment, gateway, input, actor);
      }
    }

    const gatewaySession = await gateway.createPaymentSession({
      paymentId: payment.id,
      invoiceId: payment.invoiceId,
      invoiceNumber: payment.invoice.invoiceNumber,
      amount: payment.amount,
      currency: payment.currency,
      customerEmail: payment.invoice.customerEmailSnapshot,
      idempotencyKey,
    });
    await this.prisma.payment.updateMany({
      where: { id: payment.id, reference: null },
      data: { reference: gatewaySession.providerSessionId },
    });
    return paymentSessionSchema.parse({
      paymentId: payment.id,
      invoiceId: payment.invoiceId,
      provider: gateway.key,
      providerSessionId: gatewaySession.providerSessionId,
      checkoutUrl: gatewaySession.checkoutUrl,
      amount: serializeMoney(payment.amount, payment.currency),
      expiresAt: gatewaySession.expiresAt.toISOString(),
      duplicate,
    });
  }

  async processWebhook(
    provider: string,
    rawBody: Buffer,
    signature: string,
  ): Promise<PaymentWebhookResult> {
    const gateway = this.gateways.get(provider);
    if (rawBody.length === 0 || rawBody.length > MAX_WEBHOOK_BYTES) {
      throw this.webhookRejected('Webhook body is missing or too large.');
    }
    if (!gateway.verifyWebhookSignature(rawBody, signature)) {
      throw this.webhookRejected('Webhook signature is invalid.', true);
    }
    const event = this.normalize(gateway, rawBody);
    const payloadHash = createHash('sha256').update(rawBody).digest('hex');
    const existing = await this.prisma.paymentEvent.findFirst({
      where: { provider: gateway.key, providerEventId: event.providerEventId },
    });
    if (existing) return this.replay(existing, payloadHash, event);

    try {
      const result = await this.prisma.$transaction(async (transaction) => {
        const storedEvent = await transaction.paymentEvent.create({
          data: {
            provider: gateway.key,
            providerEventId: event.providerEventId,
            idempotencyKey: this.eventIdempotencyKey(
              gateway.key,
              event.providerEventId,
            ),
            eventType: event.eventType,
            status: PaymentEventStatus.RECEIVED,
            payloadHash,
            normalizedPayload: this.normalizedPayload(event),
          },
        });
        if (event.merchantId !== gateway.merchantId) {
          return this.rejectStoredEvent(
            transaction,
            storedEvent.id,
            'Merchant identity does not match this gateway.',
          );
        }
        await this.lockInvoice(transaction, event.invoiceId);
        const [invoice, payment] = await Promise.all([
          transaction.invoice.findUnique({ where: { id: event.invoiceId } }),
          transaction.payment.findUnique({ where: { id: event.paymentId } }),
        ]);
        const validationError = await this.validateEvent(
          transaction,
          gateway,
          event,
          invoice,
          payment,
        );
        if (validationError) {
          return this.rejectStoredEvent(
            transaction,
            storedEvent.id,
            validationError,
          );
        }
        if (!invoice || !payment) {
          throw new Error('Validated financial records could not be loaded.');
        }
        await transaction.paymentEvent.update({
          where: { id: storedEvent.id },
          data: { paymentId: payment.id },
        });
        if (event.status === 'PENDING') {
          await transaction.paymentEvent.update({
            where: { id: storedEvent.id },
            data: {
              status: PaymentEventStatus.IGNORED,
              processedAt: new Date(),
            },
          });
          return { outcome: 'ignored' } as const;
        }
        const now = new Date();
        if (event.status === 'FAILED') {
          await transaction.payment.update({
            where: { id: payment.id },
            data: {
              status: PaymentStatus.FAILED,
              failureReason:
                event.failureReason ?? 'Provider reported payment failure.',
              receivedAt: new Date(event.occurredAt),
            },
          });
          await this.completeEventAndOutbox(
            transaction,
            storedEvent.id,
            event,
            gateway.key,
            payment.id,
            invoice.id,
            'GATEWAY_PAYMENT_FAILED',
          );
          await transaction.activityLog.create({
            data: {
              action: 'GATEWAY_PAYMENT_FAILED',
              entityType: 'PAYMENT',
              entityId: payment.id,
              metadata: {
                invoiceId: invoice.id,
                provider: gateway.key,
                providerEventId: event.providerEventId,
              },
            },
          });
          return { outcome: 'processed' } as const;
        }

        const providerTransactionId =
          gateway.extractProviderTransactionId(event);
        if (!providerTransactionId) {
          return this.rejectStoredEvent(
            transaction,
            storedEvent.id,
            'Successful event does not contain a transaction identifier.',
          );
        }
        await transaction.payment.update({
          where: { id: payment.id },
          data: {
            status: PaymentStatus.SUCCEEDED,
            providerTransactionId,
            receivedAt: new Date(event.occurredAt),
            verifiedAt: now,
            failureReason: null,
          },
        });
        await this.settleInvoice(
          transaction,
          invoice,
          payment.id,
          payment.amount,
          now,
        );
        await this.completeEventAndOutbox(
          transaction,
          storedEvent.id,
          event,
          gateway.key,
          payment.id,
          invoice.id,
          'GATEWAY_PAYMENT_SUCCEEDED',
        );
        await transaction.activityLog.create({
          data: {
            action: 'GATEWAY_PAYMENT_VERIFIED',
            entityType: 'PAYMENT',
            entityId: payment.id,
            metadata: {
              invoiceId: invoice.id,
              provider: gateway.key,
              providerEventId: event.providerEventId,
              amount: payment.amount.toString(),
              balanceDue: '0',
            },
          },
        });
        return { outcome: 'processed' } as const;
      });
      if (result.outcome === 'rejected') {
        throw this.webhookRejected(result.message);
      }
      return paymentWebhookResultSchema.parse({
        accepted: true,
        duplicate: false,
        providerEventId: event.providerEventId,
        status: result.outcome === 'processed' ? 'PROCESSED' : 'IGNORED',
      });
    } catch (error) {
      if (!this.isUniqueConstraintError(error)) throw error;
      const raced = await this.prisma.paymentEvent.findFirst({
        where: {
          provider: gateway.key,
          providerEventId: event.providerEventId,
        },
      });
      if (raced) return this.replay(raced, payloadHash, event);
      throw this.webhookRejected(
        'Provider transaction has already been recorded.',
      );
    }
  }

  private async validateEvent(
    transaction: Prisma.TransactionClient,
    gateway: PaymentGateway,
    event: NormalizedPaymentEvent,
    invoice: Invoice | null,
    payment: Payment | null,
  ): Promise<string | null> {
    if (!invoice || !payment) return 'Invoice or payment identity is invalid.';
    if (
      payment.invoiceId !== event.invoiceId ||
      payment.provider !== gateway.key ||
      payment.kind !== PaymentKind.CHARGE
    ) {
      return 'Invoice or payment identity is invalid.';
    }
    if (payment.amount.toString() !== event.amount) {
      return 'Payment amount does not match the expected amount.';
    }
    if (
      payment.currency !== event.currency ||
      invoice.currency !== event.currency
    ) {
      return 'Payment currency does not match the invoice currency.';
    }
    const providerTransactionId = gateway.extractProviderTransactionId(event);
    if (providerTransactionId) {
      const duplicateTransaction = await transaction.payment.findFirst({
        where: {
          provider: gateway.key,
          providerTransactionId,
          id: { not: payment.id },
        },
        select: { id: true },
      });
      if (duplicateTransaction) {
        return 'Provider transaction has already been recorded.';
      }
    }
    if (payment.status !== PaymentStatus.PENDING) {
      return 'Payment has already reached a final state.';
    }
    if (event.status !== 'PENDING') {
      if (
        invoice.status !== InvoiceStatus.UNPAID &&
        invoice.status !== InvoiceStatus.OVERDUE
      ) {
        return 'Invoice is not payable.';
      }
      if (invoice.balanceDue !== payment.amount) {
        return 'Invoice balance no longer matches the payment session.';
      }
    }
    return null;
  }

  private async settleInvoice(
    transaction: Prisma.TransactionClient,
    invoice: {
      id: string;
      orderId: string | null;
      amountPaid: bigint;
      balanceDue: bigint;
    },
    paymentId: string,
    amount: bigint,
    now: Date,
  ): Promise<void> {
    await transaction.invoice.update({
      where: { id: invoice.id },
      data: {
        amountPaid: invoice.amountPaid + amount,
        balanceDue: invoice.balanceDue - amount,
        status: InvoiceStatus.PAID,
        paidAt: now,
      },
    });
    if (invoice.orderId) {
      const paidOrder = await transaction.order.updateMany({
        where: { id: invoice.orderId, status: OrderStatus.AWAITING_PAYMENT },
        data: { status: OrderStatus.PAID },
      });
      if (paidOrder.count === 1) {
        await transaction.activityLog.create({
          data: {
            action: 'ORDER_MARKED_PAID_BY_VERIFIED_PAYMENT',
            entityType: 'ORDER',
            entityId: invoice.orderId,
            metadata: { invoiceId: invoice.id, paymentId },
          },
        });
      }
    }
  }

  private async completeEventAndOutbox(
    transaction: Prisma.TransactionClient,
    paymentEventId: string,
    event: NormalizedPaymentEvent,
    provider: string,
    paymentId: string,
    invoiceId: string,
    eventType: 'GATEWAY_PAYMENT_SUCCEEDED' | 'GATEWAY_PAYMENT_FAILED',
  ): Promise<void> {
    const now = new Date();
    await transaction.paymentEvent.update({
      where: { id: paymentEventId },
      data: { status: PaymentEventStatus.PROCESSED, processedAt: now },
    });
    await transaction.outboxEvent.create({
      data: {
        aggregateType: 'PAYMENT',
        aggregateId: paymentId,
        eventType,
        idempotencyKey: `payment-webhook:${paymentEventId}`,
        payload: {
          paymentId,
          invoiceId,
          provider,
          providerEventId: event.providerEventId,
          providerTransactionId: event.providerTransactionId,
          amount: event.amount,
          currency: event.currency,
        },
      },
    });
  }

  private async rejectStoredEvent(
    transaction: Prisma.TransactionClient,
    paymentEventId: string,
    message: string,
  ): Promise<WebhookTransactionResult> {
    await transaction.paymentEvent.update({
      where: { id: paymentEventId },
      data: {
        status: PaymentEventStatus.FAILED,
        errorMessage: message,
        processedAt: new Date(),
      },
    });
    return { outcome: 'rejected', message };
  }

  private replay(
    existing: {
      payloadHash: string;
      providerEventId: string;
      status: PaymentEventStatus;
      errorMessage: string | null;
    },
    payloadHash: string,
    event: NormalizedPaymentEvent,
  ): PaymentWebhookResult {
    if (existing.payloadHash !== payloadHash) {
      throw this.webhookRejected(
        'Provider event identifier was reused with different content.',
      );
    }
    if (existing.status === PaymentEventStatus.FAILED) {
      throw this.webhookRejected(
        existing.errorMessage ?? 'Provider event was previously rejected.',
      );
    }
    return paymentWebhookResultSchema.parse({
      accepted: true,
      duplicate: true,
      providerEventId: event.providerEventId,
      status:
        existing.status === PaymentEventStatus.IGNORED
          ? 'IGNORED'
          : 'PROCESSED',
    });
  }

  private normalize(
    gateway: PaymentGateway,
    rawBody: Buffer,
  ): NormalizedPaymentEvent {
    try {
      return gateway.normalizeProviderEvent(rawBody);
    } catch {
      throw this.webhookRejected('Webhook payload is invalid.');
    }
  }

  private normalizedPayload(
    event: NormalizedPaymentEvent,
  ): Prisma.InputJsonValue {
    return {
      providerEventId: event.providerEventId,
      eventType: event.eventType,
      status: event.status,
      merchantId: event.merchantId,
      paymentId: event.paymentId,
      invoiceId: event.invoiceId,
      amount: event.amount,
      currency: event.currency,
      providerTransactionId: event.providerTransactionId,
      occurredAt: event.occurredAt,
      failureReason: event.failureReason,
    };
  }

  private async findSessionPayment(
    idempotencyKey: string,
  ): Promise<SessionPaymentRecord | null> {
    return this.prisma.payment.findUnique({
      where: { idempotencyKey },
      include: {
        invoice: {
          select: {
            invoiceNumber: true,
            customerId: true,
            customerEmailSnapshot: true,
          },
        },
      },
    });
  }

  private assertMatchingSession(
    payment: SessionPaymentRecord,
    gateway: PaymentGateway,
    input: CreatePaymentSessionRequest,
    actor: AuthRequestContext,
  ): void {
    if (
      payment.invoiceId !== input.invoiceId ||
      payment.provider !== gateway.key ||
      payment.createdByUserId !== actor.identity.userId ||
      !this.canAccessInvoice(payment.invoice.customerId, actor)
    ) {
      throw this.conflict(
        'This submission key has already been used for another payment session.',
      );
    }
    if (payment.status !== PaymentStatus.PENDING) {
      throw this.conflict(
        'This payment session has already reached a final state.',
      );
    }
  }

  private canAccessInvoice(
    customerId: string,
    actor: AuthRequestContext,
  ): boolean {
    return (
      actor.identity.role === 'ADMIN' ||
      actor.identity.customerId === customerId
    );
  }

  private async lockInvoice(
    transaction: Prisma.TransactionClient,
    invoiceId: string,
  ): Promise<void> {
    await transaction.$queryRaw`
      SELECT "id"
      FROM "invoices"
      WHERE "id" = ${invoiceId}::uuid
      FOR UPDATE
    `;
  }

  private eventIdempotencyKey(
    provider: string,
    providerEventId: string,
  ): string {
    return `gateway-event:${createHash('sha256')
      .update(`${provider}:${providerEventId}`)
      .digest('hex')}`;
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'P2002'
    );
  }

  private notFound(message: string): ApplicationException {
    return new ApplicationException({
      status: HttpStatus.NOT_FOUND,
      code: 'RESOURCE_NOT_FOUND',
      message,
    });
  }

  private invalid(message: string): ApplicationException {
    return new ApplicationException({
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      code: 'UNPROCESSABLE_ENTITY',
      message,
    });
  }

  private conflict(message: string): ApplicationException {
    return new ApplicationException({
      status: HttpStatus.CONFLICT,
      code: 'CONFLICT',
      message,
    });
  }

  private webhookRejected(
    message: string,
    signatureFailure = false,
  ): ApplicationException {
    return new ApplicationException({
      status: signatureFailure
        ? HttpStatus.UNAUTHORIZED
        : HttpStatus.UNPROCESSABLE_ENTITY,
      code: 'PAYMENT_WEBHOOK_REJECTED',
      message,
    });
  }
}
