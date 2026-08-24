import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  CustomerStatus,
  InvoiceStatus,
  OrderStatus,
  Prisma,
  SettingCategory,
  UserStatus,
  type PrismaClient,
} from '@webhost-billing/database';
import {
  POSTGRES_BIGINT_MAX,
  PROJECT_NAME,
  businessIdentitySchema,
  createPaginationMeta,
  invoiceAddressSchema,
  invoiceCreationResultSchema,
  invoiceSchema,
  serializeMoney,
  type BusinessIdentity,
  type CreateInvoiceRequest,
  type Invoice,
  type InvoiceActionRequest,
  type InvoiceCreationResult,
  type InvoiceItemInput,
  type InvoiceListQuery,
  type PaginationMeta,
  type UpdateDraftInvoiceRequest,
} from '@webhost-billing/shared';
import { ApplicationException } from '../../common/errors/application.exception';
import { createHumanReadableNumber } from '../../common/identifiers/business-number';
import type { SecurityRequestContext } from '../../common/http/request-context';
import { PRISMA_CLIENT } from '../../infrastructure/database/database.module';
import type { AuthRequestContext } from '../auth/auth.types';

interface CalculableItem {
  quantity: number;
  unitAmount: bigint;
  discountAmount: bigint;
  taxAmount: bigint;
}

export interface InvoiceTotals {
  subtotal: bigint;
  discountTotal: bigint;
  taxTotal: bigint;
  total: bigint;
  creditTotal: bigint;
  amountPaid: bigint;
  balanceDue: bigint;
  lineTotals: bigint[];
}

export class InvoiceCalculationError extends Error {}
export class InvoiceStateTransitionError extends Error {}

export function nextInvoiceStatus(input: {
  action: InvoiceActionRequest['action'];
  status: InvoiceStatus;
  dueAt: Date;
  balanceDue: bigint;
  amountPaid: bigint;
  now: Date;
}): InvoiceStatus {
  if (input.action === 'ISSUE') {
    if (input.status !== InvoiceStatus.DRAFT) {
      throw new InvoiceStateTransitionError(
        'Only a draft invoice can be issued.',
      );
    }
    if (input.dueAt < input.now) {
      throw new InvoiceStateTransitionError(
        'Invoice due date cannot precede its issue date.',
      );
    }
    return input.balanceDue === 0n ? InvoiceStatus.PAID : InvoiceStatus.UNPAID;
  }
  if (input.action === 'MARK_OVERDUE') {
    if (
      input.status !== InvoiceStatus.UNPAID ||
      input.balanceDue === 0n ||
      input.dueAt >= input.now
    ) {
      throw new InvoiceStateTransitionError(
        'Only a past-due unpaid invoice with a balance can be marked overdue.',
      );
    }
    return InvoiceStatus.OVERDUE;
  }
  if (
    (input.status !== InvoiceStatus.DRAFT &&
      input.status !== InvoiceStatus.UNPAID &&
      input.status !== InvoiceStatus.OVERDUE) ||
    input.amountPaid > 0n
  ) {
    throw new InvoiceStateTransitionError(
      'Paid or settled invoices cannot be cancelled; use a refund or reversal.',
    );
  }
  return InvoiceStatus.CANCELLED;
}

function checkedAdd(left: bigint, right: bigint, label: string): bigint {
  if (right > POSTGRES_BIGINT_MAX - left) {
    throw new InvoiceCalculationError(`${label} exceeds the supported range.`);
  }
  return left + right;
}

