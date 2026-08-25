import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { ApiEnvironment } from '@webhost-billing/config';
import {
  CustomerStatus,
  OutboxStatus,
  type Prisma,
  UserRole,
  UserStatus,
  type PrismaClient,
} from '@webhost-billing/database';
import {
  authenticatedIdentitySchema,
  customerProfileSummarySchema,
  type AuthenticatedIdentity,
  type AuthenticationSession,
  type CustomerProfileSummary,
  type LoginRequest,
  type PasswordResetConfirmation,
  type RegistrationRequest,
  type TwoFactorDisableRequest,
  type TwoFactorLoginRequest,
  type TwoFactorRecoveryCodesResponse,
  type TwoFactorSetupResponse,
  type TwoFactorStatus,
} from '@webhost-billing/shared';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { ApplicationException } from '../../../common/errors/application.exception';
import type { SecurityRequestContext } from '../../../common/http/request-context';
import { PRISMA_CLIENT } from '../../../infrastructure/database/database.module';
import { API_ENVIRONMENT } from '../../../infrastructure/environment/environment.module';
import { AUTH_TOKEN_FACTORY } from '../auth.constants';
import type { AuthRequestContext, AuthTokenFactory } from '../auth.types';
import { AuthAuditService } from './auth-audit.service';
import { hashOpaqueToken } from './auth-token.service';
import { PasswordHasherService } from './password-hasher.service';
import { TokenCipherService } from './token-cipher.service';
import { TotpService } from './totp.service';

interface UserWithProfiles {
  id: string;
  email: string;
  passwordHash: string | null;
  role: UserRole;
  status: UserStatus;
  emailVerifiedAt: Date | null;
  deletedAt: Date | null;
  customer: { id: string } | null;
  adminProfile: { id: string } | null;
  adminTotpCredential?: { enabledAt: Date | null } | null;
}

export interface LoginResult {
  token: string;
  identity: AuthenticatedIdentity;
  session: AuthenticationSession;
}

export interface TwoFactorChallengeResult {
  requiresTwoFactor: true;
  challengeToken: string;
  expiresAt: string;
}

export interface RegisteredCustomerAccount {
  userId: string;
  customerId: string;
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'P2002'
  );
}

function invalidTokenException(): ApplicationException {
  return new ApplicationException({
    status: HttpStatus.BAD_REQUEST,
    code: 'INVALID_OR_EXPIRED_TOKEN',
    message: 'Token is invalid or has expired.',
  });
}

function equalHexDigest(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, 'hex');
  const rightBuffer = Buffer.from(right, 'hex');
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

