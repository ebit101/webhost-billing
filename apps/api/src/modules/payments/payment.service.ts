import { createHash } from 'node:crypto';
import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  InvoiceStatus,
  OrderStatus,
  PaymentKind,
  PaymentStatus,
  Prisma,
  SettingCategory,
  type PrismaClient,
} from '@webhost-billing/database';
import {
  createPaginationMeta,
  manualPaymentCreationResultSchema,
  manualPaymentMethodSchema,
  manualPaymentSchema,
  paymentSettingsSchema,
  serializeMoney,
  type CreatePaymentAdjustmentRequest,
  type ManualPayment,
  type ManualPaymentCreationResult,
  type ManualPaymentProof,
  type ManualPaymentState,
  type PaginationMeta,
  type PaymentListQuery,
  type PaymentSettings,
  type RecordManualPaymentRequest,
  type ReviewManualPaymentRequest,
  type SubmitManualPaymentRequest,
} from '@webhost-billing/shared';
import { ApplicationException } from '../../common/errors/application.exception';
import type { SecurityRequestContext } from '../../common/http/request-context';
import { PRISMA_CLIENT } from '../../infrastructure/database/database.module';
import type { AuthRequestContext } from '../auth/auth.types';

const PAYMENT_SETTINGS_KEY = 'billing.manual-payments';

const paymentInclude = {
  invoice: {
    select: {
      id: true,
      invoiceNumber: true,
      customerId: true,
      customerNameSnapshot: true,
      orderId: true,
      status: true,
      currency: true,
      total: true,
      creditTotal: true,
      amountPaid: true,
      balanceDue: true,
    },
  },
  createdBy: { select: { role: true } },
  adjustments: {
    where: { status: PaymentStatus.SUCCEEDED },
    select: { amount: true },
  },
} satisfies Prisma.PaymentInclude;

type PaymentRecord = Prisma.PaymentGetPayload<{
  include: typeof paymentInclude;
}>;

type DatabaseClient = PrismaClient | Prisma.TransactionClient;

@Injectable()
export class PaymentService {
  constructor(@Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient) {}

  async getSettings(): Promise<PaymentSettings> {
    return this.readSettings(this.prisma);
  }

  async updateSettings(
    input: PaymentSettings,
    actor: AuthRequestContext,
    context: SecurityRequestContext,
  ): Promise<PaymentSettings> {
    const settings = paymentSettingsSchema.parse(input);
    await this.prisma.$transaction([
      this.prisma.setting.upsert({
        where: { key: PAYMENT_SETTINGS_KEY },
        update: {
          value: settings,
          category: SettingCategory.BILLING,
          updatedByUserId: actor.identity.userId,
        },
        create: {
          key: PAYMENT_SETTINGS_KEY,
          category: SettingCategory.BILLING,
          value: settings,
          description: 'Manual payment policy.',
          updatedByUserId: actor.identity.userId,
        },
      }),
      this.prisma.activityLog.create({
        data: {
          actorUserId: actor.identity.userId,
          action: 'MANUAL_PAYMENT_SETTINGS_UPDATED_BY_ADMIN',
          entityType: 'SETTING',
          ipAddressHash: context.ipAddressHash,
          metadata: settings,
        },
      }),
    ]);
    return settings;
  }