export function calculateInvoiceTotals(
  items: readonly CalculableItem[],
  creditTotal: bigint,
  amountPaid = 0n,
): InvoiceTotals {
  if (!items.length) {
    throw new InvoiceCalculationError('At least one invoice item is required.');
  }
  let subtotal = 0n;
  let discountTotal = 0n;
  let taxTotal = 0n;
  const lineTotals: bigint[] = [];
  for (const item of items) {
    if (item.quantity < 1 || !Number.isSafeInteger(item.quantity)) {
      throw new InvoiceCalculationError('Invoice quantity is invalid.');
    }
    if (
      item.unitAmount < 0n ||
      item.discountAmount < 0n ||
      item.taxAmount < 0n
    ) {
      throw new InvoiceCalculationError('Invoice amounts cannot be negative.');
    }
    const quantity = BigInt(item.quantity);
    if (
      item.unitAmount > 0n &&
      quantity > POSTGRES_BIGINT_MAX / item.unitAmount
    ) {
      throw new InvoiceCalculationError(
        'Invoice item subtotal exceeds the supported range.',
      );
    }
    const gross = item.unitAmount * quantity;
    if (item.discountAmount > gross) {
      throw new InvoiceCalculationError(
        'An item discount cannot exceed its subtotal.',
      );
    }
    const afterDiscount = gross - item.discountAmount;
    const lineTotal = checkedAdd(
      afterDiscount,
      item.taxAmount,
      'Invoice item total',
    );
    subtotal = checkedAdd(subtotal, gross, 'Invoice subtotal');
    discountTotal = checkedAdd(
      discountTotal,
      item.discountAmount,
      'Invoice discount total',
    );
    taxTotal = checkedAdd(taxTotal, item.taxAmount, 'Invoice tax total');
    lineTotals.push(lineTotal);
  }
  const afterDiscount = subtotal - discountTotal;
  const total = checkedAdd(afterDiscount, taxTotal, 'Invoice total');
  if (creditTotal < 0n || amountPaid < 0n) {
    throw new InvoiceCalculationError('Settlement amounts cannot be negative.');
  }
  const settled = checkedAdd(creditTotal, amountPaid, 'Invoice settlement');
  if (settled > total) {
    throw new InvoiceCalculationError(
      'Credits and payments cannot exceed the invoice total.',
    );
  }
  return {
    subtotal,
    discountTotal,
    taxTotal,
    total,
    creditTotal,
    amountPaid,
    balanceDue: total - settled,
    lineTotals,
  };
}

const invoiceInclude = {
  items: {
    orderBy: [{ linePosition: 'asc' as const }, { id: 'asc' as const }],
  },
  order: { select: { orderNumber: true } },
} satisfies Prisma.InvoiceInclude;

type InvoiceRecord = Prisma.InvoiceGetPayload<{
  include: typeof invoiceInclude;
}>;

@Injectable()
export class InvoiceService {
  constructor(@Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient) {}

  async getBusinessIdentity(): Promise<BusinessIdentity> {
    const setting = await this.prisma.setting.findUnique({
      where: { key: 'business.identity' },
      select: { value: true },
    });
    return this.normalizeBusinessIdentity(setting?.value);
  }

  async updateBusinessIdentity(
    input: BusinessIdentity,
    actor: AuthRequestContext,
    context: SecurityRequestContext,
  ): Promise<BusinessIdentity> {
    const identity = businessIdentitySchema.parse(input);
    await this.prisma.$transaction([
      this.prisma.setting.upsert({
        where: { key: 'business.identity' },
        update: {
          value: identity,
          category: SettingCategory.BUSINESS,
          updatedByUserId: actor.identity.userId,
        },
        create: {
          key: 'business.identity',
          category: SettingCategory.BUSINESS,
          value: identity,
          description: 'Legal identity snapshot source for future invoices.',
          updatedByUserId: actor.identity.userId,
        },
      }),
      this.prisma.activityLog.create({
        data: {
          actorUserId: actor.identity.userId,
          action: 'INVOICE_BUSINESS_IDENTITY_UPDATED_BY_ADMIN',
          entityType: 'SETTING',
          ipAddressHash: context.ipAddressHash,
          metadata: { key: 'business.identity' },
        },
      }),
    ]);
    return identity;
  }

