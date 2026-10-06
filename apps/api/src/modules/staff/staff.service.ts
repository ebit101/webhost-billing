import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { ApiEnvironment } from '@webhost-billing/config';
import {
  Prisma,
  UserRole,
  UserStatus,
  type PrismaClient,
} from '@webhost-billing/database';
import {
  staffAccountSchema,
  type StaffAccount,
  type CreateStaffRequest,
  type UpdateStaffRequest,
} from '@webhost-billing/shared';
import { randomUUID } from 'node:crypto';
import { ApplicationException } from '../../common/errors/application.exception';
import type { SecurityRequestContext } from '../../common/http/request-context';
import { PRISMA_CLIENT } from '../../infrastructure/database/database.module';
import { API_ENVIRONMENT } from '../../infrastructure/environment/environment.module';
import type { AuthRequestContext, AuthTokenFactory } from '../auth/auth.types';
import { AUTH_TOKEN_FACTORY } from '../auth/auth.constants';
import { hashOpaqueToken } from '../auth/services/auth-token.service';
import { TokenCipherService } from '../auth/services/token-cipher.service';

const include = {
  adminProfile: true,
  adminTotpCredential: { select: { enabledAt: true } },
} satisfies Prisma.UserInclude;
type StaffUser = Prisma.UserGetPayload<{ include: typeof include }>;

function fail(message: string, status = HttpStatus.CONFLICT): never {
  throw new ApplicationException({
    status,
    code: status === HttpStatus.FORBIDDEN ? 'FORBIDDEN' : 'CONFLICT',
    message,
  });
}

