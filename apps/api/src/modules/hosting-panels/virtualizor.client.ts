import { Inject, Injectable } from '@nestjs/common';
import type { ApiEnvironment } from '@webhost-billing/config';
import {
  virtualizorCredentialsSchema,
  createServerRequestSchema,
} from '@webhost-billing/shared';
import { z } from 'zod';
import { request as httpsRequest } from 'node:https';
import { API_ENVIRONMENT } from '../../infrastructure/environment/environment.module';
import {
  isPublicAddress,
  CPANEL_WHM_LOOKUP,
  type CpanelWhmLookup,
} from './cpanel-whm-http.client';
import { HostingPanelProviderError } from './hosting-panel.error';
import type {
  HostingPanelConnection,
  HostingPanelConnectionResult,
} from './hosting-panel.interface';

export const VIRTUALIZOR_REQUEST = Symbol('VIRTUALIZOR_REQUEST');
export type VirtualizorRequest = (
  url: URL,
  signal: AbortSignal,
  address: { address: string; family: number },
) => Promise<Response>;
// Pin the verified address at the socket boundary to prevent DNS rebinding.
export const virtualizorHttpsRequest: VirtualizorRequest = (
  url,
  signal,
  address,
) =>
  new Promise((resolve, reject) => {
    const request = httpsRequest(
      url,
      {
        method: 'GET',
        headers: { accept: 'application/json' },
        signal,
        family: address.family,
        lookup: (_hostname, _options, callback) =>
          callback(null, address.address, address.family),
      },
      (response) => {
        const chunks: Buffer[] = [];
        let size = 0;
        response.on('data', (chunk: Buffer) => {
          size += chunk.length;
          if (size > 1_048_576) {
            request.destroy(new Error('Response too large'));
            return;
          }
          chunks.push(chunk);
        });
        response.on('error', reject);
        response.on('end', () => {
          try {
            const status = response.statusCode ?? 502;
            resolve(
              new Response(
                [204, 205, 304].includes(status)
                  ? null
                  : Buffer.concat(chunks).toString('utf8'),
                { status },
              ),
            );
          } catch {
            reject(new Error('Invalid HTTP response'));
          }
        });
      },
    );
    request.on('error', reject);
    request.end();
  });

// Admin API only. Never accepts an action or mutation payload from a caller.
@Injectable()
export class VirtualizorClient {
  constructor(
    @Inject(API_ENVIRONMENT) private readonly environment: ApiEnvironment,
    @Inject(VIRTUALIZOR_REQUEST) private readonly request: VirtualizorRequest,
    @Inject(CPANEL_WHM_LOOKUP) private readonly lookup: CpanelWhmLookup,
  ) {}

  async testConnection(
    connection: HostingPanelConnection,
  ): Promise<HostingPanelConnectionResult> {
    if (!this.environment.VIRTUALIZOR_API_ENABLED)
      throw this.error(
        'VIRTUALIZOR_DISABLED',
        'Virtualizor networking is disabled. Save the configuration and arrange connection acceptance separately.',
      );
    let credentials: z.infer<typeof virtualizorCredentialsSchema>;
    try {
      credentials = virtualizorCredentialsSchema.parse(
        JSON.parse(connection.credential ?? ''),
      );
      createServerRequestSchema.parse({
        serverType: 'VIRTUALIZOR',
        name: 'Connection',
        hostname: connection.hostname,
        port: connection.port,
        credentials,
      });
      if (!connection.useTls) throw new Error();
    } catch {
      throw this.error(
        'VIRTUALIZOR_CONFIGURATION_INVALID',
        'Virtualizor requires an HTTPS hostname, an approved port and an API key/password pair.',
      );
    }
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      this.environment.HOSTING_PANEL_TIMEOUT_MS,
    );
    try {
      const addresses = await this.lookup(connection.hostname);
      controller.signal.throwIfAborted();
      if (
        !addresses.length ||
        addresses.some(({ address }) => !isPublicAddress(address))
      )
        throw this.error(
          'VIRTUALIZOR_CONFIGURATION_INVALID',
          'The Virtualizor hostname must resolve only to public network addresses.',
        );
      const url = new URL(
        `https://${connection.hostname}:${connection.port}/index.php`,
      );
      url.search = new URLSearchParams({
        act: 'servers',
        api: 'json',
        adminapikey: credentials.apiKey,
        adminapipass: credentials.apiPassword,
      }).toString();
      const address = addresses[0];
      if (!address)
        throw this.error(
          'VIRTUALIZOR_CONFIGURATION_INVALID',
          'The Virtualizor hostname has no public address.',
        );
      const response = await this.request(url, controller.signal, address);
      if (!response.ok)
        throw this.error(
          'VIRTUALIZOR_REQUEST_REJECTED',
          'Virtualizor rejected the connection request. Check API permissions and connection settings.',
        );
      if (
        !response.body ||
        Number(response.headers.get('content-length')) > 1_048_576
      )
        throw this.error(
          'VIRTUALIZOR_RESPONSE_INVALID',
          'Virtualizor returned an invalid connection response.',
        );
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          size += chunk.value.byteLength;
          if (size > 1_048_576) {
            await reader.cancel();
            throw this.error(
              'VIRTUALIZOR_RESPONSE_INVALID',
              'Virtualizor returned an invalid connection response.',
            );
          }
          chunks.push(chunk.value);
        }
      } finally {
        reader.releaseLock();
      }
      const json: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      const server = z
        .object({
          serid: z.union([
            z.string().regex(/^\d+$/),
            z.number().int().nonnegative(),
          ]),
        })
        .passthrough();
      const result = z
        .object({
          act: z.literal('servers').optional(),
          servers: z.union([z.array(server), z.record(z.string(), server)]),
          error: z.unknown().optional(),
        })
        .parse(json);
      if (
        result.error !== undefined &&
        result.error !== null &&
        result.error !== false &&
        result.error !== '' &&
        !(Array.isArray(result.error) && result.error.length === 0)
      )
        throw this.error(
          'VIRTUALIZOR_REQUEST_REJECTED',
          'Virtualizor could not verify the configured API credentials.',
        );
      return {
        providerVersion: 'Virtualizor Admin API',
        capabilities: ['connection-test'],
      };
    } catch (error) {
      if (error instanceof HostingPanelProviderError) throw error;
      // Provider bodies, credentials and URLs must never escape this boundary.
      throw this.error(
        'VIRTUALIZOR_CONNECTION_UNVERIFIED',
        'The Virtualizor connection could not be verified. Check the endpoint, certificate and API permissions.',
      );
    } finally {
      clearTimeout(timer);
    }
  }
  private error(code: string, message: string) {
    return new HostingPanelProviderError('PERMANENT', code, message);
  }
}