  async create(
    input: CreateInvoiceRequest,
    actor: AuthRequestContext,
    context: SecurityRequestContext,
  ): Promise<InvoiceCreationResult> {
    const existing = await this.findBySubmissionKey(input.submissionKey);
    if (existing) return this.duplicateResult(existing, input);
    const amounts = this.parseAndCalculate(input.items, input.creditTotal);
    try {
      const invoiceId = await this.prisma.$transaction(async (transaction) => {
        const customer = await transaction.customer.findFirst({
          where: {
            id: input.customerId,
            deletedAt: null,
            status: CustomerStatus.ACTIVE,
            user: { status: UserStatus.ACTIVE, deletedAt: null },
          },
          include: { user: { select: { email: true } } },
        });
        if (!customer) {
          throw new ApplicationException({
            status: HttpStatus.UNPROCESSABLE_ENTITY,
            code: 'UNPROCESSABLE_ENTITY',
            message: 'The selected customer account is not active.',
          });
        }
        const setting = await transaction.setting.findUnique({
          where: { key: 'business.identity' },
          select: { value: true },
        });
        const invoice = await transaction.invoice.create({
          data: {
            invoiceNumber: createHumanReadableNumber('INV'),
            submissionKey: input.submissionKey,
            customerId: customer.id,
            status: InvoiceStatus.DRAFT,
            currency: input.currency,
            subtotal: amounts.subtotal,
            discountTotal: amounts.discountTotal,
            taxTotal: amounts.taxTotal,
            total: amounts.total,
            creditTotal: amounts.creditTotal,
            balanceDue: amounts.balanceDue,
            customerNameSnapshot:
              customer.companyName ??
              `${customer.firstName} ${customer.lastName}`,
            customerEmailSnapshot: customer.user.email,
            customerAddressSnapshot: {
              line1: customer.addressLine1,
              line2: customer.addressLine2,
              city: customer.city,
              region: customer.region,
              postalCode: customer.postalCode,
              countryCode: customer.countryCode,
            },
            businessIdentitySnapshot: this.normalizeBusinessIdentity(
              setting?.value,
            ),
            ...(customer.taxIdentifier
              ? {
                  taxIdentitySnapshot: {
                    taxIdentifier: customer.taxIdentifier,
                  },
                }
              : {}),
            dueAt: new Date(input.dueAt),
            items: {
              create: input.items.map((item, index) =>
                this.itemCreateData(
                  item,
                  input.currency,
                  amounts.lineTotals[index],
                  index + 1,
                ),
              ),
            },
          },
        });
        await transaction.activityLog.create({
          data: {
            actorUserId: actor.identity.userId,
            action: 'INVOICE_DRAFT_CREATED_BY_ADMIN',
            entityType: 'INVOICE',
            entityId: invoice.id,
            ipAddressHash: context.ipAddressHash,
            metadata: {
              customerId: customer.id,
              itemCount: input.items.length,
            },
          },
        });
        return invoice.id;
      });
      return invoiceCreationResultSchema.parse({
        invoice: await this.getUnchecked(invoiceId),
        duplicate: false,
      });
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        const raced = await this.findBySubmissionKey(input.submissionKey);
        if (raced) return this.duplicateResult(raced, input);
        throw new ApplicationException({
          status: HttpStatus.CONFLICT,
          code: 'CONFLICT',
          message: 'Could not allocate a unique invoice number. Try again.',
        });
      }
      throw error;
    }
  }

  async updateDraft(
    invoiceId: string,
    input: UpdateDraftInvoiceRequest,
    actor: AuthRequestContext,
    context: SecurityRequestContext,
  ): Promise<Invoice> {
    const current = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: { status: true, updatedAt: true },
    });
    if (!current) throw this.notFound();
    if (current.status !== InvoiceStatus.DRAFT) {
      throw new ApplicationException({
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        code: 'UNPROCESSABLE_ENTITY',
        message: 'Only a draft invoice can be edited.',
      });
    }
    const amounts = this.parseAndCalculate(input.items, input.creditTotal);
    await this.prisma.$transaction(async (transaction) => {
      const claimedDraft = await transaction.invoice.updateMany({
        where: {
          id: invoiceId,
          status: InvoiceStatus.DRAFT,
          updatedAt: current.updatedAt,
        },
        data: { updatedAt: new Date() },
      });
      if (claimedDraft.count !== 1) {
        throw this.invalidAction(
          'The invoice changed while it was being edited. Reload and try again.',
        );
      }
      await transaction.invoiceItem.deleteMany({ where: { invoiceId } });
      await transaction.invoice.update({
        where: { id: invoiceId },
        data: {
          currency: input.currency,
          dueAt: new Date(input.dueAt),
          subtotal: amounts.subtotal,
          discountTotal: amounts.discountTotal,
          taxTotal: amounts.taxTotal,
          total: amounts.total,
          creditTotal: amounts.creditTotal,
          balanceDue: amounts.balanceDue,
          items: {
            create: input.items.map((item, index) =>
              this.itemCreateData(
                item,
                input.currency,
                amounts.lineTotals[index],
                index + 1,
              ),
            ),
          },
        },
      });
      await transaction.activityLog.create({
        data: {
          actorUserId: actor.identity.userId,
          action: 'INVOICE_DRAFT_UPDATED_BY_ADMIN',
          entityType: 'INVOICE',
          entityId: invoiceId,
          ipAddressHash: context.ipAddressHash,
          metadata: { itemCount: input.items.length },
        },
      });
    });
    return this.getUnchecked(invoiceId);
  }

  async applyAction(
    invoiceId: string,
    input: InvoiceActionRequest,
    actor: AuthRequestContext,
    context: SecurityRequestContext,
  ): Promise<Invoice> {
    const current = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: {
        status: true,
        dueAt: true,
        balanceDue: true,
        amountPaid: true,
        orderId: true,
        updatedAt: true,
      },
    });
    if (!current) throw this.notFound();
    const now = new Date();
    let nextStatus: InvoiceStatus;
    try {
      nextStatus = nextInvoiceStatus({
        action: input.action,
        status: current.status,
        dueAt: current.dueAt,
        balanceDue: current.balanceDue,
        amountPaid: current.amountPaid,
        now,
      });
    } catch (error) {
      if (error instanceof InvoiceStateTransitionError) {
        throw this.invalidAction(error.message);
      }
      throw error;
    }
    const action =
      input.action === 'ISSUE'
        ? 'INVOICE_ISSUED_BY_ADMIN'
        : input.action === 'MARK_OVERDUE'
          ? 'INVOICE_MARKED_OVERDUE_BY_ADMIN'
          : 'INVOICE_CANCELLED_BY_ADMIN';
    await this.prisma.$transaction(async (transaction) => {
      const transitioned = await transaction.invoice.updateMany({
        where: {
          id: invoiceId,
          status: current.status,
          dueAt: current.dueAt,
          balanceDue: current.balanceDue,
          amountPaid: current.amountPaid,
          updatedAt: current.updatedAt,
        },
        data: {
          status: nextStatus,
          ...(input.action === 'ISSUE'
            ? {
                issuedAt: now,
                ...(nextStatus === InvoiceStatus.PAID ? { paidAt: now } : {}),
              }
            : {}),
          ...(input.action === 'CANCEL' ? { cancelledAt: now } : {}),
        },
      });
      if (transitioned.count !== 1) {
        throw this.invalidAction(
          'The invoice changed while the action was being applied. Reload and try again.',
        );
      }
      if (input.action === 'CANCEL' && current.orderId) {
        const cancelledOrders = await transaction.order.updateMany({
          where: {
            id: current.orderId,
            status: { in: [OrderStatus.PENDING, OrderStatus.AWAITING_PAYMENT] },
          },
          data: { status: OrderStatus.CANCELLED, cancelledAt: now },
        });
        if (cancelledOrders.count > 0) {
          await transaction.activityLog.create({
            data: {
              actorUserId: actor.identity.userId,
              action: 'ORDER_CANCELLED_WITH_INVOICE_BY_ADMIN',
              entityType: 'ORDER',
              entityId: current.orderId,
              ipAddressHash: context.ipAddressHash,
              metadata: { invoiceId },
            },
          });
        }
      }
      await transaction.activityLog.create({
        data: {
          actorUserId: actor.identity.userId,
          action,
          entityType: 'INVOICE',
          entityId: invoiceId,
          ipAddressHash: context.ipAddressHash,
          metadata: { previousStatus: current.status, status: nextStatus },
        },
      });
    });
    return this.getUnchecked(invoiceId);
  }

  async list(query: InvoiceListQuery): Promise<{
    data: Invoice[];
    pagination: PaginationMeta;
  }> {
    const where: Prisma.InvoiceWhereInput = {
      ...(query.customerId ? { customerId: query.customerId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              {
                invoiceNumber: { contains: query.search, mode: 'insensitive' },
              },
              {
                customerEmailSnapshot: {
                  contains: query.search,
                  mode: 'insensitive',
                },
              },
              {
                customerNameSnapshot: {
                  contains: query.search,
                  mode: 'insensitive',
                },
              },
              {
                items: {
                  some: {
                    descriptionSnapshot: {
                      contains: query.search,
                      mode: 'insensitive',
                    },
                  },
                },
              },
            ],
          }
        : {}),
    };
    const [invoices, totalItems] = await this.prisma.$transaction([
      this.prisma.invoice.findMany({
        where,
        include: invoiceInclude,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.invoice.count({ where }),
    ]);
    return {
      data: invoices.map((invoice) => this.toInvoice(invoice)),
      pagination: createPaginationMeta(query.page, query.pageSize, totalItems),
    };
  }

  async get(invoiceId: string, actor: AuthRequestContext): Promise<Invoice> {
    const invoice = await this.getRecord(invoiceId);
    if (
      actor.identity.role === 'CUSTOMER' &&
      actor.identity.customerId !== invoice.customerId
    ) {
      throw new ApplicationException({
        status: HttpStatus.FORBIDDEN,
        code: 'FORBIDDEN',
        message: 'You do not have access to this invoice.',
      });
    }
    return this.toInvoice(invoice);
  }

  private parseAndCalculate(
    items: readonly InvoiceItemInput[],
    credit: string,
  ): InvoiceTotals {
    try {
      return calculateInvoiceTotals(
        items.map((item) => ({
          quantity: item.quantity,
          unitAmount: BigInt(item.unitAmount),
          discountAmount: BigInt(item.discountAmount),
          taxAmount: BigInt(item.taxAmount),
        })),
        BigInt(credit),
      );
    } catch (error) {
      if (error instanceof InvoiceCalculationError) {
        throw new ApplicationException({
          status: HttpStatus.UNPROCESSABLE_ENTITY,
          code: 'UNPROCESSABLE_ENTITY',
          message: error.message,
        });
      }
      throw error;
    }
  }

  private itemCreateData(
    item: InvoiceItemInput,
    currency: string,
    lineTotal: bigint | undefined,
    linePosition: number,
  ) {
    if (lineTotal === undefined) throw new Error('Missing invoice line total');
    return {
      linePosition,
      descriptionSnapshot: item.description,
      currency,
      quantity: item.quantity,
      unitAmount: BigInt(item.unitAmount),
      discountAmount: BigInt(item.discountAmount),
      taxAmount: BigInt(item.taxAmount),
      lineTotal,
      servicePeriodStart: item.servicePeriodStart
        ? new Date(item.servicePeriodStart)
        : null,
      servicePeriodEnd: item.servicePeriodEnd
        ? new Date(item.servicePeriodEnd)
        : null,
    };
  }

  private async findBySubmissionKey(
    key: string,
  ): Promise<InvoiceRecord | null> {
    return this.prisma.invoice.findUnique({
      where: { submissionKey: key },
      include: invoiceInclude,
    });
  }

  private duplicateResult(
    existing: InvoiceRecord,
    input: CreateInvoiceRequest,
  ): InvoiceCreationResult {
    const storedItems = existing.items.map((item) =>
      JSON.stringify([
        item.descriptionSnapshot,
        item.quantity,
        item.unitAmount.toString(),
        item.discountAmount.toString(),
        item.taxAmount.toString(),
        item.servicePeriodStart?.toISOString() ?? null,
        item.servicePeriodEnd?.toISOString() ?? null,
      ]),
    );
    const submittedItems = input.items.map((item) =>
      JSON.stringify([
        item.description,
        item.quantity,
        item.unitAmount,
        item.discountAmount,
        item.taxAmount,
        item.servicePeriodStart
          ? new Date(item.servicePeriodStart).toISOString()
          : null,
        item.servicePeriodEnd
          ? new Date(item.servicePeriodEnd).toISOString()
          : null,
      ]),
    );
    const sameItems =
      storedItems.length === submittedItems.length &&
      storedItems.every((item, index) => item === submittedItems[index]);
    if (
      existing.customerId !== input.customerId ||
      existing.currency !== input.currency ||
      existing.dueAt.getTime() !== new Date(input.dueAt).getTime() ||
      existing.creditTotal !== BigInt(input.creditTotal) ||
      !sameItems
    ) {
      throw new ApplicationException({
        status: HttpStatus.CONFLICT,
        code: 'CONFLICT',
        message:
          'This submission key has already been used for another invoice.',
      });
    }
    return invoiceCreationResultSchema.parse({
      invoice: this.toInvoice(existing),
      duplicate: true,
    });
  }

  private async getUnchecked(invoiceId: string): Promise<Invoice> {
    return this.toInvoice(await this.getRecord(invoiceId));
  }

  private async getRecord(invoiceId: string): Promise<InvoiceRecord> {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: invoiceInclude,
    });
    if (!invoice) throw this.notFound();
    return invoice;
  }

  private toInvoice(invoice: InvoiceRecord): Invoice {
    const address = invoiceAddressSchema.parse(invoice.customerAddressSnapshot);
    const businessIdentity = this.normalizeBusinessIdentity(
      invoice.businessIdentitySnapshot,
    );
    const taxIdentity = this.normalizeTaxIdentity(invoice.taxIdentitySnapshot);
    return invoiceSchema.parse({
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      customerId: invoice.customerId,
      orderId: invoice.orderId,
      orderNumber: invoice.order?.orderNumber ?? null,
      status: invoice.status,
      currency: invoice.currency,
      subtotal: serializeMoney(invoice.subtotal, invoice.currency),
      discountTotal: serializeMoney(invoice.discountTotal, invoice.currency),
      taxTotal: serializeMoney(invoice.taxTotal, invoice.currency),
      total: serializeMoney(invoice.total, invoice.currency),
      creditTotal: serializeMoney(invoice.creditTotal, invoice.currency),
      amountPaid: serializeMoney(invoice.amountPaid, invoice.currency),
      balanceDue: serializeMoney(invoice.balanceDue, invoice.currency),
      customerName: invoice.customerNameSnapshot,
      customerEmail: invoice.customerEmailSnapshot,
      customerAddress: address,
      businessIdentity,
      taxIdentity,
      issuedAt: invoice.issuedAt?.toISOString() ?? null,
      dueAt: invoice.dueAt.toISOString(),
      paidAt: invoice.paidAt?.toISOString() ?? null,
      cancelledAt: invoice.cancelledAt?.toISOString() ?? null,
      createdAt: invoice.createdAt.toISOString(),
      updatedAt: invoice.updatedAt.toISOString(),
      items: invoice.items.map((item) => ({
        id: item.id,
        description: item.descriptionSnapshot,
        quantity: item.quantity,
        unitAmount: serializeMoney(item.unitAmount, item.currency),
        discountAmount: serializeMoney(item.discountAmount, item.currency),
        taxAmount: serializeMoney(item.taxAmount, item.currency),
        lineTotal: serializeMoney(item.lineTotal, item.currency),
        servicePeriodStart: item.servicePeriodStart?.toISOString() ?? null,
        servicePeriodEnd: item.servicePeriodEnd?.toISOString() ?? null,
      })),
    });
  }

  private normalizeBusinessIdentity(value: unknown): BusinessIdentity {
    const parsed = businessIdentitySchema.safeParse(value);
    if (parsed.success) return parsed.data;
    if (typeof value === 'object' && value !== null) {
      const record = value as Record<string, unknown>;
      if (typeof record.name === 'string' && record.name.trim()) {
        return businessIdentitySchema.parse({
          name: record.name,
          ...(typeof record.address === 'string' && record.address.trim()
            ? { addressLine1: record.address }
            : {}),
        });
      }
    }
    return { name: PROJECT_NAME };
  }

  private normalizeTaxIdentity(value: unknown) {
    if (
      typeof value === 'object' &&
      value !== null &&
      'taxIdentifier' in value &&
      typeof value.taxIdentifier === 'string' &&
      value.taxIdentifier.length > 0 &&
      value.taxIdentifier.length <= 64
    ) {
      return { taxIdentifier: value.taxIdentifier };
    }
    return null;
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'P2002'
    );
  }

  private invalidAction(message: string) {
    return new ApplicationException({
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      code: 'UNPROCESSABLE_ENTITY',
      message,
    });
  }

  private notFound() {
    return new ApplicationException({
      status: HttpStatus.NOT_FOUND,
      code: 'RESOURCE_NOT_FOUND',
      message: 'Invoice was not found.',
    });
  }
}
