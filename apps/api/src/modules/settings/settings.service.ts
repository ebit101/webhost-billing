import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { ApiEnvironment } from '@webhost-billing/config';
import { SettingCategory, type PrismaClient } from '@webhost-billing/database';
import {
  DEFAULT_BUSINESS_SETTINGS,
  activeProviderSettingsSchema,
  businessIdentitySchema,
  businessLocalizationSettingsSchema,
  businessSettingsSchema,
  emailBrandingSettingsSchema,
  invoiceNumberingSettingsSchema,
  manualPaymentInstructionsSchema,
  paymentSettingsSchema,
  renewalAutomationPolicySchema,
  settingsOverviewSchema,
  terminationPolicySchema,
  type BusinessSettings,
  type SettingsOverview,
} from '@webhost-billing/shared';
import { ApplicationException } from '../../common/errors/application.exception';
import type { SecurityRequestContext } from '../../common/http/request-context';
import { PRISMA_CLIENT } from '../../infrastructure/database/database.module';
import { API_ENVIRONMENT } from '../../infrastructure/environment/environment.module';
import type { AuthRequestContext } from '../auth/auth.types';
import { IntegrationCredentialService } from './integration-credential.service';

const KEYS = {
  businessIdentity: 'business.identity',
  localization: 'business.localization',
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

  async overview(): Promise<SettingsOverview> {
    const [settings, credentialRecords, cpanelServers] = await Promise.all([
      this.prisma.setting.findMany({
        where: { key: { in: Object.values(KEYS) } },
        select: { key: true, value: true },
      }),
      this.prisma.integrationCredential.findMany({
        where: { providerKey: { in: ['bkash', 'sslcommerz'] } },
        select: {
          providerKey: true,
          maskedIdentifier: true,
          keyVersion: true,
          updatedAt: true,
        },
      }),
      this.prisma.server.findMany({
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

  async update(
    input: BusinessSettings,
    actor: AuthRequestContext,
    context: SecurityRequestContext,
  ): Promise<SettingsOverview> {
    const settings = businessSettingsSchema.parse(input);
    await this.validateActiveGateway(settings.activeGateway);
    await this.prisma.$transaction(async (transaction) => {
      const writes = [
        this.setting(
          KEYS.businessIdentity,
          SettingCategory.BUSINESS,
          settings.businessIdentity,
          'Legal identity snapshot source for future invoices.',
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
          KEYS.renewal,
          SettingCategory.AUTOMATION,
          settings.renewalAutomation,
          'Renewal invoice, reminder, overdue, and grace policy.',
        ),
        this.setting(
          KEYS.termination,
          SettingCategory.AUTOMATION,
          settings.terminationPolicy,
          'Permanent hosting termination policy.',
        ),
        this.setting(
          KEYS.manualPayment,
          SettingCategory.BILLING,
          {
            partialPaymentsEnabled:
              settings.manualPayments.partialPaymentsEnabled,
          },
          'Manual payment policy.',
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
      ];
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
            activeGateway: settings.activeGateway,
            activeHostingPanelAdapter: settings.activeHostingPanelAdapter,
          },
        },
      });
    });
    return this.overview();
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
