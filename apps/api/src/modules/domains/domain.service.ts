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
  ResellbizLiveRegistrar,
  type DomainRegistrar,
  type RegistrarIntent,
} from '@webhost-billing/database/registrar';
import {
  PROJECT_NAME,
  domainDetailSchema,
  fakeRegistrarSettingsSchema,
  domainOfferSchema,
  domainQuoteSchema,
  type DomainQuoteRequest,
  type DomainPurchaseRequest,
  type AdminDomainQuoteRequest,
  type AdminDomainPurchaseRequest,
  type DomainApprovalRequest,
  resellbizSetupSchema,
  resellbizSettingsSchema,
  resellbizConfigurationSchema,
  resellbizCredentialSchema,
  domainContactSchema,
  resellbizContactSchema,
  domainNameSchema,
  adminOfflineConsentEvidenceSchema,
  type ResellbizSetup,
  domainSelectionSnapshotSchema,
  registrarConnectionIdentitySchema,
} from '@webhost-billing/shared';
import { ApplicationException } from '../../common/errors/application.exception';
import { allocateInvoiceNumber } from '../../common/identifiers/invoice-number';
import { createHumanReadableNumber } from '../../common/identifiers/business-number';
import { PRISMA_CLIENT } from '../../infrastructure/database/database.module';
import { API_ENVIRONMENT } from '../../infrastructure/environment/environment.module';
import type { AuthRequestContext } from '../auth/auth.types';
import {
  DomainAdministrationService,
  registrarIdentity,
  registrarFingerprint,
} from './domain-administration.service';

