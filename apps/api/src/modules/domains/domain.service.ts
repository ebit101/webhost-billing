import { createHash, randomUUID } from 'node:crypto';
import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { ApiEnvironment } from '@webhost-billing/config';
import { Prisma, type PrismaClient } from '@webhost-billing/database';
import {
  FakeDomainRegistrar,
  RegistrarCipher,
  credentialBinding,
  contactBinding,
  lockDomainInvoice,
  verifiedDomainInvoice,
} from '@webhost-billing/database/registrar';
import {
  PROJECT_NAME,
  domainDetailSchema,
  fakeRegistrarSettingsSchema,
  domainOfferSchema,
  domainQuoteSchema,
  type DomainQuoteRequest,
  type DomainPurchaseRequest,
  type DomainApprovalRequest,
} from '@webhost-billing/shared';
import { ApplicationException } from '../../common/errors/application.exception';
import { allocateInvoiceNumber } from '../../common/identifiers/invoice-number';
import { createHumanReadableNumber } from '../../common/identifiers/business-number';
import { PRISMA_CLIENT } from '../../infrastructure/database/database.module';
import { API_ENVIRONMENT } from '../../infrastructure/environment/environment.module';
import type { AuthRequestContext } from '../auth/auth.types';

@Injectable()
export class DomainService {
  private readonly simulationAllowed: boolean;
  private readonly cipher: RegistrarCipher;
  private readonly provider: FakeDomainRegistrar;
  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient,
    @Inject(API_ENVIRONMENT) environment: ApiEnvironment,
  ) {
    this.simulationAllowed = environment.NODE_ENV !== 'production';
    this.cipher = new RegistrarCipher(environment.CREDENTIAL_ENCRYPTION_KEY);
    this.provider = new FakeDomainRegistrar(prisma);
  }
  private requireSimulation(): void {
    if (!this.simulationAllowed)
      this.deny(
        'Simulated registrar writes are disabled in production.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
  }
  private deny(message: string, status = HttpStatus.CONFLICT): never {
    throw new ApplicationException({
      status,
      code: status === HttpStatus.FORBIDDEN ? 'FORBIDDEN' : 'CONFLICT',
      message,
    });
  }
  private administrator(auth: AuthRequestContext): void {
    if (
      auth.identity.role !== 'ADMIN' ||
      auth.identity.staffRole !== 'FULL_ADMINISTRATOR' ||
      !auth.identity.twoFactorEnabled
    )
      this.deny(
        'A full administrator with two-factor authentication is required.',
        HttpStatus.FORBIDDEN,
      );
  }
  private customer(auth: AuthRequestContext): string {
    if (auth.identity.role !== 'CUSTOMER')
      this.deny(
        'Sign in as the customer to accept the fictional registration agreement.',
        HttpStatus.FORBIDDEN,
      );
    return auth.identity.customerId;
  }
  async settings() {
    const accounts = await this.prisma.registrarAccount.findMany({
      orderBy: { createdAt: 'asc' },
      take: 10,
    });
    return accounts.map((account) =>
      fakeRegistrarSettingsSchema.parse({
        id: account.id,
        brand: 'StarGate/UK2 (resell.biz)',
        mode: 'Simulated',
        enabled: account.enabled,
        networkEnabled: false,
        credentials: 'No external credentials configured',
      }),
    );
  }
  async setup(sellingAmount: string, auth: AuthRequestContext) {
    this.requireSimulation();
    this.administrator(auth);
    const existing = await this.prisma.registrarAccount.findFirst();
    if (existing) return this.settings();
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(500050)::text`;
      if (await tx.registrarAccount.count()) return;
      const account = await tx.registrarAccount.create({
        data: { enabled: true },
      });
      await tx.registrarCredential.create({
        data: {
          accountId: account.id,
          version: 1,
          ciphertext: this.cipher.encrypt(credentialBinding(account.id, 1), {
            simulated: true,
            identity: account.id,
          }),
        },
      });
      for (const tld of ['com', 'net']) {
        const product = await tx.product.create({
          data: {
            kind: 'DOMAIN',
            slug: `simulated-domain-${tld}`,
            name: `Simulated .${tld} domain registration`,
            status: 'ACTIVE',
            publicVisible: true,
            prices: {
              create: {
                billingPeriod: 'ANNUAL',
                currency: 'BDT',
                amount: BigInt(sellingAmount),
                setupFee: 0n,
              },
            },
          },
          include: { prices: true },
        });
        const price = product.prices[0];
        if (!price) throw new Error('Domain offer price missing.');
        await tx.domainOffer.create({
          data: {
            accountId: account.id,
            productId: product.id,
            priceId: price.id,
            tld,
            nameservers: ['ns1.example.test', 'ns2.example.test'],
          },
        });
      }
      await tx.activityLog.create({
        data: {
          actorUserId: auth.identity.userId,
          action: 'FAKE_REGISTRAR_ENABLED',
          entityType: 'REGISTRAR',
          entityId: account.id,
          metadata: { networkEnabled: false },
        },
      });
    });
    return this.settings();
  }
  async toggle(id: string, enabled: boolean, auth: AuthRequestContext) {
    this.requireSimulation();
    this.administrator(auth);
    await this.prisma.registrarAccount.update({
      where: { id },
      data: { enabled },
    });
    await this.prisma.activityLog.create({
      data: {
        actorUserId: auth.identity.userId,
        action: enabled ? 'FAKE_REGISTRAR_ENABLED' : 'REGISTRAR_DISABLED',
        entityType: 'REGISTRAR',
        entityId: id,
      },
    });
    return this.settings();
  }
  async offers() {
    if (!this.simulationAllowed) return [];
    const offers = await this.prisma.domainOffer.findMany({ take: 20 });
    const result = [];
    for (const offer of offers) {
      const account = await this.prisma.registrarAccount.findUniqueOrThrow({
        where: { id: offer.accountId },
      });
      const price = await this.prisma.productPrice.findUniqueOrThrow({
        where: { id: offer.priceId },
        include: { product: true },
      });
      if (
        !account.enabled ||
        account.mode !== 'FAKE' ||
        !price.isActive ||
        price.deletedAt ||
        price.product.status !== 'ACTIVE' ||
        price.product.deletedAt ||
        !price.product.publicVisible
      )
        continue;
      result.push(
        domainOfferSchema.parse({
          id: offer.id,
          tld: offer.tld,
          years: 1,
          sellingAmount: price.amount.toString(),
          currency: 'BDT',
          nameservers: offer.nameservers,
          simulated: true,
          costAmount: (
            await this.provider.quote(`ordinary-example.${offer.tld}`)
          ).costAmount.toString(),
          costCurrency: 'USD',
          observedAt: new Date().toISOString(),
        }),
      );
    }
    return result;
  }
  async quote(input: DomainQuoteRequest, auth: AuthRequestContext) {
    this.requireSimulation();
    const customerId = this.customer(auth);
    const offer = await this.prisma.domainOffer.findUnique({
      where: { id: input.offerId },
    });
    if (!offer || !input.domainName.endsWith(`.${offer.tld}`))
      this.deny('Select a matching supported domain offer.');
    const account = await this.prisma.registrarAccount.findUniqueOrThrow({
      where: { id: offer.accountId },
    });
    if (!account.enabled || account.mode !== 'FAKE')
      this.deny('The simulated registrar is disabled.');
    const price = await this.prisma.productPrice.findUniqueOrThrow({
      where: { id: offer.priceId },
      include: { product: true },
    });
    if (
      !price.isActive ||
      price.deletedAt ||
      price.currency !== 'BDT' ||
      price.amount <= 0n ||
      price.setupFee !== 0n ||
      price.product.kind !== 'DOMAIN' ||
      price.product.status !== 'ACTIVE' ||
      !price.product.publicVisible ||
      price.product.deletedAt
    )
      this.deny('This domain offer is unavailable.');
    const cost = await this.provider.quote(input.domainName);
    if (!cost.available) this.deny('The simulated domain is unavailable.');
    const now = new Date();
    const quote = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM customers WHERE id=${customerId}::uuid FOR UPDATE`;
      const customer = await tx.customer.findUniqueOrThrow({
        where: { id: customerId },
        include: { user: true },
      });
      if (
        customer.status !== 'ACTIVE' ||
        customer.deletedAt ||
        customer.user.status !== 'ACTIVE' ||
        customer.user.deletedAt
      )
        this.deny('The customer account is inactive.');
      const recent = await tx.domainQuote.count({
        where: { customerId, createdAt: { gt: new Date(Date.now() - 600000) } },
      });
      if (recent >= 10)
        this.deny('Please wait before requesting more simulated quotes.');
      return tx.domainQuote.create({
        data: {
          customerId,
          accountId: account.id,
          offerId: offer.id,
          domainName: input.domainName,
          sellingAmount: price.amount,
          costAmount: cost.costAmount,
          costCurrency: cost.costCurrency,
          agreement: input.agreement,
          nameservers: offer.nameservers as Prisma.InputJsonValue,
          contactCiphertext: this.cipher.encrypt(
            contactBinding(account.id, customerId),
            input.contact,
          ),
          fingerprint: createHash('sha256')
            .update(`stargate:FAKE:Contact:${account.id}:${customerId}:`)
            .update(JSON.stringify(input.contact))
            .digest('hex'),
          expiresAt: new Date(now.getTime() + 300000),
        },
      });
    });
    return domainQuoteSchema.parse({
      id: quote.id,
      domainName: quote.domainName,
      sellingAmount: quote.sellingAmount.toString(),
      currency: 'BDT',
      costAmount: quote.costAmount.toString(),
      costCurrency: quote.costCurrency,
      expiresAt: quote.expiresAt.toISOString(),
      simulated: true,
    });
  }
  async purchase(input: DomainPurchaseRequest, auth: AuthRequestContext) {
    this.requireSimulation();
    const customerId = this.customer(auth);
    try {
      const id = await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM domain_quotes WHERE id=${input.quoteId}::uuid FOR UPDATE`;
        const prior = await tx.domain.findUnique({
          where: { submissionKey: input.submissionKey },
        });
        if (prior) {
          if (
            prior.customerId !== customerId ||
            prior.quoteId !== input.quoteId
          )
            this.deny('This submission key belongs to a different request.');
          return prior.id;
        }
        const quote = await tx.domainQuote.findUnique({
          where: { id: input.quoteId },
        });
        if (!quote || quote.customerId !== customerId)
          this.deny(
            'This quote is not available to your account.',
            HttpStatus.FORBIDDEN,
          );
        if (quote.expiresAt <= new Date())
          this.deny('The quote expired. Request a new quote explicitly.');
        const offer = await tx.domainOffer.findUniqueOrThrow({
          where: { id: quote.offerId },
        });
        const account = await tx.registrarAccount.findUniqueOrThrow({
          where: { id: quote.accountId },
        });
        const price = await tx.productPrice.findUniqueOrThrow({
          where: { id: offer.priceId },
          include: { product: true },
        });
        const customer = await tx.customer.findUniqueOrThrow({
          where: { id: customerId },
          include: { user: true },
        });
        if (
          !account.enabled ||
          account.mode !== 'FAKE' ||
          !price.isActive ||
          price.deletedAt ||
          price.product.deletedAt ||
          price.product.status !== 'ACTIVE' ||
          !price.product.publicVisible ||
          price.amount !== quote.sellingAmount ||
          customer.status !== 'ACTIVE' ||
          customer.deletedAt ||
          customer.user.status !== 'ACTIVE' ||
          customer.user.deletedAt
        )
          this.deny('The offer or customer changed. Request a new quote.');
        const now = new Date();
        const order = await tx.order.create({
          data: {
            orderNumber: createHumanReadableNumber('ORD', now),
            submissionKey: `domain:${input.submissionKey}`,
            customerId,
            status: 'AWAITING_PAYMENT',
            currency: 'BDT',
            subtotal: quote.sellingAmount,
            total: quote.sellingAmount,
            customerEmailSnapshot: customer.user.email,
            items: {
              create: {
                kind: 'DOMAIN',
                productId: price.productId,
                productPriceId: price.id,
                productNameSnapshot: price.product.name,
                descriptionSnapshot:
                  'Simulated one-year domain registration; no external calls or charges.',
                billingPeriod: 'ANNUAL',
                currency: 'BDT',
                unitAmount: quote.sellingAmount,
                lineTotal: quote.sellingAmount,
                requestedDomain: quote.domainName,
              },
            },
          },
          include: { items: true },
        });
        const item = order.items[0];
        if (!item) throw new Error('Domain order item missing.');
        const business = await tx.setting.findUnique({
          where: { key: 'business.identity' },
        });
        const invoice = await tx.invoice.create({
          data: {
            invoiceNumber: await allocateInvoiceNumber(tx),
            submissionKey: `invoice:domain:${input.submissionKey}`,
            customerId,
            orderId: order.id,
            status: 'UNPAID',
            currency: 'BDT',
            subtotal: quote.sellingAmount,
            total: quote.sellingAmount,
            balanceDue: quote.sellingAmount,
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
            businessIdentitySnapshot: business?.value ?? { name: PROJECT_NAME },
            ...(customer.taxIdentifier
              ? {
                  taxIdentitySnapshot: {
                    taxIdentifier: customer.taxIdentifier,
                  },
                }
              : {}),
            issuedAt: now,
            dueAt: now,
            items: {
              create: {
                orderItemId: item.id,
                linePosition: 1,
                descriptionSnapshot: `Simulated registration of ${quote.domainName} for one year`,
                currency: 'BDT',
                quantity: 1,
                unitAmount: quote.sellingAmount,
                lineTotal: quote.sellingAmount,
              },
            },
          },
        });
        const domain = await tx.domain.create({
          data: {
            quoteId: quote.id,
            customerId,
            accountId: account.id,
            orderItemId: item.id,
            invoiceId: invoice.id,
            domainName: quote.domainName,
            submissionKey: input.submissionKey,
          },
        });
        await tx.activityLog.create({
          data: {
            actorUserId: auth.identity.userId,
            action: 'SIMULATED_DOMAIN_ORDER_CREATED',
            entityType: 'DOMAIN',
            entityId: domain.id,
          },
        });
        return domain.id;
      });
      return this.detail(id, auth);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const prior = await this.prisma.domain.findUnique({
          where: { submissionKey: input.submissionKey },
        });
        if (prior?.customerId === customerId && prior.quoteId === input.quoteId)
          return this.detail(prior.id, auth);
        this.deny('The domain or quote already has a registration request.');
      }
      throw error;
    }
  }
  async list(auth: AuthRequestContext) {
    const records = await this.prisma.domain.findMany({
      where:
        auth.identity.role === 'CUSTOMER'
          ? { customerId: auth.identity.customerId }
          : {},
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 100,
    });
    return Promise.all(records.map((record) => this.detail(record.id, auth)));
  }
  async detail(id: string, auth: AuthRequestContext) {
    const domain = await this.prisma.domain.findUnique({ where: { id } });
    if (
      !domain ||
      (auth.identity.role === 'CUSTOMER' &&
        domain.customerId !== auth.identity.customerId)
    )
      this.deny('The domain request is unavailable.', HttpStatus.FORBIDDEN);
    const invoice = await this.prisma.invoice.findUniqueOrThrow({
      where: { id: domain.invoiceId },
    });
    const item = await this.prisma.orderItem.findUniqueOrThrow({
      where: { id: domain.orderItemId },
    });
    const quote = await this.prisma.domainQuote.findUniqueOrThrow({
      where: { id: domain.quoteId },
    });
    const operation = await this.prisma.registrarOperation.findUnique({
      where: { domainId: id },
    });
    return domainDetailSchema.parse({
      id,
      domainName: domain.domainName,
      state:
        domain.state === 'AWAITING_PAYMENT' && invoice.status === 'PAID'
          ? 'AWAITING_APPROVAL'
          : domain.state,
      verification: domain.verification,
      expiresAt: domain.expiresAt?.toISOString() ?? null,
      simulated: true,
      autoRenew: false,
      registrar: 'StarGate/UK2 (resell.biz)',
      registrationYears: 1,
      requestedAt: domain.createdAt.toISOString(),
      sellingAmount: quote.sellingAmount.toString(),
      financialAttention: [
        'REFUNDED',
        'PARTIALLY_REFUNDED',
        'CANCELLED',
      ].includes(invoice.status),
      invoiceId: invoice.id,
      invoiceStatus: invoice.status,
      orderId: item.orderId,
      balanceDue: invoice.balanceDue.toString(),
      currency: invoice.currency,
      nameservers: quote.nameservers,
      agreement: quote.agreement,
      ...(auth.identity.role === 'ADMIN'
        ? {
            customerId: domain.customerId,
            accountId: domain.accountId,
            costAmount: quote.costAmount.toString(),
            costCurrency: quote.costCurrency,
            contact: this.cipher.decrypt(
              contactBinding(domain.accountId, domain.customerId),
              quote.contactCiphertext,
            ),
            operationId: operation?.id ?? null,
            dispatchClaimed: Boolean(operation?.claimedAt),
            evidence: operation
              ? await this.prisma.registrarEvidence
                  .findMany({
                    where: { operationId: operation.id },
                    orderBy: { createdAt: 'asc' },
                    select: { code: true, createdAt: true },
                    take: 100,
                  })
                  .then((records) =>
                    records.map((record) => ({
                      ...record,
                      createdAt: record.createdAt.toISOString(),
                    })),
                  )
              : [],
          }
        : {}),
    });
  }
  async approve(
    id: string,
    input: DomainApprovalRequest,
    auth: AuthRequestContext,
  ) {
    this.requireSimulation();
    this.administrator(auth);
    const domain = await this.prisma.domain.findUniqueOrThrow({
      where: { id },
    });
    if (input.confirmation !== domain.domainName)
      this.deny('Type the exact domain name to approve.');
    const cost = await this.provider.quote(domain.domainName);
    if (!cost.available || cost.costAmount > BigInt(input.costCeiling))
      this.deny('Availability or the approved native cost ceiling changed.');
    await this.prisma.$transaction(async (tx) => {
      await lockDomainInvoice(tx, domain.invoiceId);
      await tx.$queryRaw`SELECT id FROM domains WHERE id=${id}::uuid FOR UPDATE`;
      const current = await tx.domain.findUniqueOrThrow({ where: { id } });
      const account = await tx.registrarAccount.findUniqueOrThrow({
        where: { id: current.accountId },
      });
      if (!account.enabled || account.mode !== 'FAKE')
        this.deny('The simulated registrar is disabled.');
      if (
        !(await verifiedDomainInvoice(
          tx,
          current.invoiceId,
          current.customerId,
        ))
      )
        this.deny('A fully verified, unadjusted BDT payment is required.');
      const prior = await tx.registrarOperation.findUnique({
        where: { domainId: id },
      });
      if (prior?.claimedAt)
        this.deny(
          'This operation is already claimed. Use read-only reconciliation.',
        );
      const credential = await tx.registrarCredential.findFirstOrThrow({
        where: { accountId: account.id },
        orderBy: { version: 'desc' },
      });
      const operation =
        prior ??
        (await tx.registrarOperation.create({
          data: {
            domainId: id,
            customerId: current.customerId,
            accountId: account.id,
            credentialId: credential.id,
            actorUserId: auth.identity.userId,
            costCeiling: BigInt(input.costCeiling),
          },
        }));
      if (operation.costCeiling !== BigInt(input.costCeiling))
        this.deny(
          'The approved cost ceiling cannot be changed on an existing operation.',
        );
      await tx.domain.update({ where: { id }, data: { state: 'PENDING' } });
      await tx.registrarEvidence.create({
        data: { operationId: operation.id, code: 'FULL_ADMIN_MFA_APPROVED' },
      });
      await tx.outboxEvent.create({
        data: {
          aggregateType: 'REGISTRAR_OPERATION',
          aggregateId: operation.id,
          eventType: 'DOMAIN_REGISTRATION_REQUESTED',
          idempotencyKey: `domain-registration:${operation.id}:${randomUUID()}`,
          payload: { schemaVersion: 1, operationId: operation.id },
        },
      });
    });
    return this.detail(id, auth);
  }
  async reconcile(id: string, auth: AuthRequestContext) {
    this.requireSimulation();
    this.administrator(auth);
    const operation = await this.prisma.registrarOperation.findUnique({
      where: { domainId: id },
    });
    if (!operation?.claimedAt)
      this.deny(
        'Only a claimed operation can be reconciled; this action cannot register.',
      );
    if (operation.pollCount >= 10 || operation.nextPollAt > new Date())
      this.deny(
        'The read-only polling budget is exhausted or not yet available.',
      );
    await this.prisma.outboxEvent.create({
      data: {
        aggregateType: 'REGISTRAR_OPERATION',
        aggregateId: operation.id,
        eventType: 'DOMAIN_REGISTRATION_RECONCILE',
        idempotencyKey: `domain-reconcile:${operation.id}:${randomUUID()}`,
        payload: { schemaVersion: 1, operationId: operation.id },
      },
    });
    return this.detail(id, auth);
  }
}
