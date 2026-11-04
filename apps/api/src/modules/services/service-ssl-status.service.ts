import { Inject, Injectable } from '@nestjs/common';
import type { ApiEnvironment } from '@webhost-billing/config';
import type { PrismaClient } from '@webhost-billing/database';
import {
  requestedDomainSchema,
  type ServiceSslStatus,
} from '@webhost-billing/shared';
import { Resolver } from 'node:dns/promises';
import { isIP } from 'node:net';
import { connect } from 'node:tls';
import { PRISMA_CLIENT } from '../../infrastructure/database/database.module';
import { API_ENVIRONMENT } from '../../infrastructure/environment/environment.module';
import { isPublicAddress } from '../hosting-panels/cpanel-whm-http.client';

const CONCURRENCY = 12;
const MAX_PENDING = 100;
const MAX_CACHE = 1000;
const DNS_TIMEOUT = 1200;
const TLS_TIMEOUT = 1800;
const invalidCertificate = new Set([
  'CERT_HAS_EXPIRED',
  'CERT_NOT_YET_VALID',
  'CERT_REVOKED',
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'ERR_TLS_CERT_ALTNAME_INVALID',
  'INVALID_CA',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'UNABLE_TO_GET_ISSUER_CERT',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
]);

async function resolveIpv4(hostname: string) {
  const resolver = new Resolver({ timeout: DNS_TIMEOUT, tries: 1 });
  const deadline = setTimeout(() => resolver.cancel(), DNS_TIMEOUT);
  try {
    return await resolver.resolve4(hostname);
  } finally {
    clearTimeout(deadline);
  }
}

function verifyTls(
  address: string,
  hostname: string,
): Promise<ServiceSslStatus> {
  return new Promise((resolve) => {
    const socket = connect({
      host: address,
      port: 443,
      servername: hostname,
      rejectUnauthorized: true,
    });
    const deadline = setTimeout(() => finish('UNKNOWN'), TLS_TIMEOUT);
    function finish(status: ServiceSslStatus) {
      clearTimeout(deadline);
      socket.destroy();
      resolve(status);
    }
    socket.once('secureConnect', () =>
      finish(socket.authorized ? 'ACTIVE' : 'INACTIVE'),
    );
    socket.once('close', () => finish('UNKNOWN'));
    socket.once('error', (error: NodeJS.ErrnoException) => {
      finish(
        invalidCertificate.has(error.code ?? '') ||
          error.code === 'ECONNREFUSED' ||
          error.code === 'ERR_SSL_WRONG_VERSION_NUMBER'
          ? 'INACTIVE'
          : 'UNKNOWN',
      );
    });
  });
}

export async function probeWebsiteSsl(
  hostname: string,
  resolveAddresses = resolveIpv4,
  verify = verifyTls,
): Promise<ServiceSslStatus> {
  try {
    const addresses = await resolveAddresses(hostname);
    const address = addresses[0];
    if (
      !address ||
      addresses.some((entry) => isIP(entry) !== 4 || !isPublicAddress(entry))
    ) {
      return 'UNKNOWN';
    }
    // Connect to the validated IP and check the certificate against the domain.
    return await verify(address, hostname);
  } catch {
    return 'UNKNOWN';
  }
}

@Injectable()
export class ServiceSslStatusService {
  private readonly cache = new Map<
    string,
    { status: ServiceSslStatus; expires: number }
  >();
  private readonly pending = new Map<string, Promise<ServiceSslStatus>>();
  private readonly queue: (() => void)[] = [];
  private active = 0;

  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient,
    @Inject(API_ENVIRONMENT) private readonly environment: ApiEnvironment,
  ) {}

  async list(customerId: string, ids: string[]) {
    const services = await this.prisma.service.findMany({
      where: {
        customerId,
        id: { in: ids },
        status: 'ACTIVE',
        domain: { not: null },
      },
      select: {
        id: true,
        domain: true,
        server: { select: { adapterKey: true } },
      },
    });
    return Promise.all(
      services.map(async (service) => {
        const domain = requestedDomainSchema.safeParse(service.domain);
        const status =
          domain.success &&
          !isIP(domain.data) &&
          !/\.(?:test|localhost|local|invalid|example|onion|internal)$/.test(
            domain.data,
          ) &&
          !service.server.adapterKey.startsWith('fake') &&
          this.environment.NODE_ENV !== 'test'
            ? await this.check(domain.data)
            : 'UNKNOWN';
        return { serviceId: service.id, status } as const;
      }),
    );
  }

  private check(domain: string): Promise<ServiceSslStatus> {
    const cached = this.cache.get(domain);
    if (cached && cached.expires > Date.now())
      return Promise.resolve(cached.status);
    const existing = this.pending.get(domain);
    if (existing) return existing;
    if (this.pending.size >= MAX_PENDING) return Promise.resolve('UNKNOWN');

    const result = new Promise<ServiceSslStatus>((resolve) => {
      this.queue.push(() => {
        this.active++;
        void probeWebsiteSsl(domain).then((status) => {
          this.cache.delete(domain);
          this.cache.set(domain, {
            status,
            expires: Date.now() + (status === 'ACTIVE' ? 600_000 : 60_000),
          });
          const oldest = this.cache.keys().next().value;
          if (this.cache.size > MAX_CACHE && oldest) this.cache.delete(oldest);
          this.pending.delete(domain);
          this.active--;
          this.drain();
          resolve(status);
        });
      });
    });
    this.pending.set(domain, result);
    this.drain();
    return result;
  }

  private drain() {
    while (this.active < CONCURRENCY && this.queue.length)
      this.queue.shift()?.();
  }
}