  async submitManual(
    input: SubmitManualPaymentRequest,
    actor: AuthRequestContext,
    context: SecurityRequestContext,
  ): Promise<ManualPaymentCreationResult> {
    if (actor.identity.role !== 'CUSTOMER') throw new Error('Unreachable role');
    const customerId = actor.identity.customerId;
    const duplicate = await this.findBySubmissionKey(input.submissionKey);
    if (duplicate) {
      return this.duplicateChargeResult(
        duplicate,
        input,
        'CUSTOMER',
        customerId,
      );
    }
    this.validateReceivedAt(input.proof);
    try {
      const paymentId = await this.prisma.$transaction(async (transaction) => {
        await this.lockInvoice(transaction, input.invoiceId);
        const invoice = await transaction.invoice.findUnique({
          where: { id: input.invoiceId },
        });
        if (!invoice || invoice.customerId !== customerId) {
          throw this.notFound();
        }
        const amount = BigInt(input.amount);
        await this.assertPayableAmount(transaction, invoice, amount);
        const payment = await transaction.payment.create({
          data: this.chargeData(
            input,
            actor.identity.userId,
            false,
            invoice.currency,
          ),
        });
        await transaction.activityLog.create({
          data: {
            actorUserId: actor.identity.userId,
            action: 'MANUAL_PAYMENT_SUBMITTED_BY_CUSTOMER',
            entityType: 'PAYMENT',
            entityId: payment.id,
            ipAddressHash: context.ipAddressHash,
            metadata: {
              invoiceId: invoice.id,
              amount: input.amount,
              method: input.proof.method,
            },
          },
        });
        return payment.id;
      });
      return manualPaymentCreationResultSchema.parse({
        payment: await this.getUnchecked(paymentId),
        duplicate: false,
      });
    } catch (error) {
      return this.handleCreationError(error, input, 'CUSTOMER', customerId);
    }
  }

  async recordManual(
    input: RecordManualPaymentRequest,
    actor: AuthRequestContext,
    context: SecurityRequestContext,
  ): Promise<ManualPaymentCreationResult> {
    const duplicate = await this.findBySubmissionKey(input.submissionKey);
    if (duplicate) {
      return this.duplicateChargeResult(duplicate, input, 'ADMIN');
    }
    this.validateReceivedAt(input.proof);
    try {
      const paymentId = await this.prisma.$transaction(async (transaction) => {
        await this.lockInvoice(transaction, input.invoiceId);
        const invoice = await transaction.invoice.findUnique({
          where: { id: input.invoiceId },
        });
        if (!invoice) throw this.notFoundInvoice();
        const amount = BigInt(input.amount);
        await this.assertPayableAmount(transaction, invoice, amount);
        const now = new Date();
        const payment = await transaction.payment.create({
          data: {
            ...this.chargeData(
              input,
              actor.identity.userId,
              true,
              invoice.currency,
            ),
            reviewedByUserId: actor.identity.userId,
            reviewedAt: now,
            verifiedAt: now,
          },
        });
        await this.applyVerifiedCharge(
          transaction,
          invoice,
          payment.id,
          amount,
          actor,
          context,
          now,
          'ADMIN',
        );
        return payment.id;
      });
      return manualPaymentCreationResultSchema.parse({
        payment: await this.getUnchecked(paymentId),
        duplicate: false,
      });
    } catch (error) {
      return this.handleCreationError(error, input, 'ADMIN');
    }
  }

