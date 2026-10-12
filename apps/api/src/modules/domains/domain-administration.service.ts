import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import type { ApiEnvironment } from '@webhost-billing/config';
import { Prisma, type PrismaClient } from '@webhost-billing/database';
import {
  RegistrarCipher,
  credentialBinding,
  ResellbizLiveRegistrar,
} from '@webhost-billing/database/registrar';
import {
  createRegistrarConnectionSchema,
  registrarConnectionListSchema,
  registrarConnectionIdentitySchema,
  domainTldListSchema,
  domainTldRequestSchema,
  domainTldBulkSchema,
  domainPolicySchema,
  domainDnsDefaultsSchema,
  domainPolicyInputSchema,
  domainSelectionSnapshotSchema,
  resellbizConfigurationSchema,
  resellbizCredentialSchema,
  type DomainTldRequest,
  type DomainSelectionSnapshot,
} from '@webhost-billing/shared';
import type { z } from 'zod';
import { PRISMA_CLIENT } from '../../infrastructure/database/database.module';
import { API_ENVIRONMENT } from '../../infrastructure/environment/environment.module';
import { ApplicationException } from '../../common/errors/application.exception';
import type { AuthRequestContext } from '../auth/auth.types';

export function registrarIdentity(configuration: unknown) {
  const modern = registrarConnectionIdentitySchema.safeParse(configuration);
  return modern.success
    ? modern.data
    : resellbizConfigurationSchema.parse(configuration);
}
export function registrarFingerprint(
  accountId: string,
  mode: string,
  customerId: string,
  contact: unknown,
) {
  return createHash('sha256')
    .update(`stargate:${mode}:Contact:${accountId}:${customerId}:`)
    .update(JSON.stringify(contact))
    .digest('hex');
}
@Injectable()
export class DomainAdministrationService {
  private readonly cipher: RegistrarCipher;
  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient,
    @Inject(API_ENVIRONMENT) private readonly environment: ApiEnvironment,
  ) {
    this.cipher = new RegistrarCipher(environment.CREDENTIAL_ENCRYPTION_KEY);
  }
  private deny(message: string, status = HttpStatus.CONFLICT): never {
    throw new ApplicationException({
      status,
      code: status === HttpStatus.FORBIDDEN ? 'FORBIDDEN' : 'CONFLICT',
      message,
    });
  }
  authorize(auth: AuthRequestContext) {
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
  private async lock(tx: Prisma.TransactionClient) {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(510118)::text`;
  }
  private async audit(
    tx: Prisma.TransactionClient,
    auth: AuthRequestContext,
    action: string,
    id?: string,
  ) {
    await tx.activityLog.create({
      data: {
        actorUserId: auth.identity.userId,
        action,
        entityType: 'DOMAIN_ADMINISTRATION',
        entityId: id,
      },
    });
  }
  async connections(auth: AuthRequestContext) {
    this.authorize(auth);
    const accounts = await this.prisma.registrarAccount.findMany({
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: 100,
    });
    return registrarConnectionListSchema.parse(
      await Promise.all(
        accounts.map(async (account) => {
          const profile = await this.prisma.registrarProfile.findUnique({
            where: { accountId: account.id },
          });
          const credential = await this.prisma.registrarCredential.findFirst({
            where: { accountId: account.id },
            orderBy: { version: 'desc' },
          });
          const identity =
            account.mode === 'LIVE'
              ? registrarIdentity(account.configuration)
              : null;
          return {
            id: account.id,
            name: profile?.name ?? 'StarGate/UK2 (resell.biz)',
            module: 'logicboxes',
            mode: account.mode === 'LIVE' ? 'Live' : 'Simulated',
            enabled: account.enabled,
            isDefault: profile?.isDefault ?? false,
            networkEnabled:
              account.mode === 'LIVE'
                ? this.environment.RESELLBIZ_LIVE_ENABLED
                : false,
            credentialVersion: credential?.version ?? 0,
            maskedResellerId: identity
              ? `••••${identity.resellerId.slice(-4)}`
              : 'Fictional account',
            nativeCostConfirmed:
              profile?.nativeCostConfirmed ??
              (account.mode === 'FAKE' ||
                resellbizConfigurationSchema.safeParse(account.configuration)
                  .success),
            capabilities: {
              registration: true,
              renewal: account.mode === 'LIVE',
              transfer: false,
              dnsManagement: false,
              emailForwarding: false,
              idProtection: false,
            },
          };
        }),
      ),
    );
  }
  async createConnection(
    raw: z.infer<typeof createRegistrarConnectionSchema>,
    auth: AuthRequestContext,
  ) {
    this.authorize(auth);
    const input = createRegistrarConnectionSchema.parse(raw);
    try {
      await this.prisma.$transaction(async (tx) => {
        await this.lock(tx);
        if ((await tx.registrarAccount.count()) >= 100)
          this.deny('The registrar connection limit has been reached.');
        const existing = await tx.registrarAccount.findMany({
          where: { mode: 'LIVE' },
        });
        if (
          existing.some(
            (entry) =>
              registrarIdentity(entry.configuration).resellerId ===
              input.resellerId,
          )
        )
          this.deny(
            'This reseller identity is already configured. Replace its key instead.',
          );
        const account = await tx.registrarAccount.create({
          data: {
            mode: 'LIVE',
            enabled: false,
            configuration: { schemaVersion: 2, resellerId: input.resellerId },
          },
        });
        await tx.registrarCredential.create({
          data: {
            accountId: account.id,
            version: 1,
            ciphertext: this.cipher.encrypt(
              credentialBinding(account.id, 1, 'LIVE'),
              { resellerId: input.resellerId, apiKey: input.apiKey },
            ),
          },
        });
        await tx.registrarProfile.create({
          data: { accountId: account.id, name: input.name },
        });
        await this.audit(
          tx,
          auth,
          'REGISTRAR_CONNECTION_SAVED_DISABLED',
          account.id,
        );
      });
    } catch (error) {
      if (error instanceof ApplicationException) throw error;
      this.deny(
        'The registrar connection could not be saved. Refresh before retrying.',
      );
    }
    return this.connections(auth);
  }
  async setDefault(id: string, auth: AuthRequestContext) {
    this.authorize(auth);
    await this.prisma.$transaction(async (tx) => {
      await this.lock(tx);
      const account = await tx.registrarAccount.findUnique({ where: { id } });
      if (
        !account?.enabled ||
        (account.mode === 'FAKE' && this.environment.NODE_ENV === 'production')
      )
        this.deny('Choose an enabled supported registrar.');
      await tx.registrarProfile.updateMany({
        where: { isDefault: true },
        data: { isDefault: false },
      });
      await tx.registrarProfile.upsert({
        where: { accountId: id },
        create: {
          accountId: id,
          name: 'StarGate/UK2 (resell.biz)',
          isDefault: true,
          nativeCostConfirmed:
            account.mode === 'FAKE' ||
            resellbizConfigurationSchema.safeParse(account.configuration)
              .success,
        },
        update: { isDefault: true },
      });
      await this.ensureOffers(tx, id);
      await this.audit(tx, auth, 'REGISTRAR_DEFAULT_CHANGED', id);
    });
    return this.connections(auth);
  }
  async rotate(
    id: string,
    raw: z.infer<typeof resellbizCredentialSchema>,
    auth: AuthRequestContext,
  ) {
    this.authorize(auth);
    const input = resellbizCredentialSchema.parse(raw);
    await this.prisma.$transaction(async (tx) => {
      await this.lock(tx);
      await tx.$queryRaw`SELECT id FROM registrar_accounts WHERE id=${id}::uuid FOR UPDATE`;
      const account = await tx.registrarAccount.findUniqueOrThrow({
        where: { id },
      });
      if (
        account.mode !== 'LIVE' ||
        registrarIdentity(account.configuration).resellerId !== input.resellerId
      )
        this.deny(
          'Credential replacement must retain the same reseller identity.',
        );
      const latest = await tx.registrarCredential.findFirstOrThrow({
        where: { accountId: id },
        orderBy: { version: 'desc' },
      });
      await tx.registrarCredential.create({
        data: {
          accountId: id,
          version: latest.version + 1,
          ciphertext: this.cipher.encrypt(
            credentialBinding(id, latest.version + 1, 'LIVE'),
            input,
          ),
        },
      });
      await tx.registrarAccount.update({
        where: { id },
        data: { enabled: false },
      });
      await this.audit(tx, auth, 'REGISTRAR_CREDENTIAL_REPLACED_DISABLED', id);
    });
    return this.connections(auth);
  }
  async provider(id: string, credentialId?: string) {
    const account = await this.prisma.registrarAccount.findUniqueOrThrow({
      where: { id },
    });
    if (account.mode !== 'LIVE' || !this.environment.RESELLBIZ_LIVE_ENABLED)
      this.deny('Live registrar networking is disabled.');
    const identity = registrarIdentity(account.configuration);
    const credential = await this.prisma.registrarCredential.findFirstOrThrow({
      where: { accountId: id, ...(credentialId ? { id: credentialId } : {}) },
      orderBy: { version: 'desc' },
    });
    const payload = resellbizCredentialSchema.parse(
      this.cipher.decrypt(
        credentialBinding(id, credential.version, 'LIVE'),
        credential.ciphertext,
      ),
    );
    if (payload.resellerId !== identity.resellerId)
      this.deny('Registrar credential ownership changed.');
    return { provider: new ResellbizLiveRegistrar(payload), credential };
  }
  async check(id: string, domainName: string, auth: AuthRequestContext) {
    this.authorize(auth);
    const { provider, credential } = await this.provider(id);
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM registrar_accounts WHERE id=${id}::uuid FOR UPDATE`;
      if (
        (await tx.activityLog.count({
          where: {
            entityId: id,
            action: {
              in: [
                'REGISTRAR_CONNECTION_CHECK_RESERVED',
                'RESELLBIZ_READ_RESERVED',
              ],
            },
            createdAt: { gt: new Date(Date.now() - 60000) },
          },
        })) >= 5
      )
        this.deny('Please wait before another connection check.');
      await this.audit(tx, auth, 'REGISTRAR_CONNECTION_CHECK_RESERVED', id);
    });
    try {
      const quote = await provider.quote(domainName);
      return {
        available: quote.available,
        costAmount: quote.costAmount.toString(),
        costCurrency: quote.costCurrency,
        credentialVersion: credential.version,
        notice:
          'Read-only availability/cost check. No domain or customer was created; native cost currency still needs account confirmation.',
      };
    } catch {
      this.deny(
        'Registrar availability or cost could not be verified. No registration was submitted.',
      );
    }
  }
  async toggle(
    id: string,
    input: { enabled: boolean; confirmNativeUsdCosts?: true },
    auth: AuthRequestContext,
  ) {
    this.authorize(auth);
    const account = await this.prisma.registrarAccount.findUniqueOrThrow({
      where: { id },
    });
    if (account.mode !== 'LIVE')
      this.deny('Simulation settings are development-only.');
    const currentCredential = input.enabled
      ? (await this.provider(id)).credential
      : null;
    if (input.enabled) {
      if (!input.confirmNativeUsdCosts)
        this.deny(
          'Confirm native USD costs from the provider account before enabling.',
        );
      await this.check(id, 'ordinary-example.com', auth);
    }
    await this.prisma.$transaction(async (tx) => {
      await this.lock(tx);
      await tx.$queryRaw`SELECT id FROM registrar_accounts WHERE id=${id}::uuid FOR UPDATE`;
      if (
        input.enabled &&
        currentCredential?.id !==
          (
            await tx.registrarCredential.findFirstOrThrow({
              where: { accountId: id },
              orderBy: { version: 'desc' },
            })
          ).id
      )
        this.deny('Credentials changed during the check. Review them again.');
      await tx.registrarAccount.update({
        where: { id },
        data: { enabled: input.enabled },
      });
      await tx.registrarProfile.upsert({
        where: { accountId: id },
        create: {
          accountId: id,
          name: 'StarGate/UK2 (resell.biz)',
          nativeCostConfirmed: input.enabled,
        },
        update: input.enabled ? { nativeCostConfirmed: true } : {},
      });
      if (input.enabled) await this.ensureOffers(tx, id);
      await this.audit(
        tx,
        auth,
        input.enabled
          ? 'REGISTRAR_CONNECTION_ENABLED'
          : 'REGISTRAR_CONNECTION_DISABLED',
        id,
      );
    });
    return this.connections(auth);
  }
  private async ensureOffers(tx: Prisma.TransactionClient, accountId?: string) {
    const accounts = await tx.registrarAccount.findMany({
      where: { enabled: true, ...(accountId ? { id: accountId } : {}) },
      take: 100,
    });
    const tlds = await tx.domainCatalogueTld.findMany({
      where: { tld: 'com', registrationPriceId: { not: null } },
      take: 1000,
    });
    for (const account of accounts)
      for (const tld of tlds) {
        const prior = await tx.domainOffer.findUnique({
          where: { accountId_tld: { accountId: account.id, tld: tld.tld } },
        });
        if (!prior && tld.registrationPriceId)
          await tx.domainOffer.create({
            data: {
              accountId: account.id,
              tld: tld.tld,
              productId: tld.productId,
              priceId: tld.registrationPriceId,
              nameservers: [],
            },
          });
      }
  }
  async defaults(auth: AuthRequestContext) {
    this.authorize(auth);
    const dns = await this.prisma.setting.findUnique({
      where: { key: 'domains.dns-defaults' },
    });
    const policies = await this.prisma.setting.findUnique({
      where: { key: 'domains.policies' },
    });
    return {
      dns: dns ? domainDnsDefaultsSchema.parse(dns.value) : null,
      policies: policies ? domainPolicySchema.parse(policies.value) : null,
    };
  }
  async saveDefaults(
    kind: 'dns' | 'policies',
    value: unknown,
    auth: AuthRequestContext,
  ) {
    this.authorize(auth);
    const parsed =
      kind === 'dns'
        ? domainDnsDefaultsSchema.parse(value)
        : { ...domainPolicyInputSchema.parse(value), revision: randomUUID() };
    await this.prisma.$transaction(async (tx) => {
      await this.lock(tx);
      const key = kind === 'dns' ? 'domains.dns-defaults' : 'domains.policies';
      await tx.setting.upsert({
        where: { key },
        create: {
          key,
          category: 'INTEGRATION',
          value: parsed,
          updatedByUserId: auth.identity.userId,
        },
        update: { value: parsed, updatedByUserId: auth.identity.userId },
      });
      await this.audit(
        tx,
        auth,
        kind === 'dns'
          ? 'DOMAIN_DNS_DEFAULTS_CHANGED'
          : 'DOMAIN_POLICIES_CHANGED',
      );
    });
    return this.defaults(auth);
  }
  async tlds(auth: AuthRequestContext) {
    this.authorize(auth);
    const rows = await this.prisma.domainCatalogueTld.findMany({
      orderBy: [{ displayOrder: 'asc' }, { tld: 'asc' }],
      take: 1000,
    });
    return domainTldListSchema.parse(
      await Promise.all(
        rows.map(async (row) => {
          const price = row.registrationPriceId
            ? await this.prisma.productPrice.findUniqueOrThrow({
                where: { id: row.registrationPriceId },
              })
            : null;
          return {
            id: row.id,
            tld: row.tld,
            enabled: row.enabled,
            featured: row.featured,
            displayOrder: row.displayOrder,
            preferredRegistrarId: row.preferredRegistrarId,
            revision: row.revision,
            registrationAmount: price?.amount.toString() ?? null,
            renewalAmount: row.renewalAmount?.toString() ?? null,
            currency: 'BDT',
            years: 1,
            registrationSupported: row.tld === 'com',
            renewalSupported: row.tld === 'com',
            transferSupported: false,
          };
        }),
      ),
    );
  }
  async saveTld(raw: DomainTldRequest, auth: AuthRequestContext) {
    this.authorize(auth);
    const input = domainTldRequestSchema.parse(raw);
    await this.prisma.$transaction(async (tx) => {
      await this.lock(tx);
      if (
        input.preferredRegistrarId &&
        !(await tx.registrarAccount.findUnique({
          where: { id: input.preferredRegistrarId },
        }))
      )
        this.deny('Registrar was not found.');
      const old = await tx.domainCatalogueTld.findUnique({
        where: { tld: input.tld },
      });
      if ((old?.revision ?? 0) !== input.revision)
        this.deny('TLD pricing changed. Refresh before saving.');
      if (!old && (await tx.domainCatalogueTld.count()) >= 1000)
        this.deny('The TLD catalogue limit has been reached.');
      const productId =
        old?.productId ??
        (
          await tx.product.create({
            data: {
              kind: 'DOMAIN',
              slug: `domain-catalogue-${input.tld}-${randomUUID()}`,
              name: `.${input.tld} domain registration`,
              status: 'ACTIVE',
              publicVisible: true,
            },
          })
        ).id;
      const priceId = input.registrationAmount
        ? (
            await tx.productPrice.create({
              data: {
                productId,
                currency: 'BDT',
                billingPeriod: 'ANNUAL',
                amount: BigInt(input.registrationAmount),
                setupFee: 0n,
                isActive: false,
              },
            })
          ).id
        : null;
      const { registrationAmount, renewalAmount, revision, ...values } = input;
      void registrationAmount;
      const data = {
        ...values,
        renewalAmount: renewalAmount ? BigInt(renewalAmount) : null,
        registrationPriceId: priceId,
        revision: revision + 1,
      };
      const saved = await tx.domainCatalogueTld.upsert({
        where: { tld: input.tld },
        create: { ...data, productId },
        update: data,
      });
      await this.ensureOffers(tx);
      await this.audit(tx, auth, 'DOMAIN_TLD_PRICE_REVISION_SAVED', saved.id);
    });
    return this.tlds(auth);
  }
  async bulk(
    raw: z.infer<typeof domainTldBulkSchema>,
    auth: AuthRequestContext,
  ) {
    this.authorize(auth);
    const input = domainTldBulkSchema.parse(raw);
    if (
      new Set(input.entries.map((entry) => entry.id)).size !==
      input.entries.length
    )
      this.deny('Select each TLD only once.');
    await this.prisma.$transaction(async (tx) => {
      await this.lock(tx);
      if (
        input.preferredRegistrarId &&
        !(await tx.registrarAccount.findUnique({
          where: { id: input.preferredRegistrarId },
        }))
      )
        this.deny('Registrar was not found.');
      for (const entry of [...input.entries].sort((a, b) =>
        a.id.localeCompare(b.id),
      )) {
        const old = await tx.domainCatalogueTld.findUnique({
          where: { id: entry.id },
        });
        if (!old || old.revision !== entry.revision)
          this.deny(
            'A selected TLD changed. Refresh before applying the batch.',
          );
        if (input.enabled && (old.tld !== 'com' || !old.registrationPriceId))
          this.deny('A selected TLD cannot be enabled for registration.');
        await tx.domainCatalogueTld.update({
          where: { id: entry.id },
          data: {
            revision: { increment: 1 },
            ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
            ...(input.preferredRegistrarId !== undefined
              ? { preferredRegistrarId: input.preferredRegistrarId }
              : {}),
          },
        });
        await this.audit(tx, auth, 'DOMAIN_TLD_BULK_CHANGED', entry.id);
      }
    });
    return this.tlds(auth);
  }
  async catalogueContext(
    tld: string,
    accountId?: string,
  ): Promise<{
    catalogue: Awaited<
      ReturnType<PrismaClient['domainCatalogueTld']['findUniqueOrThrow']>
    >;
    snapshot: DomainSelectionSnapshot;
    nameservers: string[];
    originId: string;
  } | null> {
    const catalogue = await this.prisma.domainCatalogueTld.findUnique({
      where: { tld },
    });
    if (!catalogue) return null;
    if (!catalogue.enabled || !catalogue.registrationPriceId || tld !== 'com')
      this.deny('This TLD is unavailable for registration.');
    const dnsRow = await this.prisma.setting.findUnique({
      where: { key: 'domains.dns-defaults' },
    });
    const policyRow = await this.prisma.setting.findUnique({
      where: { key: 'domains.policies' },
    });
    const dns = domainDnsDefaultsSchema.safeParse(dnsRow?.value);
    const policies = domainPolicySchema.safeParse(policyRow?.value);
    if (!dns.success || !policies.success)
      this.deny(
        'Domain DNS defaults and approved policies must be configured before registration.',
      );
    const accounts = await this.prisma.registrarAccount.findMany({
      where: { enabled: true },
      orderBy: { id: 'asc' },
      take: 100,
    });
    const eligible: { id: string; name: string }[] = [];
    let globalDefault: string | undefined;
    for (const account of accounts) {
      const profile = await this.prisma.registrarProfile.findUnique({
        where: { accountId: account.id },
      });
      if (profile?.isDefault) globalDefault = account.id;
      if (
        account.mode === 'LIVE' &&
        (!this.environment.RESELLBIZ_LIVE_ENABLED ||
          !profile?.nativeCostConfirmed)
      )
        continue;
      if (account.mode === 'FAKE' && this.environment.NODE_ENV === 'production')
        continue;
      if (
        account.mode === 'LIVE' &&
        !registrarConnectionIdentitySchema.safeParse(account.configuration)
          .success
      ) {
        const legacy = resellbizConfigurationSchema.parse(
          account.configuration,
        );
        if (
          legacy.agreementUrl !== policies.data.agreementUrl ||
          legacy.customerTermsUrl !== policies.data.customerTermsUrl ||
          legacy.customerPrivacyUrl !== policies.data.customerPrivacyUrl
        )
          continue;
      }
      eligible.push({
        id: account.id,
        name: profile?.name ?? 'StarGate/UK2 (resell.biz)',
      });
    }
    const originId =
      accountId ?? catalogue.preferredRegistrarId ?? globalDefault;
    const origin = accounts.find((entry) => entry.id === originId);
    const sameMode = eligible.filter(
      (entry) =>
        accounts.find((account) => account.id === entry.id)?.mode ===
        origin?.mode,
    );
    if (
      !originId ||
      !sameMode.some((entry) => entry.id === originId) ||
      sameMode.length > 32
    )
      this.deny('Choose an enabled, compatible default or TLD registrar.');
    return {
      catalogue,
      originId,
      nameservers: dns.data.nameservers,
      snapshot: domainSelectionSnapshotSchema.parse({
        schemaVersion: 1,
        catalogueId: catalogue.id,
        catalogueRevision: catalogue.revision,
        priceId: catalogue.registrationPriceId,
        policies: policies.data,
        eligibleRegistrars: sameMode,
      }),
    };
  }
}
