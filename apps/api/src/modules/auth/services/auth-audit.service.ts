import { Inject, Injectable } from '@nestjs/common';
import type { Prisma, PrismaClient } from '@webhost-billing/database';
import type { SecurityRequestContext } from '../../../common/http/request-context';
import { PRISMA_CLIENT } from '../../../infrastructure/database/database.module';

export interface AuthAuditEvent {
  action: string;
  actorUserId?: string;
  entityType: 'USER' | 'AUTH_SESSION' | 'CUSTOMER';
  entityId?: string;
  metadata?: Prisma.InputJsonObject;
}

@Injectable()
export class AuthAuditService {
  constructor(@Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient) {}

  async record(
    event: AuthAuditEvent,
    context: SecurityRequestContext,
  ): Promise<void> {
    await this.prisma.activityLog.create({
      data: {
        action: event.action,
        entityType: event.entityType,
        ipAddressHash: context.ipAddressHash,
        ...(event.actorUserId ? { actorUserId: event.actorUserId } : {}),
        ...(event.entityId ? { entityId: event.entityId } : {}),
        ...(event.metadata ? { metadata: event.metadata } : {}),
      },
    });
  }
}
