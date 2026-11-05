import {
  domainNameSchema,
  domainExtensionSchema,
  type DomainContact,
  type RegistrarDomainFacts,
} from '@webhost-billing/shared';
import type { PrismaClient } from '../index';

export interface RegistrarQuote {
  available: boolean;
  costAmount: bigint;
  costCurrency: 'USD';
  observedAt: Date;
  simulated: boolean;
}
export interface RegistrarIntent {
  operationId: string;
  accountId: string;
  customerId: string;
  domainName: string;
  nameservers: readonly string[];
  contact: DomainContact;
  costCeiling: bigint;
}
export interface RegistrarObservation {
  orderId: string;
  accountId: string;
  customerId: string;
  operationId: string;
  domainName: string;
  state: 'Active' | 'InActive' | 'Rejected';
  expiresAt: Date;
  verification: 'Pending' | 'Verified';
}
export interface DomainRegistrar {
  renewalQuote?(
    reference: RegistrarDomainFactsReference,
  ): Promise<RegistrarRenewalQuote>;
  renewDomain?(
    intent: RegistrarRenewalIntent,
    claimSubmission: () => Promise<void>,
  ): Promise<void>;
  supportsDomainFacts?(tld: string): boolean;
  readDomainFacts?(
    reference: RegistrarDomainFactsReference,
  ): Promise<RegistrarDomainFacts | null>;
  quote(domainName: string): Promise<RegistrarQuote>;
  ensureContacts(intent: RegistrarIntent, fingerprint: string): Promise<void>;
  registerOnce(intent: RegistrarIntent): Promise<void>;
  lookup(intent: RegistrarIntent): Promise<RegistrarObservation | null>;
}
export interface RegistrarDomainFactsReference {
  accountId: string;
  customerId: string;
  domainName: string;
  providerOrderId: string;
}
export interface RegistrarRenewalQuote {
  costAmount: bigint;
  costCurrency: 'USD';
  balance: 'SUFFICIENT' | 'INSUFFICIENT' | 'UNKNOWN';
  rejectionCode?: 'PROVIDER_REJECTED';
}
export interface RegistrarRenewalIntent extends RegistrarDomainFactsReference {
  operationId: string;
  previousExpiry: string;
  targetExpiry: string;
  years: 1;
  costCeiling: bigint;
  costCurrency: 'USD';
}

