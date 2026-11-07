import { createHash } from 'node:crypto';
import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { ApiEnvironment } from '@webhost-billing/config';
import type { Prisma, PrismaClient } from '@webhost-billing/database';
import {
  hostingUsageSampleSchema,
  serviceUsageSchema,
  type ServiceUsage,
} from '@webhost-billing/shared';
import { ApplicationException } from '../../common/errors/application.exception';
import { PRISMA_CLIENT } from '../../infrastructure/database/database.module';
import { API_ENVIRONMENT } from '../../infrastructure/environment/environment.module';
import {
  REDIS_CLIENT,
  type RedisClient,
} from '../../infrastructure/redis/redis.module';
import type { AuthRequestContext } from '../auth/auth.types';
import { HostingPanelRegistry } from '../hosting-panels/hosting-panel.registry';
import { CpanelCredentialCipher } from '../hosting-panels/cpanel-credential-cipher';
import { withHostingPanelTimeout } from '../hosting-panels/hosting-panel.error';

type Record = Prisma.ServiceGetPayload<{ include: { server: true } }>;
const FRESH_SECONDS = 300;
const RETAIN_SECONDS = 86400;
const MAX_ACTIVE = 4;

@Injectable()
export class ServiceUsageService {
  private active = 0;
  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient,
    @Inject(REDIS_CLIENT) private readonly redis: RedisClient,
    @Inject(API_ENVIRONMENT) private readonly environment: ApiEnvironment,
    private readonly registry: HostingPanelRegistry,
    private readonly cipher: CpanelCredentialCipher,
  ) {}

  async get(
    serviceId: string,
    actor: AuthRequestContext,
    customerId?: string,
  ): Promise<ServiceUsage> {
    // Reauthorize before reading any shared cache or consulting a provider.
    const record = await this.owned(serviceId, actor, customerId);
    const period = new Date().toISOString().slice(0, 7);
    const simulated = record.server.adapterKey === 'fake-panel';
    const empty = (
      status: ServiceUsage['status'],
      retryAfterSeconds = 60,
    ): ServiceUsage => ({
      serviceId,
      status,
      sampledAt: null,
      freshUntil: null,
      disk: null,
      bandwidth: null,
      bandwidthPeriod: period,
      simulated,
      retryAfterSeconds,
    });
    if (
      !['ACTIVE', 'SUSPENDED'].includes(record.status) ||
      !record.domain ||
      !record.controlPanelUsername ||
      !record.externalAccountId ||
      record.server.deletedAt ||
      record.server.status !== 'ACTIVE'
    )
      return empty('NOT_READY');
    if (
      !['fake-panel', 'cpanel-whm'].includes(record.server.adapterKey) ||
      (simulated && this.environment.NODE_ENV === 'production')
    )
      return empty('UNSUPPORTED');
    if (
      !simulated &&
      (!record.server.apiUsername ||
        !record.server.credentialsCiphertext ||
        !record.server.credentialKeyVersion)
    )
      return empty('NOT_READY');

    const fingerprint = this.fingerprint(record);
    const key = `${this.environment.AUTH_RATE_LIMIT_NAMESPACE}:hosting-usage:v1:${serviceId}:${fingerprint}:${period}`;
    let saved: ServiceUsage | undefined;
    const fallback = (seconds = 60) =>
      saved
        ? serviceUsageSchema.parse({
            ...saved,
            status: 'STALE',
            retryAfterSeconds: seconds,
          })
        : empty('UNAVAILABLE', seconds);
    try {
      const raw = await this.redis.get(key);
      if (raw) {
        const parsed = serviceUsageSchema.safeParse(JSON.parse(raw) as unknown);
        if (
          parsed.success &&
          parsed.data.serviceId === serviceId &&
          parsed.data.bandwidthPeriod === period &&
          parsed.data.simulated === simulated &&
          parsed.data.sampledAt &&
          Date.parse(parsed.data.sampledAt) <= Date.now() &&
          Date.now() - Date.parse(parsed.data.sampledAt) < RETAIN_SECONDS * 1000
        )
          saved = parsed.data;
      }
      if (saved?.freshUntil && Date.parse(saved.freshUntil) > Date.now()) {
        return serviceUsageSchema.parse({
          ...saved,
          status: 'AVAILABLE',
          retryAfterSeconds: Math.min(
            FRESH_SECONDS,
            Math.ceil((Date.parse(saved.freshUntil) - Date.now()) / 1000),
          ),
        });
      }
      const cooldown = Math.max(
        60,
        Math.ceil((this.environment.HOSTING_PANEL_TIMEOUT_MS * 2) / 1000) + 10,
      );
      const acquired = await this.redis.set(`${key}:attempt`, '1', {
        NX: true,
        EX: cooldown,
      });
      if (!acquired || this.active >= MAX_ACTIVE) return fallback(cooldown);
    } catch {
      // Redis failure cannot become an uncapped provider polling path.
      return fallback();
    }

    this.active += 1;
    try {
      const panel = this.registry.get(record.server.adapterKey);
      if (!panel.getUsage) return empty('UNSUPPORTED');
      const server = record.server;
      const sample = hostingUsageSampleSchema.parse(
        await withHostingPanelTimeout(
          panel.getUsage(
            {
              serverId: server.id,
              hostname: server.hostname,
              port: server.port,
              useTls: server.useTls,
              apiUsername: server.apiUsername,
              credential:
                server.credentialsCiphertext && server.credentialKeyVersion
                  ? this.cipher.decrypt(
                      server.id,
                      server.credentialKeyVersion,
                      server.credentialsCiphertext,
                    )
                  : null,
            },
            {
              externalAccountId: record.externalAccountId,
              username: record.controlPanelUsername,
              domain: record.domain,
              packageIdentifier: record.currentPackageIdentifier ?? '',
            },
            period,
          ),
          this.environment.HOSTING_PANEL_TIMEOUT_MS * 2 + 500,
          false,
        ),
      );
      if (
        sample.bandwidthPeriod !== period ||
        (!sample.disk && !sample.bandwidth)
      )
        return fallback();
      // A transfer, reassignment, deletion or credential change during the read
      // must not publish observations from the former account binding.
      const current = await this.owned(serviceId, actor, customerId);
      if (
        this.fingerprint(current) !== fingerprint ||
        !['ACTIVE', 'SUSPENDED'].includes(current.status) ||
        current.server.status !== 'ACTIVE' ||
        current.server.deletedAt
      )
        return empty('NOT_READY');
      const now = Date.now();
      const result = serviceUsageSchema.parse({
        ...sample,
        serviceId,
        status: 'AVAILABLE',
        sampledAt: new Date(now).toISOString(),
        freshUntil: new Date(now + FRESH_SECONDS * 1000).toISOString(),
        retryAfterSeconds: FRESH_SECONDS,
        simulated,
      });
      try {
        await this.redis.set(key, JSON.stringify(result), {
          EX: RETAIN_SECONDS,
        });
      } catch {
        /* Keep the shared attempt lease; never log provider data. */
      }
      return result;
    } catch (error) {
      if (error instanceof ApplicationException) throw error;
      return fallback();
    } finally {
      this.active -= 1;
    }
  }

  private async owned(
    id: string,
    actor: AuthRequestContext,
    customerId?: string,
  ): Promise<Record> {
    if (
      actor.identity.role !== 'CUSTOMER' &&
      (actor.identity.role !== 'ADMIN' ||
        actor.identity.staffRole !== 'FULL_ADMINISTRATOR')
    ) {
      throw new ApplicationException({
        status: HttpStatus.FORBIDDEN,
        code: 'FORBIDDEN',
        message: 'You do not have access to hosting usage.',
      });
    }
    if (
      actor.identity.role === 'CUSTOMER' &&
      customerId &&
      actor.identity.customerId.toLowerCase() !== customerId.toLowerCase()
    )
      throw this.notFound();
    const boundCustomerId =
      actor.identity.role === 'CUSTOMER'
        ? actor.identity.customerId
        : customerId;
    const record = await this.prisma.service.findFirst({
      where: {
        id,
        ...(boundCustomerId
          ? { customerId: boundCustomerId.toLowerCase() }
          : {}),
      },
      include: { server: true },
    });
    if (!record) throw this.notFound();
    return record;
  }
  private fingerprint(record: Record): string {
    return createHash('sha256')
      .update(
        JSON.stringify([
          record.customerId,
          record.serverId,
          record.server.adapterKey,
          record.server.hostname,
          record.server.port,
          record.server.useTls,
          record.server.updatedAt.toISOString(),
          record.domain,
          record.controlPanelUsername,
          record.externalAccountId,
          record.currentPackageIdentifier,
        ]),
      )
      .digest('hex');
  }
  private notFound() {
    return new ApplicationException({
      status: HttpStatus.NOT_FOUND,
      code: 'RESOURCE_NOT_FOUND',
      message: 'Service was not found.',
    });
  }
}