@Injectable()
export class StaffService {
  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient,
    @Inject(API_ENVIRONMENT) private readonly environment: ApiEnvironment,
    @Inject(AUTH_TOKEN_FACTORY) private readonly tokens: AuthTokenFactory,
    private readonly cipher: TokenCipherService,
  ) {}

  async list(): Promise<StaffAccount[]> {
    const users = await this.prisma.user.findMany({
      where: {
        role: UserRole.ADMIN,
        deletedAt: null,
        adminProfile: { isNot: null },
      },
      include,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    return users.map((user) => this.serialize(user));
  }

  async create(
    input: CreateStaffRequest,
    actor: AuthRequestContext,
    context: SecurityRequestContext,
  ): Promise<StaffAccount> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.lockAndAuthorize(tx, actor);
        const user = await tx.user.create({
          data: {
            email: input.email,
            role: UserRole.ADMIN,
            status: UserStatus.PENDING_VERIFICATION,
            adminProfile: {
              create: {
                displayName: input.displayName,
                staffRole: input.staffRole,
              },
            },
          },
          include,
        });
        await this.queueInvitation(tx, user);
        await this.audit(tx, actor, context, user.id, 'STAFF_INVITED', {
          staffRole: input.staffRole,
        });
        return this.serialize(user);
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      )
        fail('An account with this email already exists.');
      throw error;
    }
  }

  async update(
    userId: string,
    input: UpdateStaffRequest,
    actor: AuthRequestContext,
    context: SecurityRequestContext,
  ): Promise<StaffAccount> {
    return this.prisma.$transaction(async (tx) => {
      await this.lockAndAuthorize(tx, actor);
      const user = await tx.user.findUnique({ where: { id: userId }, include });
      if (
        !user ||
        user.role !== UserRole.ADMIN ||
        !user.adminProfile ||
        user.deletedAt
      )
        fail('Administrator account was not found.', HttpStatus.NOT_FOUND);
      if (
        userId === actor.identity.userId &&
        (!input.enabled || input.staffRole !== 'FULL_ADMINISTRATOR')
      )
        fail('You cannot disable or demote your own administrator account.');

      const removesActiveFull =
        user.status === UserStatus.ACTIVE &&
        user.adminProfile.staffRole === 'FULL_ADMINISTRATOR' &&
        (!input.enabled || input.staffRole !== 'FULL_ADMINISTRATOR');
      if (removesActiveFull) {
        const remaining = await tx.user.count({
          where: {
            id: { not: userId },
            role: UserRole.ADMIN,
            status: UserStatus.ACTIVE,
            deletedAt: null,
            emailVerifiedAt: { not: null },
            passwordHash: { not: null },
            adminProfile: { is: { staffRole: 'FULL_ADMINISTRATOR' } },
          },
        });
        if (remaining === 0)
          fail('At least one active full administrator must remain.');
      }
      const now = new Date();
      const result = await tx.user.update({
        where: { id: userId },
        data: {
          status: !input.enabled
            ? UserStatus.DISABLED
            : user.emailVerifiedAt && user.passwordHash
              ? UserStatus.ACTIVE
              : UserStatus.PENDING_VERIFICATION,
          adminProfile: {
            update: {
              displayName: input.displayName,
              staffRole: input.staffRole,
            },
          },
        },
        include,
      });
      await tx.authSession.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: now, revokedReason: 'STAFF_ACCESS_CHANGED' },
      });
      await tx.adminLoginChallenge.updateMany({
        where: { userId, usedAt: null },
        data: { usedAt: now },
      });
      if (!input.enabled) await this.invalidateInvitation(tx, userId, now);
      await this.audit(tx, actor, context, userId, 'STAFF_ACCESS_CHANGED', {
        previousRole: user.adminProfile.staffRole,
        staffRole: input.staffRole,
        previousStatus: user.status,
        status: result.status,
      });
      return this.serialize(result);
    });
  }

  async resend(
    userId: string,
    actor: AuthRequestContext,
    context: SecurityRequestContext,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await this.lockAndAuthorize(tx, actor);
      const user = await tx.user.findUnique({ where: { id: userId }, include });
      if (
        !user ||
        user.role !== UserRole.ADMIN ||
        !user.adminProfile ||
        user.deletedAt ||
        (user.status !== UserStatus.PENDING_VERIFICATION &&
          !(user.status === UserStatus.ACTIVE && !user.passwordHash))
      )
        fail('Only a pending administrator can receive another invitation.');
      await this.invalidateInvitation(tx, userId, new Date());
      await this.queueInvitation(tx, user);
      await this.audit(
        tx,
        actor,
        context,
        userId,
        'STAFF_INVITATION_RESENT',
        {},
      );
    });
  }

  private async lockAndAuthorize(
    tx: Prisma.TransactionClient,
    actor: AuthRequestContext,
  ): Promise<void> {
    // Serialize all staff mutations and re-read the actor after acquiring the lock.
    await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(920006)`;
    const user = await tx.user.findUnique({
      where: { id: actor.identity.userId },
      include,
    });
    if (
      !user ||
      user.role !== UserRole.ADMIN ||
      user.status !== UserStatus.ACTIVE ||
      user.deletedAt ||
      !user.emailVerifiedAt ||
      !user.passwordHash ||
      user.adminProfile?.staffRole !== 'FULL_ADMINISTRATOR' ||
      !user.adminTotpCredential?.enabledAt
    )
      fail(
        'Staff changes require an active full administrator with two-factor authentication.',
        HttpStatus.FORBIDDEN,
      );
  }

  private async invalidateInvitation(
    tx: Prisma.TransactionClient,
    userId: string,
    now: Date,
  ): Promise<void> {
    await tx.emailVerificationToken.updateMany({
      where: { userId, usedAt: null },
      data: { usedAt: now, deliveryCiphertext: 'superseded' },
    });
    await tx.passwordResetToken.updateMany({
      where: { userId, usedAt: null },
      data: { usedAt: now, deliveryCiphertext: 'superseded' },
    });
  }

  private async queueInvitation(
    tx: Prisma.TransactionClient,
    user: StaffUser,
  ): Promise<void> {
    const now = Date.now();
    // Reuse the existing encrypted token delivery and one-time confirmation flows.
    for (const purpose of ['EMAIL_VERIFICATION', 'PASSWORD_RESET'] as const) {
      if (purpose === 'EMAIL_VERIFICATION' && user.emailVerifiedAt) continue;
      const id = randomUUID();
      const token = this.tokens.generate();
      const data = {
        id,
        userId: user.id,
        tokenHash: hashOpaqueToken(token),
        deliveryCiphertext: this.cipher.encrypt(token),
        expiresAt: new Date(
          now +
            1000 *
              (purpose === 'EMAIL_VERIFICATION'
                ? this.environment.EMAIL_VERIFICATION_TTL_SECONDS
                : this.environment.PASSWORD_RESET_TTL_SECONDS),
        ),
      };
      if (purpose === 'EMAIL_VERIFICATION')
        await tx.emailVerificationToken.create({ data });
      else await tx.passwordResetToken.create({ data });
      await tx.outboxEvent.create({
        data: {
          aggregateType: 'USER',
          aggregateId: user.id,
          eventType:
            purpose === 'EMAIL_VERIFICATION'
              ? 'AUTH_EMAIL_VERIFICATION_REQUESTED'
              : 'AUTH_PASSWORD_RESET_REQUESTED',
          idempotencyKey: `staff-invitation:${purpose}:${id}`,
          payload: {
            schemaVersion: 1,
            recipientEmail: user.email,
            tokenRecordId: id,
            purpose,
          },
        },
      });
    }
  }

  private serialize(user: StaffUser): StaffAccount {
    return staffAccountSchema.parse({
      id: user.id,
      email: user.email,
      displayName: user.adminProfile?.displayName,
      staffRole: user.adminProfile?.staffRole,
      // Verification and password setup are independent one-time flows. Until
      // both finish, keep the invitation visible and eligible for recovery.
      status:
        user.status === UserStatus.ACTIVE && !user.passwordHash
          ? UserStatus.PENDING_VERIFICATION
          : user.status,
      twoFactorEnabled: Boolean(user.adminTotpCredential?.enabledAt),
    });
  }

  private async audit(
    tx: Prisma.TransactionClient,
    actor: AuthRequestContext,
    context: SecurityRequestContext,
    entityId: string,
    action: string,
    metadata: Prisma.InputJsonObject,
  ): Promise<void> {
    await tx.activityLog.create({
      data: {
        actorUserId: actor.identity.userId,
        entityType: 'USER',
        entityId,
        action,
        metadata,
        ipAddressHash: context.ipAddressHash,
      },
    });
  }
}
