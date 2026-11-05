import { createHash } from 'node:crypto';
import type { Prisma } from '@webhost-billing/database';
import {
  readHostingProvisioningMode,
  serializeMoney,
  type HostingPlanChangeQuoteInput,
} from '@webhost-billing/shared';
import { nextServiceDueAt } from './service-period';

export const pendingUpgradeStates = [
  'REQUESTED',
  'APPLYING',
  'REVIEW_REQUIRED',
];
export function upgradeOperationKey(id: string, attempt: number): string {
  const hash = createHash('sha256')
    .update(`hosting-upgrade:${id}:${attempt}`)
    .digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}
export async function upgradeContext(
  db: Prisma.TransactionClient,
  serviceId: string,
  targetPriceId: string,
  at: Date,
  ignoreUpgradeId?: string,
) {
  const service = await db.service.findUniqueOrThrow({
    where: { id: serviceId },
    include: {
      server: true,
      customer: { include: { user: true } },
      orderItem: true,
    },
  });
  const target = await db.productPrice.findUniqueOrThrow({
    where: { id: targetPriceId },
    include: { product: true },
  });
  const invoiceInclude = {
    payments: {
      select: { kind: true, status: true, amount: true, verifiedAt: true },
    },
  } satisfies Prisma.InvoiceInclude;
  const renewals = await db.invoiceItem.findMany({
    where: {
      serviceId,
      servicePeriodStart: { lte: at },
      servicePeriodEnd: { gt: at },
      invoice: { status: 'PAID', customerId: service.customerId },
    },
    include: { invoice: { include: invoiceInclude } },
  });
  const initialEnd = nextServiceDueAt(
    service.startedAt,
    service.billingPeriod as 'MONTHLY' | 'QUARTERLY' | 'ANNUAL',
  );
  const initial =
    service.orderItem && service.startedAt <= at && at < initialEnd
      ? await db.invoice.findMany({
          where: {
            orderId: service.orderItem.orderId,
            status: 'PAID',
            customerId: service.customerId,
            items: { some: { orderItemId: service.orderItem.id } },
          },
          include: invoiceInclude,
        })
      : [];
  const candidates = [
    ...renewals.map((line) => ({
      invoice: line.invoice,
      start: line.servicePeriodStart!,
      end: line.servicePeriodEnd!,
      amount: line.unitAmount,
      clean:
        line.quantity === 1 &&
        line.discountAmount === 0n &&
        line.taxAmount === 0n &&
        line.lineTotal === line.unitAmount,
    })),
    ...initial.map((invoice) => ({
      invoice,
      start: service.startedAt,
      end: initialEnd,
      amount: service.orderItem!.unitAmount,
      clean: true,
    })),
  ];
  const coverage = candidates.length === 1 ? candidates[0] : undefined;
  let sourceInvoice = coverage?.invoice;
  if (sourceInvoice) {
    await db.$queryRaw`SELECT id FROM invoices WHERE id = ${sourceInvoice.id}::uuid FOR UPDATE`;
    sourceInvoice = await db.invoice.findUniqueOrThrow({
      where: { id: sourceInvoice.id },
      include: invoiceInclude,
    });
  }
  const paid = Boolean(
    coverage?.clean &&
    sourceInvoice &&
    sourceInvoice.balanceDue === 0n &&
    sourceInvoice.amountPaid === sourceInvoice.total &&
    sourceInvoice.payments
      .filter(
        (payment) =>
          payment.kind === 'CHARGE' &&
          payment.status === 'SUCCEEDED' &&
          payment.verifiedAt,
      )
      .reduce((sum, payment) => sum + payment.amount, 0n) ===
      sourceInvoice.amountPaid &&
    sourceInvoice.creditTotal === 0n &&
    sourceInvoice.taxTotal === 0n &&
    sourceInvoice.discountTotal === 0n &&
    sourceInvoice.currency === service.currency &&
    coverage.amount === service.recurringAmount &&
    sourceInvoice.payments.every(
      (payment) => payment.kind === 'CHARGE' || payment.status !== 'SUCCEEDED',
    ),
  );
  const periodStart = coverage?.start ?? service.startedAt;
  const periodEnd = coverage?.end ?? initialEnd;
  const own = ignoreUpgradeId
    ? await db.serviceUpgrade.findUnique({ where: { id: ignoreUpgradeId } })
    : null;
  const related = {
    OR: [
      { items: { some: { serviceId } } },
      ...(service.orderItem ? [{ orderId: service.orderItem.orderId }] : []),
    ],
  };
  const invoices = await db.invoice.findMany({
    where: {
      ...related,
      hostingUpgrade: { isNot: { status: 'CANCELLED' } },
      id: own?.invoiceId ? { not: own.invoiceId } : undefined,
      status: { not: 'CANCELLED' },
    },
    include: {
      items: { select: { servicePeriodStart: true } },
      payments: { select: { status: true } },
    },
  });
  const financial = invoices.some(
    (invoice) =>
      invoice.status !== 'PAID' ||
      invoice.balanceDue > 0n ||
      invoice.creditTotal > 0n ||
      invoice.discountTotal > 0n ||
      invoice.taxTotal > 0n ||
      invoice.payments.some((p) => p.status === 'PENDING') ||
      invoice.items.some(
        (item) =>
          item.servicePeriodStart && item.servicePeriodStart >= periodEnd,
      ),
  );
  const addOns = service.orderItem
    ? await db.orderItem.findMany({
        where: { orderId: service.orderItem.orderId, kind: 'ADD_ON' },
        include: { product: { include: { eligibleHostingPlans: true } } },
        orderBy: { id: 'asc' },
      })
    : [];
  const addOnsCompatible = addOns.every(
    (item) =>
      item.fulfilledAt &&
      (item.billingPeriod === 'ONE_TIME' ||
        item.product.eligibleHostingPlans.some(
          (pair) => pair.hostingProductId === target.productId,
        )),
  );
  const [pending, completed, cancellation, uncertain] = await Promise.all([
    db.serviceUpgrade.count({
      where: {
        serviceId,
        status: { in: pendingUpgradeStates },
        ...(ignoreUpgradeId ? { id: { not: ignoreUpgradeId } } : {}),
      },
    }),
    db.serviceUpgrade.count({
      where: {
        serviceId,
        status: 'COMPLETED',
        quote: {
          path: ['paidPeriod', 'endAt'],
          equals: periodEnd.toISOString(),
        },
      },
    }),
    db.hostingCancellationRequest.count({
      where: { serviceId, status: { in: ['OPEN', 'COMPLETED'] } },
    }),
    db.hostingPanelOperation.count({
      where: {
        serviceId,
        status: { in: ['RUNNING', 'INCONSISTENT'] },
        ...(own?.operationId ? { id: { not: own.operationId } } : {}),
        OR: [
          { upgradeResult: { is: null } },
          { upgradeResult: { is: { status: { not: 'COMPLETED' } } } },
        ],
      },
    }),
  ]);
  const provisioning = service.provisioningSnapshot;
  const packageIdentifier =
    service.currentPackageIdentifier ??
    (provisioning &&
    typeof provisioning === 'object' &&
    !Array.isArray(provisioning) &&
    typeof provisioning.hostingPackageIdentifier === 'string'
      ? provisioning.hostingPackageIdentifier
      : '');
  const now = new Date();
  const activeTarget =
    target.product.kind === 'HOSTING' &&
    target.product.status === 'ACTIVE' &&
    target.isActive &&
    (!target.validFrom || target.validFrom <= now) &&
    (!target.validUntil || target.validUntil > now);
  const input: HostingPlanChangeQuoteInput = {
    serviceId,
    serviceUpdatedAt: service.updatedAt.toISOString(),
    baseCurrency: service.currency,
    change: 'UPGRADE',
    quotedAt: at.toISOString(),
    paidPeriod: {
      startAt: periodStart.toISOString(),
      endAt: periodEnd.toISOString(),
      invoiceId: sourceInvoice?.id ?? service.id,
    },
    current: {
      productId: service.productId,
      priceId: service.productPriceId,
      name: service.productNameSnapshot,
      recurringAmount: serializeMoney(
        service.recurringAmount,
        service.currency,
      ),
      billingPeriod: service.billingPeriod as
        'MONTHLY' | 'QUARTERLY' | 'ANNUAL',
      serverId: service.serverId,
      adapterKey: service.server.adapterKey,
      packageIdentifier: packageIdentifier || 'unverified',
    },
    target: {
      productId: target.productId,
      priceId: target.id,
      name: target.product.name,
      recurringAmount: serializeMoney(target.amount, target.currency),
      billingPeriod: target.billingPeriod as 'MONTHLY' | 'QUARTERLY' | 'ANNUAL',
      serverId: service.serverId,
      adapterKey: service.server.adapterKey,
      packageIdentifier:
        target.product.hostingPackageIdentifier ?? 'unverified',
    },
    targetActive: activeTarget,
    facts: {
      customerOwnsService: true,
      customerActive:
        service.customer.status === 'ACTIVE' &&
        service.customer.user.status === 'ACTIVE' &&
        !service.customer.deletedAt &&
        !service.customer.user.deletedAt,
      serviceActive:
        service.status === 'ACTIVE' &&
        Boolean(service.externalAccountId && service.controlPanelUsername),
      serverReady:
        service.server.status === 'ACTIVE' && !service.server.deletedAt,
      packageChangeSupported: ['fake-panel', 'cpanel-whm'].includes(
        service.server.adapterKey,
      ),
      sourcePackageVerified: Boolean(packageIdentifier),
      targetPackageVerified: Boolean(
        target.product.hostingPackageIdentifier &&
        /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,190}$/.test(
          target.product.hostingPackageIdentifier,
        ),
      ),
      targetCapacityFits: true,
      changeAllowed: true,
      paidPeriodVerified: paid,
      addOnsCompatible,
      hasOpenFinancialWork: financial,
      hasCancellation: cancellation > 0,
      hasPendingChange: pending > 0,
      hasUncertainOperation: uncertain > 0,
      hasChangeInPaidPeriod: completed > 0,
      preserveExistingHosting:
        readHostingProvisioningMode(provisioning) === 'PRESERVE_EXISTING',
    },
  };
  const hash = createHash('sha256')
    .update(
      JSON.stringify({
        input,
        targetUpdatedAt: target.product.updatedAt,
        serverUpdatedAt: service.server.updatedAt,
        addOns: addOns.map((item) => ({
          id: item.id,
          amount: item.lineTotal.toString(),
          fulfilledAt: item.fulfilledAt,
          renewalEndsAt: item.renewalEndsAt,
        })),
      }),
    )
    .digest('hex');
  return { input, hash, service, target, sourceInvoice };
}
