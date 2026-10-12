import type { PrismaClient } from '../index';
import type { RegistrarIntent } from './provider';
import type {
  ResellbizPreparationStore,
  ResellbizBinding,
} from './resellbiz-live';

export class DatabaseRegistrarPreparation implements ResellbizPreparationStore {
  constructor(private readonly prisma: PrismaClient) {}
  private key(intent: RegistrarIntent, fingerprint: string) {
    return {
      accountId: intent.accountId,
      customerId: intent.customerId,
      fingerprint,
    };
  }
  async load(
    intent: RegistrarIntent,
    fingerprint: string,
  ): Promise<ResellbizBinding | undefined> {
    const mapping = await this.prisma.registrarMapping.findUnique({
      where: {
        accountId_customerId_fingerprint: this.key(intent, fingerprint),
      },
    });
    return mapping
      ? {
          accountId: intent.accountId,
          localCustomerId: intent.customerId,
          remoteCustomerId: mapping.remoteCustomerId,
          remoteContactId: mapping.remoteContactId,
        }
      : undefined;
  }
  async claim(
    intent: RegistrarIntent,
    fingerprint: string,
    step: 'customer' | 'contact',
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM registrar_accounts WHERE id=${intent.accountId}::uuid FOR UPDATE`;
      const key = this.key(intent, fingerprint);
      const row = await tx.registrarPreparation.upsert({
        where: { accountId_customerId_fingerprint: key },
        create: { ...key, operationId: intent.operationId },
        update: {},
      });
      if (
        row.operationId !== intent.operationId ||
        (step === 'customer'
          ? row.customerClaimedAt !== null
          : row.contactClaimedAt !== null)
      )
        throw new Error(
          'Registrar creation was previously claimed. Reconcile without retrying.',
        );
      if (step === 'customer') {
        const prior = await tx.registrarPreparation.findFirst({
          where: {
            accountId: intent.accountId,
            customerId: intent.customerId,
            id: { not: row.id },
            customerClaimedAt: { not: null },
            remoteCustomerId: null,
          },
        });
        if (prior)
          throw new Error(
            'An earlier registrar customer creation needs reconciliation.',
          );
      } else if (!row.remoteCustomerId)
        throw new Error('Registrar customer is not verified.');
      await tx.registrarPreparation.update({
        where: { id: row.id },
        data:
          step === 'customer'
            ? { customerClaimedAt: new Date() }
            : { contactClaimedAt: new Date() },
      });
    });
  }
  async customer(
    intent: RegistrarIntent,
    fingerprint: string,
    remoteId: string,
  ): Promise<void> {
    const key = this.key(intent, fingerprint);
    await this.prisma.registrarPreparation.upsert({
      where: { accountId_customerId_fingerprint: key },
      create: {
        ...key,
        operationId: intent.operationId,
        remoteCustomerId: remoteId,
      },
      update: { remoteCustomerId: remoteId },
    });
  }
  async complete(
    intent: RegistrarIntent,
    fingerprint: string,
    customerId: string,
    contactId: string,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.registrarPreparation.update({
        where: {
          accountId_customerId_fingerprint: this.key(intent, fingerprint),
        },
        data: { remoteContactId: contactId },
      });
      await tx.registrarMapping.create({
        data: {
          ...this.key(intent, fingerprint),
          remoteCustomerId: customerId,
          remoteContactId: contactId,
        },
      });
    });
  }
}
