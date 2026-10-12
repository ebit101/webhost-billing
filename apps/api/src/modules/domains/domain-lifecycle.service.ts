import { randomUUID } from 'node:crypto';
import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { ApiEnvironment } from '@webhost-billing/config';
import type { PrismaClient } from '@webhost-billing/database';
import {
  RegistrarCipher,
  lockDomainInvoice,
  verifiedDomainInvoice,
} from '@webhost-billing/database/registrar';
import {
  domainActionRequestSchema,
  domainActionSchema,
  domainManagementSchema,
  PROJECT_NAME,
  type DomainActionRequest,
} from '@webhost-billing/shared';
import { z } from 'zod';
import { PRISMA_CLIENT } from '../../infrastructure/database/database.module';
import { API_ENVIRONMENT } from '../../infrastructure/environment/environment.module';
import { ApplicationException } from '../../common/errors/application.exception';
import { allocateInvoiceNumber } from '../../common/identifiers/invoice-number';
import type { AuthRequestContext } from '../auth/auth.types';
import { DomainService } from './domain.service';

const payloadSchema = z
  .object({
    request: domainActionRequestSchema,
    previousExpiry: z.iso.datetime(),
  })
  .strict();
@Injectable()
export class DomainLifecycleService {
  private readonly cipher: RegistrarCipher;
  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient,
    @Inject(API_ENVIRONMENT) environment: ApiEnvironment,
    private readonly domains: DomainService,
  ) {
    this.cipher = new RegistrarCipher(environment.CREDENTIAL_ENCRYPTION_KEY);
  }
  private deny(message: string): never {
    throw new ApplicationException({
      status: HttpStatus.CONFLICT,
      code: 'CONFLICT',
      message,
    });
  }
  private administrator(auth: AuthRequestContext) {
    if (
      auth.identity.role !== 'ADMIN' ||
      auth.identity.staffRole !== 'FULL_ADMINISTRATOR' ||
      !auth.identity.twoFactorEnabled
    )
      throw new ApplicationException({
        status: HttpStatus.FORBIDDEN,
        code: 'FORBIDDEN',
        message:
          'A full administrator with two-factor authentication is required.',
      });
  }
  private binding(actionId: string) {
    return `resellbiz:domain-action:${actionId}`;
  }
  async list(domainId: string, auth: AuthRequestContext) {
    await this.domains.detail(domainId, auth);
    return Promise.all(
      (
        await this.prisma.domainAction.findMany({
          where: { domainId },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: 50,
        })
      ).map(async (action) => {
        const invoice = action.invoiceId
          ? await this.prisma.invoice.findUnique({
              where: { id: action.invoiceId },
              include: { payments: true },
            })
          : null;
        const financialAttention =
          !!invoice &&
          ((action.state === 'FAILED' && invoice.amountPaid > 0n) ||
            invoice.payments.some(
              (payment) =>
                payment.status === 'SUCCEEDED' && payment.kind !== 'CHARGE',
            ));
        return domainActionSchema.parse({
          id: action.id,
          kind: action.kind,
          state: action.state,
          createdAt: action.createdAt.toISOString(),
          claimed: !!action.claimedAt,
          invoiceId: action.invoiceId,
          financialAttention,
        });
      }),
    );
  }
  async stored(domainId: string, auth: AuthRequestContext) {
    await this.domains.detail(domainId, auth);
    const domain = await this.prisma.domain.findUniqueOrThrow({
      where: { id: domainId },
    });
    return domain.managementSnapshot
      ? domainManagementSchema.parse({
          ...domainManagementSchema.parse(domain.managementSnapshot),
          ...(domain.currentContactCiphertext
            ? {
                contact: this.cipher.decrypt(
                  `resellbiz:current-contact:${domainId}`,
                  domain.currentContactCiphertext,
                ),
              }
            : {}),
        })
      : null;
  }
  async refresh(domainId: string, auth: AuthRequestContext) {
    const context = await this.domains.managementContext(domainId, auth);
    await this.domains.reserveManagementRead(context.account.id, auth);
    let observed;
    try {
      observed = await context.provider.management(
        context.intent,
        context.orderId,
      );
    } catch {
      this.deny(
        'Registrar management evidence is unavailable. No mutation was sent.',
      );
    }
    const state = domainManagementSchema.parse({
      nameservers: observed.nameservers,
      locked: observed.locked,
      observedAt: observed.observedAt,
      expiresAt: observed.expiresAt,
      verification: observed.verification,
    });
    await this.prisma.domain.update({
      where: { id: domainId },
      data: {
        managementSnapshot: state,
        ...(observed.contact
          ? {
              currentContactCiphertext: this.cipher.encrypt(
                `resellbiz:current-contact:${domainId}`,
                observed.contact,
              ),
            }
          : {}),
        expiresAt: new Date(state.expiresAt),
        verification: state.verification,
      },
    });
    return domainManagementSchema.parse({
      ...state,
      ...(observed.contact ? { contact: observed.contact } : {}),
    });
  }
  async create(
    domainId: string,
    raw: DomainActionRequest,
    confirmation: string,
    auth: AuthRequestContext,
  ) {
    this.administrator(auth);
    const request = domainActionRequestSchema.parse(raw);
    const context = await this.domains.managementContext(domainId, auth);
    if (confirmation !== context.domain.domainName)
      this.deny('Confirm the exact domain name.');
    const id = randomUUID();
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM domains WHERE id=${domainId}::uuid FOR UPDATE`;
      const current = await tx.domain.findUniqueOrThrow({
        where: { id: domainId },
      });
      if (
        current.state !== 'REGISTERED' ||
        !current.expiresAt ||
        current.providerOrderId !== context.orderId
      )
        this.deny(
          'The domain state changed. Refresh before requesting an action.',
        );
      const open = await tx.domainAction.findFirst({
        where: {
          domainId,
          state: { notIn: ['SUCCEEDED', 'CANCELLED', 'FAILED'] },
        },
      });
      if (open)
        this.deny('Finish or reconcile the existing domain action first.');
      const credential = await tx.registrarCredential.findFirstOrThrow({
        where: { accountId: context.account.id },
        orderBy: { version: 'desc' },
      });
      let invoiceId: string | undefined;
      if (request.kind === 'RENEW') {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(510118)::text`;
        const catalogue = await tx.domainCatalogueTld.findUnique({
          where: { tld: current.domainName.split('.').at(-1) ?? '' },
        });
        if (
          catalogue &&
          (!catalogue.renewalAmount ||
            request.catalogueRevision !== catalogue.revision ||
            request.sellingAmount !== catalogue.renewalAmount.toString())
        )
          this.deny(
            'Renewal pricing changed or is unavailable. Refresh the catalogue price before creating a renewal invoice.',
          );
        const amount = BigInt(request.sellingAmount);
        if (
          amount > 999999999999999n ||
          BigInt(request.costCeiling) > 999999999999999n
        )
          this.deny('Renewal amount exceeds the supported range.');
        const business = await tx.setting.findUnique({
          where: { key: 'business.identity' },
        });
        const customer = context.customer;
        const invoice = await tx.invoice.create({
          data: {
            invoiceNumber: await allocateInvoiceNumber(tx),
            submissionKey: `invoice:domain-renewal:${id}`,
            customerId: current.customerId,
            status: 'UNPAID',
            currency: 'BDT',
            subtotal: amount,
            total: amount,
            balanceDue: amount,
            issuedAt: new Date(),
            dueAt: new Date(),
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
            items: {
              create: {
                linePosition: 1,
                descriptionSnapshot: `Renewal of ${current.domainName} for one year after ${current.expiresAt.toISOString()}`,
                currency: 'BDT',
                quantity: 1,
                unitAmount: amount,
                lineTotal: amount,
              },
            },
          },
        });
        invoiceId = invoice.id;
      }
      await tx.domainAction.create({
        data: {
          id,
          domainId,
          customerId: current.customerId,
          accountId: context.account.id,
          credentialId: credential.id,
          actorUserId: auth.identity.userId,
          kind: request.kind,
          invoiceId,
          payloadCiphertext: this.cipher.encrypt(this.binding(id), {
            request,
            previousExpiry: current.expiresAt.toISOString(),
          }),
        },
      });
      await tx.activityLog.create({
        data: {
          actorUserId: auth.identity.userId,
          action: 'DOMAIN_ACTION_REQUESTED',
          entityType: 'DOMAIN',
          entityId: domainId,
          metadata: { actionId: id, kind: request.kind },
        },
      });
    });
    return this.list(domainId, auth);
  }
  async execute(
    domainId: string,
    actionId: string,
    confirmation: string,
    auth: AuthRequestContext,
    reconcileOnly = false,
  ) {
    this.administrator(auth);
    const located = await this.prisma.domainAction.findFirst({
      where: { id: actionId, domainId },
    });
    if (!located) this.deny('Domain action is unavailable.');
    const context = await this.domains.managementContext(
      domainId,
      auth,
      located.credentialId,
    );
    if (confirmation !== context.domain.domainName)
      this.deny('Confirm the exact domain name.');
    const payload = payloadSchema.parse(
      this.cipher.decrypt(this.binding(actionId), located.payloadCiphertext),
    );
    const request = payload.request;
    const dispatch = await this.prisma.$transaction(async (tx) => {
      if (located.invoiceId) await lockDomainInvoice(tx, located.invoiceId);
      await tx.$queryRaw`SELECT id FROM domains WHERE id=${domainId}::uuid FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM domain_actions WHERE id=${actionId}::uuid FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM registrar_accounts WHERE id=${located.accountId}::uuid FOR UPDATE`;
      const action = await tx.domainAction.findUniqueOrThrow({
        where: { id: actionId },
      });
      if (['SUCCEEDED', 'CANCELLED', 'FAILED'].includes(action.state))
        return null;
      if (
        action.pollCount >= 10 ||
        (action.claimedAt && action.nextPollAt > new Date())
      )
        this.deny(
          'Wait before reconciling, or resolve the exhausted read budget manually.',
        );
      const account = await tx.registrarAccount.findUniqueOrThrow({
        where: { id: action.accountId },
      });
      if (!account.enabled) this.deny('Registrar is disabled.');
      const currentDomain = await tx.domain.findUniqueOrThrow({
        where: { id: domainId },
      });
      const actor = await tx.user.findUniqueOrThrow({
        where: { id: auth.identity.userId },
        include: { adminProfile: true, adminTotpCredential: true },
      });
      const currentCustomer = await tx.customer.findUniqueOrThrow({
        where: { id: action.customerId },
        include: { user: true },
      });
      if (
        currentDomain.state !== 'REGISTERED' ||
        currentDomain.providerOrderId !== context.orderId ||
        actor.status !== 'ACTIVE' ||
        actor.deletedAt ||
        actor.adminProfile?.staffRole !== 'FULL_ADMINISTRATOR' ||
        !actor.adminTotpCredential?.enabledAt ||
        currentCustomer.status !== 'ACTIVE' ||
        currentCustomer.deletedAt ||
        currentCustomer.user.status !== 'ACTIVE' ||
        currentCustomer.user.deletedAt ||
        !currentCustomer.user.emailVerifiedAt
      )
        this.deny(
          'The domain, customer or approving administrator is no longer eligible.',
        );
      if (reconcileOnly && !action.claimedAt)
        this.deny('Only a claimed action can be reconciled.');
      if (!action.claimedAt) {
        const busy = await tx.domainAction.findFirst({
          where: {
            accountId: action.accountId,
            id: { not: actionId },
            claimedAt: { not: null },
            state: { notIn: ['SUCCEEDED', 'CANCELLED', 'FAILED'] },
          },
        });
        if (busy)
          this.deny('Another registrar action needs reconciliation first.');
        const registrations = await tx.registrarOperation.findMany({
          where: {
            claimedAt: { not: null },
            OR: [
              { selectedAccountId: action.accountId },
              { selectedAccountId: null, accountId: action.accountId },
            ],
          },
        });
        for (const registration of registrations) {
          const registered = await tx.domain.findUniqueOrThrow({
            where: { id: registration.domainId },
          });
          if (!['REGISTERED', 'FAILED'].includes(registered.state))
            this.deny('A registration needs reconciliation first.');
        }
        if (
          request.kind === 'RENEW' &&
          (!action.invoiceId ||
            !(await verifiedDomainInvoice(
              tx,
              action.invoiceId,
              action.customerId,
            )))
        )
          this.deny(
            'A fully verified, unadjusted BDT renewal payment is required.',
          );
      }
      await tx.domainAction.update({
        where: { id: actionId },
        data: {
          state: 'NEEDS_RECONCILIATION',
          claimedAt: action.claimedAt ?? new Date(),
          pollCount: { increment: 1 },
          nextPollAt: new Date(Date.now() + 180000),
        },
      });
      await tx.activityLog.create({
        data: {
          actorUserId: auth.identity.userId,
          action: action.claimedAt
            ? 'DOMAIN_ACTION_READ_RESERVED'
            : 'DOMAIN_ACTION_DISPATCH_CLAIMED',
          entityType: 'DOMAIN',
          entityId: domainId,
          metadata: { actionId, kind: request.kind },
        },
      });
      return !action.claimedAt && !reconcileOnly;
    });
    if (dispatch === null) return this.list(domainId, auth);
    const intent = {
      ...context.intent,
      ...(request.kind === 'RENEW'
        ? { costCeiling: BigInt(request.costCeiling) }
        : {}),
    };
    let readFailed = false;
    const claimSubmission = async () => {
      const result = await this.prisma.domainAction.updateMany({
        where: {
          id: actionId,
          submittedAt: null,
          state: 'NEEDS_RECONCILIATION',
        },
        data: { submittedAt: new Date() },
      });
      if (result.count !== 1)
        this.deny(
          'The domain mutation was already submitted. Reconcile without retrying.',
        );
    };
    try {
      const before = await context.provider.management(intent, context.orderId);
      if (dispatch) {
        if (request.kind === 'NAMESERVERS')
          await context.provider.changeNameservers(
            intent,
            context.orderId,
            request.nameservers,
            claimSubmission,
          );
        if (request.kind === 'LOCK')
          await context.provider.changeLock(
            intent,
            context.orderId,
            request.locked,
            claimSubmission,
          );
        if (request.kind === 'CONTACT') {
          await this.prisma.domainAction.update({
            where: { id: actionId },
            data: { contactClaimedAt: new Date() },
          });
          const contactId = await context.provider.replacementContact({
            ...intent,
            contact: request.contact,
          });
          await this.prisma.domainAction.update({
            where: { id: actionId },
            data: { remoteContactId: contactId },
          });
          await context.provider.changeContacts(
            { ...intent, contact: request.contact },
            context.orderId,
            contactId,
            claimSubmission,
          );
        }
        if (request.kind === 'RENEW') {
          if (before.expiresAt !== payload.previousExpiry)
            this.deny(
              'Renewal expiry changed; reconcile without repeating the purchase.',
            );
          await context.provider.renew(
            intent,
            context.orderId,
            new Date(payload.previousExpiry),
            claimSubmission,
          );
        }
      }
    } catch {
      readFailed = true;
    } // No retry or raw provider errors. Independent read can still prove the result.
    if (dispatch && readFailed) {
      const unsent = await this.prisma.domainAction.findUniqueOrThrow({
        where: { id: actionId },
      });
      if (!unsent.submittedAt && !unsent.contactClaimedAt) {
        // Proven local preflight/read failure before any write claim, never an ambiguous submitted outcome.
        await this.prisma.$transaction(async (tx) => {
          await tx.domainAction.update({
            where: { id: actionId },
            data: { state: 'FAILED' },
          });
          await tx.activityLog.create({
            data: {
              actorUserId: auth.identity.userId,
              action: 'DOMAIN_ACTION_NOT_SUBMITTED',
              entityType: 'DOMAIN',
              entityId: domainId,
              metadata: { actionId },
            },
          });
        });
        return this.list(domainId, auth);
      }
    }
    let observed;
    try {
      observed = await context.provider.management(intent, context.orderId);
    } catch {
      await this.prisma.activityLog.create({
        data: {
          actorUserId: auth.identity.userId,
          action: 'DOMAIN_ACTION_READ_UNCERTAIN',
          entityType: 'DOMAIN',
          entityId: domainId,
          metadata: { actionId },
        },
      });
      return this.list(domainId, auth);
    }
    const currentAction = await this.prisma.domainAction.findUniqueOrThrow({
      where: { id: actionId },
    });
    const expiryAdvance =
      new Date(observed.expiresAt).getTime() -
      new Date(payload.previousExpiry).getTime();
    const confirmed =
      request.kind === 'NAMESERVERS'
        ? JSON.stringify([...observed.nameservers].sort()) ===
          JSON.stringify([...request.nameservers].sort())
        : request.kind === 'LOCK'
          ? observed.locked === request.locked
          : request.kind === 'CONTACT'
            ? !!currentAction.remoteContactId &&
              observed.contactIds.every(
                (id) => id === currentAction.remoteContactId,
              )
            : expiryAdvance >= 330 * 86400000 &&
              expiryAdvance <= 370 * 86400000;
    const projected = domainManagementSchema.parse({
      nameservers: observed.nameservers,
      locked: observed.locked,
      observedAt: observed.observedAt,
      expiresAt: observed.expiresAt,
      verification: observed.verification,
    });
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM domains WHERE id=${domainId}::uuid FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM domain_actions WHERE id=${actionId}::uuid FOR UPDATE`;
      const latest = await tx.domainAction.findUniqueOrThrow({
        where: { id: actionId },
      });
      if (latest.state === 'SUCCEEDED') return;
      await tx.domain.update({
        where: { id: domainId },
        data: {
          managementSnapshot: projected,
          ...(observed.contact
            ? {
                currentContactCiphertext: this.cipher.encrypt(
                  `resellbiz:current-contact:${domainId}`,
                  observed.contact,
                ),
              }
            : {}),
          expiresAt: new Date(projected.expiresAt),
          verification: projected.verification,
        },
      });
      if (confirmed)
        await tx.domainAction.update({
          where: { id: actionId },
          data: { state: 'SUCCEEDED' },
        });
      await tx.activityLog.create({
        data: {
          actorUserId: auth.identity.userId,
          action: confirmed
            ? 'DOMAIN_ACTION_CONFIRMED'
            : 'DOMAIN_ACTION_OUTCOME_UNCERTAIN',
          entityType: 'DOMAIN',
          entityId: domainId,
          metadata: {
            actionId,
            kind: request.kind,
            responseUncertain: readFailed,
          },
        },
      });
    });
    return this.list(domainId, auth);
  }
  async authorizationCode(
    domainId: string,
    confirmation: string,
    auth: AuthRequestContext,
  ) {
    this.administrator(auth);
    const context = await this.domains.managementContext(domainId, auth);
    if (confirmation !== context.domain.domainName)
      this.deny('Confirm the exact domain name.');
    await this.domains.reserveManagementRead(context.account.id, auth);
    let code: string;
    try {
      code = await context.provider.authorizationCode(
        context.intent,
        context.orderId,
      );
    } catch {
      this.deny('The registrar authorization code is unavailable.');
    }
    await this.prisma.activityLog.create({
      data: {
        actorUserId: auth.identity.userId,
        action: 'DOMAIN_AUTHORIZATION_CODE_VIEWED',
        entityType: 'DOMAIN',
        entityId: domainId,
      },
    });
    return { code };
  }
  async recoverContact(
    domainId: string,
    actionId: string,
    contactId: string,
    confirmation: string,
    auth: AuthRequestContext,
  ) {
    this.administrator(auth);
    const action = await this.prisma.domainAction.findFirst({
      where: { id: actionId, domainId },
    });
    if (
      !action ||
      action.kind !== 'CONTACT' ||
      !action.contactClaimedAt ||
      action.state !== 'NEEDS_RECONCILIATION'
    )
      this.deny(
        'Only an unresolved claimed contact creation can use read-only recovery.',
      );
    const context = await this.domains.managementContext(
      domainId,
      auth,
      action.credentialId,
    );
    if (confirmation !== context.domain.domainName)
      this.deny('Confirm the exact domain name.');
    if (action.remoteContactId && action.remoteContactId !== contactId)
      this.deny('A different immutable contact is already verified.');
    const payload = payloadSchema.parse(
      this.cipher.decrypt(this.binding(actionId), action.payloadCiphertext),
    );
    if (payload.request.kind !== 'CONTACT')
      this.deny('Contact intent is unavailable.');
    await this.domains.reserveManagementRead(action.accountId, auth);
    try {
      await context.provider.verifyReplacementContact(
        { ...context.intent, contact: payload.request.contact },
        contactId,
      );
    } catch {
      this.deny(
        'Replacement contact ownership or snapshot could not be verified. No mutation was sent.',
      );
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.domainAction.update({
        where: { id: actionId },
        data: { remoteContactId: contactId },
      });
      await tx.activityLog.create({
        data: {
          actorUserId: auth.identity.userId,
          action: 'DOMAIN_CONTACT_RECOVERY_VERIFIED',
          entityType: 'DOMAIN',
          entityId: domainId,
          metadata: { actionId },
        },
      });
    });
    return this.list(domainId, auth);
  }
  async cancelUnsent(
    domainId: string,
    actionId: string,
    confirmation: string,
    auth: AuthRequestContext,
  ) {
    this.administrator(auth);
    await this.domains.detail(domainId, auth);
    const domain = await this.prisma.domain.findUniqueOrThrow({
      where: { id: domainId },
    });
    if (confirmation !== domain.domainName)
      this.deny('Confirm the exact domain name.');
    const located = await this.prisma.domainAction.findFirst({
      where: { id: actionId, domainId },
    });
    if (!located) this.deny('Domain action is unavailable.');
    await this.prisma.$transaction(async (tx) => {
      if (located.invoiceId) await lockDomainInvoice(tx, located.invoiceId);
      await tx.$queryRaw`SELECT id FROM domains WHERE id=${domainId}::uuid FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM domain_actions WHERE id=${actionId}::uuid FOR UPDATE`;
      const action = await tx.domainAction.findUniqueOrThrow({
        where: { id: actionId },
      });
      if (action.state === 'CANCELLED') return;
      if (action.claimedAt || action.state !== 'REQUESTED')
        this.deny(
          'A claimed registrar action cannot be cancelled. Reconcile its outcome.',
        );
      if (action.invoiceId) {
        const invoice = await tx.invoice.findUniqueOrThrow({
          where: { id: action.invoiceId },
          include: { payments: true },
        });
        if (
          !['DRAFT', 'UNPAID', 'OVERDUE'].includes(invoice.status) ||
          invoice.amountPaid !== 0n ||
          invoice.payments.length
        )
          this.deny(
            'A renewal with payment history requires financial review; it cannot be cancelled here.',
          );
        await tx.invoice.update({
          where: { id: invoice.id },
          data: { status: 'CANCELLED' },
        });
      }
      await tx.domainAction.update({
        where: { id: actionId },
        data: { state: 'CANCELLED' },
      });
      await tx.activityLog.create({
        data: {
          actorUserId: auth.identity.userId,
          action: 'UNSENT_DOMAIN_ACTION_CANCELLED',
          entityType: 'DOMAIN',
          entityId: domainId,
          metadata: { actionId },
        },
      });
    });
    return this.list(domainId, auth);
  }
}
