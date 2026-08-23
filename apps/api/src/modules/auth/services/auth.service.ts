import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { ApiEnvironment } from '@webhost-billing/config';
import {
  CustomerStatus,
  OutboxStatus,
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
} from '@webhost-billing/shared';
import { randomUUID } from 'node:crypto';
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
}

export interface LoginResult {
  token: string;
  identity: AuthenticatedIdentity;
  session: AuthenticationSession;
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

@Injectable()
export class AuthService {
  private readonly sessionTtlMilliseconds: number;
  private readonly passwordResetTtlMilliseconds: number;
  private readonly emailVerificationTtlMilliseconds: number;

  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient,
    @Inject(AUTH_TOKEN_FACTORY)
    private readonly tokens: AuthTokenFactory,
    @Inject(API_ENVIRONMENT) environment: ApiEnvironment,
    private readonly passwords: PasswordHasherService,
    private readonly tokenCipher: TokenCipherService,
    private readonly audit: AuthAuditService,
  ) {
    this.sessionTtlMilliseconds = environment.SESSION_TTL_SECONDS * 1_000;
    this.passwordResetTtlMilliseconds =
      environment.PASSWORD_RESET_TTL_SECONDS * 1_000;
    this.emailVerificationTtlMilliseconds =
      environment.EMAIL_VERIFICATION_TTL_SECONDS * 1_000;
  }

  async register(
    input: RegistrationRequest,
    context: SecurityRequestContext,
  ): Promise<void> {
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
      });
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
  ): Promise<LoginResult> {
    const user = await this.prisma.user.findUnique({
      where: { email: input.email },
      include: {
        customer: { select: { id: true } },
        adminProfile: { select: { id: true } },
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
          },
        },
      },
    });

    if (
      !session ||
      session.revokedAt ||
      session.expiresAt <= now ||
      session.user.deletedAt ||
      session.user.status !== UserStatus.ACTIVE
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
}
