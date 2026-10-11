import { domainNameSchema, type DomainContact } from '@webhost-billing/shared';
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
  quote(domainName: string): Promise<RegistrarQuote>;
  ensureContacts(intent: RegistrarIntent, fingerprint: string): Promise<void>;
  registerOnce(intent: RegistrarIntent): Promise<void>;
  lookup(intent: RegistrarIntent): Promise<RegistrarObservation | null>;
}

// Deliberately fictional outcomes, not public DNS/availability or real registrations.
export class FakeDomainRegistrar implements DomainRegistrar {
  constructor(private readonly prisma: PrismaClient) {}
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
