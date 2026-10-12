import {
  domainContactSchema,
  resellbizConfigurationSchema,
  resellbizCredentialSchema,
} from '@webhost-billing/shared';
import type { Prisma, PrismaClient } from '../index';
import { RegistrarCipher, contactBinding, credentialBinding } from './cipher';
import {
  FakeDomainRegistrar,
  type DomainRegistrar,
  type RegistrarIntent,
} from './provider';
import {
  ResellbizLiveRegistrar,
  type ResellbizTransport,
} from './resellbiz-live';
import { DatabaseRegistrarPreparation } from './preparation';

export async function lockDomainInvoice(
  tx: Prisma.TransactionClient,
  invoiceId: string,
): Promise<void> {
  await tx.$queryRaw`SELECT id FROM invoices WHERE id=${invoiceId}::uuid FOR UPDATE`;
}
export async function verifiedDomainInvoice(
  tx: Prisma.TransactionClient,
  invoiceId: string,
  customerId: string,
): Promise<boolean> {
  const invoice = await tx.invoice.findUnique({
    where: { id: invoiceId },
    include: { payments: true },
  });
  if (
    !invoice ||
    invoice.customerId !== customerId ||
    invoice.status !== 'PAID' ||
    invoice.currency !== 'BDT' ||
    invoice.total <= 0n ||
    invoice.balanceDue !== 0n ||
    invoice.amountPaid !== invoice.total
  )
    return false;
  if (
    invoice.payments.some(
      (payment) =>
        payment.status === 'SUCCEEDED' &&
        (payment.kind !== 'CHARGE' ||
          payment.currency !== invoice.currency ||
          !payment.verifiedAt),
    )
  )
    return false;
  return (
    invoice.payments
      .filter(
        (payment) =>
          payment.status === 'SUCCEEDED' &&
          payment.kind === 'CHARGE' &&
          payment.verifiedAt,
      )
      .reduce((sum, payment) => sum + payment.amount, 0n) === invoice.total
  );
}

