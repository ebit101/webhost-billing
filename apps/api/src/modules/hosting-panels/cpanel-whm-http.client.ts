import { Inject, Injectable } from '@nestjs/common';
import type { ApiEnvironment } from '@webhost-billing/config';
import { z } from 'zod';
import { API_ENVIRONMENT } from '../../infrastructure/environment/environment.module';
import { HostingPanelProviderError } from './hosting-panel.error';
import type { HostingPanelConnection } from './hosting-panel.interface';

const MAX_RESPONSE_BYTES = 1_048_576;
const hostnamePattern =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

const whmMetadataSchema = z
  .object({
    command: z.string().optional(),
    reason: z.string().optional(),
    result: z.union([
      z.literal(0),
      z.literal(1),
      z.literal('0'),
      z.literal('1'),
    ]),
    version: z.union([z.number(), z.string()]).optional(),
  })
  .passthrough();

const whmEnvelopeSchema = z
  .object({
    data: z.unknown().optional(),
    metadata: whmMetadataSchema,
  })
  .passthrough();

export interface WhmApiEnvelope {
  data?: unknown;
  metadata: z.infer<typeof whmMetadataSchema>;
}

export const CPANEL_WHM_FETCH = Symbol('CPANEL_WHM_FETCH');
export type CpanelWhmFetch = typeof fetch;

function hasControlCharacters(value: string): boolean {
  return [...value].some((character) => {
    const code = character.charCodeAt(0);
    return code <= 31 || code === 127;
  });
}

@Injectable()
export class CpanelWhmHttpClient {
  private readonly timeoutMilliseconds: number;

  constructor(
    @Inject(API_ENVIRONMENT) environment: ApiEnvironment,
    @Inject(CPANEL_WHM_FETCH) private readonly fetchRequest: CpanelWhmFetch,
  ) {
    this.timeoutMilliseconds = environment.HOSTING_PANEL_TIMEOUT_MS;
  }

  async call(
    connection: HostingPanelConnection,
    functionName: string,
    parameters: Readonly<Record<string, string>>,
    mutation: boolean,
  ): Promise<WhmApiEnvelope> {
    this.validateConnection(connection);
    const url = new URL(
      `/json-api/${encodeURIComponent(functionName)}`,
      `https://${connection.hostname}:${connection.port}`,
    );
    url.searchParams.set('api.version', '1');
    for (const [key, value] of Object.entries(parameters)) {
      url.searchParams.set(key, value);
    }

    let response: Response;
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.timeoutMilliseconds,
    );
    try {
      response = await this.fetchRequest(url, {
        method: 'GET',
        headers: {
          accept: 'application/json',
          authorization: `whm ${connection.apiUsername}:${connection.credential}`,
        },
        redirect: 'error',
        signal: controller.signal,
      });
    } catch {
      throw this.transportFailure(mutation);
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new HostingPanelProviderError(
          'PERMANENT',
          'CPANEL_AUTHENTICATION_FAILED',
          'cPanel/WHM rejected the configured API token or privileges.',
        );
      }
      if (response.status === 429 || response.status >= 500) {
        throw this.transportFailure(mutation);
      }
      throw new HostingPanelProviderError(
        'PERMANENT',
        'CPANEL_REQUEST_REJECTED',
        'cPanel/WHM rejected the API request.',
      );
    }

    const declaredLength = Number(response.headers.get('content-length'));
    if (
      Number.isFinite(declaredLength) &&
      declaredLength > MAX_RESPONSE_BYTES
    ) {
      throw this.invalidResponse(mutation);
    }

    let text: string;
    try {
      text = await response.text();
    } catch {
      throw this.transportFailure(mutation);
    }
    if (Buffer.byteLength(text, 'utf8') > MAX_RESPONSE_BYTES) {
      throw this.invalidResponse(mutation);
    }

    try {
      return whmEnvelopeSchema.parse(JSON.parse(text));
    } catch {
      throw this.invalidResponse(mutation);
    }
  }

  private validateConnection(
    connection: HostingPanelConnection,
  ): asserts connection is HostingPanelConnection & {
    apiUsername: string;
    credential: string;
  } {
    if (
      !connection.useTls ||
      (connection.port !== 2087 && connection.port !== 443) ||
      !hostnamePattern.test(connection.hostname.toLowerCase()) ||
      !connection.apiUsername ||
      !/^[a-zA-Z][a-zA-Z0-9_-]{0,127}$/.test(connection.apiUsername) ||
      !connection.credential ||
      hasControlCharacters(connection.credential)
    ) {
      throw new HostingPanelProviderError(
        'PERMANENT',
        'CPANEL_CONFIGURATION_INVALID',
        'The cPanel/WHM server requires HTTPS, an approved WHM port, and an API token.',
      );
    }
  }

  private transportFailure(mutation: boolean): HostingPanelProviderError {
    return new HostingPanelProviderError(
      mutation ? 'INCONSISTENT' : 'TEMPORARY',
      mutation ? 'CPANEL_RESULT_UNKNOWN' : 'CPANEL_TEMPORARILY_UNAVAILABLE',
      mutation
        ? 'The cPanel/WHM mutation result is unknown. Reconcile the account before retrying.'
        : 'cPanel/WHM is temporarily unavailable.',
    );
  }

  private invalidResponse(mutation: boolean): HostingPanelProviderError {
    return new HostingPanelProviderError(
      mutation ? 'INCONSISTENT' : 'TEMPORARY',
      'CPANEL_RESPONSE_INVALID',
      mutation
        ? 'cPanel/WHM returned an invalid mutation response. Reconcile the account before retrying.'
        : 'cPanel/WHM returned an invalid response.',
    );
  }
}