  async review(
    paymentId: string,
    input: ReviewManualPaymentRequest,
    actor: AuthRequestContext,
    context: SecurityRequestContext,
  ): Promise<ManualPayment> {
    const initial = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      select: { invoiceId: true, kind: true, status: true, provider: true },
    });
    if (!initial || initial.provider !== 'manual') throw this.notFound();
    if (
      initial.kind !== PaymentKind.CHARGE ||
      initial.status !== PaymentStatus.PENDING
    ) {
      throw this.invalid('Only a pending manual payment can be reviewed.');
    }
    if (input.action === 'REJECT') {
      await this.prisma.$transaction(async (transaction) => {
        const now = new Date();
        const rejected = await transaction.payment.updateMany({
          where: {
            id: paymentId,
            provider: 'manual',
            kind: PaymentKind.CHARGE,
            status: PaymentStatus.PENDING,
          },
          data: {
            status: PaymentStatus.FAILED,
            failureReason: input.reason,
            reviewedByUserId: actor.identity.userId,
            reviewedAt: now,
          },
        });
        if (rejected.count !== 1) throw this.concurrentReview();
        await transaction.activityLog.create({
          data: {
            actorUserId: actor.identity.userId,
            action: 'MANUAL_PAYMENT_REJECTED_BY_ADMIN',
            entityType: 'PAYMENT',
            entityId: paymentId,
            ipAddressHash: context.ipAddressHash,
            metadata: { invoiceId: initial.invoiceId, reason: input.reason },
          },
        });
      });
      return this.getUnchecked(paymentId);
    }

    try {
      await this.prisma.$transaction(async (transaction) => {
        await this.lockInvoice(transaction, initial.invoiceId);
        const payment = await transaction.payment.findUnique({
          where: { id: paymentId },
        });
        const invoice = await transaction.invoice.findUnique({
          where: { id: initial.invoiceId },
        });
        if (
          !payment ||
          payment.status !== PaymentStatus.PENDING ||
          payment.kind !== PaymentKind.CHARGE
        ) {
          throw this.concurrentReview();
        }
        if (!invoice) throw this.notFoundInvoice();
        await this.assertPayableAmount(transaction, invoice, payment.amount);
        const now = new Date();
        const verified = await transaction.payment.updateMany({
          where: { id: payment.id, status: PaymentStatus.PENDING },
          data: {
            status: PaymentStatus.SUCCEEDED,
            providerTransactionId: this.providerReference(
              payment.manualMethod ?? 'OTHER',
              payment.reference ?? '',
            ),
            reviewedByUserId: actor.identity.userId,
            reviewedAt: now,
            verifiedAt: now,
          },
        });
        if (verified.count !== 1) throw this.concurrentReview();
        await this.applyVerifiedCharge(
          transaction,
          invoice,
          payment.id,
          payment.amount,
          actor,
          context,
          now,
          'CUSTOMER',
        );
      });
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        throw this.conflict(
          'This manual payment reference has already been verified.',
        );
      }
      throw error;
    }
    return this.getUnchecked(paymentId);
  }

  async adjust(
    originalPaymentId: string,
    input: CreatePaymentAdjustmentRequest,
    actor: AuthRequestContext,
    context: SecurityRequestContext,
  ): Promise<ManualPaymentCreationResult> {
    const duplicate = await this.findBySubmissionKey(input.submissionKey);
    if (duplicate) {
      return this.duplicateAdjustmentResult(
        duplicate,
        originalPaymentId,
        input,
      );
    }
    const originalLocator = await this.prisma.payment.findUnique({
      where: { id: originalPaymentId },
      select: { invoiceId: true },
    });
    if (!originalLocator) throw this.notFound();
    try {
      const adjustmentId = await this.prisma.$transaction(
        async (transaction) => {
          await this.lockInvoice(transaction, originalLocator.invoiceId);
          const original = await transaction.payment.findUnique({
            where: { id: originalPaymentId },
            include: {
              adjustments: {
                where: { status: PaymentStatus.SUCCEEDED },
                select: { amount: true },
              },
            },
          });
          const invoice = await transaction.invoice.findUnique({
            where: { id: originalLocator.invoiceId },
          });
          if (
            !original ||
            original.provider !== 'manual' ||
            original.kind !== PaymentKind.CHARGE ||
            original.status !== PaymentStatus.SUCCEEDED
          ) {
            throw this.invalid(
              'Only a verified original manual charge can be adjusted.',
            );
          }
          if (!invoice) throw this.notFoundInvoice();
          const adjusted = original.adjustments.reduce(
            (sum, adjustment) => sum + adjustment.amount,
            0n,
          );
          const remaining = original.amount - adjusted;
          const amount = BigInt(input.amount);
          if (amount > remaining || amount > invoice.amountPaid) {
            throw this.invalid(
              'Adjustment exceeds the remaining verified payment amount.',
            );
          }
          const now = new Date();
          const adjustment = await transaction.payment.create({
            data: {
              invoiceId: invoice.id,
              originalPaymentId: original.id,
              createdByUserId: actor.identity.userId,
              reviewedByUserId: actor.identity.userId,
              kind: input.kind,
              status: PaymentStatus.SUCCEEDED,
              provider: 'manual',
              providerTransactionId: this.providerReference(
                original.manualMethod ?? 'OTHER',
                input.reference,
              ),
              idempotencyKey: input.submissionKey,
              amount,
              currency: invoice.currency,
              reference: input.reference,
              manualMethod: original.manualMethod ?? 'OTHER',
              proofMetadata: input.note ? { note: input.note } : {},
              receivedAt: now,
              reviewedAt: now,
              verifiedAt: now,
            },
          });
          const amountPaid = invoice.amountPaid - amount;
          const balanceDue = invoice.balanceDue + amount;
          await transaction.invoice.update({
            where: { id: invoice.id },
            data: {
              amountPaid,
              balanceDue,
              status:
                amountPaid === 0n
                  ? InvoiceStatus.REFUNDED
                  : InvoiceStatus.PARTIALLY_REFUNDED,
            },
          });
          await transaction.activityLog.create({
            data: {
              actorUserId: actor.identity.userId,
              action:
                input.kind === 'REFUND'
                  ? 'MANUAL_PAYMENT_REFUNDED_BY_ADMIN'
                  : 'MANUAL_PAYMENT_REVERSED_BY_ADMIN',
              entityType: 'PAYMENT',
              entityId: adjustment.id,
              ipAddressHash: context.ipAddressHash,
              metadata: {
                invoiceId: invoice.id,
                originalPaymentId: original.id,
                amount: input.amount,
              },
            },
          });
          return adjustment.id;
        },
      );
      return manualPaymentCreationResultSchema.parse({
        payment: await this.getUnchecked(adjustmentId),
        duplicate: false,
      });
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        const raced = await this.findBySubmissionKey(input.submissionKey);
        if (raced) {
          return this.duplicateAdjustmentResult(
            raced,
            originalPaymentId,
            input,
          );
        }
        throw this.conflict(
          'This manual payment reference has already been recorded.',
        );
      }
      throw error;
    }
  }

  async list(query: PaymentListQuery): Promise<{
    data: ManualPayment[];
    pagination: PaginationMeta;
  }> {
    const where: Prisma.PaymentWhereInput = {
      provider: 'manual',
      ...(query.customerId
        ? { invoice: { customerId: query.customerId } }
        : {}),
      ...(query.invoiceId ? { invoiceId: query.invoiceId } : {}),
      ...(query.state ? this.stateWhere(query.state) : {}),
      ...(query.search
        ? {
            OR: [
              { reference: { contains: query.search, mode: 'insensitive' } },
              {
                invoice: {
                  invoiceNumber: {
                    contains: query.search,
                    mode: 'insensitive',
                  },
                },
              },
              {
                invoice: {
                  customerNameSnapshot: {
                    contains: query.search,
                    mode: 'insensitive',
                  },
                },
              },
            ],
          }
        : {}),
    };
    const [payments, totalItems] = await this.prisma.$transaction([
      this.prisma.payment.findMany({
        where,
        include: paymentInclude,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.payment.count({ where }),
    ]);
    return {
      data: payments.map((payment) => this.toPayment(payment)),
      pagination: createPaginationMeta(query.page, query.pageSize, totalItems),
    };
  }

  async get(
    paymentId: string,
    actor: AuthRequestContext,
  ): Promise<ManualPayment> {
    const payment = await this.getRecord(paymentId);
    if (
      actor.identity.role === 'CUSTOMER' &&
      payment.invoice.customerId !== actor.identity.customerId
    ) {
      throw new ApplicationException({
        status: HttpStatus.FORBIDDEN,
        code: 'FORBIDDEN',
        message: 'You do not have access to this payment.',
      });
    }
    return this.toPayment(payment);
  }

  private async applyVerifiedCharge(
    transaction: Prisma.TransactionClient,
    invoice: {
      id: string;
      orderId: string | null;
      status: InvoiceStatus;
      amountPaid: bigint;
      balanceDue: bigint;
    },
    paymentId: string,
    amount: bigint,
    actor: AuthRequestContext,
    context: SecurityRequestContext,
    now: Date,
    source: 'ADMIN' | 'CUSTOMER',
  ) {
    const amountPaid = invoice.amountPaid + amount;
    const balanceDue = invoice.balanceDue - amount;
    const fullyPaid = balanceDue === 0n;
    await transaction.invoice.update({
      where: { id: invoice.id },
      data: {
        amountPaid,
        balanceDue,
        status: fullyPaid ? InvoiceStatus.PAID : invoice.status,
        ...(fullyPaid ? { paidAt: now } : {}),
      },
    });
    if (fullyPaid && invoice.orderId) {
      const paidOrder = await transaction.order.updateMany({
        where: {
          id: invoice.orderId,
          status: OrderStatus.AWAITING_PAYMENT,
        },
        data: { status: OrderStatus.PAID },
      });
      if (paidOrder.count === 1) {
        await transaction.activityLog.create({
          data: {
            actorUserId: actor.identity.userId,
            action: 'ORDER_MARKED_PAID_BY_VERIFIED_PAYMENT',
            entityType: 'ORDER',
            entityId: invoice.orderId,
            ipAddressHash: context.ipAddressHash,
            metadata: { invoiceId: invoice.id, paymentId },
          },
        });
      }
    }
    await transaction.outboxEvent.create({
      data: {
        aggregateType: 'PAYMENT',
        aggregateId: paymentId,
        eventType: 'EMAIL_PAYMENT_RECEIVED',
        idempotencyKey: `email:payment-received:${paymentId}`,
        payload: {
          schemaVersion: 1,
          paymentId,
          invoiceId: invoice.id,
        },
      },
    });
    if (
      fullyPaid &&
      (await transaction.invoiceItem.count({
        where: {
          invoiceId: invoice.id,
          serviceId: { not: null },
          servicePeriodStart: { not: null },
          servicePeriodEnd: { not: null },
        },
      })) > 0
    ) {
      await transaction.outboxEvent.create({
        data: {
          aggregateType: 'PAYMENT',
          aggregateId: paymentId,
          eventType: 'RENEWAL_PAYMENT_COMPLETED',
          idempotencyKey: `renewal-payment:${paymentId}`,
          payload: { schemaVersion: 1, paymentId, invoiceId: invoice.id },
        },
      });
    }
    await transaction.activityLog.create({
      data: {
        actorUserId: actor.identity.userId,
        action:
          source === 'ADMIN'
            ? 'MANUAL_PAYMENT_RECORDED_BY_ADMIN'
            : 'MANUAL_PAYMENT_VERIFIED_BY_ADMIN',
        entityType: 'PAYMENT',
        entityId: paymentId,
        ipAddressHash: context.ipAddressHash,
        metadata: {
          invoiceId: invoice.id,
          amount: amount.toString(),
          balanceDue: balanceDue.toString(),
        },
      },
    });
  }

  private async assertPayableAmount(
    transaction: Prisma.TransactionClient,
    invoice: {
      status: InvoiceStatus;
      balanceDue: bigint;
      currency: string;
    },
    amount: bigint,
  ) {
    if (
      invoice.status !== InvoiceStatus.UNPAID &&
      invoice.status !== InvoiceStatus.OVERDUE
    ) {
      throw this.invalid('Only an unpaid or overdue invoice can be paid.');
    }
    if (amount <= 0n || amount > invoice.balanceDue) {
      throw this.invalid('Payment amount exceeds the invoice balance.');
    }
    const settings = await this.readSettings(transaction);
    if (!settings.partialPaymentsEnabled && amount !== invoice.balanceDue) {
      throw this.invalid(
        'Partial payments are disabled; the payment must equal the full balance.',
      );
    }
  }

  private async readSettings(client: DatabaseClient): Promise<PaymentSettings> {
    const setting = await client.setting.findUnique({
      where: { key: PAYMENT_SETTINGS_KEY },
      select: { value: true },
    });
    const parsed = paymentSettingsSchema.safeParse(setting?.value);
    return parsed.success ? parsed.data : { partialPaymentsEnabled: false };
  }

  private chargeData(
    input: SubmitManualPaymentRequest,
    actorUserId: string,
    verified: boolean,
    currency: string,
  ): Prisma.PaymentUncheckedCreateInput {
    return {
      invoiceId: input.invoiceId,
      createdByUserId: actorUserId,
      kind: PaymentKind.CHARGE,
      status: verified ? PaymentStatus.SUCCEEDED : PaymentStatus.PENDING,
      provider: 'manual',
      providerTransactionId: verified
        ? this.providerReference(input.proof.method, input.proof.reference)
        : null,
      idempotencyKey: input.submissionKey,
      amount: BigInt(input.amount),
      currency,
      reference: input.proof.reference,
      manualMethod: input.proof.method,
      proofMetadata: this.proofMetadata(input.proof),
      receivedAt: input.proof.paidAt
        ? new Date(input.proof.paidAt)
        : new Date(),
    };
  }

  private proofMetadata(proof: ManualPaymentProof): Prisma.InputJsonValue {
    return {
      ...(proof.payerName ? { payerName: proof.payerName } : {}),
      ...(proof.note ? { note: proof.note } : {}),
    };
  }

  private validateReceivedAt(proof: ManualPaymentProof) {
    if (
      proof.paidAt &&
      new Date(proof.paidAt).getTime() > Date.now() + 5 * 60 * 1000
    ) {
      throw this.invalid('Payment date cannot be in the future.');
    }
  }

  private providerReference(method: string, reference: string): string {
    return createHash('sha256')
      .update(`${method}:${reference.trim().toUpperCase()}`)
      .digest('hex');
  }

  private stateWhere(state: ManualPaymentState): Prisma.PaymentWhereInput {
    if (state === 'PENDING') {
      return { kind: PaymentKind.CHARGE, status: PaymentStatus.PENDING };
    }
    if (state === 'VERIFIED') {
      return { kind: PaymentKind.CHARGE, status: PaymentStatus.SUCCEEDED };
    }
    if (state === 'REJECTED') {
      return {
        kind: PaymentKind.CHARGE,
        status: { in: [PaymentStatus.FAILED, PaymentStatus.CANCELLED] },
      };
    }
    return {
      kind: state === 'REFUNDED' ? PaymentKind.REFUND : PaymentKind.REVERSAL,
      status: PaymentStatus.SUCCEEDED,
    };
  }

  private state(payment: PaymentRecord): ManualPaymentState {
    if (payment.kind === PaymentKind.REFUND) return 'REFUNDED';
    if (payment.kind === PaymentKind.REVERSAL) return 'REVERSED';
    if (payment.status === PaymentStatus.PENDING) return 'PENDING';
    if (payment.status === PaymentStatus.SUCCEEDED) return 'VERIFIED';
    return 'REJECTED';
  }

  private toPayment(payment: PaymentRecord): ManualPayment {
    const metadata = this.readProofMetadata(payment.proofMetadata);
    const adjustedAmount =
      payment.kind === PaymentKind.CHARGE
        ? payment.adjustments.reduce(
            (sum, adjustment) => sum + adjustment.amount,
            0n,
          )
        : 0n;
    const refundableAmount =
      payment.kind === PaymentKind.CHARGE &&
      payment.status === PaymentStatus.SUCCEEDED
        ? payment.amount - adjustedAmount
        : 0n;
    return manualPaymentSchema.parse({
      id: payment.id,
      invoiceId: payment.invoiceId,
      invoiceNumber: payment.invoice.invoiceNumber,
      customerId: payment.invoice.customerId,
      customerName: payment.invoice.customerNameSnapshot,
      originalPaymentId: payment.originalPaymentId,
      kind: payment.kind,
      state: this.state(payment),
      method: manualPaymentMethodSchema.parse(payment.manualMethod),
      reference: payment.reference,
      proof: metadata,
      amount: serializeMoney(payment.amount, payment.currency),
      adjustedAmount: serializeMoney(adjustedAmount, payment.currency),
      refundableAmount: serializeMoney(refundableAmount, payment.currency),
      submittedByRole: payment.createdBy?.role ?? null,
      failureReason: payment.failureReason,
      receivedAt: payment.receivedAt?.toISOString() ?? null,
      reviewedAt: payment.reviewedAt?.toISOString() ?? null,
      verifiedAt: payment.verifiedAt?.toISOString() ?? null,
      createdAt: payment.createdAt.toISOString(),
      updatedAt: payment.updatedAt.toISOString(),
    });
  }

  private readProofMetadata(value: unknown) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return { payerName: null, note: null };
    }
    const record = value as Record<string, unknown>;
    return {
      payerName: typeof record.payerName === 'string' ? record.payerName : null,
      note: typeof record.note === 'string' ? record.note : null,
    };
  }

  private async lockInvoice(
    transaction: Prisma.TransactionClient,
    invoiceId: string,
  ) {
    await transaction.$queryRaw`
      SELECT "id"
      FROM "invoices"
      WHERE "id" = ${invoiceId}::uuid
      FOR UPDATE
    `;
  }

  private async findBySubmissionKey(
    key: string,
  ): Promise<PaymentRecord | null> {
    return this.prisma.payment.findUnique({
      where: { idempotencyKey: key },
      include: paymentInclude,
    });
  }

  private duplicateChargeResult(
    payment: PaymentRecord,
    input: SubmitManualPaymentRequest,
    submittedByRole: 'ADMIN' | 'CUSTOMER',
    customerId?: string,
  ): ManualPaymentCreationResult {
    const metadata = this.readProofMetadata(payment.proofMetadata);
    const same =
      payment.kind === PaymentKind.CHARGE &&
      payment.invoiceId === input.invoiceId &&
      (!customerId || payment.invoice.customerId === customerId) &&
      payment.createdBy?.role === submittedByRole &&
      payment.amount === BigInt(input.amount) &&
      payment.manualMethod === input.proof.method &&
      payment.reference === input.proof.reference &&
      metadata.payerName === (input.proof.payerName ?? null) &&
      metadata.note === (input.proof.note ?? null) &&
      (!input.proof.paidAt ||
        payment.receivedAt?.getTime() ===
          new Date(input.proof.paidAt).getTime());
    if (!same) {
      throw this.conflict(
        'This submission key has already been used for another payment.',
      );
    }
    return manualPaymentCreationResultSchema.parse({
      payment: this.toPayment(payment),
      duplicate: true,
    });
  }

  private duplicateAdjustmentResult(
    payment: PaymentRecord,
    originalPaymentId: string,
    input: CreatePaymentAdjustmentRequest,
  ): ManualPaymentCreationResult {
    const metadata = this.readProofMetadata(payment.proofMetadata);
    if (
      payment.originalPaymentId !== originalPaymentId ||
      payment.kind !== input.kind ||
      payment.amount !== BigInt(input.amount) ||
      payment.reference !== input.reference ||
      metadata.note !== (input.note ?? null)
    ) {
      throw this.conflict(
        'This submission key has already been used for another adjustment.',
      );
    }
    return manualPaymentCreationResultSchema.parse({
      payment: this.toPayment(payment),
      duplicate: true,
    });
  }

  private async handleCreationError(
    error: unknown,
    input: SubmitManualPaymentRequest,
    submittedByRole: 'ADMIN' | 'CUSTOMER',
    customerId?: string,
  ): Promise<ManualPaymentCreationResult> {
    if (this.isUniqueConstraintError(error)) {
      const raced = await this.findBySubmissionKey(input.submissionKey);
      if (raced) {
        return this.duplicateChargeResult(
          raced,
          input,
          submittedByRole,
          customerId,
        );
      }
      throw this.conflict(
        'This manual payment reference has already been recorded.',
      );
    }
    throw error;
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'P2002'
    );
  }

  private async getUnchecked(paymentId: string): Promise<ManualPayment> {
    return this.toPayment(await this.getRecord(paymentId));
  }

  private async getRecord(paymentId: string): Promise<PaymentRecord> {
    const payment = await this.prisma.payment.findFirst({
      where: { id: paymentId, provider: 'manual' },
      include: paymentInclude,
    });
    if (!payment) throw this.notFound();
    return payment;
  }

  private notFound() {
    return new ApplicationException({
      status: HttpStatus.NOT_FOUND,
      code: 'RESOURCE_NOT_FOUND',
      message: 'Manual payment was not found.',
    });
  }

  private notFoundInvoice() {
    return new ApplicationException({
      status: HttpStatus.NOT_FOUND,
      code: 'RESOURCE_NOT_FOUND',
      message: 'Invoice was not found.',
    });
  }

  private invalid(message: string) {
    return new ApplicationException({
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      code: 'UNPROCESSABLE_ENTITY',
      message,
    });
  }

  private concurrentReview() {
    return new ApplicationException({
      status: HttpStatus.CONFLICT,
      code: 'CONFLICT',
      message: 'The payment has already been reviewed.',
    });
  }

  private conflict(message: string) {
    return new ApplicationException({
      status: HttpStatus.CONFLICT,
      code: 'CONFLICT',
      message,
    });
  }
}
