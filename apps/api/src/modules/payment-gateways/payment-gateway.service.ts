import { createHash } from 'node:crypto';
import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
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
  normalizedPaymentEventSchema,
  paymentSessionSchema,
  paymentGatewayDescriptorSchema,
  paymentGatewayFailureSchema,
  paymentWebhookResultSchema,
  serializeMoney,
  type CreatePaymentSessionRequest,
  type NormalizedPaymentEvent,
  type PaymentSession,
  type PaymentGatewayDescriptor,
  type PaymentGatewayFailure,
  type PaymentWebhookResult,
} from '@webhost-billing/shared';
import { ApplicationException } from '../../common/errors/application.exception';
import { PRISMA_CLIENT } from '../../infrastructure/database/database.module';
import type { AuthRequestContext } from '../auth/auth.types';
import type { PaymentGateway } from './payment-gateway.interface';
import { PaymentGatewayRegistry } from './payment-gateway.registry';
import { PaymentProviderError } from './payment-provider.error';

const MAX_WEBHOOK_BYTES = 256 * 1024;
const SESSION_CREATION_IN_PROGRESS = 'Checkout creation is in progress.';

interface SessionPaymentRecord {
  id: string;
  invoiceId: string;
  createdByUserId: string | null;
  status: PaymentStatus;
  provider: string;
  amount: bigint;
  currency: string;
  reference: string | null;
  providerCheckoutUrl: string | null;
  providerSessionExpiresAt: Date | null;
  invoice: {
    invoiceNumber: string;
    customerId: string;
    customerNameSnapshot: string;
    customerEmailSnapshot: string;
    customerAddressSnapshot: Prisma.JsonValue;
  };
}

type WebhookTransactionResult =
  | { outcome: 'processed' | 'ignored' }
  | { outcome: 'rejected'; message: string };

