import { randomUUID } from 'node:crypto';
import { Test, type TestingModule } from '@nestjs/testing';
import {
  parseApiEnvironment,
  type ApiEnvironment,
} from '@webhost-billing/config';
import { type PrismaClient } from '@webhost-billing/database';
import {
  FakeDomainRegistrar,
  RegistrarProcessor,
} from '@webhost-billing/database/registrar';
import type { RegistrarDomainFacts } from '@webhost-billing/shared';
import { AppModule } from '../src/app.module';
import { API_ENVIRONMENT } from '../src/infrastructure/environment/environment.module';
import { PRISMA_CLIENT } from '../src/infrastructure/database/database.module';
import type { AuthRequestContext } from '../src/modules/auth/auth.types';
import { TotpService } from '../src/modules/auth/services/totp.service';
import { PaymentService } from '../src/modules/payments/payment.service';
import { DomainService } from '../src/modules/domains/domain.service';
import { DomainFactsService } from '../src/modules/domains/domain-facts.service';

describe('Command 213 ownership-bound registrar facts', () => {
  let module: TestingModule;
  let prisma: PrismaClient;
  let service: DomainFactsService;
  let domains: DomainService;
  let environment: ApiEnvironment;
  let admin: AuthRequestContext;
  let customer: AuthRequestContext;
  let offerId: string;
  beforeAll(async () => {
    environment = parseApiEnvironment({
      ...process.env,
      PORT: '3001',
      NODE_ENV: 'test',
      RESELLBIZ_LIVE_ENABLED: 'false',
      REGISTRAR_DOMAIN_SYNC_LIVE_ENABLED: 'false',
    });
    module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(API_ENVIRONMENT)
      .useValue(environment)
      .compile();
    await module.init();
    prisma = module.get(PRISMA_CLIENT);
    service = module.get(DomainFactsService);
    domains = module.get(DomainService);
    const totp = module.get(TotpService);
    const owner = await prisma.user.create({
      data: {
        email: `facts-admin-${randomUUID()}@example.test`,
        role: 'ADMIN',
        status: 'ACTIVE',
        emailVerifiedAt: new Date(),
        adminProfile: {
          create: {
            displayName: 'Fictional facts administrator',
            staffRole: 'FULL_ADMINISTRATOR',
          },
        },
        adminTotpCredential: {
          create: {
            secretCiphertext: totp.encryptSecret(totp.generateSecret()),
            keyVersion: 'mfa-v1',
            createdAt: new Date(),
            enabledAt: new Date(),
          },
        },
      },
      include: { adminProfile: true },
    });
    const buyer = await prisma.user.create({
      data: {
        email: `facts-buyer-${randomUUID()}@example.test`,
        role: 'CUSTOMER',
        status: 'ACTIVE',
        emailVerifiedAt: new Date(),
        customer: {
          create: {
            customerNumber: `FACT-${randomUUID().slice(0, 20)}`,
            firstName: 'Fictional',
            lastName: 'Registrant',
            addressLine1: '213 Test Road',
            city: 'Dhaka',
            countryCode: 'BD',
          },
        },
      },
      include: { customer: true },
    });
    admin = {
      sessionId: randomUUID(),
      identity: {
        role: 'ADMIN',
        userId: owner.id,
        email: owner.email,
        adminProfileId: owner.adminProfile!.id,
        staffRole: 'FULL_ADMINISTRATOR',
        twoFactorEnabled: true,
      },
    };
    customer = {
      sessionId: randomUUID(),
      identity: {
        role: 'CUSTOMER',
        userId: buyer.id,
        email: buyer.email,
        customerId: buyer.customer!.id,
      },
    };
    await domains.setup('150000', admin);
    offerId = (await domains.offers()).find((row) => row.tld === 'com')!.id;
  });
  afterEach(() => jest.restoreAllMocks());
  afterAll(async () => module?.close());
  async function fixture() {
    const quote = await domains.quote(
      {
        offerId,
        domainName: `facts-${randomUUID()}.com`,
        contact: {
          name: 'Fictional registrant',
          company: 'Fictional company',
          address: '213 Test Road',
          city: 'Dhaka',
          region: 'Dhaka',
          postalCode: '1212',
          country: 'BD',
          email: 'facts@example.test',
          phoneCountryCode: '880',
          phone: '1700000000',
        },
        agreement: 'fictional-registration-v1',
        consent: true,
      },
      customer,
    );
    const bought = await domains.purchase(
      { quoteId: quote.id, submissionKey: randomUUID() },
      customer,
    );
    await module.get(PaymentService).recordManual(
      {
        invoiceId: bought.invoiceId!,
        amount: '150000',
        submissionKey: randomUUID(),
        proof: {
          method: 'BANK_TRANSFER',
          reference: `FICTIONAL-213-${randomUUID()}`,
        },
      },
      admin,
      { ipAddressHash: 'fictional' },
    );
    await domains.approve(
      bought.id,
      {
        confirmation: bought.domainName,
        costCeiling: '1000',
        costCurrency: 'USD',
      },
      admin,
    );
    const op = await prisma.registrarOperation.findUniqueOrThrow({
      where: { domainId: bought.id },
    });
    await new RegistrarProcessor(
      prisma,
      environment.CREDENTIAL_ENCRYPTION_KEY,
    ).process(op.id);
    const domain = await prisma.domain.findUniqueOrThrow({
      where: { id: bought.id },
    });
    expect(domain.state).toBe('REGISTERED');
    const sync = (key = randomUUID()) =>
      service.synchronize(
        domain.id,
        { submissionKey: key, confirmation: domain.domainName },
        admin,
      );
    return { domain, sync };
  }
  function observed(
    f: Awaited<ReturnType<typeof fixture>>,
    overrides: Partial<RegistrarDomainFacts> = {},
  ): RegistrarDomainFacts {
    return {
      accountId: f.domain.executionAccountId ?? f.domain.accountId,
      customerId: f.domain.customerId,
      domainName: f.domain.domainName,
      providerOrderId: f.domain.providerOrderId!,
      observedAt: new Date(Date.now()).toISOString(),
      expiresAt: f.domain.expiresAt!.toISOString(),
      status: 'ACTIVE',
      renewalEligibility: 'ELIGIBLE',
      registrarAutoRenew: false,
      simulated: true,
      ...overrides,
    };
  }
  function advance(ms = 20_000) {
    jest.spyOn(Date, 'now').mockReturnValue(Date.now() + ms);
  }

  it('updates a fresh ownership-verified expiry without changing the invoice, payment or registration history', async () => {
    const f = await fixture();
    const before = await prisma.invoice.findUniqueOrThrow({
      where: { id: f.domain.invoiceId! },
      include: { items: true, payments: true },
    });
    const next = new Date(f.domain.expiresAt!.getTime() + 86_400_000 * 365);
    await prisma.fakeRegistrarRegistration.update({
      where: { id: f.domain.providerOrderId! },
      data: { expiresAt: next },
    });
    const writes = jest.spyOn(FakeDomainRegistrar.prototype, 'registerOnce');
    const result = await f.sync();
    expect(result).toMatchObject({
      outcome: 'SUCCEEDED',
      expiresAt: next.toISOString(),
      freshness: 'FRESH',
      renewalEligibility: 'ELIGIBLE',
      reviewRequired: false,
    });
    expect(writes).not.toHaveBeenCalled();
    expect(
      await prisma.invoice.findUniqueOrThrow({
        where: { id: f.domain.invoiceId! },
        include: { items: true, payments: true },
      }),
    ).toEqual(before);
    expect(
      await prisma.domain.findUniqueOrThrow({ where: { id: f.domain.id } }),
    ).toMatchObject({
      state: f.domain.state,
      customerId: f.domain.customerId,
      accountId: f.domain.accountId,
      invoiceId: f.domain.invoiceId,
      expiresAt: next,
      autoRenew: false,
    });
    await expect(f.sync()).rejects.toMatchObject({ status: 429 });
  });
  it('retains the last trusted facts across unavailable/stale responses and succeeds on an explicit retry', async () => {
    const f = await fixture();
    const good = await f.sync();
    advance();
    const read = jest
      .spyOn(FakeDomainRegistrar.prototype, 'readDomainFacts')
      .mockRejectedValue(new Error('SECRET-PROVIDER-CONTENT'));
    const failed = await f.sync();
    expect(failed).toMatchObject({
      outcome: 'UNAVAILABLE',
      code: 'PROVIDER_UNAVAILABLE',
      expiresAt: good.expiresAt,
      lastSuccessAt: good.lastSuccessAt,
    });
    expect(JSON.stringify(failed)).not.toContain('SECRET');
    advance();
    read.mockResolvedValue(
      observed(f, { observedAt: new Date(Date.now() - 600_000).toISOString() }),
    );
    expect(await f.sync()).toMatchObject({
      outcome: 'UNAVAILABLE',
      code: 'STALE_RESPONSE',
      lastSuccessAt: good.lastSuccessAt,
    });
    advance();
    read.mockResolvedValue(observed(f));
    expect(await f.sync()).toMatchObject({ outcome: 'SUCCEEDED' });
  });
  it('requires audited expiry-conflict review and rejects customer or mismatched-domain acceptance', async () => {
    const f = await fixture();
    const earlier = new Date(
      f.domain.expiresAt!.getTime() - 30 * 86_400_000,
    ).toISOString();
    jest
      .spyOn(FakeDomainRegistrar.prototype, 'readDomainFacts')
      .mockResolvedValue(observed(f, { expiresAt: earlier }));
    const checked = await f.sync();
    expect(checked).toMatchObject({
      outcome: 'REVIEW_REQUIRED',
      code: 'EXPIRY_CONFLICT',
      candidateExpiry: earlier,
      canReview: true,
      expiresAt: null,
    });
    expect(
      (await prisma.domain.findUniqueOrThrow({ where: { id: f.domain.id } }))
        .expiresAt,
    ).toEqual(f.domain.expiresAt);
    const input = {
      confirmation: f.domain.domainName,
      reason: 'Fictional registrar correction verified.',
    };
    await expect(
      service.review(f.domain.id, checked.attemptId!, input, customer),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      service.review(
        f.domain.id,
        checked.attemptId!,
        { ...input, confirmation: 'different.com' },
        admin,
      ),
    ).rejects.toMatchObject({ status: 409 });
    expect(
      await service.review(f.domain.id, checked.attemptId!, input, admin),
    ).toMatchObject({ outcome: 'SUCCEEDED', expiresAt: earlier });
    await service.review(f.domain.id, checked.attemptId!, input, admin);
    expect(
      await prisma.activityLog.count({
        where: {
          entityId: f.domain.id,
          action: 'DOMAIN_FACT_SYNC_EXPIRY_REVIEWED',
        },
      }),
    ).toBe(1);
  });
  it('blocks account/customer/order mismatches without storing or exposing another domain observation', async () => {
    const f = await fixture();
    jest
      .spyOn(FakeDomainRegistrar.prototype, 'readDomainFacts')
      .mockResolvedValue(
        observed(f, {
          customerId: randomUUID(),
          domainName: 'other-customer.com',
        }),
      );
    const result = await f.sync();
    expect(result).toMatchObject({
      outcome: 'REVIEW_REQUIRED',
      code: 'OWNERSHIP_MISMATCH',
      canReview: false,
      candidateExpiry: null,
    });
    expect(
      (
        await prisma.domainFactSync.findUniqueOrThrow({
          where: { id: result.attemptId! },
        })
      ).facts,
    ).toBeNull();
    expect(JSON.stringify(result)).not.toContain('other-customer');
    await expect(
      service.review(
        f.domain.id,
        result.attemptId!,
        {
          confirmation: f.domain.domainName,
          reason: 'Cannot override ownership.',
        },
        admin,
      ),
    ).rejects.toMatchObject({ status: 409 });
  });
  it('records unsupported TLDs without a provider call and cannot use a customer/support session to synchronize', async () => {
    const f = await fixture();
    jest
      .spyOn(FakeDomainRegistrar.prototype, 'supportsDomainFacts')
      .mockReturnValue(false);
    const read = jest.spyOn(FakeDomainRegistrar.prototype, 'readDomainFacts');
    expect(await f.sync()).toMatchObject({
      code: 'UNSUPPORTED_TLD',
      outcome: 'UNAVAILABLE',
    });
    expect(read).not.toHaveBeenCalled();
    await expect(
      service.synchronize(
        f.domain.id,
        { submissionKey: randomUUID(), confirmation: f.domain.domainName },
        customer,
      ),
    ).rejects.toMatchObject({ status: 403 });
    const support = {
      ...customer,
      supportAdministratorId: admin.identity.userId,
    };
    await expect(
      service.synchronize(
        f.domain.id,
        { submissionKey: randomUUID(), confirmation: f.domain.domainName },
        support,
      ),
    ).rejects.toMatchObject({ status: 403 });
    expect(await service.stored(f.domain.id, support)).toMatchObject({
      canReview: false,
    });
    if (customer.identity.role !== 'CUSTOMER') throw new Error();
    await expect(
      service.stored(f.domain.id, {
        ...customer,
        identity: { ...customer.identity, customerId: randomUUID() },
      }),
    ).rejects.toMatchObject({ status: 403 });
  });
  it('rejects a binding changed during a read and leaves the prior expiry untouched', async () => {
    const f = await fixture();
    jest
      .spyOn(FakeDomainRegistrar.prototype, 'readDomainFacts')
      .mockImplementation(async () => {
        await prisma.registrarAccount.update({
          where: { id: f.domain.accountId },
          data: { enabled: false },
        });
        return observed(f);
      });
    expect(await f.sync()).toMatchObject({
      outcome: 'REVIEW_REQUIRED',
      code: 'LOCAL_BINDING_CHANGED',
      expiresAt: null,
    });
    expect(
      (await prisma.domain.findUniqueOrThrow({ where: { id: f.domain.id } }))
        .expiresAt,
    ).toEqual(f.domain.expiresAt);
    await prisma.registrarAccount.update({
      where: { id: f.domain.accountId },
      data: { enabled: true },
    });
  });
  it('replays a completed submission without another read and marks old or uncertain renewal facts for review', async () => {
    const f = await fixture();
    const key = randomUUID();
    const read = jest
      .spyOn(FakeDomainRegistrar.prototype, 'readDomainFacts')
      .mockResolvedValue(
        observed(f, {
          renewalEligibility: 'UNKNOWN',
          registrarAutoRenew: null,
        }),
      );
    const first = await f.sync(key);
    expect(first).toMatchObject({
      outcome: 'SUCCEEDED',
      renewalEligibility: 'UNKNOWN',
      reviewRequired: true,
    });
    expect(await f.sync(key)).toEqual(first);
    expect(read).toHaveBeenCalledTimes(1);
    advance(2 * 3_600_000);
    expect(await service.stored(f.domain.id, customer)).toMatchObject({
      freshness: 'STALE',
      reviewRequired: true,
    });
  });
  it('coalesces concurrent replay and recovers an abandoned read without applying its late result', async () => {
    const f = await fixture();
    let deliver!: (facts: RegistrarDomainFacts) => void;
    let started!: () => void;
    const entered = new Promise<void>((resolve) => {
      started = resolve;
    });
    const pending = new Promise<RegistrarDomainFacts>((resolve) => {
      deliver = resolve;
    });
    const read = jest
      .spyOn(FakeDomainRegistrar.prototype, 'readDomainFacts')
      .mockImplementationOnce(() => {
        started();
        return pending;
      });
    const key = randomUUID();
    const first = f.sync(key);
    await entered;
    expect(await f.sync(key)).toMatchObject({
      outcome: 'RUNNING',
      attemptId: key,
    });
    await expect(f.sync()).rejects.toMatchObject({ status: 429 });
    expect(read).toHaveBeenCalledTimes(1);
    advance(100_000);
    const expiry = new Date(
      f.domain.expiresAt!.getTime() + 365 * 86_400_000,
    ).toISOString();
    read.mockResolvedValueOnce(observed(f, { expiresAt: expiry }));
    expect(await f.sync()).toMatchObject({
      outcome: 'SUCCEEDED',
      expiresAt: expiry,
    });
    deliver(observed(f));
    expect(await first).toMatchObject({
      outcome: 'SUCCEEDED',
      expiresAt: expiry,
    });
    expect(
      await prisma.domainFactSync.findUniqueOrThrow({ where: { id: key } }),
    ).toMatchObject({
      status: 'UNAVAILABLE',
      code: 'READ_TIMED_OUT',
      appliedAt: null,
    });
    expect(
      await prisma.domainFactSync.count({
        where: { domainId: f.domain.id, appliedAt: { not: null } },
      }),
    ).toBe(1);
  });
  it('holds unknown status and rejects expired conflict review, preserving the prior expiry', async () => {
    const f = await fixture();
    const read = jest
      .spyOn(FakeDomainRegistrar.prototype, 'readDomainFacts')
      .mockResolvedValue(observed(f, { status: 'UNKNOWN' }));
    expect(await f.sync()).toMatchObject({
      outcome: 'REVIEW_REQUIRED',
      code: 'STATUS_UNCONFIRMED',
      expiresAt: null,
      canReview: false,
    });
    advance();
    read.mockResolvedValue(
      observed(f, {
        expiresAt: new Date(
          f.domain.expiresAt!.getTime() - 86_400_000,
        ).toISOString(),
      }),
    );
    const conflict = await f.sync();
    advance(6 * 60_000);
    await expect(
      service.review(
        f.domain.id,
        conflict.attemptId!,
        { confirmation: f.domain.domainName, reason: 'Too old to accept.' },
        admin,
      ),
    ).rejects.toMatchObject({ status: 409 });
    expect(
      (await prisma.domain.findUniqueOrThrow({ where: { id: f.domain.id } }))
        .expiresAt,
    ).toEqual(f.domain.expiresAt);
  });
  it('does not allow the simulated provider to run in production', async () => {
    const f = await fixture();
    const production = new DomainFactsService(
      prisma,
      { ...environment, NODE_ENV: 'production' },
      domains,
    );
    const read = jest.spyOn(FakeDomainRegistrar.prototype, 'readDomainFacts');
    expect(
      await production.synchronize(
        f.domain.id,
        { submissionKey: randomUUID(), confirmation: f.domain.domainName },
        admin,
      ),
    ).toMatchObject({ outcome: 'UNAVAILABLE', code: 'SIMULATION_DISABLED' });
    expect(read).not.toHaveBeenCalled();
  });
  it('requires both independent live-read gates before resolving live credentials or contacting a provider', async () => {
    if (customer.identity.role !== 'CUSTOMER') throw new Error();
    const account = await prisma.registrarAccount.create({
      data: {
        mode: 'LIVE',
        enabled: true,
        configuration: { schemaVersion: 2, resellerId: '54321' },
      },
    });
    // Deliberately unusable encrypted-evidence placeholders: no credentials can
    // be decrypted and no provider context may be opened in this gate test.
    const credential = await prisma.registrarCredential.create({
      data: {
        accountId: account.id,
        version: 1,
        ciphertext: 'unusable-fictional-gate-fixture',
      },
    });
    const offer = await prisma.domainOffer.findUniqueOrThrow({
      where: { id: offerId },
    });
    await prisma.domainOffer.create({
      data: {
        accountId: account.id,
        tld: 'com',
        productId: offer.productId,
        priceId: offer.priceId,
        nameservers: ['ns1.example.test', 'ns2.example.test'],
      },
    });
    const domain = await prisma.domain.create({
      data: {
        customerId: customer.identity.customerId,
        accountId: account.id,
        executionAccountId: account.id,
        domainName: `gate-${randomUUID()}.com`,
        submissionKey: randomUUID(),
        origin: 'EXISTING',
        state: 'REGISTERED',
        providerOrderId: '123456',
        expiresAt: new Date(Date.now() + 365 * 86_400_000),
        ownershipVerifiedAt: new Date(),
        linkCredentialId: credential.id,
        linkEvidenceCiphertext: 'unusable-fictional-ownership-fixture',
      },
    });
    const liveContext = jest
      .spyOn(domains, 'managementContext')
      .mockRejectedValue(new Error('Unexpected live credential access.'));
    expect(
      parseApiEnvironment({
        ...process.env,
        NODE_ENV: 'test',
        PORT: '3001',
        REGISTRAR_DOMAIN_SYNC_LIVE_ENABLED: undefined,
      }).REGISTRAR_DOMAIN_SYNC_LIVE_ENABLED,
    ).toBe(false);
    for (const gates of [
      {
        RESELLBIZ_LIVE_ENABLED: false,
        REGISTRAR_DOMAIN_SYNC_LIVE_ENABLED: false,
      },
      {
        RESELLBIZ_LIVE_ENABLED: true,
        REGISTRAR_DOMAIN_SYNC_LIVE_ENABLED: false,
      },
      {
        RESELLBIZ_LIVE_ENABLED: false,
        REGISTRAR_DOMAIN_SYNC_LIVE_ENABLED: true,
      },
    ]) {
      advance();
      const gated = new DomainFactsService(
        prisma,
        { ...environment, ...gates },
        domains,
      );
      expect(
        await gated.synchronize(
          domain.id,
          { submissionKey: randomUUID(), confirmation: domain.domainName },
          admin,
        ),
      ).toMatchObject({ outcome: 'UNAVAILABLE', code: 'LIVE_READ_DISABLED' });
    }
    expect(liveContext).not.toHaveBeenCalled();
  });
});