export class RegistrarProcessor {
  private readonly cipher: RegistrarCipher;
  private readonly provider: DomainRegistrar | undefined;
  constructor(
    private readonly prisma: PrismaClient,
    secret: string,
    provider?: DomainRegistrar,
    private readonly options: {
      simulationAllowed?: boolean;
      liveAllowed?: boolean;
      liveTransport?: ResellbizTransport;
    } = {},
  ) {
    this.cipher = new RegistrarCipher(secret);
    this.provider = provider;
  }
  async process(operationId: string): Promise<void> {
    const locator = await this.prisma.registrarOperation.findUnique({
      where: { id: operationId },
    });
    if (!locator) return;
    const locatedDomain = await this.prisma.domain.findUniqueOrThrow({
      where: { id: locator.domainId },
    });
    const preparation = await this.prisma.$transaction(async (tx) => {
      await lockDomainInvoice(tx, locatedDomain.invoiceId);
      await tx.$queryRaw`SELECT id FROM domains WHERE id=${locator.domainId}::uuid FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM registrar_operations WHERE id=${operationId}::uuid FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM registrar_accounts WHERE id=${locator.accountId}::uuid FOR UPDATE`;
      const operation = await tx.registrarOperation.findUniqueOrThrow({
        where: { id: operationId },
      });
      const domain = await tx.domain.findUniqueOrThrow({
        where: { id: operation.domainId },
      });
      const account = await tx.registrarAccount.findUniqueOrThrow({
        where: { id: operation.accountId },
      });
      if (
        !account.enabled ||
        (account.mode === 'FAKE'
          ? this.options.simulationAllowed === false
          : account.mode !== 'LIVE' ||
            this.options.liveAllowed !== true ||
            !operation.priceChangeRiskAccepted) ||
        account.provider !== 'stargate' ||
        ['REGISTERED', 'FAILED'].includes(domain.state)
      )
        return null;
      if (
        operation.pollCount >= 10 ||
        (operation.claimedAt && operation.nextPollAt > new Date())
      )
        return null;
      const quote = await tx.domainQuote.findUniqueOrThrow({
        where: { id: domain.quoteId },
      });
      const credential = await tx.registrarCredential.findUniqueOrThrow({
        where: { id: operation.credentialId },
      });
      const credentials = this.cipher.decrypt(
        credentialBinding(account.id, credential.version, account.mode),
        credential.ciphertext,
      );
      const contact = domainContactSchema.parse(
        this.cipher.decrypt(
          contactBinding(account.id, domain.customerId, account.mode),
          quote.contactCiphertext,
        ),
      );
      const nameservers = quote.nameservers;
      if (
        !Array.isArray(nameservers) ||
        !nameservers.every(
          (value): value is string => typeof value === 'string',
        )
      )
        throw new Error('Registrar nameservers unavailable.');
      const intent: RegistrarIntent = {
        operationId,
        accountId: account.id,
        customerId: domain.customerId,
        domainName: domain.domainName,
        nameservers,
        contact,
        costCeiling: operation.costCeiling,
      };
      let provider = this.provider ?? new FakeDomainRegistrar(this.prisma);
      if (account.mode === 'LIVE') {
        const config = resellbizConfigurationSchema.parse(
          account.configuration,
        );
        const payload = resellbizCredentialSchema.parse(credentials);
        const mapping = await tx.registrarMapping.findUnique({
          where: {
            accountId_customerId_fingerprint: {
              accountId: account.id,
              customerId: domain.customerId,
              fingerprint: quote.fingerprint,
            },
          },
        });
        if (
          payload.resellerId !== config.resellerId ||
          quote.agreement !== 'resellbiz-registration-v1' ||
          JSON.stringify(nameservers) !== JSON.stringify(config.nameservers)
        )
          return null;
        provider =
          this.provider ??
          new ResellbizLiveRegistrar(
            payload,
            this.options.liveTransport,
            mapping
              ? {
                  accountId: account.id,
                  localCustomerId: domain.customerId,
                  remoteCustomerId: mapping.remoteCustomerId,
                  remoteContactId: mapping.remoteContactId,
                }
              : undefined,
            new DatabaseRegistrarPreparation(this.prisma),
          );
      }
      if (!operation.claimedAt) {
        if (
          account.mode === 'LIVE' &&
          (await tx.domainAction.findFirst({
            where: {
              accountId: account.id,
              claimedAt: { not: null },
              state: { notIn: ['SUCCEEDED', 'CANCELLED', 'FAILED'] },
            },
          }))
        )
          return null;
        const approver = await tx.user.findUnique({
          where: { id: operation.actorUserId },
          include: { adminProfile: true, adminTotpCredential: true },
        });
        const customer = await tx.customer.findUnique({
          where: { id: domain.customerId },
          include: { user: true },
        });
        const item = await tx.orderItem.findUniqueOrThrow({
          where: { id: domain.orderItemId },
          include: { order: true },
        });
        if (
          !approver ||
          approver.role !== 'ADMIN' ||
          approver.status !== 'ACTIVE' ||
          approver.deletedAt ||
          approver.adminProfile?.staffRole !== 'FULL_ADMINISTRATOR' ||
          !approver.adminTotpCredential?.enabledAt ||
          !customer ||
          customer.status !== 'ACTIVE' ||
          customer.deletedAt ||
          customer.user.status !== 'ACTIVE' ||
          (account.mode === 'LIVE' && !customer.user.emailVerifiedAt) ||
          customer.user.deletedAt ||
          !['PAID', 'PROCESSING'].includes(item.order.status) ||
          !(await verifiedDomainInvoice(
            tx,
            domain.invoiceId,
            domain.customerId,
          ))
        ) {
          await tx.domain.update({
            where: { id: domain.id },
            data: { state: 'AWAITING_APPROVAL' },
          });
          await tx.registrarEvidence.create({
            data: { operationId, code: 'PAYMENT_OR_OWNER_INELIGIBLE' },
          });
          return null;
        }
        // Only one outstanding mutation per account. Redelivery is reconciliation only.
        const busy = await tx.registrarOperation.findMany({
          where: {
            accountId: account.id,
            id: { not: operationId },
            claimedAt: { not: null },
          },
        });
        for (const outstanding of busy) {
          const busyDomain = await tx.domain.findUniqueOrThrow({
            where: { id: outstanding.domainId },
          });
          if (!['REGISTERED', 'FAILED'].includes(busyDomain.state)) return null;
        }
        await tx.registrarOperation.update({
          where: { id: operationId },
          data: {
            claimedAt: new Date(),
            pollCount: { increment: 1 },
            nextPollAt: new Date(Date.now() + 360000),
          },
        });
        await tx.domain.update({
          where: { id: domain.id },
          data: { state: 'NEEDS_RECONCILIATION' },
        });
        await tx.registrarEvidence.create({
          data: { operationId, code: 'DISPATCH_CLAIMED' },
        });
      } else {
        // Reserve the read slot under the same locks before leaving the transaction.
        await tx.registrarOperation.update({
          where: { id: operationId },
          data: {
            pollCount: { increment: 1 },
            nextPollAt: new Date(Date.now() + 360000),
          },
        });
      }
      return {
        intent,
        provider,
        mode: account.mode,
        dispatch: !operation.claimedAt,
      };
    });
    if (!preparation) return;
    const { intent, provider } = preparation;
    if (preparation.dispatch) {
      try {
        const cost = await provider.quote(intent.domainName);
        const existing = await provider.lookup(intent);
        if (
          existing ||
          !cost.available ||
          cost.costCurrency !== 'USD' ||
          cost.simulated !== (preparation.mode === 'FAKE') ||
          cost.costAmount > intent.costCeiling ||
          cost.costAmount <= 0n
        ) {
          await this.evidence(operationId, 'PRE_DISPATCH_CONFLICT');
          return;
        }
        const fingerprint = (
          await this.prisma.domainQuote.findUniqueOrThrow({
            where: { id: locatedDomain.quoteId },
          })
        ).fingerprint;
        await provider.ensureContacts(intent, fingerprint);
        await provider.registerOnce(intent);
        await this.evidence(operationId, 'MUTATION_RESPONSE_RECEIVED');
      } catch {
        await this.evidence(operationId, 'MUTATION_OUTCOME_UNCERTAIN');
      }
    }
    let observation;
    try {
      observation = await provider.lookup(intent);
    } catch {
      await this.evidence(operationId, 'READ_OUTCOME_UNCERTAIN');
      return;
    }
    await this.prisma.$transaction(async (tx) => {
      await lockDomainInvoice(tx, locatedDomain.invoiceId);
      await tx.$queryRaw`SELECT id FROM domains WHERE id=${locator.domainId}::uuid FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM registrar_operations WHERE id=${operationId}::uuid FOR UPDATE`;
      const op = await tx.registrarOperation.findUniqueOrThrow({
        where: { id: operationId },
      });
      const current = await tx.domain.findUniqueOrThrow({
        where: { id: locator.domainId },
      });
      if (['REGISTERED', 'FAILED'].includes(current.state)) return;
      const match =
        observation &&
        observation.accountId === intent.accountId &&
        observation.customerId === intent.customerId &&
        observation.operationId === operationId &&
        observation.domainName === intent.domainName &&
        Number.isFinite(observation.expiresAt.getTime()) &&
        observation.expiresAt > new Date()
          ? observation
          : null;
      const state =
        match?.state === 'Active'
          ? 'REGISTERED'
          : match?.state === 'Rejected'
            ? 'FAILED'
            : 'NEEDS_RECONCILIATION';
      await tx.registrarOperation.update({
        where: { id: operationId },
        data: {
          nextPollAt: new Date(
            Date.now() +
              (op.pollCount === 1 ? 15 : op.pollCount === 2 ? 30 : 360) * 1000,
          ),
        },
      });
      await tx.domain.update({
        where: { id: locator.domainId },
        data: {
          state,
          ...(match && state === 'REGISTERED'
            ? {
                providerOrderId: match.orderId,
                expiresAt: match.expiresAt,
                verification: match.verification,
              }
            : {}),
        },
      });
      await tx.registrarEvidence.create({
        data: {
          operationId,
          code:
            state === 'REGISTERED'
              ? 'OWNERSHIP_AND_EXPIRY_CONFIRMED'
              : state === 'FAILED'
                ? 'PROVIDER_REJECTED'
                : 'MANUAL_RECONCILIATION_REQUIRED',
        },
      });
      if (state === 'REGISTERED') {
        const item = await tx.orderItem.findUniqueOrThrow({
          where: { id: locatedDomain.orderItemId },
        });
        await tx.order.update({
          where: { id: item.orderId },
          data: { status: 'COMPLETED', completedAt: new Date() },
        });
      }
    });
  }
  private async evidence(operationId: string, code: string): Promise<void> {
    await this.prisma.registrarEvidence.create({ data: { operationId, code } });
  }
}
