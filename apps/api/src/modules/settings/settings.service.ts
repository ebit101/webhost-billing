import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { ApiEnvironment } from '@webhost-billing/config';
import {
  SettingCategory,
  type Prisma,
  type PrismaClient,
} from '@webhost-billing/database';
import {
  DEFAULT_BUSINESS_SETTINGS,
  DEFAULT_PUBLIC_PREFERENCES,
  DEFAULT_CHECKOUT_TERMS,
  checkoutTermsPolicySchema,
  type CheckoutTermsInput,
  displayPreferencesSchema,
  publicWebsiteSchema,
  type PublicPreferences,
  activeProviderSettingsSchema,
  businessIdentitySchema,
  businessLocalizationSettingsSchema,
  currencyCodeSchema,
  updateBusinessSettingsRequestSchema,
  emailBrandingSettingsSchema,
  invoiceNumberingSettingsSchema,
  manualPaymentInstructionsSchema,
  paymentSettingsSchema,
  renewalAutomationPolicySchema,
  settingsOverviewSchema,
  terminationPolicySchema,
  type BusinessSettings,
  type PatchBusinessSettingsRequest,
  type UpdateBusinessSettingsRequest,
  type SettingsOverview,
} from '@webhost-billing/shared';
import { ApplicationException } from '../../common/errors/application.exception';
import type { SecurityRequestContext } from '../../common/http/request-context';
import { PRISMA_CLIENT } from '../../infrastructure/database/database.module';
import { API_ENVIRONMENT } from '../../infrastructure/environment/environment.module';
import type { AuthRequestContext } from '../auth/auth.types';
import { IntegrationCredentialService } from './integration-credential.service';
import {
  lockPartialPaymentPolicy,
  updatePartialPaymentPolicy,
} from '../payments/partial-payment-policy';

import { CHECKOUT_TERMS_KEY, readCheckoutTerms } from './checkout-terms';

const KEYS = {
  businessIdentity: 'business.identity',
  checkoutTerms: CHECKOUT_TERMS_KEY,
  website: 'business.public-website',
  displayPreferences: 'business.display-preferences',
  localization: 'business.localization',
  currencySelection: 'business.currency-selection',
  invoiceNumbering: 'billing.invoice-numbering',
  renewal: 'automation.renewal-policy',
  termination: 'business.termination-policy',
  manualPayment: 'billing.manual-payments',
  manualPaymentInstructions: 'billing.manual-payment-instructions',
  emailBranding: 'email.branding',
  activeProviders: 'integration.active-providers',
} as const;

