import { randomUUID } from 'node:crypto';
import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { ApiEnvironment } from '@webhost-billing/config';
import { Prisma, type PrismaClient } from '@webhost-billing/database';
import {
  RegistrarCipher,
  ResellbizLiveRegistrar,
  credentialBinding,
} from '@webhost-billing/database/registrar';
import {
  existingDomainLinkRequestSchema,
  existingDomainLinkEvidenceSchema,
  resellbizCredentialSchema,
  type ExistingDomainLinkRequest,
} from '@webhost-billing/shared';
import { PRISMA_CLIENT } from '../../infrastructure/database/database.module';
import { API_ENVIRONMENT } from '../../infrastructure/environment/environment.module';
import { ApplicationException } from '../../common/errors/application.exception';
import type { AuthRequestContext } from '../auth/auth.types';
import {
  DomainAdministrationService,
  registrarIdentity,
} from './domain-administration.service';
import { DomainService } from './domain.service';

@Injectable()
export class ExistingDomainLinkService {
  private readonly cipher: RegistrarCipher;
  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient,
    @Inject(API_ENVIRONMENT) private readonly environment: ApiEnvironment,
    private readonly administration: DomainAdministrationService,
    private readonly domains: DomainService,
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
  private async eligibleCustomer(
    prisma: Pick<Prisma.TransactionClient, 'customer'>,
    id: string,
  ) {
    const customer = await prisma.customer.findUnique({
      where: { id },
      include: { user: true },
    });
    if (
      !customer ||
      customer.deletedAt ||
      customer.status !== 'ACTIVE' ||
      customer.user.deletedAt ||
      customer.user.status !== 'ACTIVE' ||
      !customer.user.emailVerifiedAt
    )
      this.deny('Select an active, email-verified client.');
  }
  async link(raw: ExistingDomainLinkRequest, auth: AuthRequestContext) {
    this.administration.authorize(auth);
    const input = existingDomainLinkRequestSchema.parse(raw);
    const prior = await this.prisma.domain.findUnique({
      where: { submissionKey: input.submissionKey },
    });
    if (prior) {
      if (
        prior.origin !== 'EXISTING' ||
        prior.customerId !== input.customerId ||
        prior.accountId !== input.registrarAccountId ||
        prior.domainName !== input.domainName
      )
        this.deny('This submission key belongs to another request.');
      return this.domains.detail(prior.id, auth, input.customerId);
    }
    if (!this.environment.RESELLBIZ_LIVE_ENABLED)
      this.deny(
        'Live registrar networking is disabled. No domain was linked.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    const account = await this.prisma.registrarAccount.findUnique({
      where: { id: input.registrarAccountId },
    });
    if (
      !account ||
      account.provider !== 'stargate' ||
      account.mode !== 'LIVE' ||
      !account.enabled
    )
      this.deny(
        'The selected registrar connection is disabled or unavailable.',
      );
    await this.eligibleCustomer(this.prisma, input.customerId);
    if (
      await this.prisma.domain.findUnique({
        where: { domainName: input.domainName },
      })
    )
      this.deny('This domain already has a client record.');
    const credential = await this.prisma.registrarCredential.findFirst({
      where: { accountId: account.id },
      orderBy: { version: 'desc' },
    });
    if (!credential)
      this.deny('The selected registrar credential is unavailable.');
    const payload = resellbizCredentialSchema.parse(
      this.cipher.decrypt(
        credentialBinding(account.id, credential.version, 'LIVE'),
        credential.ciphertext,
      ),
    );
    if (
      payload.resellerId !== registrarIdentity(account.configuration).resellerId
    )
      this.deny('Registrar credential ownership changed.');
    await this.domains.reserveManagementRead(account.id, auth);
    let evidence: Awaited<
      ReturnType<ResellbizLiveRegistrar['inspectExisting']>
    >;
    try {
      evidence = await new ResellbizLiveRegistrar(payload).inspectExisting({
        accountId: account.id,
        customerId: input.customerId,
        domainName: input.domainName,
      });
    } catch {
      this.deny(
        'Active domain ownership could not be verified in this registrar account. No domain was linked or purchased.',
      );
    }
    const id = randomUUID();
    const proof = existingDomainLinkEvidenceSchema.parse({
      remoteCustomerId: evidence.remoteCustomerId,
      remoteContactId: evidence.remoteContactId,
      contact: evidence.observed.contact,
      nameservers: evidence.observed.nameservers,
    });
    let linkedId: string;
    try {
      linkedId = await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(510118)::text`;
        await tx.$queryRaw`SELECT id FROM users WHERE id=${auth.identity.userId}::uuid FOR UPDATE`;
        const actor = await tx.user.findUnique({
          where: { id: auth.identity.userId },
          include: { adminProfile: true, adminTotpCredential: true },
        });
        if (
          !actor ||
          actor.role !== 'ADMIN' ||
          actor.status !== 'ACTIVE' ||
          actor.deletedAt ||
          actor.adminProfile?.staffRole !== 'FULL_ADMINISTRATOR' ||
          !actor.adminTotpCredential?.enabledAt
        )
          this.deny(
            'The approving administrator is no longer eligible.',
            HttpStatus.FORBIDDEN,
          );
        if (new Date(evidence.observed.expiresAt) <= new Date())
          this.deny(
            'The domain expired during verification. No domain was linked.',
          );
        await tx.$queryRaw`SELECT id FROM registrar_accounts WHERE id=${account.id}::uuid FOR UPDATE`;
        await tx.$queryRaw`SELECT u.id FROM users u JOIN customers c ON c.user_id=u.id WHERE c.id=${input.customerId}::uuid FOR UPDATE OF u`;
        await tx.$queryRaw`SELECT id FROM customers WHERE id=${input.customerId}::uuid FOR UPDATE`;
        const current = await tx.registrarAccount.findUniqueOrThrow({
          where: { id: account.id },
        });
        const latest = await tx.registrarCredential.findFirst({
          where: { accountId: account.id },
          orderBy: { version: 'desc' },
        });
        if (
          !current.enabled ||
          current.mode !== account.mode ||
          current.provider !== account.provider ||
          JSON.stringify(current.configuration) !==
            JSON.stringify(account.configuration) ||
          latest?.id !== credential.id
        )
          this.deny(
            'Registrar settings changed during verification. Check the domain again.',
          );
        await this.eligibleCustomer(tx, input.customerId);
        const duplicate = await tx.domain.findUnique({
          where: { domainName: input.domainName },
        });
        if (duplicate) {
          if (
            duplicate.origin === 'EXISTING' &&
            duplicate.submissionKey === input.submissionKey &&
            duplicate.customerId === input.customerId &&
            duplicate.accountId === account.id
          )
            return duplicate.id;
          this.deny('This domain already has a client record.');
        }
        await tx.domain.create({
          data: {
            id,
            origin: 'EXISTING',
            customerId: input.customerId,
            accountId: account.id,
            executionAccountId: account.id,
            domainName: input.domainName,
            submissionKey: input.submissionKey,
            state: 'REGISTERED',
            verification: evidence.observed.verification,
            providerOrderId: evidence.observed.orderId,
            expiresAt: new Date(evidence.observed.expiresAt),
            linkCredentialId: credential.id,
            ownershipVerifiedAt: new Date(evidence.observed.observedAt),
            linkEvidenceCiphertext: this.cipher.encrypt(
              `resellbiz:existing-link:${id}`,
              proof,
            ),
            managementSnapshot: {
              nameservers: evidence.observed.nameservers,
              locked: evidence.observed.locked,
              verification: evidence.observed.verification,
              expiresAt: evidence.observed.expiresAt,
              observedAt: evidence.observed.observedAt,
            },
            currentContactCiphertext: this.cipher.encrypt(
              `resellbiz:current-contact:${id}`,
              proof.contact,
            ),
          },
        });
        await tx.activityLog.create({
          data: {
            actorUserId: auth.identity.userId,
            action: 'EXISTING_DOMAIN_LINKED',
            entityType: 'DOMAIN',
            entityId: id,
            metadata: {
              customerId: input.customerId,
              accountId: account.id,
              credentialId: credential.id,
            },
          },
        });
        return id;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      )
        this.deny(
          'This domain or submission already has a client record. Refresh saved records.',
        );
      throw error;
    }
    return this.domains.detail(linkedId, auth, input.customerId);
  }
}
