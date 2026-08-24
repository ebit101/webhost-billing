import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  CustomerStatus,
  Prisma,
  UserStatus,
  type PrismaClient,
} from '@webhost-billing/database';
import {
  createPaginationMeta,
  customerDetailSchema,
  customerSummarySchema,
  serializeMoney,
  type ChangeCustomerPasswordRequest,
  type CreateCustomerRequest,
  type CustomerDetail,
  type CustomerListQuery,
  type CustomerSummary,
  type PaginationMeta,
  type UpdateCustomerAccessRequest,
  type UpdateCustomerBillingRequest,
  type UpdateCustomerProfileRequest,
} from '@webhost-billing/shared';
import { ApplicationException } from '../../common/errors/application.exception';
import type { SecurityRequestContext } from '../../common/http/request-context';
import { PRISMA_CLIENT } from '../../infrastructure/database/database.module';
import type { AuthRequestContext } from '../auth/auth.types';
import { AuthService } from '../auth/services/auth.service';
import { PasswordHasherService } from '../auth/services/password-hasher.service';

const RECENT_LINKED_RECORD_LIMIT = 10;

export function accountStatusAfterActivation(
  emailVerifiedAt: Date | null,
): UserStatus {
  return emailVerifiedAt ? UserStatus.ACTIVE : UserStatus.PENDING_VERIFICATION;
}