@Injectable()
export class AuthService {
  private readonly sessionTtlMilliseconds: number;
  private readonly passwordResetTtlMilliseconds: number;
  private readonly emailVerificationTtlMilliseconds: number;
  private readonly sessionIdleTtlMilliseconds: number;

  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient,
    @Inject(AUTH_TOKEN_FACTORY)
    private readonly tokens: AuthTokenFactory,
    @Inject(API_ENVIRONMENT) environment: ApiEnvironment,
    private readonly passwords: PasswordHasherService,
    private readonly tokenCipher: TokenCipherService,
    private readonly totp: TotpService,
    private readonly audit: AuthAuditService,
  ) {
    this.sessionTtlMilliseconds = environment.SESSION_TTL_SECONDS * 1_000;
    this.sessionIdleTtlMilliseconds = Math.min(
      this.sessionTtlMilliseconds,
      60 * 60 * 1_000,
    );
    this.passwordResetTtlMilliseconds =
      environment.PASSWORD_RESET_TTL_SECONDS * 1_000;
    this.emailVerificationTtlMilliseconds =
      environment.EMAIL_VERIFICATION_TTL_SECONDS * 1_000;
  }

  async register(
    input: RegistrationRequest & { taxIdentifier?: string },
    context: SecurityRequestContext,
    options?: { administratorActorUserId: string },
  ): Promise<RegisteredCustomerAccount> {
    const passwordHash = await this.passwords.hash(input.password);
    const userId = randomUUID();
    const customerId = randomUUID();
    const verificationTokenId = randomUUID();
    const verificationToken = this.tokens.generate();
    const now = new Date();
    const expiresAt = new Date(
      now.getTime() + this.emailVerificationTtlMilliseconds,
    );

    try {
      await this.prisma.$transaction(async (transaction) => {
        await transaction.user.create({
          data: {
            id: userId,
            email: input.email,
            passwordHash,
            role: UserRole.CUSTOMER,
            status: UserStatus.PENDING_VERIFICATION,
            customer: {
              create: {
                id: customerId,
                customerNumber: this.createCustomerNumber(customerId),
                status: CustomerStatus.ACTIVE,
                firstName: input.firstName,
                lastName: input.lastName,
                addressLine1: input.addressLine1,
                city: input.city,
                countryCode: input.countryCode,
                ...(input.companyName
                  ? { companyName: input.companyName }
                  : {}),
                ...(input.phone ? { phone: input.phone } : {}),
                ...(input.addressLine2
                  ? { addressLine2: input.addressLine2 }
                  : {}),
                ...(input.region ? { region: input.region } : {}),
                ...(input.postalCode ? { postalCode: input.postalCode } : {}),
                ...(input.taxIdentifier
                  ? { taxIdentifier: input.taxIdentifier }
                  : {}),
              },
            },
          },
        });
        await transaction.emailVerificationToken.create({
          data: {
            id: verificationTokenId,
            userId,
            tokenHash: hashOpaqueToken(verificationToken),
            deliveryCiphertext: this.tokenCipher.encrypt(verificationToken),
            expiresAt,
          },
        });
        await transaction.outboxEvent.create({
          data: {
            aggregateType: 'USER',
            aggregateId: userId,
            eventType: 'AUTH_EMAIL_VERIFICATION_REQUESTED',
            idempotencyKey: `auth-email-verification:${verificationTokenId}`,
            payload: {
              schemaVersion: 1,
              recipientEmail: input.email,
              tokenRecordId: verificationTokenId,
              purpose: 'EMAIL_VERIFICATION',
            },
            status: OutboxStatus.PENDING,
          },
        });
        await transaction.activityLog.create({
          data: {
            actorUserId: userId,
            action: 'AUTH_REGISTERED',
            entityType: 'USER',
            entityId: userId,
            ipAddressHash: context.ipAddressHash,
          },
        });
        if (options) {
          await transaction.activityLog.create({
            data: {
              actorUserId: options.administratorActorUserId,
              action: 'CUSTOMER_CREATED_BY_ADMIN',
              entityType: 'CUSTOMER',
              entityId: customerId,
              ipAddressHash: context.ipAddressHash,
              metadata: { accountStatus: 'PENDING_VERIFICATION' },
            },
          });
        }
      });
      return { userId, customerId };
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ApplicationException({
          status: HttpStatus.CONFLICT,
          code: 'CONFLICT',
          message: 'An account with this email already exists.',
        });
      }

      throw error;
    }
  }

  async verifyEmail(
    token: string,
    context: SecurityRequestContext,
  ): Promise<void> {
    const tokenHash = hashOpaqueToken(token);
    const now = new Date();

    await this.prisma.$transaction(async (transaction) => {
      const verification = await transaction.emailVerificationToken.findUnique({
        where: { tokenHash },
        select: { id: true, userId: true, usedAt: true, expiresAt: true },
      });

      if (
        !verification ||
        verification.usedAt ||
        verification.expiresAt <= now
      ) {
        throw invalidTokenException();
      }

      const consumed = await transaction.emailVerificationToken.updateMany({
        where: {
          id: verification.id,
          usedAt: null,
          expiresAt: { gt: now },
        },
        data: { usedAt: now, deliveryCiphertext: 'consumed' },
      });

      if (consumed.count !== 1) {
        throw invalidTokenException();
      }

      await transaction.user.update({
        where: { id: verification.userId },
        data: {
          emailVerifiedAt: now,
          status: UserStatus.ACTIVE,
        },
      });
      await transaction.activityLog.create({
        data: {
          actorUserId: verification.userId,
          action: 'AUTH_EMAIL_VERIFIED',
          entityType: 'USER',
          entityId: verification.userId,
          ipAddressHash: context.ipAddressHash,
        },
      });
    });
  }

  async login(
    input: LoginRequest,
    context: SecurityRequestContext,
  ): Promise<LoginResult | TwoFactorChallengeResult> {
    const user = await this.prisma.user.findUnique({
      where: { email: input.email },
      include: {
        customer: { select: { id: true } },
        adminProfile: { select: { id: true } },
        adminTotpCredential: { select: { enabledAt: true } },
      },
    });

    if (!user?.passwordHash) {
      await this.passwords.consumeEquivalentWork(input.password);
      await this.audit.record(
        {
          action: 'AUTH_LOGIN_FAILED',
          entityType: 'USER',
          metadata: { reason: 'INVALID_CREDENTIALS' },
        },
        context,
      );
      throw this.invalidCredentialsException();
    }

    const passwordMatches = await this.passwords.verify(
      user.passwordHash,
      input.password,
    );

    if (!passwordMatches || user.deletedAt) {
      await this.audit.record(
        {
          action: 'AUTH_LOGIN_FAILED',
          entityType: 'USER',
          entityId: user.id,
          metadata: { reason: 'INVALID_CREDENTIALS' },
        },
        context,
      );
      throw this.invalidCredentialsException();
    }

    if (
      user.status === UserStatus.PENDING_VERIFICATION ||
      !user.emailVerifiedAt
    ) {
      throw new ApplicationException({
        status: HttpStatus.FORBIDDEN,
        code: 'EMAIL_VERIFICATION_REQUIRED',
        message: 'Email verification is required.',
      });
    }

    if (user.status !== UserStatus.ACTIVE) {
      throw this.invalidCredentialsException();
    }

    const identity = this.toIdentity(user);
    if (user.role === UserRole.ADMIN && user.adminTotpCredential?.enabledAt) {
      const challengeToken = this.tokens.generate();
      const createdAt = new Date();
      const expiresAt = new Date(createdAt.getTime() + 5 * 60 * 1_000);
      await this.prisma.$transaction([
        this.prisma.adminLoginChallenge.updateMany({
          where: { userId: user.id, usedAt: null },
          data: { usedAt: createdAt },
        }),
        this.prisma.adminLoginChallenge.create({
          data: {
            userId: user.id,
            tokenHash: hashOpaqueToken(challengeToken),
            expiresAt,
            ipAddressHash: context.ipAddressHash,
            ...(context.userAgent ? { userAgent: context.userAgent } : {}),
          },
        }),
        this.prisma.activityLog.create({
          data: {
            actorUserId: user.id,
            action: 'AUTH_TWO_FACTOR_CHALLENGE_CREATED',
            entityType: 'USER',
            entityId: user.id,
            ipAddressHash: context.ipAddressHash,
          },
        }),
      ]);
      return {
        requiresTwoFactor: true,
        challengeToken,
        expiresAt: expiresAt.toISOString(),
      };
    }

    const rawToken = this.tokens.generate();
    const createdAt = new Date();
    const expiresAt = new Date(
      createdAt.getTime() + this.sessionTtlMilliseconds,
    );
    const sessionId = randomUUID();

    await this.prisma.$transaction(async (transaction) => {
      await transaction.authSession.create({
        data: {
          id: sessionId,
          userId: user.id,
          tokenHash: hashOpaqueToken(rawToken),
          createdAt,
          expiresAt,
          lastSeenAt: createdAt,
          ipAddressHash: context.ipAddressHash,
          ...(user.role === UserRole.ADMIN
            ? { twoFactorVerifiedAt: createdAt }
            : {}),
          ...(context.userAgent ? { userAgent: context.userAgent } : {}),
        },
      });
      await transaction.user.update({
        where: { id: user.id },
        data: { lastLoginAt: createdAt },
      });
      await transaction.activityLog.create({
        data: {
          actorUserId: user.id,
          action: 'AUTH_LOGIN_SUCCEEDED',
          entityType: 'AUTH_SESSION',
          entityId: sessionId,
          ipAddressHash: context.ipAddressHash,
        },
      });
    });

    return {
      token: rawToken,
      identity,
      session: {
        id: sessionId,
        createdAt: createdAt.toISOString(),
        lastSeenAt: createdAt.toISOString(),
        expiresAt: expiresAt.toISOString(),
        current: true,
      },
    };
  }

  async authenticateSession(rawToken: string): Promise<AuthRequestContext> {
    const now = new Date();
    const session = await this.prisma.authSession.findUnique({
      where: { tokenHash: hashOpaqueToken(rawToken) },
      include: {
        user: {
          include: {
            customer: { select: { id: true } },
            adminProfile: { select: { id: true } },
            adminTotpCredential: { select: { enabledAt: true } },
          },
        },
      },
    });
    const idleExpired = Boolean(
      session &&
      now.getTime() - session.lastSeenAt.getTime() >
        this.sessionIdleTtlMilliseconds,
    );
    const missingSecondFactor = Boolean(
      session &&
      session.user.role === UserRole.ADMIN &&
      session.user.adminTotpCredential?.enabledAt &&
      !session.twoFactorVerifiedAt,
    );
    if (session && !session.revokedAt && (idleExpired || missingSecondFactor)) {
      const reason = idleExpired ? 'IDLE_TIMEOUT' : 'MFA_REQUIRED';
      await this.prisma.$transaction([
        this.prisma.authSession.updateMany({
          where: { id: session.id, revokedAt: null },
          data: { revokedAt: now, revokedReason: reason },
        }),
        this.prisma.activityLog.create({
          data: {
            actorUserId: session.userId,
            action: 'AUTH_SESSION_REVOKED_AUTOMATICALLY',
            entityType: 'AUTH_SESSION',
            entityId: session.id,
            metadata: { reason },
          },
        }),
      ]);
    }

    if (
      !session ||
      session.revokedAt ||
      session.expiresAt <= now ||
      idleExpired ||
      session.user.deletedAt ||
      session.user.status !== UserStatus.ACTIVE ||
      missingSecondFactor
    ) {
      throw new ApplicationException({
        status: HttpStatus.UNAUTHORIZED,
        code: 'AUTHENTICATION_REQUIRED',
        message: 'Authentication is required.',
      });
    }

    if (now.getTime() - session.lastSeenAt.getTime() >= 300_000) {
      await this.prisma.authSession.update({
        where: { id: session.id },
        data: { lastSeenAt: now },
      });
    }

    return {
      identity: this.toIdentity(session.user),
      sessionId: session.id,
    };
  }

  async completeTwoFactorLogin(
    input: TwoFactorLoginRequest,
    context: SecurityRequestContext,
  ): Promise<LoginResult> {
    const now = new Date();
    const challenge = await this.prisma.adminLoginChallenge.findUnique({
      where: { tokenHash: hashOpaqueToken(input.challengeToken) },
      include: {
        user: {
          include: {
            customer: { select: { id: true } },
            adminProfile: { select: { id: true } },
            adminTotpCredential: {
              include: { recoveryCodes: { where: { usedAt: null } } },
            },
          },
        },
      },
    });
    if (
      !challenge ||
      challenge.usedAt ||
      challenge.expiresAt <= now ||
      challenge.failedAttempts >= 5 ||
      challenge.ipAddressHash !== context.ipAddressHash ||
      challenge.user.role !== UserRole.ADMIN ||
      challenge.user.status !== UserStatus.ACTIVE ||
      challenge.user.deletedAt ||
      !challenge.user.adminTotpCredential?.enabledAt
    ) {
      throw this.invalidTwoFactorException();
    }

    const credential = challenge.user.adminTotpCredential;
    const timeStep = this.totp.verify(
      this.totp.decryptSecret(credential.secretCiphertext),
      input.code,
      now,
    );
    const recoveryHash = this.totp.hashRecoveryCode(input.code);
    const recovery = credential.recoveryCodes.find((item) =>
      equalHexDigest(item.codeHash, recoveryHash),
    );

    try {
      return await this.prisma.$transaction(async (transaction) => {
        let factorConsumed = false;
        if (timeStep !== null) {
          const consumed = await transaction.adminTotpCredential.updateMany({
            where: {
              id: credential.id,
              OR: [
                { lastUsedTimeStep: null },
                { lastUsedTimeStep: { lt: timeStep } },
              ],
            },
            data: { lastUsedTimeStep: timeStep },
          });
          factorConsumed = consumed.count === 1;
        } else if (recovery) {
          const consumed = await transaction.adminRecoveryCode.updateMany({
            where: { id: recovery.id, usedAt: null },
            data: { usedAt: now },
          });
          factorConsumed = consumed.count === 1;
        }

        const challengeConsumed = factorConsumed
          ? await transaction.adminLoginChallenge.updateMany({
              where: { id: challenge.id, usedAt: null, expiresAt: { gt: now } },
              data: { usedAt: now },
            })
          : { count: 0 };
        if (!factorConsumed || challengeConsumed.count !== 1) {
          throw this.invalidTwoFactorException();
        }

        return this.createSession(
          transaction,
          challenge.user,
          context,
          now,
          true,
          recovery ? 'RECOVERY_CODE' : 'TOTP',
        );
      });
    } catch (error) {
      if (error instanceof ApplicationException) {
        await this.prisma.$transaction([
          this.prisma.adminLoginChallenge.updateMany({
            where: {
              id: challenge.id,
              usedAt: null,
              failedAttempts: { lt: 5 },
            },
            data: { failedAttempts: { increment: 1 } },
          }),
          this.prisma.activityLog.create({
            data: {
              actorUserId: challenge.userId,
              action: 'AUTH_TWO_FACTOR_LOGIN_FAILED',
              entityType: 'USER',
              entityId: challenge.userId,
              ipAddressHash: context.ipAddressHash,
            },
          }),
        ]);
        throw error;
      }
      throw error;
    }
  }

  async requestPasswordReset(
    email: string,
    context: SecurityRequestContext,
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, passwordHash: true, deletedAt: true },
    });

    const token = this.tokens.generate();

    if (!user?.passwordHash || user.deletedAt) {
      this.tokenCipher.encrypt(token);
      return;
    }

    const now = new Date();
    const tokenId = randomUUID();
    const expiresAt = new Date(
      now.getTime() + this.passwordResetTtlMilliseconds,
    );

    await this.prisma.$transaction(async (transaction) => {
      await transaction.passwordResetToken.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: now, deliveryCiphertext: 'superseded' },
      });
      await transaction.passwordResetToken.create({
        data: {
          id: tokenId,
          userId: user.id,
          tokenHash: hashOpaqueToken(token),
          deliveryCiphertext: this.tokenCipher.encrypt(token),
          expiresAt,
        },
      });
      await transaction.outboxEvent.create({
        data: {
          aggregateType: 'USER',
          aggregateId: user.id,
          eventType: 'AUTH_PASSWORD_RESET_REQUESTED',
          idempotencyKey: `auth-password-reset:${tokenId}`,
          payload: {
            schemaVersion: 1,
            recipientEmail: user.email,
            tokenRecordId: tokenId,
            purpose: 'PASSWORD_RESET',
          },
          status: OutboxStatus.PENDING,
        },
      });
      await transaction.activityLog.create({
        data: {
          actorUserId: user.id,
          action: 'AUTH_PASSWORD_RESET_REQUESTED',
          entityType: 'USER',
          entityId: user.id,
          ipAddressHash: context.ipAddressHash,
        },
      });
    });
  }

  async confirmPasswordReset(
    input: PasswordResetConfirmation,
    context: SecurityRequestContext,
  ): Promise<void> {
    const now = new Date();
    const tokenHash = hashOpaqueToken(input.token);
    const token = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash },
      select: { id: true, userId: true, usedAt: true, expiresAt: true },
    });

    if (!token || token.usedAt || token.expiresAt <= now) {
      throw invalidTokenException();
    }

    const passwordHash = await this.passwords.hash(input.password);

    await this.prisma.$transaction(async (transaction) => {
      const consumed = await transaction.passwordResetToken.updateMany({
        where: { id: token.id, usedAt: null, expiresAt: { gt: now } },
        data: { usedAt: now, deliveryCiphertext: 'consumed' },
      });

      if (consumed.count !== 1) {
        throw invalidTokenException();
      }

      await transaction.user.update({
        where: { id: token.userId },
        data: { passwordHash },
      });
      await transaction.authSession.updateMany({
        where: { userId: token.userId, revokedAt: null },
        data: { revokedAt: now, revokedReason: 'PASSWORD_RESET' },
      });
      await transaction.activityLog.create({
        data: {
          actorUserId: token.userId,
          action: 'AUTH_PASSWORD_RESET_COMPLETED',
          entityType: 'USER',
          entityId: token.userId,
          ipAddressHash: context.ipAddressHash,
        },
      });
    });
  }

  async logout(
    auth: AuthRequestContext,
    context: SecurityRequestContext,
  ): Promise<void> {
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.authSession.updateMany({
        where: {
          id: auth.sessionId,
          userId: auth.identity.userId,
          revokedAt: null,
        },
        data: { revokedAt: now, revokedReason: 'LOGOUT' },
      }),
      this.prisma.activityLog.create({
        data: {
          actorUserId: auth.identity.userId,
          action: 'AUTH_LOGOUT',
          entityType: 'AUTH_SESSION',
          entityId: auth.sessionId,
          ipAddressHash: context.ipAddressHash,
        },
      }),
    ]);
  }

  async logoutAll(
    auth: AuthRequestContext,
    context: SecurityRequestContext,
  ): Promise<void> {
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.authSession.updateMany({
        where: { userId: auth.identity.userId, revokedAt: null },
        data: { revokedAt: now, revokedReason: 'LOGOUT_ALL' },
      }),
      this.prisma.activityLog.create({
        data: {
          actorUserId: auth.identity.userId,
          action: 'AUTH_LOGOUT_ALL',
          entityType: 'USER',
          entityId: auth.identity.userId,
          ipAddressHash: context.ipAddressHash,
        },
      }),
    ]);
  }

  async listSessions(
    auth: AuthRequestContext,
  ): Promise<AuthenticationSession[]> {
    const sessions = await this.prisma.authSession.findMany({
      where: {
        userId: auth.identity.userId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    return sessions.map((session) => ({
      id: session.id,
      createdAt: session.createdAt.toISOString(),
      lastSeenAt: session.lastSeenAt.toISOString(),
      expiresAt: session.expiresAt.toISOString(),
      current: session.id === auth.sessionId,
    }));
  }

  async revokeSession(
    auth: AuthRequestContext,
    sessionId: string,
    context: SecurityRequestContext,
  ): Promise<boolean> {
    const session = await this.prisma.authSession.findFirst({
      where: { id: sessionId, userId: auth.identity.userId },
      select: { id: true },
    });

    if (!session) {
      throw new ApplicationException({
        status: HttpStatus.NOT_FOUND,
        code: 'RESOURCE_NOT_FOUND',
        message: 'Session was not found.',
      });
    }

    await this.prisma.$transaction([
      this.prisma.authSession.updateMany({
        where: { id: sessionId, revokedAt: null },
        data: { revokedAt: new Date(), revokedReason: 'USER_REVOKED' },
      }),
      this.prisma.activityLog.create({
        data: {
          actorUserId: auth.identity.userId,
          action: 'AUTH_SESSION_REVOKED',
          entityType: 'AUTH_SESSION',
          entityId: sessionId,
          ipAddressHash: context.ipAddressHash,
        },
      }),
    ]);

    return sessionId === auth.sessionId;
  }

  async getTwoFactorStatus(auth: AuthRequestContext): Promise<TwoFactorStatus> {
    this.requireAdministrator(auth);
    const credential = await this.prisma.adminTotpCredential.findUnique({
      where: { userId: auth.identity.userId },
      include: {
        recoveryCodes: { where: { usedAt: null }, select: { id: true } },
      },
    });
    return {
      enabled: Boolean(credential?.enabledAt),
      pendingSetup: Boolean(credential && !credential.enabledAt),
      recoveryCodesRemaining: credential?.enabledAt
        ? credential.recoveryCodes.length
        : 0,
    };
  }

  async beginTwoFactorSetup(
    auth: AuthRequestContext,
    password: string,
    context: SecurityRequestContext,
  ): Promise<TwoFactorSetupResponse> {
    this.requireAdministrator(auth);
    await this.verifyCurrentPassword(auth.identity.userId, password);
    const secret = this.totp.generateSecret();
    const encrypted = this.totp.encryptSecret(secret);
    await this.prisma.$transaction(async (transaction) => {
      const existing = await transaction.adminTotpCredential.findUnique({
        where: { userId: auth.identity.userId },
        select: { id: true, enabledAt: true },
      });
      if (existing?.enabledAt) {
        throw new ApplicationException({
          status: HttpStatus.CONFLICT,
          code: 'CONFLICT',
          message: 'Two-factor authentication is already enabled.',
        });
      }
      const credential = await transaction.adminTotpCredential.upsert({
        where: { userId: auth.identity.userId },
        create: {
          userId: auth.identity.userId,
          secretCiphertext: encrypted,
          keyVersion: this.totp.keyVersion,
        },
        update: {
          secretCiphertext: encrypted,
          keyVersion: this.totp.keyVersion,
          lastUsedTimeStep: null,
        },
      });
      await transaction.adminRecoveryCode.deleteMany({
        where: { credentialId: credential.id },
      });
      await transaction.activityLog.create({
        data: {
          actorUserId: auth.identity.userId,
          action: 'AUTH_TWO_FACTOR_SETUP_STARTED',
          entityType: 'USER',
          entityId: auth.identity.userId,
          ipAddressHash: context.ipAddressHash,
        },
      });
    });
    return {
      secret,
      otpauthUri: this.totp.buildUri(auth.identity.email, secret),
    };
  }

  async enableTwoFactor(
    auth: AuthRequestContext,
    code: string,
    context: SecurityRequestContext,
  ): Promise<TwoFactorRecoveryCodesResponse> {
    this.requireAdministrator(auth);
    const credential = await this.prisma.adminTotpCredential.findUnique({
      where: { userId: auth.identity.userId },
    });
    if (!credential || credential.enabledAt)
      throw this.invalidTwoFactorException();
    const now = new Date();
    const timeStep = this.totp.verify(
      this.totp.decryptSecret(credential.secretCiphertext),
      code,
      now,
    );
    if (timeStep === null) throw this.invalidTwoFactorException();
    const recoveryCodes = this.totp.createRecoveryCodes();
    await this.prisma.$transaction(async (transaction) => {
      const enabled = await transaction.adminTotpCredential.updateMany({
        where: { id: credential.id, enabledAt: null },
        data: { enabledAt: now, lastUsedTimeStep: timeStep },
      });
      if (enabled.count !== 1) throw this.invalidTwoFactorException();
      await transaction.adminRecoveryCode.createMany({
        data: recoveryCodes.map((recoveryCode) => ({
          credentialId: credential.id,
          codeHash: this.totp.hashRecoveryCode(recoveryCode),
        })),
      });
      await transaction.authSession.updateMany({
        where: {
          userId: auth.identity.userId,
          id: { not: auth.sessionId },
          revokedAt: null,
        },
        data: { revokedAt: now, revokedReason: 'MFA_ENABLED' },
      });
      await transaction.authSession.update({
        where: { id: auth.sessionId },
        data: { twoFactorVerifiedAt: now },
      });
      await transaction.activityLog.create({
        data: {
          actorUserId: auth.identity.userId,
          action: 'AUTH_TWO_FACTOR_ENABLED',
          entityType: 'USER',
          entityId: auth.identity.userId,
          ipAddressHash: context.ipAddressHash,
        },
      });
    });
    return { recoveryCodes };
  }

  async disableTwoFactor(
    auth: AuthRequestContext,
    input: TwoFactorDisableRequest,
    context: SecurityRequestContext,
  ): Promise<void> {
    this.requireAdministrator(auth);
    await this.verifyCurrentPassword(auth.identity.userId, input.password);
    const credential = await this.getEnabledCredential(auth.identity.userId);
    const now = new Date();
    await this.consumeEnabledFactor(credential, input.code, now);
    await this.prisma.$transaction([
      this.prisma.adminTotpCredential.delete({ where: { id: credential.id } }),
      this.prisma.authSession.updateMany({
        where: { userId: auth.identity.userId, revokedAt: null },
        data: { revokedAt: now, revokedReason: 'MFA_DISABLED' },
      }),
      this.prisma.activityLog.create({
        data: {
          actorUserId: auth.identity.userId,
          action: 'AUTH_TWO_FACTOR_DISABLED',
          entityType: 'USER',
          entityId: auth.identity.userId,
          ipAddressHash: context.ipAddressHash,
        },
      }),
    ]);
  }

  async regenerateRecoveryCodes(
    auth: AuthRequestContext,
    input: TwoFactorDisableRequest,
    context: SecurityRequestContext,
  ): Promise<TwoFactorRecoveryCodesResponse> {
    this.requireAdministrator(auth);
    await this.verifyCurrentPassword(auth.identity.userId, input.password);
    const credential = await this.getEnabledCredential(auth.identity.userId);
    const now = new Date();
    await this.consumeEnabledFactor(credential, input.code, now);
    const recoveryCodes = this.totp.createRecoveryCodes();
    await this.prisma.$transaction(async (transaction) => {
      await transaction.adminRecoveryCode.deleteMany({
        where: { credentialId: credential.id },
      });
      await transaction.adminRecoveryCode.createMany({
        data: recoveryCodes.map((recoveryCode) => ({
          credentialId: credential.id,
          codeHash: this.totp.hashRecoveryCode(recoveryCode),
        })),
      });
      await transaction.activityLog.create({
        data: {
          actorUserId: auth.identity.userId,
          action: 'AUTH_TWO_FACTOR_RECOVERY_CODES_REGENERATED',
          entityType: 'USER',
          entityId: auth.identity.userId,
          ipAddressHash: context.ipAddressHash,
        },
      });
    });
    return { recoveryCodes };
  }

  async getCustomerProfile(
    customerId: string,
  ): Promise<CustomerProfileSummary> {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, deletedAt: null },
      select: {
        id: true,
        customerNumber: true,
        firstName: true,
        lastName: true,
        companyName: true,
      },
    });

    if (!customer) {
      throw new ApplicationException({
        status: HttpStatus.NOT_FOUND,
        code: 'RESOURCE_NOT_FOUND',
        message: 'Customer was not found.',
      });
    }

    return customerProfileSummarySchema.parse(customer);
  }

  private toIdentity(user: UserWithProfiles): AuthenticatedIdentity {
    if (user.role === UserRole.ADMIN && user.adminProfile) {
      return authenticatedIdentitySchema.parse({
        userId: user.id,
        email: user.email,
        role: 'ADMIN',
        adminProfileId: user.adminProfile.id,
      });
    }

    if (user.role === UserRole.CUSTOMER && user.customer) {
      return authenticatedIdentitySchema.parse({
        userId: user.id,
        email: user.email,
        role: 'CUSTOMER',
        customerId: user.customer.id,
      });
    }

    throw new Error('Authenticated user profile is unavailable');
  }

  private async createSession(
    transaction: Prisma.TransactionClient,
    user: UserWithProfiles,
    context: SecurityRequestContext,
    createdAt: Date,
    twoFactorVerified: boolean,
    method?: string,
  ): Promise<LoginResult> {
    const rawToken = this.tokens.generate();
    const expiresAt = new Date(
      createdAt.getTime() + this.sessionTtlMilliseconds,
    );
    const sessionId = randomUUID();
    await transaction.authSession.create({
      data: {
        id: sessionId,
        userId: user.id,
        tokenHash: hashOpaqueToken(rawToken),
        createdAt,
        expiresAt,
        lastSeenAt: createdAt,
        ipAddressHash: context.ipAddressHash,
        ...(context.userAgent ? { userAgent: context.userAgent } : {}),
        ...(twoFactorVerified ? { twoFactorVerifiedAt: createdAt } : {}),
      },
    });
    await transaction.user.update({
      where: { id: user.id },
      data: { lastLoginAt: createdAt },
    });
    await transaction.activityLog.create({
      data: {
        actorUserId: user.id,
        action: 'AUTH_LOGIN_SUCCEEDED',
        entityType: 'AUTH_SESSION',
        entityId: sessionId,
        ipAddressHash: context.ipAddressHash,
        ...(method ? { metadata: { secondFactor: method } } : {}),
      },
    });
    return {
      token: rawToken,
      identity: this.toIdentity(user),
      session: {
        id: sessionId,
        createdAt: createdAt.toISOString(),
        lastSeenAt: createdAt.toISOString(),
        expiresAt: expiresAt.toISOString(),
        current: true,
      },
    };
  }

  private requireAdministrator(auth: AuthRequestContext): void {
    if (auth.identity.role !== 'ADMIN') {
      throw new ApplicationException({
        status: HttpStatus.FORBIDDEN,
        code: 'FORBIDDEN',
        message: 'Administrator access is required.',
      });
    }
  }

  private async verifyCurrentPassword(
    userId: string,
    password: string,
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true },
    });
    if (
      !user?.passwordHash ||
      !(await this.passwords.verify(user.passwordHash, password))
    ) {
      throw this.invalidCredentialsException();
    }
  }

  private async getEnabledCredential(userId: string) {
    const credential = await this.prisma.adminTotpCredential.findUnique({
      where: { userId },
      include: { recoveryCodes: { where: { usedAt: null } } },
    });
    if (!credential?.enabledAt) throw this.invalidTwoFactorException();
    return credential;
  }

  private async consumeEnabledFactor(
    credential: Awaited<ReturnType<AuthService['getEnabledCredential']>>,
    code: string,
    now: Date,
  ): Promise<void> {
    const step = this.totp.verify(
      this.totp.decryptSecret(credential.secretCiphertext),
      code,
      now,
    );
    if (step !== null) {
      const result = await this.prisma.adminTotpCredential.updateMany({
        where: {
          id: credential.id,
          OR: [{ lastUsedTimeStep: null }, { lastUsedTimeStep: { lt: step } }],
        },
        data: { lastUsedTimeStep: step },
      });
      if (result.count === 1) return;
    } else {
      const recoveryHash = this.totp.hashRecoveryCode(code);
      const recovery = credential.recoveryCodes.find((item) =>
        equalHexDigest(item.codeHash, recoveryHash),
      );
      if (recovery) {
        const result = await this.prisma.adminRecoveryCode.updateMany({
          where: { id: recovery.id, usedAt: null },
          data: { usedAt: now },
        });
        if (result.count === 1) return;
      }
    }
    throw this.invalidTwoFactorException();
  }

  private createCustomerNumber(customerId: string): string {
    return `CUS-${customerId.replaceAll('-', '').slice(0, 12).toUpperCase()}`;
  }

  private invalidCredentialsException(): ApplicationException {
    return new ApplicationException({
      status: HttpStatus.UNAUTHORIZED,
      code: 'INVALID_CREDENTIALS',
      message: 'Email or password is incorrect.',
    });
  }

  private invalidTwoFactorException(): ApplicationException {
    return new ApplicationException({
      status: HttpStatus.UNAUTHORIZED,
      code: 'INVALID_TWO_FACTOR_CODE',
      message: 'The two-factor challenge or code is invalid or expired.',
    });
  }
}