@Injectable()
export class SettingsService {
  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient,
    @Inject(API_ENVIRONMENT) private readonly environment: ApiEnvironment,
    private readonly credentials: IntegrationCredentialService,
  ) {}

  async overview(
    database: Pick<
      PrismaClient,
      'setting' | 'integrationCredential' | 'server' | 'invoice'
    > = this.prisma,
  ): Promise<SettingsOverview> {
    const [settings, credentialRecords, cpanelServers] = await Promise.all([
      database.setting.findMany({
        where: { key: { in: Object.values(KEYS) } },
        select: { key: true, value: true },
      }),
      database.integrationCredential.findMany({
        where: { providerKey: { in: ['bkash', 'sslcommerz'] } },
        select: {
          providerKey: true,
          maskedIdentifier: true,
          keyVersion: true,
          updatedAt: true,
        },
      }),
      database.server.findMany({
        where: {
          adapterKey: 'cpanel-whm',
          credentialsCiphertext: { not: null },
          deletedAt: null,
        },
        select: { credentialKeyVersion: true, updatedAt: true },
      }),
    ]);
    const values = new Map(settings.map((entry) => [entry.key, entry.value]));
    const localization = this.parse(
      businessLocalizationSettingsSchema,
      values.get(KEYS.localization),
      {
        currency: DEFAULT_BUSINESS_SETTINGS.currency,
        timeZone: DEFAULT_BUSINESS_SETTINGS.timeZone,
      },
    );
    const confirmedCurrency = this.confirmedCurrency(
      values.get(KEYS.currencySelection),
    );
    const currency = confirmedCurrency ?? localization.currency;
    const currencyLocked = await this.currencyIsLocked(
      database,
      currency,
      confirmedCurrency,
    );
    const paymentPolicy = this.parse(
      paymentSettingsSchema,
      values.get(KEYS.manualPayment),
      {
        partialPaymentsEnabled:
          DEFAULT_BUSINESS_SETTINGS.manualPayments.partialPaymentsEnabled,
      },
    );
    const paymentInstructions = this.parse(
      manualPaymentInstructionsSchema.pick({ instructions: true }),
      values.get(KEYS.manualPaymentInstructions),
      { instructions: DEFAULT_BUSINESS_SETTINGS.manualPayments.instructions },
    );
    const activeProviders = this.parse(
      activeProviderSettingsSchema,
      values.get(KEYS.activeProviders),
      {
        activeGateway: DEFAULT_BUSINESS_SETTINGS.activeGateway,
        activeHostingPanelAdapter:
          DEFAULT_BUSINESS_SETTINGS.activeHostingPanelAdapter,
      },
    );
    const credentialByProvider = new Map(
      credentialRecords.map((entry) => [entry.providerKey, entry]),
    );
    const latestCpanelUpdate = cpanelServers.reduce<Date | null>(
      (latest, server) =>
        !latest || server.updatedAt > latest ? server.updatedAt : latest,
      null,
    );
    const cpanelKeyVersions = new Set(
      cpanelServers
        .map((server) => server.credentialKeyVersion)
        .filter((value): value is string => Boolean(value)),
    );
    return settingsOverviewSchema.parse({
      businessIdentity: this.parse(
        businessIdentitySchema,
        values.get(KEYS.businessIdentity),
        DEFAULT_BUSINESS_SETTINGS.businessIdentity,
      ),
      ...localization,
      currency,
      currencyLocked,
      invoiceNumbering: this.parse(
        invoiceNumberingSettingsSchema,
        values.get(KEYS.invoiceNumbering),
        DEFAULT_BUSINESS_SETTINGS.invoiceNumbering,
      ),
      renewalAutomation: {
        ...this.parse(
          renewalAutomationPolicySchema,
          values.get(KEYS.renewal),
          DEFAULT_BUSINESS_SETTINGS.renewalAutomation,
        ),
        timeZone: localization.timeZone,
      },
      terminationPolicy: this.parse(
        terminationPolicySchema,
        values.get(KEYS.termination),
        DEFAULT_BUSINESS_SETTINGS.terminationPolicy,
      ),
      manualPayments: { ...paymentPolicy, ...paymentInstructions },
      emailBranding: this.parse(
        emailBrandingSettingsSchema,
        values.get(KEYS.emailBranding),
        DEFAULT_BUSINESS_SETTINGS.emailBranding,
      ),
      ...activeProviders,
      preferences: this.readPreferences(values),
      credentialStatuses: [
        this.paymentCredentialStatus('bkash', credentialByProvider),
        this.paymentCredentialStatus('sslcommerz', credentialByProvider),
        {
          provider: 'cpanel-whm',
          configured: cpanelServers.length > 0,
          maskedIdentifier:
            cpanelServers.length > 0
              ? `${cpanelServers.length} WHM server${cpanelServers.length === 1 ? '' : 's'}`
              : null,
          updatedAt: latestCpanelUpdate?.toISOString() ?? null,
          keyVersion:
            cpanelKeyVersions.size === 1
              ? ([...cpanelKeyVersions][0] ?? null)
              : cpanelKeyVersions.size > 1
                ? 'mixed'
                : null,
          managedAt: 'HOSTING_SERVERS',
        },
      ],
    });
  }

  private readPreferences(
    values: ReadonlyMap<string, unknown>,
  ): PublicPreferences {
    const { website, ...defaults } = DEFAULT_PUBLIC_PREFERENCES;
    return {
      ...this.parse(
        displayPreferencesSchema,
        values.get(KEYS.displayPreferences),
        defaults,
      ),
      website: this.parse(
        z.object({ url: publicWebsiteSchema }),
        values.get(KEYS.website),
        { url: website },
      ).url,
      checkoutTerms: this.parse(
        checkoutTermsPolicySchema,
        values.get(KEYS.checkoutTerms),
        DEFAULT_CHECKOUT_TERMS,
      ),
    };
  }

  async publicPreferences(): Promise<PublicPreferences> {
    const records = await this.prisma.setting.findMany({
      where: {
        key: {
          in: [KEYS.website, KEYS.displayPreferences, KEYS.checkoutTerms],
        },
      },
      select: { key: true, value: true },
    });
    const values = new Map(records.map(({ key, value }) => [key, value]));
    return {
      ...this.readPreferences(values),
      checkoutTerms: readCheckoutTerms(values.get(KEYS.checkoutTerms)),
    };
  }

  async presentation(): Promise<{ timeZone: string }> {
    const record = await this.prisma.setting.findUnique({
      where: { key: KEYS.localization },
      select: { value: true },
    });
    const localization = this.parse(
      businessLocalizationSettingsSchema,
      record?.value,
      {
        currency: DEFAULT_BUSINESS_SETTINGS.currency,
        timeZone: DEFAULT_BUSINESS_SETTINGS.timeZone,
      },
    );
    return { timeZone: localization.timeZone };
  }

  async update(
    input: UpdateBusinessSettingsRequest,
    actor: AuthRequestContext,
    context: SecurityRequestContext,
  ): Promise<SettingsOverview> {
    const settings = updateBusinessSettingsRequestSchema.parse(input);
    await this.validateActiveGateway(settings.activeGateway);
    await this.prisma.$transaction(async (transaction) => {
      await this.lockSetting(
        transaction,
        KEYS.renewal,
        SettingCategory.AUTOMATION,
        DEFAULT_BUSINESS_SETTINGS.renewalAutomation,
      );
      await this.persist(
        transaction,
        settings,
        new Set(Object.values(KEYS)),
        actor,
        context,
      );
    });
    return this.overview();
  }

  async patch(
    input: PatchBusinessSettingsRequest,
    actor: AuthRequestContext,
    context: SecurityRequestContext,
  ): Promise<SettingsOverview> {
    if (input.checkoutTerms)
      return this.saveCheckoutTerms(input.checkoutTerms, actor, context);
    if (input.activeProviders)
      await this.validateActiveGateway(input.activeProviders.activeGateway);
    const keys = new Set<string>();
    if (input.businessIdentity) keys.add(KEYS.businessIdentity);
    if (input.website !== undefined) keys.add(KEYS.website);
    if (input.displayPreferences) keys.add(KEYS.displayPreferences);
    if (input.localization) keys.add(KEYS.localization);
    if (input.localization || input.renewalAutomation) keys.add(KEYS.renewal);
    if (input.invoiceNumbering && Object.keys(input.invoiceNumbering).length)
      keys.add(KEYS.invoiceNumbering);
    if (input.manualPayments) keys.add(KEYS.manualPaymentInstructions);
    if (input.emailBranding) keys.add(KEYS.emailBranding);
    if (input.activeProviders) keys.add(KEYS.activeProviders);
    if (!keys.size) return this.overview();

    await this.prisma.$transaction(async (transaction) => {
      if (input.manualPayments) await lockPartialPaymentPolicy(transaction);
      // Lock the same settings rows used by automation and invoice allocation
      // before merging fields whose persisted values can change independently.
      if (keys.has(KEYS.renewal)) {
        await this.lockSetting(
          transaction,
          KEYS.renewal,
          SettingCategory.AUTOMATION,
          DEFAULT_BUSINESS_SETTINGS.renewalAutomation,
        );
      }
      if (keys.has(KEYS.invoiceNumbering)) {
        await this.lockSetting(
          transaction,
          KEYS.invoiceNumbering,
          SettingCategory.BILLING,
          DEFAULT_BUSINESS_SETTINGS.invoiceNumbering,
        );
      }
      const { credentialStatuses, preferences, currencyLocked, ...current } =
        await this.overview(transaction);
      void credentialStatuses;
      void preferences;
      void currencyLocked;
      const localization = input.localization ?? {
        currency: current.currency,
        timeZone: current.timeZone,
      };
      const result = updateBusinessSettingsRequestSchema.safeParse({
        ...current,
        ...localization,
        ...(input.activeProviders ?? {}),
        businessIdentity: input.businessIdentity ?? current.businessIdentity,
        invoiceNumbering: {
          ...current.invoiceNumbering,
          ...input.invoiceNumbering,
        },
        renewalAutomation: {
          ...(input.renewalAutomation ?? current.renewalAutomation),
          timeZone: localization.timeZone,
        },
        manualPayments: { ...current.manualPayments, ...input.manualPayments },
        emailBranding: input.emailBranding ?? current.emailBranding,
        partialPaymentPolicyConfirmation:
          input.partialPaymentPolicyConfirmation,
      });
      if (!result.success)
        throw this.invalid(
          result.error.issues[0]?.message ??
            'Review the settings and try again.',
        );
      await this.persist(transaction, result.data, keys, actor, context, input);
    });
    return this.overview();
  }

  private async saveCheckoutTerms(
    input: CheckoutTermsInput,
    actor: AuthRequestContext,
    context: SecurityRequestContext,
  ) {
    await this.prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${CHECKOUT_TERMS_KEY}, 0))::text`;
      const row = await transaction.setting.findUnique({
        where: { key: CHECKOUT_TERMS_KEY },
        select: { value: true },
      });
      const previous = checkoutTermsPolicySchema.safeParse(row?.value);
      if (
        previous.success &&
        previous.data.required === input.required &&
        previous.data.url === input.url &&
        previous.data.revision === input.revision
      )
        return;
      const policy = checkoutTermsPolicySchema.parse({
        ...input,
        version: randomUUID(),
      });
      const setting = this.setting(
        CHECKOUT_TERMS_KEY,
        SettingCategory.BUSINESS,
        policy,
        'Customer checkout terms policy.',
      );
      await transaction.setting.upsert({
        where: { key: setting.key },
        create: { ...setting, updatedByUserId: actor.identity.userId },
        update: {
          value: setting.value,
          updatedByUserId: actor.identity.userId,
        },
      });
      await transaction.activityLog.create({
        data: {
          actorUserId: actor.identity.userId,
          action: 'CHECKOUT_TERMS_UPDATED_BY_ADMIN',
          entityType: 'SETTING',
          ipAddressHash: context.ipAddressHash,
          metadata: {
            required: policy.required,
            version: policy.version,
            revision: policy.revision,
          },
        },
      });
    });
    return this.overview();
  }

  private async lockSetting(
    transaction: Prisma.TransactionClient,
    key: string,
    category: SettingCategory,
    value: Prisma.InputJsonValue,
  ) {
    await transaction.setting.upsert({
      where: { key },
      update: {},
      create: { key, category, value },
    });
    await transaction.$queryRaw`
      SELECT "id" FROM "settings" WHERE "key" = ${key} FOR UPDATE
    `;
  }

  private async persist(
    transaction: Prisma.TransactionClient,
    settings: UpdateBusinessSettingsRequest,
    keys: ReadonlySet<string>,
    actor: AuthRequestContext,
    context: SecurityRequestContext,
    preferences?: Pick<
      PatchBusinessSettingsRequest,
      'website' | 'displayPreferences' | 'confirmCurrency'
    >,
  ) {
    let confirmedCurrency: string | undefined;
    if (keys.has(KEYS.localization)) {
      await transaction.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${KEYS.currencySelection}, 0))::text`;
      const rows = await transaction.setting.findMany({
        where: { key: { in: [KEYS.localization, KEYS.currencySelection] } },
        select: { key: true, value: true },
      });
      const values = new Map(rows.map(({ key, value }) => [key, value]));
      const selection = this.confirmedCurrency(
        values.get(KEYS.currencySelection),
      );
      const localization = businessLocalizationSettingsSchema.safeParse(
        values.get(KEYS.localization),
      );
      const current =
        selection ??
        (localization.success
          ? localization.data.currency
          : DEFAULT_BUSINESS_SETTINGS.currency);
      const locked = await this.currencyIsLocked(
        transaction,
        current,
        selection,
      );
      if (settings.currency !== current) {
        if (locked) throw this.invalid('The business currency is locked.');
        if (!preferences?.confirmCurrency)
          throw this.invalid('Confirm the business currency before saving it.');
        if (!Intl.supportedValuesOf('currency').includes(settings.currency))
          throw this.invalid('Select a supported business currency.');
      }
      if (!locked && preferences?.confirmCurrency)
        confirmedCurrency = settings.currency;
    }
    if (keys.has(KEYS.manualPaymentInstructions))
      await updatePartialPaymentPolicy(
        transaction,
        settings.manualPayments.partialPaymentsEnabled,
        settings.partialPaymentPolicyConfirmation,
        actor,
        context,
      );
    const writes = [
      this.setting(
        KEYS.businessIdentity,
        SettingCategory.BUSINESS,
        settings.businessIdentity,
        'Legal identity snapshot source for future invoices.',
      ),
      this.setting(
        KEYS.renewal,
        SettingCategory.AUTOMATION,
        settings.renewalAutomation,
        'Renewal invoice, reminder, overdue, and grace policy.',
      ),
      this.setting(
        KEYS.localization,
        SettingCategory.BUSINESS,
        { currency: settings.currency, timeZone: settings.timeZone },
        'Operating currency and IANA business time zone.',
      ),
      this.setting(
        KEYS.invoiceNumbering,
        SettingCategory.BILLING,
        settings.invoiceNumbering,
        'Sequential numbering policy for future invoices.',
      ),
      this.setting(
        KEYS.termination,
        SettingCategory.AUTOMATION,
        settings.terminationPolicy,
        'Permanent hosting termination policy.',
      ),
      this.setting(
        KEYS.manualPaymentInstructions,
        SettingCategory.BILLING,
        { instructions: settings.manualPayments.instructions },
        'Customer-visible manual-payment instructions.',
      ),
      this.setting(
        KEYS.emailBranding,
        SettingCategory.EMAIL,
        settings.emailBranding,
        'Branding and sender identity for future email messages.',
      ),
      this.setting(
        KEYS.activeProviders,
        SettingCategory.INTEGRATION,
        {
          activeGateway: settings.activeGateway,
          activeHostingPanelAdapter: settings.activeHostingPanelAdapter,
        },
        'Active payment and hosting integration adapters.',
      ),
    ].filter((write) => keys.has(write.key));
    if (confirmedCurrency) {
      writes.push(
        this.setting(
          KEYS.currencySelection,
          SettingCategory.BUSINESS,
          { currency: confirmedCurrency },
          'One-time business currency selection.',
        ),
      );
    }
    if (preferences?.website !== undefined)
      writes.push(
        this.setting(
          KEYS.website,
          SettingCategory.BUSINESS,
          { url: preferences.website },
          'Public business website.',
        ),
      );
    if (preferences?.displayPreferences)
      writes.push(
        this.setting(
          KEYS.displayPreferences,
          SettingCategory.BUSINESS,
          preferences.displayPreferences,
          'Default country and date display formats.',
        ),
      );
    for (const write of writes) {
      await transaction.setting.upsert({
        where: { key: write.key },
        update: {
          category: write.category,
          value: write.value,
          description: write.description,
          updatedByUserId: actor.identity.userId,
        },
        create: {
          ...write,
          updatedByUserId: actor.identity.userId,
        },
      });
    }
    await transaction.activityLog.create({
      data: {
        actorUserId: actor.identity.userId,
        action: 'BUSINESS_SETTINGS_UPDATED_BY_ADMIN',
        entityType: 'SETTING',
        ipAddressHash: context.ipAddressHash,
        metadata: {
          keys: writes.map((write) => write.key),
          ...(keys.has(KEYS.activeProviders)
            ? {
                activeGateway: settings.activeGateway,
                activeHostingPanelAdapter: settings.activeHostingPanelAdapter,
              }
            : {}),
        },
      },
    });
  }

  async activeGateway(): Promise<BusinessSettings['activeGateway']> {
    const setting = await this.prisma.setting.findUnique({
      where: { key: KEYS.activeProviders },
      select: { value: true },
    });
    return this.parse(activeProviderSettingsSchema, setting?.value, {
      activeGateway: DEFAULT_BUSINESS_SETTINGS.activeGateway,
      activeHostingPanelAdapter:
        DEFAULT_BUSINESS_SETTINGS.activeHostingPanelAdapter,
    }).activeGateway;
  }

  async activeHostingPanelAdapter(): Promise<
    BusinessSettings['activeHostingPanelAdapter']
  > {
    const setting = await this.prisma.setting.findUnique({
      where: { key: KEYS.activeProviders },
      select: { value: true },
    });
    if (!setting && this.environment.NODE_ENV !== 'production') {
      return 'fake-panel';
    }
    return this.parse(activeProviderSettingsSchema, setting?.value, {
      activeGateway: DEFAULT_BUSINESS_SETTINGS.activeGateway,
      activeHostingPanelAdapter:
        DEFAULT_BUSINESS_SETTINGS.activeHostingPanelAdapter,
    }).activeHostingPanelAdapter;
  }

  private async validateActiveGateway(
    provider: BusinessSettings['activeGateway'],
  ): Promise<void> {
    if (provider === 'fake' && this.environment.NODE_ENV === 'production') {
      throw this.invalid(
        'The fake payment gateway is unavailable in production.',
      );
    }
    if (
      (provider === 'bkash' || provider === 'sslcommerz') &&
      !(await this.credentials.isConfigured(provider))
    ) {
      throw this.invalid(
        `${provider === 'bkash' ? 'bKash' : 'SSLCOMMERZ'} credentials must be configured before activation.`,
      );
    }
    if (provider === 'bkash' || provider === 'sslcommerz') {
      const origin = new URL(this.environment.API_PUBLIC_ORIGIN);
      if (
        origin.protocol !== 'https:' ||
        origin.username ||
        origin.password ||
        origin.pathname !== '/' ||
        origin.search ||
        origin.hash
      ) {
        throw this.invalid(
          'A credential-free HTTPS API public origin is required for online payments.',
        );
      }
    }
  }

  private paymentCredentialStatus(
    provider: 'bkash' | 'sslcommerz',
    records: Map<
      string,
      {
        maskedIdentifier: string;
        keyVersion: string;
        updatedAt: Date;
      }
    >,
  ) {
    const stored = records.get(provider);
    if (stored) {
      return {
        provider,
        configured: true,
        maskedIdentifier: stored.maskedIdentifier,
        updatedAt: stored.updatedAt.toISOString(),
        keyVersion: stored.keyVersion,
        managedAt: 'SETTINGS' as const,
      };
    }
    const identifier =
      provider === 'bkash'
        ? this.environment.BKASH_USERNAME
        : this.environment.SSLCOMMERZ_STORE_ID;
    const configured =
      provider === 'bkash'
        ? Boolean(
            this.environment.BKASH_APP_KEY &&
            this.environment.BKASH_APP_SECRET &&
            this.environment.BKASH_USERNAME &&
            this.environment.BKASH_PASSWORD,
          )
        : Boolean(
            this.environment.SSLCOMMERZ_STORE_ID &&
            this.environment.SSLCOMMERZ_STORE_PASSWORD,
          );
    return {
      provider,
      configured,
      maskedIdentifier:
        configured && identifier ? `Deployment ${mask(identifier)}` : null,
      updatedAt: null,
      keyVersion: configured ? 'deployment-environment' : null,
      managedAt: 'SETTINGS' as const,
    };
  }

  private setting(
    key: string,
    category: SettingCategory,
    value: object,
    description: string,
  ) {
    return { key, category, value, description };
  }

  private confirmedCurrency(value: unknown): string | undefined {
    const selection = z
      .object({ currency: currencyCodeSchema })
      .safeParse(value);
    return selection.success ? selection.data.currency : undefined;
  }

  private async currencyIsLocked(
    database: Pick<PrismaClient, 'invoice'>,
    currency: string,
    selection?: string,
  ) {
    return (
      selection !== undefined ||
      currency !== DEFAULT_BUSINESS_SETTINGS.currency ||
      Boolean(await database.invoice.findFirst({ select: { id: true } }))
    );
  }

  private parse<T>(
    schema: {
      safeParse(
        value: unknown,
      ): { success: true; data: T } | { success: false };
    },
    value: unknown,
    fallback: T,
  ): T {
    const parsed = schema.safeParse(value);
    return parsed.success ? parsed.data : fallback;
  }

  private invalid(message: string): ApplicationException {
    return new ApplicationException({
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      code: 'UNPROCESSABLE_ENTITY',
      message,
    });
  }
}

function mask(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length <= 4) return `${trimmed.slice(0, 1)}***`;
  return `${trimmed.slice(0, 2)}***${trimmed.slice(-2)}`;
}