@Injectable()
export class PaymentGatewayService {
  private readonly logger = new Logger(PaymentGatewayService.name);

  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient,
    private readonly gateways: PaymentGatewayRegistry,
  ) {}

  async listGateways(): Promise<PaymentGatewayDescriptor[]> {
    return (await this.gateways.list()).map((gateway) =>
      paymentGatewayDescriptorSchema.parse({
        key: gateway.key,
        displayName: gateway.displayName,
        mode: gateway.mode,
      }),
    );
  }

  async listFailures(): Promise<PaymentGatewayFailure[]> {
    const failures = await this.prisma.payment.findMany({
      where: {
        provider: { in: ['bkash', 'sslcommerz'] },
        status: { in: [PaymentStatus.PENDING, PaymentStatus.FAILED] },
        failureReason: { not: null },
      },
      orderBy: { updatedAt: 'desc' },
      take: 50,
      include: { invoice: { select: { invoiceNumber: true } } },
    });
    return failures.map((payment) =>
      paymentGatewayFailureSchema.parse({
        paymentId: payment.id,
        invoiceId: payment.invoiceId,
        invoiceNumber: payment.invoice.invoiceNumber,
        provider: payment.provider,
        status: payment.status,
        failureReason: payment.failureReason,
        updatedAt: payment.updatedAt.toISOString(),
      }),
    );
  }

  async createSession(
    provider: string,
    input: CreatePaymentSessionRequest,
    actor: AuthRequestContext,
  ): Promise<PaymentSession> {
    const gateway = await this.gateways.get(provider, true);
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
                  customerNameSnapshot: true,
                  customerEmailSnapshot: true,
                  customerAddressSnapshot: true,
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

    if (
      duplicate &&
      payment.reference &&
      payment.providerCheckoutUrl &&
      payment.providerSessionExpiresAt
    ) {
      if (payment.providerSessionExpiresAt <= new Date()) {
        throw this.conflict(
          'This checkout session has expired. Start a new payment attempt.',
        );
      }
      return paymentSessionSchema.parse({
        paymentId: payment.id,
        invoiceId: payment.invoiceId,
        provider: gateway.key,
        providerSessionId: payment.reference,
        checkoutUrl: payment.providerCheckoutUrl,
        amount: serializeMoney(payment.amount, payment.currency),
        expiresAt: payment.providerSessionExpiresAt.toISOString(),
        duplicate: true,
      });
    }

    const customerAddress = this.customerAddress(
      payment.invoice.customerAddressSnapshot,
    );
    const claim = await this.prisma.payment.updateMany({
      where: { id: payment.id, reference: null, failureReason: null },
      data: { failureReason: SESSION_CREATION_IN_PROGRESS },
    });
    if (claim.count !== 1) {
      throw this.conflict(
        'This checkout is already being created or requires administrator reconciliation.',
      );
    }

    let gatewaySession;
    try {
      gatewaySession = await gateway.createPaymentSession({
        paymentId: payment.id,
        invoiceId: payment.invoiceId,
        invoiceNumber: payment.invoice.invoiceNumber,
        amount: payment.amount,
        currency: payment.currency,
        customerName: payment.invoice.customerNameSnapshot,
        customerEmail: payment.invoice.customerEmailSnapshot,
        customerAddress,
        idempotencyKey,
      });
    } catch (error) {
      const providerError =
        error instanceof PaymentProviderError
          ? error
          : new PaymentProviderError(
              'The payment provider returned an unexpected response. Reconciliation is required before retrying.',
              'UNKNOWN',
            );
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          status:
            providerError.outcome === 'FAILED'
              ? PaymentStatus.FAILED
              : PaymentStatus.PENDING,
          failureReason: providerError.safeMessage,
        },
      });
      throw new ApplicationException({
        status: HttpStatus.SERVICE_UNAVAILABLE,
        code: 'SERVICE_UNAVAILABLE',
        message: providerError.safeMessage,
      });
    }
    await this.prisma.payment.updateMany({
      where: { id: payment.id, reference: null },
      data: {
        reference: gatewaySession.providerSessionId,
        providerCheckoutUrl: gatewaySession.checkoutUrl,
        providerSessionExpiresAt: gatewaySession.expiresAt,
        failureReason: null,
      },
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
    const gateway = await this.gateways.get(provider);
    if (rawBody.length === 0 || rawBody.length > MAX_WEBHOOK_BYTES) {
      throw this.webhookRejected('Webhook body is missing or too large.');
    }
    if (!(await gateway.verifyWebhookSignature(rawBody, signature))) {
      throw this.webhookRejected('Webhook signature is invalid.', true);
    }
    const event = this.normalize(gateway, rawBody);
    const payloadHash = createHash('sha256').update(rawBody).digest('hex');
    return this.processNormalizedEvent(gateway, event, payloadHash);
  }

  private async processNormalizedEvent(
    gateway: PaymentGateway,
    event: NormalizedPaymentEvent,
    payloadHash: string,
  ): Promise<PaymentWebhookResult> {
    const existing = await this.prisma.paymentEvent.findFirst({
      where: { provider: gateway.key, providerEventId: event.providerEventId },
    });
    if (existing) {
      const replay = this.replay(existing, payloadHash, event);
      this.logPaymentEvent(gateway.key, replay);
      return replay;
    }

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
          if (payment?.status === PaymentStatus.PENDING) {
            await transaction.payment.update({
              where: { id: payment.id },
              data: { failureReason: validationError },
            });
          }
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
          if (event.failureReason) {
            await transaction.payment.update({
              where: { id: payment.id },
              data: { failureReason: event.failureReason },
            });
          }
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
      const webhookResult = paymentWebhookResultSchema.parse({
        accepted: true,
        duplicate: false,
        providerEventId: event.providerEventId,
        status: result.outcome === 'processed' ? 'PROCESSED' : 'IGNORED',
      });
      this.logPaymentEvent(gateway.key, webhookResult);
      return webhookResult;
    } catch (error) {
      if (!this.isUniqueConstraintError(error)) {
        this.logger.error(
          JSON.stringify({
            event: 'payment_event_processing_failed',
            provider: gateway.key,
            providerEventId: event.providerEventId,
          }),
        );
        throw error;
      }
      const raced = await this.prisma.paymentEvent.findFirst({
        where: {
          provider: gateway.key,
          providerEventId: event.providerEventId,
        },
      });
      if (raced) {
        const replay = this.replay(raced, payloadHash, event);
        this.logPaymentEvent(gateway.key, replay);
        return replay;
      }
      throw this.webhookRejected(
        'Provider transaction has already been recorded.',
      );
    }
  }

  private logPaymentEvent(
    provider: string,
    result: PaymentWebhookResult,
  ): void {
    this.logger.log(
      JSON.stringify({
        event: 'payment_event_processed',
        provider,
        providerEventId: result.providerEventId,
        status: result.status,
        duplicate: result.duplicate,
      }),
    );
  }

  async completeBkashCallback(
    providerSessionId: string,
    callbackStatus: string,
  ): Promise<{ invoiceId: string }> {
    const gateway = await this.gateways.get('bkash');
    const payment = await this.prisma.payment.findFirst({
      where: { provider: gateway.key, reference: providerSessionId },
      select: {
        id: true,
        invoiceId: true,
        amount: true,
        currency: true,
        status: true,
      },
    });
    if (!payment) throw this.notFound('Payment session was not found.');
    if (payment.status !== PaymentStatus.PENDING) {
      return { invoiceId: payment.invoiceId };
    }

    try {
      const context = {
        providerSessionId,
        paymentId: payment.id,
        invoiceId: payment.invoiceId,
        amount: payment.amount,
        currency: payment.currency,
      };
      let event: NormalizedPaymentEvent;
      if (callbackStatus === 'success' && gateway.completePaymentSession) {
        event = await gateway.completePaymentSession(context);
      } else {
        const status = await gateway.queryTransactionStatus(providerSessionId);
        event = normalizedPaymentEventSchema.parse({
          providerEventId: `bkash:${providerSessionId}:${status.providerTransactionId ?? status.status}`,
          eventType: `payment.${status.status.toLowerCase()}`,
          status: status.status === 'REFUNDED' ? 'FAILED' : status.status,
          merchantId: gateway.merchantId,
          paymentId: payment.id,
          invoiceId: payment.invoiceId,
          amount: status.amount.toString(),
          currency: status.currency,
          providerTransactionId: status.providerTransactionId,
          occurredAt: status.occurredAt.toISOString(),
          failureReason: status.failureReason,
        });
      }
      await this.processNormalizedEvent(
        gateway,
        event,
        this.eventPayloadHash(event),
      );
    } catch (error) {
      if (!(error instanceof PaymentProviderError)) throw error;
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          status:
            error.outcome === 'FAILED'
              ? PaymentStatus.FAILED
              : PaymentStatus.PENDING,
          failureReason: error.safeMessage,
        },
      });
    }
    return { invoiceId: payment.invoiceId };
  }

  async reconcilePayment(
    provider: string,
    paymentId: string,
    actor: AuthRequestContext,
  ): Promise<PaymentWebhookResult> {
    const gateway = await this.gateways.get(provider);
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      select: {
        id: true,
        invoiceId: true,
        provider: true,
        reference: true,
        amount: true,
        currency: true,
        status: true,
      },
    });
    if (!payment || payment.provider !== gateway.key) {
      throw this.notFound('Payment was not found.');
    }
    if (payment.status !== PaymentStatus.PENDING || !payment.reference) {
      throw this.conflict('Only a pending gateway payment can be reconciled.');
    }
    try {
      const status = await gateway.queryTransactionStatus(payment.reference);
      if (status.status === 'REFUNDED') {
        throw this.invalid('Refund reconciliation is not part of this flow.');
      }
      const event = normalizedPaymentEventSchema.parse({
        providerEventId: `reconciliation:${gateway.key}:${payment.id}:${status.providerTransactionId ?? status.status}`,
        eventType: `payment.${status.status.toLowerCase()}`,
        status: status.status,
        merchantId: gateway.merchantId,
        paymentId: payment.id,
        invoiceId: payment.invoiceId,
        amount: status.amount.toString(),
        currency: status.currency,
        providerTransactionId: status.providerTransactionId,
        occurredAt: status.occurredAt.toISOString(),
        failureReason: status.failureReason,
      });
      const result = await this.processNormalizedEvent(
        gateway,
        event,
        this.eventPayloadHash(event),
      );
      await this.prisma.activityLog.create({
        data: {
          actorUserId: actor.identity.userId,
          action: 'GATEWAY_PAYMENT_RECONCILED',
          entityType: 'PAYMENT',
          entityId: payment.id,
          metadata: { provider: gateway.key, status: event.status },
        },
      });
      return result;
    } catch (error) {
      if (!(error instanceof PaymentProviderError)) throw error;
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { failureReason: error.safeMessage },
      });
      throw new ApplicationException({
        status: HttpStatus.SERVICE_UNAVAILABLE,
        code: 'SERVICE_UNAVAILABLE',
        message: error.safeMessage,
      });
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
    if (event.status === 'SUCCEEDED') {
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
    if (eventType === 'GATEWAY_PAYMENT_SUCCEEDED') {
      await transaction.outboxEvent.create({
        data: {
          aggregateType: 'PAYMENT',
          aggregateId: paymentId,
          eventType: 'EMAIL_PAYMENT_RECEIVED',
          idempotencyKey: `email:payment-received:${paymentId}`,
          payload: { schemaVersion: 1, paymentId, invoiceId },
        },
      });
      const renewalItems = await transaction.invoiceItem.count({
        where: {
          invoiceId,
          serviceId: { not: null },
          servicePeriodStart: { not: null },
          servicePeriodEnd: { not: null },
        },
      });
      if (renewalItems > 0) {
        await transaction.outboxEvent.create({
          data: {
            aggregateType: 'PAYMENT',
            aggregateId: paymentId,
            eventType: 'RENEWAL_PAYMENT_COMPLETED',
            idempotencyKey: `renewal-payment:${paymentId}`,
            payload: { schemaVersion: 1, paymentId, invoiceId },
          },
        });
      }
    }
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

  private eventPayloadHash(event: NormalizedPaymentEvent): string {
    return createHash('sha256')
      .update(JSON.stringify(this.normalizedPayload(event)))
      .digest('hex');
  }

  private customerAddress(value: Prisma.JsonValue): {
    line1: string;
    line2: string | null;
    city: string;
    region: string | null;
    postalCode: string | null;
    countryCode: string;
  } {
    if (!value || Array.isArray(value) || typeof value !== 'object') {
      throw this.invalid('Invoice billing address is invalid.');
    }
    const stringValue = (key: string, required: boolean): string | null => {
      const field = value[key];
      if (typeof field === 'string' && field.trim()) return field.trim();
      if (
        !required &&
        (field === null || field === undefined || field === '')
      ) {
        return null;
      }
      throw this.invalid('Invoice billing address is invalid.');
    };
    return {
      line1: stringValue('line1', true) as string,
      line2: stringValue('line2', false),
      city: stringValue('city', true) as string,
      region: stringValue('region', false),
      postalCode: stringValue('postalCode', false),
      countryCode: stringValue('countryCode', true) as string,
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
            customerNameSnapshot: true,
            customerEmailSnapshot: true,
            customerAddressSnapshot: true,
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
