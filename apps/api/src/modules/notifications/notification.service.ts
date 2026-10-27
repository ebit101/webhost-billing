import { Inject, Injectable } from '@nestjs/common';
import type { ApiEnvironment } from '@webhost-billing/config';
import type { PrismaClient } from '@webhost-billing/database';
import {
  normalizeNotificationPhone,
  notificationCatalog,
  notificationEntrySchema,
  notificationPreferencesSchema,
  type NotificationListQuery,
  type NotificationPreferencesRequest,
} from '@webhost-billing/shared';
import { PRISMA_CLIENT } from '../../infrastructure/database/database.module';
import { API_ENVIRONMENT } from '../../infrastructure/environment/environment.module';
import { TokenCipherService } from '../auth/services/token-cipher.service';

@Injectable()
export class NotificationService {
  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient,
    @Inject(API_ENVIRONMENT) private readonly environment: ApiEnvironment,
    private readonly cipher: TokenCipherService,
  ) {}

  async preferences(userId: string) {
    const preference = await this.prisma.notificationPreference.findUnique({
      where: { userId },
    });
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { customer: true },
    });
    const accountPhone = normalizeNotificationPhone(
      user.customer?.phone,
      user.customer?.countryCode,
    );
    return notificationPreferencesSchema.parse({
      whatsAppEnabled: preference?.whatsAppEnabled ?? true,
      maskedPhone: preference?.phoneLastFour
        ? `••••${preference.phoneLastFour}`
        : accountPhone
          ? `••••${accountPhone.slice(-4)}`
          : null,
      deliveryMode: this.environment.NOTIFICATION_DELIVERY_MODE,
    });
  }

  async update(userId: string, input: NotificationPreferencesRequest) {
    await this.prisma.$transaction(async (tx) => {
      // Serialize concurrent preference changes, including turning alerts off.
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
      const data = {
        whatsAppEnabled: input.whatsAppEnabled,
        ...(input.phone
          ? {
              phoneCiphertext: this.cipher.encrypt(input.phone),
              phoneLastFour: input.phone.slice(-4),
            }
          : {}),
      };
      await tx.notificationPreference.upsert({
        where: { userId },
        create: { userId, ...data },
        update: data,
      });
      if (!input.whatsAppEnabled || input.phone)
        await tx.notificationEntry.updateMany({
          where: { userId, channel: 'WHATSAPP', status: 'QUEUED' },
          data: { status: 'SUPPRESSED', completedAt: new Date() },
        });
      await tx.activityLog.create({
        data: {
          actorUserId: userId,
          action: 'NOTIFICATION_PREFERENCES_UPDATED',
          entityType: 'USER',
          entityId: userId,
          metadata: {
            whatsAppEnabled: input.whatsAppEnabled,
            phoneChanged: Boolean(input.phone),
          },
        },
      });
    });
    return this.preferences(userId);
  }

  async list(userId: string, query: NotificationListQuery) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { adminProfile: true },
    });
    const keys =
      user.role === 'ADMIN' &&
      user.adminProfile?.staffRole !== 'FULL_ADMINISTRATOR'
        ? ['admin-security-alert']
        : notificationCatalog
            .filter((item) => item.audience === user.role)
            .map((item) => item.key);
    const where = {
      userId,
      key: { in: keys },
      ...(query.channel ? { channel: query.channel } : {}),
    };
    const pageSize = 25;
    const [totalItems, entries] = await this.prisma.$transaction([
      this.prisma.notificationEntry.count({ where }),
      this.prisma.notificationEntry.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return {
      data: entries.map((entry) =>
        notificationEntrySchema.parse({
          ...entry,
          createdAt: entry.createdAt.toISOString(),
          completedAt: entry.completedAt?.toISOString() ?? null,
        }),
      ),
      pagination: {
        page: query.page,
        pageSize,
        totalItems,
        totalPages: Math.ceil(totalItems / pageSize),
      },
    };
  }

  async emailHistory(userId: string, query: NotificationListQuery) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { customer: true },
    });
    const where = {
      recipientEmail: user.email,
      queuedAt: { gte: user.createdAt },
      ...(user.role === 'CUSTOMER'
        ? {
            customerId:
              user.customer?.id ?? '00000000-0000-4000-8000-000000000000',
          }
        : {}),
    };
    const pageSize = 25;
    const [totalItems, entries] = await this.prisma.$transaction([
      this.prisma.emailLog.count({ where }),
      this.prisma.emailLog.findMany({
        where,
        orderBy: [{ queuedAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          templateKey: true,
          subjectSnapshot: true,
          status: true,
          provider: true,
          queuedAt: true,
          sentAt: true,
        },
      }),
    ]);
    return {
      data: entries.map((entry) => ({
        ...entry,
        queuedAt: entry.queuedAt.toISOString(),
        sentAt: entry.sentAt?.toISOString() ?? null,
      })),
      pagination: {
        page: query.page,
        pageSize,
        totalItems,
        totalPages: Math.ceil(totalItems / pageSize),
      },
    };
  }
}