// Deliberately fictional outcomes, not public DNS/availability or real registrations.
export class FakeDomainRegistrar implements DomainRegistrar {
  constructor(private readonly prisma: PrismaClient) {}
  async renewalQuote(
    reference: RegistrarDomainFactsReference,
  ): Promise<RegistrarRenewalQuote> {
    const facts = await this.readDomainFacts(reference);
    if (!facts) throw new Error('Fictional registration unavailable.');
    return { costAmount: 1000n, costCurrency: 'USD', balance: 'SUFFICIENT' };
  }
  async renewDomain(
    intent: RegistrarRenewalIntent,
    claimSubmission: () => Promise<void>,
  ): Promise<void> {
    await claimSubmission();
    await this.prisma.$transaction(async (tx) => {
      const replay = await tx.fakeRegistrarRenewal.findUnique({
        where: { operationId: intent.operationId },
      });
      if (replay) return;
      const row = await tx.fakeRegistrarRegistration.findUniqueOrThrow({
        where: {
          accountId_domainName: {
            accountId: intent.accountId,
            domainName: intent.domainName,
          },
        },
      });
      await tx.$queryRaw`SELECT id FROM fake_registrar_registrations WHERE id=${row.id}::uuid FOR UPDATE`;
      const current = await tx.fakeRegistrarRegistration.findUniqueOrThrow({
        where: { id: row.id },
      });
      if (
        current.id !== intent.providerOrderId ||
        current.customerId !== intent.customerId ||
        current.expiresAt.toISOString() !== intent.previousExpiry
      )
        throw new Error('Fictional registrar binding or expiry changed.');
      const op = await tx.domainRenewalOperation.findUniqueOrThrow({
        where: { id: intent.operationId },
      });
      if (
        !op.submittedAt ||
        op.status !== 'RUNNING' ||
        op.accountId !== intent.accountId ||
        intent.years !== 1
      )
        throw new Error('Fictional renewal has no submission claim.');
      await tx.fakeRegistrarRenewal.create({
        data: {
          operationId: intent.operationId,
          registrationId: row.id,
          previousExpiry: new Date(intent.previousExpiry),
          targetExpiry: new Date(intent.targetExpiry),
        },
      });
      await tx.fakeRegistrarRegistration.update({
        where: { id: row.id },
        data: { expiresAt: new Date(intent.targetExpiry) },
      });
    });
  }
  supportsDomainFacts(tld: string): boolean {
    return domainExtensionSchema.safeParse(tld).success;
  }
  async readDomainFacts(
    reference: RegistrarDomainFactsReference,
  ): Promise<RegistrarDomainFacts | null> {
    const row = await this.prisma.fakeRegistrarRegistration.findUnique({
      where: {
        accountId_domainName: {
          accountId: reference.accountId,
          domainName: reference.domainName,
        },
      },
    });
    if (!row) return null;
    const active = row.state === 'Active';
    return {
      accountId: row.accountId,
      customerId: row.customerId,
      domainName: row.domainName,
      providerOrderId: row.id,
      observedAt: new Date(Date.now()).toISOString(),
      expiresAt: row.expiresAt.toISOString(),
      status: active
        ? 'ACTIVE'
        : row.state === 'InActive'
          ? 'SUSPENDED'
          : 'UNKNOWN',
      renewalEligibility:
        active && row.expiresAt.getTime() > Date.now()
          ? 'ELIGIBLE'
          : 'INELIGIBLE',
      registrarAutoRenew: false,
      simulated: true,
    };
  }
  async quote(domainName: string): Promise<RegistrarQuote> {
    domainNameSchema.parse(domainName);
    return {
      available: !domainName.startsWith('taken-'),
      costAmount: domainName.startsWith('price-') ? 1500n : 1000n,
      costCurrency: 'USD',
      observedAt: new Date(),
      simulated: true,
    };
  }
  async ensureContacts(
    intent: RegistrarIntent,
    fingerprint: string,
  ): Promise<void> {
    if (!/^[a-f0-9]{64}$/.test(fingerprint))
      throw new Error('Contact snapshot unavailable.');
    await this.prisma.registrarMapping.upsert({
      where: {
        accountId_customerId_fingerprint: {
          accountId: intent.accountId,
          customerId: intent.customerId,
          fingerprint,
        },
      },
      create: {
        accountId: intent.accountId,
        customerId: intent.customerId,
        fingerprint,
        remoteCustomerId: `fake-${intent.customerId}`,
        remoteContactId: fingerprint,
      },
      update: {},
    });
    if (intent.domainName.startsWith('contact-lost-'))
      throw new Error('Simulated ambiguous contact creation.');
  }
  async registerOnce(intent: RegistrarIntent): Promise<void> {
    const quote = await this.quote(intent.domainName);
    if (!quote.available || quote.costAmount > intent.costCeiling)
      throw new Error('Registrar preflight denied.');
    const expiry = new Date();
    expiry.setUTCFullYear(expiry.getUTCFullYear() + 1);
    await this.prisma.fakeRegistrarRegistration.create({
      data: {
        accountId: intent.accountId,
        customerId: intent.customerId,
        operationId: intent.operationId,
        domainName: intent.domainName,
        state: intent.domainName.startsWith('pending-')
          ? 'InActive'
          : intent.domainName.startsWith('reject-')
            ? 'Rejected'
            : 'Active',
        expiresAt: expiry,
      },
    });
    if (intent.domainName.startsWith('lost-'))
      throw new Error('Simulated lost response.');
  }
  async lookup(intent: RegistrarIntent): Promise<RegistrarObservation | null> {
    const record = await this.prisma.fakeRegistrarRegistration.findUnique({
      where: {
        accountId_domainName: {
          accountId: intent.accountId,
          domainName: intent.domainName,
        },
      },
    });
    if (!record) return null;
    return {
      orderId: record.id,
      accountId: record.accountId,
      customerId: record.customerId,
      operationId: record.operationId,
      domainName: record.domainName,
      state:
        record.state === 'Active'
          ? 'Active'
          : record.state === 'Rejected'
            ? 'Rejected'
            : 'InActive',
      expiresAt: record.expiresAt,
      verification: 'Pending',
    };
  }
}