@Injectable()
export class DomainService {
  private readonly simulationAllowed: boolean;
  private readonly cipher: RegistrarCipher;
  private readonly provider: FakeDomainRegistrar;
  private readonly liveAllowed: boolean;
  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient,
    @Inject(API_ENVIRONMENT) environment: ApiEnvironment,
    private readonly administration: DomainAdministrationService,
  ) {
    this.simulationAllowed = environment.NODE_ENV !== 'production';
    this.liveAllowed = environment.RESELLBIZ_LIVE_ENABLED;
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
  private requireRuntime(): void {
    if (!this.simulationAllowed && !this.liveAllowed) this.requireSimulation();
  }
  private selectionRevision(snapshot: unknown, nameservers: unknown) {
    return createHash('sha256')
      .update(JSON.stringify({ snapshot, nameservers }))
      .digest('hex');
  }
  private requireAccount(account: { mode: string; enabled: boolean }): void {
    if (account.mode === 'FAKE') this.requireSimulation();
    else if (account.mode !== 'LIVE' || !this.liveAllowed)
      this.deny(
        'Live registrar networking is disabled by the installation.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    if (!account.enabled) this.deny('The registrar is disabled.');
  }
  private async reserveLiveRead(
    accountId: string,
    auth: AuthRequestContext,
  ): Promise<void> {
    if (!this.liveAllowed)
      this.deny(
        'Live registrar networking is disabled by the installation.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM registrar_accounts WHERE id=${accountId}::uuid FOR UPDATE`;
      const recent = await tx.activityLog.count({
        where: {
          entityId: accountId,
          action: {
            in: [
              'RESELLBIZ_READ_RESERVED',
              'REGISTRAR_CONNECTION_CHECK_RESERVED',
            ],
          },
          createdAt: { gt: new Date(Date.now() - 60000) },
        },
      });
      if (recent >= 5) this.deny('Please wait before another registrar check.');
      await tx.activityLog.create({
        data: {
          actorUserId: auth.identity.userId,
          action: 'RESELLBIZ_READ_RESERVED',
          entityType: 'REGISTRAR',
          entityId: accountId,
        },
      });
    });
  }
  private async liveProvider(
    accountId: string,
    binding?: {
      localCustomerId: string;
      remoteCustomerId: string;
      remoteContactId: string;
    },
    pinnedCredentialId?: string,
  ): Promise<ResellbizLiveRegistrar> {
    const account = await this.prisma.registrarAccount.findUniqueOrThrow({
      where: { id: accountId },
    });
    if (account.mode !== 'LIVE')
      this.deny('Select the live resell.biz account.');
    const config = registrarIdentity(account.configuration);
    const credential = await this.prisma.registrarCredential.findFirstOrThrow({
      where: {
        accountId,
        ...(pinnedCredentialId ? { id: pinnedCredentialId } : {}),
      },
      orderBy: { version: 'desc' },
    });
    const payload = resellbizCredentialSchema.parse(
      this.cipher.decrypt(
        credentialBinding(accountId, credential.version, 'LIVE'),
        credential.ciphertext,
      ),
    );
    if (payload.resellerId !== config.resellerId)
      this.deny('Registrar credential ownership changed.');
    return new ResellbizLiveRegistrar(
      payload,
      undefined,
      binding ? { accountId, ...binding } : undefined,
    );
  }
  private async quoteFrom(
    accountId: string,
    name: string,
    auth: AuthRequestContext,
  ) {
    const account = await this.prisma.registrarAccount.findUniqueOrThrow({
      where: { id: accountId },
    });
    let provider: DomainRegistrar = this.provider;
    if (account.mode === 'LIVE') {
      await this.reserveLiveRead(accountId, auth);
      provider = await this.liveProvider(accountId);
    } else this.requireSimulation();
    try {
      return await provider.quote(name);
    } catch {
      this.deny(
        'Registrar availability or cost could not be verified. No registration was submitted.',
      );
    }
  }
  async liveSettings(auth: AuthRequestContext) {
    this.administrator(auth);
    const account = (
      await this.prisma.registrarAccount.findMany({
        where: { mode: 'LIVE' },
        take: 100,
      })
    ).find(
      (entry) =>
        resellbizConfigurationSchema.safeParse(entry.configuration).success,
    );
    if (!account) return null;
    const config = resellbizConfigurationSchema.parse(account.configuration);
    const credential = await this.prisma.registrarCredential.findFirstOrThrow({
      where: { accountId: account.id },
      orderBy: { version: 'desc' },
    });
    const offer = await this.prisma.domainOffer.findFirstOrThrow({
      where: { accountId: account.id },
    });
    const price = await this.prisma.productPrice.findUniqueOrThrow({
      where: { id: offer.priceId },
    });
    return resellbizSettingsSchema.parse({
      id: account.id,
      mode: 'Live',
      enabled: account.enabled,
      networkEnabled: this.liveAllowed,
      maskedResellerId: `••••${config.resellerId.slice(-4)}`,
      credentialVersion: credential.version,
      agreementUrl: config.agreementUrl,
      customerTermsUrl: config.customerTermsUrl,
      customerPrivacyUrl: config.customerPrivacyUrl,
      nameservers: config.nameservers,
      sellingAmount: price.amount.toString(),
    });
  }
  async setupLive(raw: ResellbizSetup, auth: AuthRequestContext) {
    this.administrator(auth);
    const input = resellbizSetupSchema.parse(raw);
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(510051)::text`;
      if (await tx.registrarAccount.findFirst({ where: { mode: 'LIVE' } }))
        this.deny(
          'The live account is already configured. Replace its credential explicitly instead.',
        );
      const account = await tx.registrarAccount.create({
        data: {
          mode: 'LIVE',
          enabled: false,
          configuration: {
            resellerId: input.resellerId,
            nameservers: input.nameservers,
            agreementUrl: input.agreementUrl,
            customerTermsUrl: input.customerTermsUrl,
            customerPrivacyUrl: input.customerPrivacyUrl,
            confirmNativeUsdCosts: true,
          },
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
      const product = await tx.product.create({
        data: {
          kind: 'DOMAIN',
          slug: 'resellbiz-domain-com',
          name: '.com domain registration',
          status: 'ACTIVE',
          publicVisible: true,
          prices: {
            create: {
              billingPeriod: 'ANNUAL',
              currency: 'BDT',
              amount: BigInt(input.sellingAmount),
              setupFee: 0n,
            },
          },
        },
        include: { prices: true },
      });
      const price = product.prices[0];
      if (!price) throw new Error('Registrar price unavailable.');
      await tx.domainOffer.create({
        data: {
          accountId: account.id,
          productId: product.id,
          priceId: price.id,
          tld: 'com',
          nameservers: input.nameservers,
        },
      });
      await tx.activityLog.create({
        data: {
          actorUserId: auth.identity.userId,
          action: 'RESELLBIZ_CONFIGURED_DISABLED',
          entityType: 'REGISTRAR',
          entityId: account.id,
        },
      });
    });
    return this.liveSettings(auth);
  }
  async rotateLiveCredential(
    id: string,
    input: { resellerId: string; apiKey: string },
    auth: AuthRequestContext,
  ) {
    this.administrator(auth);
    input = resellbizCredentialSchema.parse(input);
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM registrar_accounts WHERE id=${id}::uuid FOR UPDATE`;
      const account = await tx.registrarAccount.findUniqueOrThrow({
        where: { id },
      });
      if (
        account.mode !== 'LIVE' ||
        resellbizConfigurationSchema.parse(account.configuration).resellerId !==
          input.resellerId
      )
        this.deny(
          'Credential replacement must retain the same reseller identity.',
        );
      const latest = await tx.registrarCredential.findFirstOrThrow({
        where: { accountId: id },
        orderBy: { version: 'desc' },
      });
      const version = latest.version + 1;
      await tx.registrarCredential.create({
        data: {
          accountId: id,
          version,
          ciphertext: this.cipher.encrypt(
            credentialBinding(id, version, 'LIVE'),
            input,
          ),
        },
      });
      await tx.registrarAccount.update({
        where: { id },
        data: { enabled: false },
      });
      await tx.activityLog.create({
        data: {
          actorUserId: auth.identity.userId,
          action: 'RESELLBIZ_CREDENTIAL_REPLACED_DISABLED',
          entityType: 'REGISTRAR',
          entityId: id,
        },
      });
    });
    return this.liveSettings(auth);
  }
  async checkLive(id: string, name: string, auth: AuthRequestContext) {
    this.administrator(auth);
    const account = await this.prisma.registrarAccount.findUniqueOrThrow({
      where: { id },
    });
    if (account.mode !== 'LIVE') this.deny('Select the live account.');
    const quote = await this.quoteFrom(id, domainNameSchema.parse(name), auth);
    return {
      available: quote.available,
      costAmount: quote.costAmount.toString(),
      costCurrency: quote.costCurrency,
      observedAt: quote.observedAt.toISOString(),
      simulated: false,
    };
  }
  async toggleLive(id: string, enabled: boolean, auth: AuthRequestContext) {
    this.administrator(auth);
    const checkedCredential = enabled
      ? await this.prisma.registrarCredential.findFirstOrThrow({
          where: { accountId: id },
          orderBy: { version: 'desc' },
        })
      : null;
    if (enabled) await this.checkLive(id, 'ordinary-example.com', auth);
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM registrar_accounts WHERE id=${id}::uuid FOR UPDATE`;
      const account = await tx.registrarAccount.findUniqueOrThrow({
        where: { id },
      });
      if (account.mode !== 'LIVE') this.deny('Select the live account.');
      if (
        enabled &&
        checkedCredential?.id !==
          (
            await tx.registrarCredential.findFirstOrThrow({
              where: { accountId: id },
              orderBy: { version: 'desc' },
            })
          ).id
      )
        this.deny(
          'Credential changed during the connection check. Check it again before enabling.',
        );
      await tx.registrarAccount.update({ where: { id }, data: { enabled } });
      await tx.activityLog.create({
        data: {
          actorUserId: auth.identity.userId,
          action: enabled ? 'RESELLBIZ_ENABLED' : 'REGISTRAR_DISABLED',
          entityType: 'REGISTRAR',
          entityId: id,
        },
      });
    });
    return this.liveSettings(auth);
  }
  async bindLiveContact(
    id: string,
    input: { remoteCustomerId: string; remoteContactId: string },
    auth: AuthRequestContext,
  ) {
    this.administrator(auth);
    const domain = await this.prisma.domain.findUniqueOrThrow({
      where: { id },
    });
    const account = await this.prisma.registrarAccount.findUniqueOrThrow({
      where: { id: domain.executionAccountId ?? domain.accountId },
    });
    if (account.mode !== 'LIVE') this.deny('Select a live domain request.');
    const quote = await this.prisma.domainQuote.findUniqueOrThrow({
      where: { id: domain.quoteId },
    });
    const contact = domainContactSchema.parse(
      this.cipher.decrypt(
        contactBinding(domain.accountId, domain.customerId, 'LIVE'),
        quote.contactCiphertext,
      ),
    );
    const fingerprint = registrarFingerprint(
      account.id,
      account.mode,
      domain.customerId,
      contact,
    );
    const provider = await this.liveProvider(account.id, {
      localCustomerId: domain.customerId,
      ...input,
    });
    await this.reserveLiveRead(account.id, auth);
    const intent: RegistrarIntent = {
      accountId: account.id,
      customerId: domain.customerId,
      domainName: domain.domainName,
      operationId: randomUUID(),
      nameservers: quote.nameservers as string[],
      contact,
      costCeiling: quote.costAmount,
    };
    try {
      await provider.ensureContacts(intent, fingerprint);
    } catch {
      this.deny(
        'Registrar customer/contact ownership or exact registrant data could not be verified. This check sent no mutation.',
      );
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM domains WHERE id=${id}::uuid FOR UPDATE`;
      const prior = await tx.registrarMapping.findUnique({
        where: {
          accountId_customerId_fingerprint: {
            accountId: account.id,
            customerId: domain.customerId,
            fingerprint,
          },
        },
      });
      if (
        prior &&
        (prior.remoteCustomerId !== input.remoteCustomerId ||
          prior.remoteContactId !== input.remoteContactId)
      )
        this.deny('A different immutable registrar contact is already bound.');
      if (!prior)
        await tx.registrarMapping.create({
          data: {
            accountId: account.id,
            customerId: domain.customerId,
            fingerprint,
            ...input,
          },
        });
      await tx.activityLog.create({
        data: {
          actorUserId: auth.identity.userId,
          action: 'RESELLBIZ_CONTACT_OWNERSHIP_VERIFIED',
          entityType: 'DOMAIN',
          entityId: id,
        },
      });
    });
    return this.detail(id, auth);
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
        'Sign in as the customer to accept the registration agreement.',
        HttpStatus.FORBIDDEN,
      );
    return auth.identity.customerId;
  }
  async settings() {
    const accounts = await this.prisma.registrarAccount.findMany({
      where: { mode: 'FAKE' },
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
    const existing = await this.prisma.registrarAccount.findFirst({
      where: { mode: 'FAKE' },
    });
    if (existing) return this.settings();
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(500050)::text`;
      if (await tx.registrarAccount.count({ where: { mode: 'FAKE' } })) return;
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
    if (
      (await this.prisma.registrarAccount.findUnique({ where: { id } }))
        ?.mode !== 'FAKE'
    )
      this.deny('Select a simulated account.');
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
    const managed = await this.prisma.domainCatalogueTld.findMany({
      orderBy: [{ displayOrder: 'asc' }, { tld: 'asc' }],
      take: 1000,
    });
    const catalogueResults = [];
    for (const catalogue of managed) {
      if (!catalogue.enabled || catalogue.tld !== 'com') continue;
      let context;
      try {
        context = await this.administration.catalogueContext(catalogue.tld);
      } catch (error) {
        if (error instanceof ApplicationException) continue;
        throw error;
      }
      if (!context) continue;
      const offer = await this.prisma.domainOffer.findUnique({
        where: {
          accountId_tld: { accountId: context.originId, tld: catalogue.tld },
        },
      });
      if (!offer) continue;
      const account = await this.prisma.registrarAccount.findUniqueOrThrow({
        where: { id: context.originId },
      });
      const price = await this.prisma.productPrice.findUniqueOrThrow({
        where: { id: context.snapshot.priceId },
        include: { product: true },
      });
      if (
        price.deletedAt ||
        price.product.deletedAt ||
        price.product.status !== 'ACTIVE' ||
        !price.product.publicVisible
      )
        continue;
      catalogueResults.push(
        domainOfferSchema.parse({
          id: offer.id,
          tld: catalogue.tld,
          years: 1,
          sellingAmount: price.amount.toString(),
          currency: 'BDT',
          nameservers: context.nameservers,
          simulated: account.mode === 'FAKE',
          ...(account.mode === 'LIVE'
            ? {
                agreementUrl: context.snapshot.policies.agreementUrl,
                customerTermsUrl: context.snapshot.policies.customerTermsUrl,
                customerPrivacyUrl:
                  context.snapshot.policies.customerPrivacyUrl,
              }
            : {
                costAmount: '1000',
                costCurrency: 'USD',
                observedAt: new Date().toISOString(),
              }),
          eligibleRegistrars: context.snapshot.eligibleRegistrars,
          selectionConsentRevision: this.selectionRevision(
            context.snapshot,
            context.nameservers,
          ),
          featured: catalogue.featured,
        }),
      );
    }
    const offers = await this.prisma.domainOffer.findMany({ take: 20 });
    const result = [...catalogueResults];
    for (const offer of offers) {
      if (managed.some((entry) => entry.tld === offer.tld)) continue;
      const account = await this.prisma.registrarAccount.findUniqueOrThrow({
        where: { id: offer.accountId },
      });
      if (
        account.mode === 'LIVE' &&
        registrarConnectionIdentitySchema.safeParse(account.configuration)
          .success
      )
        continue;
      const price = await this.prisma.productPrice.findUniqueOrThrow({
        where: { id: offer.priceId },
        include: { product: true },
      });
      if (
        !account.enabled ||
        (account.mode === 'FAKE'
          ? !this.simulationAllowed
          : account.mode !== 'LIVE' || !this.liveAllowed) ||
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
          simulated: account.mode === 'FAKE',
          ...(account.mode === 'LIVE'
            ? {
                agreementUrl: resellbizConfigurationSchema.parse(
                  account.configuration,
                ).agreementUrl,
                customerTermsUrl: resellbizConfigurationSchema.parse(
                  account.configuration,
                ).customerTermsUrl,
                customerPrivacyUrl: resellbizConfigurationSchema.parse(
                  account.configuration,
                ).customerPrivacyUrl,
              }
            : {
                costAmount: (
                  await this.provider.quote(`ordinary-example.${offer.tld}`)
                ).costAmount.toString(),
                costCurrency: 'USD',
                observedAt: new Date().toISOString(),
              }),
        }),
      );
    }
    return result;
  }
  async quote(input: DomainQuoteRequest, auth: AuthRequestContext) {
    this.requireRuntime();
    const customerId = this.customer(auth);
    return this.quoteForCustomer(input, auth, customerId);
  }
  async adminQuote(input: AdminDomainQuoteRequest, auth: AuthRequestContext) {
    this.administrator(auth);
    this.requireSimulation();
    const consentedAt = new Date(input.offlineConsent.consentedAt);
    if (consentedAt > new Date())
      this.deny('The recorded customer consent cannot be dated in the future.');
    const { customerId, offlineConsent, ...quoteInput } = input;
    return this.quoteForCustomer(
      { ...quoteInput, consent: true },
      auth,
      customerId,
      {
        method: offlineConsent.method,
        reference: offlineConsent.reference,
        consentedAt: offlineConsent.consentedAt,
        recordedAt: new Date().toISOString(),
        recordedBy: auth.identity.userId,
      },
    );
  }
  private async quoteForCustomer(
    input: DomainQuoteRequest,
    auth: AuthRequestContext,
    customerId: string,
    offlineConsent?: Prisma.InputJsonValue,
  ) {
    const offer = await this.prisma.domainOffer.findUnique({
      where: { id: input.offerId },
    });
    if (!offer || !input.domainName.endsWith(`.${offer.tld}`))
      this.deny('Select a matching supported domain offer.');
    const account = await this.prisma.registrarAccount.findUniqueOrThrow({
      where: { id: offer.accountId },
    });
    if (offlineConsent && account.mode !== 'FAKE')
      this.deny(
        'Admin-assisted orders currently support simulated registrar offers only.',
      );
    this.requireAccount(account);
    const catalogueContext = await this.administration.catalogueContext(
      offer.tld,
      offer.accountId,
    );
    if (
      catalogueContext &&
      input.selectionConsentRevision !==
        this.selectionRevision(
          catalogueContext.snapshot,
          catalogueContext.nameservers,
        )
    )
      this.deny(
        'The catalogue, DNS or registrar consent scope changed. Refresh and review the offer again.',
      );
    if (
      account.mode === 'LIVE' &&
      (!resellbizContactSchema.safeParse(input.contact).success ||
        input.customerPolicyConsent !== true)
    )
      this.deny(
        'Complete the registrar contact fields and accept the customer terms and privacy policy.',
      );
    if (
      input.agreement !==
      (account.mode === 'LIVE'
        ? 'resellbiz-registration-v1'
        : 'fictional-registration-v1')
    )
      this.deny('Accept the agreement for the selected registrar mode.');
    const price = await this.prisma.productPrice.findUniqueOrThrow({
      where: { id: catalogueContext?.snapshot.priceId ?? offer.priceId },
      include: { product: true },
    });
    if (
      (!catalogueContext && !price.isActive) ||
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
    const cost = await this.quoteFrom(account.id, input.domainName, auth);
    if (!cost.available) this.deny('The domain is unavailable.');
    const now = new Date();
    const quote = await this.prisma.$transaction(async (tx) => {
      if (catalogueContext) {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(510118)::text`;
        const fresh = await this.administration.catalogueContext(
          offer.tld,
          offer.accountId,
        );
        if (
          !fresh ||
          this.selectionRevision(fresh.snapshot, fresh.nameservers) !==
            input.selectionConsentRevision
        )
          this.deny('Domain configuration changed. Review a fresh quote.');
      }
      await tx.$queryRaw`SELECT id FROM customers WHERE id=${customerId}::uuid FOR UPDATE`;
      const customer = await tx.customer.findUniqueOrThrow({
        where: { id: customerId },
        include: { user: true },
      });
      if (
        customer.status !== 'ACTIVE' ||
        customer.deletedAt ||
        customer.user.status !== 'ACTIVE' ||
        (account.mode === 'LIVE' && !customer.user.emailVerifiedAt) ||
        customer.user.deletedAt
      )
        this.deny('The customer account is inactive.');
      const recent = await tx.domainQuote.count({
        where: { customerId, createdAt: { gt: new Date(Date.now() - 600000) } },
      });
      if (recent >= 10) this.deny('Please wait before requesting more quotes.');
      const stored = await tx.domainQuote.create({
        data: {
          customerId,
          accountId: account.id,
          offerId: offer.id,
          domainName: input.domainName,
          sellingAmount: price.amount,
          costAmount: cost.costAmount,
          costCurrency: cost.costCurrency,
          agreement: input.agreement,
          nameservers: (catalogueContext?.nameservers ??
            offer.nameservers) as Prisma.InputJsonValue,
          ...(catalogueContext
            ? { selectionSnapshot: catalogueContext.snapshot }
            : {}),
          ...(offlineConsent ? { offlineConsent } : {}),
          contactCiphertext: this.cipher.encrypt(
            contactBinding(account.id, customerId, account.mode),
            input.contact,
          ),
          fingerprint: createHash('sha256')
            .update(
              `stargate:${account.mode}:Contact:${account.id}:${customerId}:`,
            )
            .update(JSON.stringify(input.contact))
            .digest('hex'),
          expiresAt: new Date(now.getTime() + 300000),
        },
      });
      if (offlineConsent)
        await tx.activityLog.create({
          data: {
            actorUserId: auth.identity.userId,
            action: 'DOMAIN_OFFLINE_CONSENT_RECORDED',
            entityType: 'DOMAIN_QUOTE',
            entityId: stored.id,
            metadata: { customerId },
          },
        });
      return stored;
    });
    return domainQuoteSchema.parse({
      id: quote.id,
      domainName: quote.domainName,
      sellingAmount: quote.sellingAmount.toString(),
      currency: 'BDT',
      ...(account.mode === 'FAKE'
        ? {
            costAmount: quote.costAmount.toString(),
            costCurrency: quote.costCurrency,
          }
        : {}),
      expiresAt: quote.expiresAt.toISOString(),
      simulated: account.mode === 'FAKE',
    });
  }
  async purchase(input: DomainPurchaseRequest, auth: AuthRequestContext) {
    this.requireRuntime();
    const customerId = this.customer(auth);
    return this.purchaseForCustomer(input, auth, customerId, false);
  }
  async adminPurchase(
    input: AdminDomainPurchaseRequest,
    auth: AuthRequestContext,
  ) {
    this.administrator(auth);
    this.requireSimulation();
    return this.purchaseForCustomer(input, auth, input.customerId, true);
  }
  private async purchaseForCustomer(
    input: DomainPurchaseRequest,
    auth: AuthRequestContext,
    customerId: string,
    adminAssisted: boolean,
  ) {
    try {
      const id = await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM domain_quotes WHERE id=${input.quoteId}::uuid FOR UPDATE`;
        const quote = await tx.domainQuote.findUnique({
          where: { id: input.quoteId },
        });
        if (!quote || quote.customerId !== customerId)
          this.deny(
            'This quote is not available to your account.',
            HttpStatus.FORBIDDEN,
          );
        if (Boolean(quote.offlineConsent) !== adminAssisted)
          this.deny(
            'This quote cannot be ordered through this route.',
            HttpStatus.FORBIDDEN,
          );
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
        if (quote.expiresAt <= new Date())
          this.deny('The quote expired. Request a new quote explicitly.');
        const offer = await tx.domainOffer.findUniqueOrThrow({
          where: { id: quote.offerId },
        });
        const account = await tx.registrarAccount.findUniqueOrThrow({
          where: { id: quote.accountId },
        });
        const selection = quote.selectionSnapshot
          ? domainSelectionSnapshotSchema.parse(quote.selectionSnapshot)
          : null;
        if (selection) {
          await tx.$queryRaw`SELECT pg_advisory_xact_lock(510118)::text`;
          const fresh = await this.administration.catalogueContext(
            offer.tld,
            quote.accountId,
          );
          if (
            !fresh ||
            JSON.stringify(fresh.snapshot) !== JSON.stringify(selection) ||
            JSON.stringify(fresh.nameservers) !==
              JSON.stringify(quote.nameservers)
          )
            this.deny(
              'The price, DNS or consent scope changed. Request a new quote.',
            );
        }
        const price = await tx.productPrice.findUniqueOrThrow({
          where: { id: selection?.priceId ?? offer.priceId },
          include: { product: true },
        });
        const customer = await tx.customer.findUniqueOrThrow({
          where: { id: customerId },
          include: { user: true },
        });
        this.requireAccount(account);
        if (adminAssisted && account.mode !== 'FAKE')
          this.deny(
            'Admin-assisted orders currently support simulated registrar offers only.',
          );
        if (
          !account.enabled ||
          (!selection && !price.isActive) ||
          price.deletedAt ||
          price.product.deletedAt ||
          price.product.status !== 'ACTIVE' ||
          !price.product.publicVisible ||
          price.amount !== quote.sellingAmount ||
          customer.status !== 'ACTIVE' ||
          customer.deletedAt ||
          customer.user.status !== 'ACTIVE' ||
          (account.mode === 'LIVE' && !customer.user.emailVerifiedAt) ||
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
                  account.mode === 'LIVE'
                    ? 'One-year domain registration; requires verified payment and separate administrator approval.'
                    : 'Simulated one-year domain registration; no external calls or charges.',
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
                descriptionSnapshot: `${account.mode === 'LIVE' ? 'Registration' : 'Simulated registration'} of ${quote.domainName} for one year`,
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
            action: adminAssisted
              ? 'SIMULATED_ADMIN_DOMAIN_ORDER_CREATED'
              : account.mode === 'LIVE'
                ? 'LIVE_DOMAIN_ORDER_CREATED'
                : 'SIMULATED_DOMAIN_ORDER_CREATED',
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
        const replayQuote = prior
          ? await this.prisma.domainQuote.findUnique({
              where: { id: prior.quoteId },
            })
          : null;
        if (
          prior?.customerId === customerId &&
          prior.quoteId === input.quoteId &&
          Boolean(replayQuote?.offlineConsent) === adminAssisted
        )
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
    const account = await this.prisma.registrarAccount.findUniqueOrThrow({
      where: { id: domain.executionAccountId ?? domain.accountId },
    });
    if (account.mode === 'LIVE' && auth.identity.role === 'ADMIN')
      this.administrator(auth);
    const operation = await this.prisma.registrarOperation.findUnique({
      where: { domainId: id },
    });
    const selection = quote.selectionSnapshot
      ? domainSelectionSnapshotSchema.parse(quote.selectionSnapshot)
      : null;
    const profile = await this.prisma.registrarProfile.findUnique({
      where: { accountId: account.id },
    });
    const catalogue = await this.prisma.domainCatalogueTld.findUnique({
      where: { tld: domain.domainName.split('.').at(-1) ?? '' },
    });
    const globalDefault = await this.prisma.registrarProfile.findFirst({
      where: { isDefault: true },
    });
    const recommended =
      catalogue?.preferredRegistrarId ??
      globalDefault?.accountId ??
      domain.accountId;
    const choices = [];
    if (auth.identity.role === 'ADMIN') {
      for (const entry of selection?.eligibleRegistrars ?? [
        {
          id: domain.accountId,
          name: profile?.name ?? 'StarGate/UK2 (resell.biz)',
        },
      ]) {
        const eligible = await this.prisma.registrarAccount.findUnique({
          where: { id: entry.id },
        });
        if (eligible?.enabled && eligible.mode === account.mode)
          choices.push({ ...entry, isDefault: entry.id === recommended });
      }
    }
    return domainDetailSchema.parse({
      id,
      domainName: domain.domainName,
      state:
        domain.state === 'AWAITING_PAYMENT' && invoice.status === 'PAID'
          ? 'AWAITING_APPROVAL'
          : domain.state,
      verification: domain.verification,
      expiresAt: domain.expiresAt?.toISOString() ?? null,
      simulated: account.mode === 'FAKE',
      ...(account.mode === 'LIVE'
        ? {
            agreementUrl:
              selection?.policies.agreementUrl ??
              resellbizConfigurationSchema.parse(account.configuration)
                .agreementUrl,
          }
        : {}),
      autoRenew: false,
      registrar: profile?.name ?? 'StarGate/UK2 (resell.biz)',
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
            accountId: account.id,
            costAmount: quote.costAmount.toString(),
            costCurrency: quote.costCurrency,
            contact: this.cipher.decrypt(
              contactBinding(domain.accountId, domain.customerId, account.mode),
              quote.contactCiphertext,
            ),
            ...(quote.offlineConsent
              ? {
                  offlineConsent: adminOfflineConsentEvidenceSchema.parse(
                    quote.offlineConsent,
                  ),
                }
              : {}),
            operationId: operation?.id ?? null,
            dispatchClaimed: Boolean(operation?.claimedAt),
            ...(catalogue
              ? {
                  renewalSellingAmount:
                    catalogue.renewalAmount?.toString() ?? null,
                  renewalCatalogueRevision: catalogue.revision,
                }
              : {}),
            selectedRegistrarId:
              operation?.selectedAccountId ?? (operation ? account.id : null),
            eligibleRegistrars: choices,
            contactMappingVerified:
              account.mode === 'FAKE' ||
              Boolean(
                await this.prisma.registrarMapping.findUnique({
                  where: {
                    accountId_customerId_fingerprint: {
                      accountId: account.id,
                      customerId: domain.customerId,
                      fingerprint:
                        operation?.selectionFingerprint ?? quote.fingerprint,
                    },
                  },
                }),
              ),
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
    this.requireRuntime();
    this.administrator(auth);
    const domain = await this.prisma.domain.findUniqueOrThrow({
      where: { id },
    });
    if (input.confirmation !== domain.domainName)
      this.deny('Type the exact domain name to approve.');
    const quote = await this.prisma.domainQuote.findUniqueOrThrow({
      where: { id: domain.quoteId },
    });
    const selection = quote.selectionSnapshot
      ? domainSelectionSnapshotSchema.parse(quote.selectionSnapshot)
      : null;
    if (selection && !input.registrarAccountId)
      this.deny('Select and review the registrar before approval.');
    const selectedAccountId = input.registrarAccountId ?? domain.accountId;
    if (
      !(selection?.eligibleRegistrars ?? [{ id: domain.accountId }]).some(
        (entry) => entry.id === selectedAccountId,
      )
    )
      this.deny(
        'This registrar was not included in the customer consent. Request new customer consent, not an automatic provider switch.',
      );
    const approvalAccount =
      await this.prisma.registrarAccount.findUniqueOrThrow({
        where: { id: selectedAccountId },
      });
    this.requireAccount(approvalAccount);
    const origin = await this.prisma.registrarAccount.findUniqueOrThrow({
      where: { id: domain.accountId },
    });
    if (approvalAccount.mode !== origin.mode)
      this.deny('Simulation and live registrar accounts cannot be mixed.');
    const checkedCredential =
      await this.prisma.registrarCredential.findFirstOrThrow({
        where: { accountId: selectedAccountId },
        orderBy: { version: 'desc' },
      });
    if (approvalAccount.mode === 'LIVE' && !input.acceptPriceChangeRisk)
      this.deny(
        'Confirm the real purchase and non-atomic provider price-change risk.',
      );
    const cost = await this.quoteFrom(
      selectedAccountId,
      domain.domainName,
      auth,
    );
    if (!cost.available || cost.costAmount > BigInt(input.costCeiling))
      this.deny('Availability or the approved native cost ceiling changed.');
    await this.prisma.$transaction(async (tx) => {
      await lockDomainInvoice(tx, domain.invoiceId);
      await tx.$queryRaw`SELECT id FROM domains WHERE id=${id}::uuid FOR UPDATE`;
      const current = await tx.domain.findUniqueOrThrow({ where: { id } });
      const account = await tx.registrarAccount.findUniqueOrThrow({
        where: { id: selectedAccountId },
      });
      this.requireAccount(account);
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
        where: { accountId: current.accountId },
        orderBy: { version: 'desc' },
      });
      const selectedCredential = await tx.registrarCredential.findFirstOrThrow({
        where: { accountId: selectedAccountId },
        orderBy: { version: 'desc' },
      });
      if (selectedCredential.id !== checkedCredential.id)
        this.deny(
          'Registrar credentials changed during approval. Review again.',
        );
      if (
        prior &&
        (prior.selectedAccountId ?? prior.accountId) !== selectedAccountId
      )
        this.deny(
          'The approved registrar cannot be changed. Reconcile this request instead.',
        );
      const contact = this.cipher.decrypt(
        contactBinding(domain.accountId, domain.customerId, origin.mode),
        quote.contactCiphertext,
      );
      const operation =
        prior ??
        (await tx.registrarOperation.create({
          data: {
            domainId: id,
            customerId: current.customerId,
            accountId: current.accountId,
            credentialId: credential.id,
            ...(selection
              ? {
                  selectedAccountId,
                  selectedCredentialId: selectedCredential.id,
                  selectionFingerprint: registrarFingerprint(
                    selectedAccountId,
                    account.mode,
                    current.customerId,
                    contact,
                  ),
                }
              : {}),
            actorUserId: auth.identity.userId,
            costCeiling: BigInt(input.costCeiling),
            priceChangeRiskAccepted:
              account.mode === 'LIVE' && input.acceptPriceChangeRisk === true,
          },
        }));
      if (operation.costCeiling !== BigInt(input.costCeiling))
        this.deny(
          'The approved cost ceiling cannot be changed on an existing operation.',
        );
      await tx.domain.update({
        where: { id },
        data: {
          state: 'PENDING',
          ...(selection ? { executionAccountId: selectedAccountId } : {}),
        },
      });
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
  async checkRegistration(
    id: string,
    accountId: string,
    auth: AuthRequestContext,
  ) {
    this.administrator(auth);
    const detail = await this.detail(id, auth);
    if (detail.dispatchClaimed || detail.operationId)
      this.deny(
        'This request already has an immutable approval. Reconcile it instead.',
      );
    if (!detail.eligibleRegistrars?.some((entry) => entry.id === accountId))
      this.deny('Select a registrar within the customer consent scope.');
    const domain = await this.prisma.domain.findUniqueOrThrow({
      where: { id },
    });
    const account = await this.prisma.registrarAccount.findUniqueOrThrow({
      where: { id: accountId },
    });
    this.requireAccount(account);
    const quote = await this.quoteFrom(accountId, domain.domainName, auth);
    return {
      registrarAccountId: accountId,
      available: quote.available,
      costAmount: quote.costAmount.toString(),
      costCurrency: quote.costCurrency,
      simulated: quote.simulated,
      observedAt: quote.observedAt.toISOString(),
    };
  }
  async reconcile(id: string, auth: AuthRequestContext) {
    this.requireRuntime();
    this.administrator(auth);
    const operation = await this.prisma.registrarOperation.findUnique({
      where: { domainId: id },
    });
    if (operation)
      this.requireAccount(
        await this.prisma.registrarAccount.findUniqueOrThrow({
          where: { id: operation.selectedAccountId ?? operation.accountId },
        }),
      );
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
  async managementContext(
    id: string,
    auth: AuthRequestContext,
    credentialId?: string,
  ) {
    await this.detail(id, auth); // Resource ownership and administrator MFA enforced before credential access.
    const domain = await this.prisma.domain.findUniqueOrThrow({
      where: { id },
    });
    const account = await this.prisma.registrarAccount.findUniqueOrThrow({
      where: { id: domain.executionAccountId ?? domain.accountId },
    });
    this.requireAccount(account);
    if (
      account.mode !== 'LIVE' ||
      domain.state !== 'REGISTERED' ||
      !domain.providerOrderId ||
      !domain.expiresAt
    )
      this.deny('Only a confirmed live registration can be managed.');
    const customer = await this.prisma.customer.findUniqueOrThrow({
      where: { id: domain.customerId },
      include: { user: true },
    });
    if (
      customer.deletedAt ||
      customer.status !== 'ACTIVE' ||
      customer.user.deletedAt ||
      customer.user.status !== 'ACTIVE' ||
      !customer.user.emailVerifiedAt
    )
      this.deny(
        'The customer account is not eligible for registrar operations.',
      );
    const quote = await this.prisma.domainQuote.findUniqueOrThrow({
      where: { id: domain.quoteId },
    });
    const mapping = await this.prisma.registrarMapping.findUniqueOrThrow({
      where: {
        accountId_customerId_fingerprint: {
          accountId: account.id,
          customerId: domain.customerId,
          fingerprint:
            (
              await this.prisma.registrarOperation.findUnique({
                where: { domainId: id },
              })
            )?.selectionFingerprint ?? quote.fingerprint,
        },
      },
    });
    const provider = await this.liveProvider(
      account.id,
      {
        localCustomerId: domain.customerId,
        remoteCustomerId: mapping.remoteCustomerId,
        remoteContactId: mapping.remoteContactId,
      },
      credentialId,
    );
    const intent: RegistrarIntent = {
      operationId: id,
      accountId: account.id,
      customerId: domain.customerId,
      domainName: domain.domainName,
      nameservers: quote.nameservers as string[],
      contact: domainContactSchema.parse(
        this.cipher.decrypt(
          contactBinding(domain.accountId, domain.customerId, 'LIVE'),
          quote.contactCiphertext,
        ),
      ),
      costCeiling: quote.costAmount,
    };
    return {
      domain,
      account,
      customer,
      provider,
      intent,
      orderId: domain.providerOrderId,
    };
  }
  async reserveManagementRead(accountId: string, auth: AuthRequestContext) {
    return this.reserveLiveRead(accountId, auth);
  }
}
