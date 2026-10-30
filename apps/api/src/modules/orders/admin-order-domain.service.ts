import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { Prisma, type PrismaClient } from '@webhost-billing/database';
import {
  adminOrderDomainOptionsSchema,
  serializeMoney,
} from '@webhost-billing/shared';
import { ApplicationException } from '../../common/errors/application.exception';
import { PRISMA_CLIENT } from '../../infrastructure/database/database.module';

type Actor = {
  identity: {
    userId: string;
    role?: string;
    staffRole?: string;
    twoFactorEnabled?: boolean;
  };
};

@Injectable()
export class AdminOrderDomainService {
  constructor(@Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient) {}
  private deny(message: string, status = HttpStatus.CONFLICT): never {
    throw new ApplicationException({
      status,
      code: status === HttpStatus.FORBIDDEN ? 'FORBIDDEN' : 'CONFLICT',
      message,
    });
  }
  authorize(actor: Actor) {
    if (
      actor.identity.role !== 'ADMIN' ||
      actor.identity.staffRole !== 'FULL_ADMINISTRATOR' ||
      !actor.identity.twoFactorEnabled
    )
      this.deny(
        'A full administrator with two-factor authentication is required for domain orders.',
        HttpStatus.FORBIDDEN,
      );
  }
  async lockActor(tx: Prisma.TransactionClient, id: string) {
    await tx.$queryRaw`SELECT id FROM users WHERE id=${id}::uuid FOR UPDATE`;
    const actor = await tx.user.findUnique({
      where: { id },
      include: { adminProfile: true, adminTotpCredential: true },
    });
    if (
      !actor ||
      actor.role !== 'ADMIN' ||
      actor.status !== 'ACTIVE' ||
      actor.deletedAt ||
      actor.adminProfile?.staffRole !== 'FULL_ADMINISTRATOR' ||
      !actor.adminTotpCredential?.enabledAt
    )
      this.deny(
        'The approving administrator is no longer eligible.',
        HttpStatus.FORBIDDEN,
      );
  }
  private priceWhere(now: Date): Prisma.ProductPriceWhereInput {
    return {
      // The catalogue points to immutable price versions that deliberately stay
      // out of the general active-price list. The current TLD reference is authority.
      deletedAt: null,
      currency: 'BDT',
      billingPeriod: 'ANNUAL',
      amount: { gt: 0n },
      setupFee: 0n,
      AND: [
        { OR: [{ validFrom: null }, { validFrom: { lte: now } }] },
        { OR: [{ validUntil: null }, { validUntil: { gt: now } }] },
      ],
      product: { kind: 'DOMAIN', status: 'ACTIVE', deletedAt: null },
    };
  }
  async options(customerId: string, actor: Actor) {
    this.authorize(actor);
    const customer = await this.prisma.customer.findFirst({
      where: {
        id: customerId,
        deletedAt: null,
        status: 'ACTIVE',
        user: {
          status: 'ACTIVE',
          deletedAt: null,
          emailVerifiedAt: { not: null },
        },
      },
      select: { id: true },
    });
    if (!customer) this.deny('Select an active, email-verified client.');
    const now = new Date();
    const tlds = await this.prisma.domainCatalogueTld.findMany({
      where: { enabled: true, registrationPriceId: { not: null } },
      orderBy: { displayOrder: 'asc' },
      take: 100,
    });
    const prices = await this.prisma.productPrice.findMany({
      where: {
        ...this.priceWhere(now),
        id: {
          in: tlds.flatMap((t) =>
            t.registrationPriceId ? [t.registrationPriceId] : [],
          ),
        },
      },
      include: { product: true },
    });
    const bound = await this.prisma.existingDomainOrder.findMany({
      where: { customerId },
      select: { domainId: true },
    });
    const domains = await this.prisma.domain.findMany({
      where: {
        customerId,
        origin: 'EXISTING',
        state: 'REGISTERED',
        expiresAt: { gt: now },
        ownershipVerifiedAt: { not: null },
        id: { notIn: bound.map((x) => x.domainId) },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return adminOrderDomainOptionsSchema.parse({
      customerId,
      prices: tlds.flatMap((t) => {
        const p = prices.find(
          (p) => p.id === t.registrationPriceId && p.productId === t.productId,
        );
        return p
          ? [
              {
                tld: t.tld,
                priceId: p.id,
                name: p.product.name,
                amount: serializeMoney(p.amount, p.currency),
              },
            ]
          : [];
      }),
      domains: domains.map((d) => ({
        id: d.id,
        domainName: d.domainName,
        ownershipVerifiedAt: d.ownershipVerifiedAt!.toISOString(),
        expiresAt: d.expiresAt!.toISOString(),
      })),
    });
  }
  async existingSelection(
    tx: Prisma.TransactionClient,
    domainId: string,
    priceId: string,
    customerId: string,
    domainName: string,
  ) {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(510118)::text`;
    await tx.$queryRaw`SELECT id FROM domains WHERE id=${domainId}::uuid FOR UPDATE`;
    const domain = await tx.domain.findUnique({ where: { id: domainId } });
    const now = new Date();
    if (
      !domain ||
      domain.customerId !== customerId ||
      domain.domainName !== domainName ||
      domain.origin !== 'EXISTING' ||
      domain.state !== 'REGISTERED' ||
      !domain.ownershipVerifiedAt ||
      !domain.linkEvidenceCiphertext ||
      !domain.expiresAt ||
      domain.expiresAt <= now
    )
      this.deny(
        'Select this client’s unexpired, ownership-verified existing domain. No registration was sent.',
      );
    if (await tx.existingDomainOrder.findUnique({ where: { domainId } }))
      this.deny('This existing domain already has an initial billing order.');
    const customer = await tx.customer.findUnique({
      where: { id: customerId },
      include: { user: true },
    });
    if (!customer?.user.emailVerifiedAt)
      this.deny('Verify the client email before creating a domain order.');
    const tld = await tx.domainCatalogueTld.findFirst({
      where: {
        enabled: true,
        registrationPriceId: priceId,
        tld: domainName.split('.').at(-1),
      },
    });
    const price = await tx.productPrice.findFirst({
      where: {
        ...this.priceWhere(now),
        id: priceId,
        ...(tld ? { productId: tld.productId } : {}),
      },
      include: { product: true },
    });
    if (!tld || !price)
      this.deny(
        'The annual domain catalogue price is unavailable. Refresh the selection.',
      );
    return { domain, price };
  }
}