@Injectable()
export class CustomerService {
  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient,
    private readonly auth: AuthService,
    private readonly passwords: PasswordHasherService,
  ) {}

  async create(
    input: CreateCustomerRequest,
    actor: AuthRequestContext,
    context: SecurityRequestContext,
  ): Promise<CustomerDetail> {
    const account = await this.auth.register(input, context, {
      administratorActorUserId: actor.identity.userId,
    });
    return this.getById(account.customerId);
  }

  async list(query: CustomerListQuery): Promise<{
    data: CustomerSummary[];
    pagination: PaginationMeta;
  }> {
    const where: Prisma.CustomerWhereInput = {
      deletedAt: null,
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              {
                customerNumber: { contains: query.search, mode: 'insensitive' },
              },
              { firstName: { contains: query.search, mode: 'insensitive' } },
              { lastName: { contains: query.search, mode: 'insensitive' } },
              { companyName: { contains: query.search, mode: 'insensitive' } },
              {
                user: {
                  email: { contains: query.search, mode: 'insensitive' },
                },
              },
            ],
          }
        : {}),
    };
    const [customers, totalItems] = await this.prisma.$transaction([
      this.prisma.customer.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: {
          user: {
            select: { email: true, status: true, emailVerifiedAt: true },
          },
          _count: {
            select: {
              orders: true,
              services: true,
              invoices: true,
              tickets: true,
            },
          },
        },
      }),
      this.prisma.customer.count({ where }),
    ]);

    return {
      data: customers.map((customer) =>
        customerSummarySchema.parse({
          id: customer.id,
          customerNumber: customer.customerNumber,
          status: customer.status,
          accountStatus: customer.user.status,
          email: customer.user.email,
          emailVerified: Boolean(customer.user.emailVerifiedAt),
          firstName: customer.firstName,
          lastName: customer.lastName,
          companyName: customer.companyName,
          createdAt: customer.createdAt.toISOString(),
          linkedCounts: customer._count,
        }),
      ),
      pagination: createPaginationMeta(query.page, query.pageSize, totalItems),
    };
  }

  async getById(customerId: string): Promise<CustomerDetail> {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, deletedAt: null },
      include: {
        user: { select: { email: true, status: true, emailVerifiedAt: true } },
        orders: {
          orderBy: { createdAt: 'desc' },
          take: RECENT_LINKED_RECORD_LIMIT,
        },
        services: {
          orderBy: { createdAt: 'desc' },
          take: RECENT_LINKED_RECORD_LIMIT,
          include: { product: { select: { name: true } } },
        },
        invoices: {
          orderBy: { createdAt: 'desc' },
          take: RECENT_LINKED_RECORD_LIMIT,
        },
        tickets: {
          orderBy: { updatedAt: 'desc' },
          take: RECENT_LINKED_RECORD_LIMIT,
        },
        _count: {
          select: {
            orders: true,
            services: true,
            invoices: true,
            tickets: true,
          },
        },
      },
    });
    if (!customer) throw this.notFound();

    const [payments, paymentCount] = await this.prisma.$transaction([
      this.prisma.payment.findMany({
        where: { invoice: { customerId } },
        orderBy: { createdAt: 'desc' },
        take: RECENT_LINKED_RECORD_LIMIT,
        include: { invoice: { select: { invoiceNumber: true } } },
      }),
      this.prisma.payment.count({ where: { invoice: { customerId } } }),
    ]);

    return customerDetailSchema.parse({
      id: customer.id,
      customerNumber: customer.customerNumber,
      status: customer.status,
      accountStatus: customer.user.status,
      email: customer.user.email,
      emailVerified: Boolean(customer.user.emailVerifiedAt),
      firstName: customer.firstName,
      lastName: customer.lastName,
      companyName: customer.companyName,
      phone: customer.phone,
      addressLine1: customer.addressLine1,
      addressLine2: customer.addressLine2,
      city: customer.city,
      region: customer.region,
      postalCode: customer.postalCode,
      countryCode: customer.countryCode,
      taxIdentifier: customer.taxIdentifier,
      createdAt: customer.createdAt.toISOString(),
      updatedAt: customer.updatedAt.toISOString(),
      linked: {
        orders: customer.orders.map((order) => ({
          id: order.id,
          status: order.status,
          total: serializeMoney(order.total, order.currency),
          createdAt: order.createdAt.toISOString(),
        })),
        services: customer.services.map((service) => ({
          id: service.id,
          status: service.status,
          productName: service.product.name,
          domain: service.domain,
          recurringAmount: serializeMoney(
            service.recurringAmount,
            service.currency,
          ),
          createdAt: service.createdAt.toISOString(),
        })),
        invoices: customer.invoices.map((invoice) => ({
          id: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          status: invoice.status,
          total: serializeMoney(invoice.total, invoice.currency),
          balanceDue: serializeMoney(invoice.balanceDue, invoice.currency),
          dueAt: invoice.dueAt.toISOString(),
          createdAt: invoice.createdAt.toISOString(),
        })),
        payments: payments.map((payment) => ({
          id: payment.id,
          invoiceId: payment.invoiceId,
          invoiceNumber: payment.invoice.invoiceNumber,
          kind: payment.kind,
          status: payment.status,
          provider: payment.provider,
          amount: serializeMoney(payment.amount, payment.currency),
          createdAt: payment.createdAt.toISOString(),
        })),
        tickets: customer.tickets.map((ticket) => ({
          id: ticket.id,
          ticketNumber: ticket.ticketNumber,
          subject: ticket.subject,
          status: ticket.status,
          priority: ticket.priority,
          createdAt: ticket.createdAt.toISOString(),
          updatedAt: ticket.updatedAt.toISOString(),
        })),
        counts: { ...customer._count, payments: paymentCount },
      },
    });
  }

  async updateProfile(
    customerId: string,
    input: UpdateCustomerProfileRequest,
    actor: AuthRequestContext,
    context: SecurityRequestContext,
  ): Promise<CustomerDetail> {
    await this.assertExists(customerId);
    await this.prisma.$transaction([
      this.prisma.customer.update({ where: { id: customerId }, data: input }),
      this.prisma.activityLog.create({
        data: {
          actorUserId: actor.identity.userId,
          action:
            actor.identity.role === 'ADMIN'
              ? 'CUSTOMER_PROFILE_UPDATED_BY_ADMIN'
              : 'CUSTOMER_PROFILE_UPDATED',
          entityType: 'CUSTOMER',
          entityId: customerId,
          ipAddressHash: context.ipAddressHash,
          metadata: { changedFields: Object.keys(input).sort() },
        },
      }),
    ]);
    return this.getById(customerId);
  }

  async updateBilling(
    customerId: string,
    input: UpdateCustomerBillingRequest,
    actor: AuthRequestContext,
    context: SecurityRequestContext,
  ): Promise<CustomerDetail> {
    await this.assertExists(customerId);
    await this.prisma.$transaction([
      this.prisma.customer.update({ where: { id: customerId }, data: input }),
      this.prisma.activityLog.create({
        data: {
          actorUserId: actor.identity.userId,
          action: 'CUSTOMER_BILLING_UPDATED_BY_ADMIN',
          entityType: 'CUSTOMER',
          entityId: customerId,
          ipAddressHash: context.ipAddressHash,
          metadata: { changedFields: Object.keys(input).sort() },
        },
      }),
    ]);
    return this.getById(customerId);
  }

  async updateAccess(
    customerId: string,
    input: UpdateCustomerAccessRequest,
    actor: AuthRequestContext,
    context: SecurityRequestContext,
  ): Promise<CustomerDetail> {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, deletedAt: null },
      include: { user: { select: { id: true, emailVerifiedAt: true } } },
    });
    if (!customer) throw this.notFound();

    const now = new Date();
    const userStatus = input.active
      ? accountStatusAfterActivation(customer.user.emailVerifiedAt)
      : UserStatus.DISABLED;
    await this.prisma.$transaction(async (transaction) => {
      await transaction.customer.update({
        where: { id: customerId },
        data: {
          status: input.active
            ? CustomerStatus.ACTIVE
            : CustomerStatus.INACTIVE,
        },
      });
      await transaction.user.update({
        where: { id: customer.user.id },
        data: { status: userStatus },
      });
      if (!input.active) {
        await transaction.authSession.updateMany({
          where: { userId: customer.user.id, revokedAt: null },
          data: { revokedAt: now, revokedReason: 'ADMIN_ACCESS_DEACTIVATED' },
        });
      }
      await transaction.activityLog.create({
        data: {
          actorUserId: actor.identity.userId,
          action: input.active
            ? 'CUSTOMER_ACCESS_ACTIVATED_BY_ADMIN'
            : 'CUSTOMER_ACCESS_DEACTIVATED_BY_ADMIN',
          entityType: 'CUSTOMER',
          entityId: customerId,
          ipAddressHash: context.ipAddressHash,
          metadata: { accountStatus: userStatus },
        },
      });
    });
    return this.getById(customerId);
  }

  async changePassword(
    customerId: string,
    input: ChangeCustomerPasswordRequest,
    actor: AuthRequestContext,
    context: SecurityRequestContext,
  ): Promise<void> {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, deletedAt: null },
      include: { user: { select: { id: true, passwordHash: true } } },
    });
    if (!customer?.user.passwordHash) throw this.notFound();
    if (
      !(await this.passwords.verify(
        customer.user.passwordHash,
        input.currentPassword,
      ))
    ) {
      throw new ApplicationException({
        status: HttpStatus.UNAUTHORIZED,
        code: 'INVALID_CREDENTIALS',
        message: 'Current password is incorrect.',
      });
    }
    const passwordHash = await this.passwords.hash(input.newPassword);
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: customer.user.id },
        data: { passwordHash },
      }),
      this.prisma.authSession.updateMany({
        where: { userId: customer.user.id, revokedAt: null },
        data: { revokedAt: now, revokedReason: 'PASSWORD_CHANGED' },
      }),
      this.prisma.activityLog.create({
        data: {
          actorUserId: actor.identity.userId,
          action: 'CUSTOMER_PASSWORD_CHANGED',
          entityType: 'CUSTOMER',
          entityId: customerId,
          ipAddressHash: context.ipAddressHash,
        },
      }),
    ]);
  }

  private async assertExists(customerId: string): Promise<void> {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, deletedAt: null },
      select: { id: true },
    });
    if (!customer) throw this.notFound();
  }

  private notFound(): ApplicationException {
    return new ApplicationException({
      status: HttpStatus.NOT_FOUND,
      code: 'RESOURCE_NOT_FOUND',
      message: 'Customer was not found.',
    });
  }
}
