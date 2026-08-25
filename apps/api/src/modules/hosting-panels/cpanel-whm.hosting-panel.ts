import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  CpanelWhmHttpClient,
  type WhmApiEnvelope,
} from './cpanel-whm-http.client';
import { HostingPanelProviderError } from './hosting-panel.error';
import type {
  CreateHostingAccountInput,
  HostingAccountReference,
  HostingAccountResult,
  HostingLoginResult,
  HostingPanel,
  HostingPanelConnection,
  HostingPanelConnectionResult,
} from './hosting-panel.interface';
import type { HostingAccount } from '@webhost-billing/shared';

const scalarStringSchema = z
  .union([z.string(), z.number()])
  .transform((value) => String(value));
const accountSummaryDataSchema = z
  .object({
    acct: z.array(
      z
        .object({
          user: scalarStringSchema,
          domain: scalarStringSchema,
          plan: scalarStringSchema,
          suspended: z.union([z.boolean(), z.string(), z.number()]).optional(),
        })
        .passthrough(),
    ),
  })
  .passthrough();
const accountCountDataSchema = z
  .object({ users: z.union([z.number(), z.string()]) })
  .passthrough();
const loginDataSchema = z
  .object({
    expires: z.union([z.number(), z.string()]),
    service: z.literal('cpaneld'),
    url: z.url(),
  })
  .passthrough();

const CAPABILITIES = [
  'accountsummary',
  'createacct',
  'suspendacct',
  'unsuspendacct',
  'changepackage',
  'passwd',
  'create_user_session',
  'removeacct',
] as const;

@Injectable()
export class CpanelWhmHostingPanel implements HostingPanel {
  readonly key = 'cpanel-whm';
  readonly displayName = 'cPanel/WHM';

  constructor(private readonly http: CpanelWhmHttpClient) {}

  async testConnection(
    connection: HostingPanelConnection,
  ): Promise<HostingPanelConnectionResult> {
    const response = await this.http.call(
      connection,
      'get_current_users_count',
      {},
      false,
    );
    this.assertSuccess(response, false);
    if (!accountCountDataSchema.safeParse(response.data).success) {
      throw this.invalidResponse(false);
    }
    return {
      providerVersion: `WHM API ${String(response.metadata.version ?? 1)}`,
      capabilities: [...CAPABILITIES],
    };
  }

  async createAccount(
    connection: HostingPanelConnection,
    input: CreateHostingAccountInput,
  ): Promise<HostingAccountResult> {
    const username = this.usernameFor(input.serviceReference);
    const existingByUsername = await this.lookupAccount(connection, {
      user: username,
    });
    if (existingByUsername) {
      this.assertExactAccount(
        existingByUsername,
        username,
        input.domain,
        input.packageIdentifier,
      );
      return { account: existingByUsername, created: false };
    }
    const existingByDomain = await this.lookupAccount(connection, {
      domain: input.domain,
    });
    if (existingByDomain) {
      throw this.inconsistent(
        'The domain already belongs to a different cPanel account.',
      );
    }

    const response = await this.http.call(
      connection,
      'createacct',
      {
        username,
        domain: input.domain,
        plan: input.packageIdentifier,
        contactemail: input.contactEmail,
        showpass: 'n',
      },
      true,
    );
    this.assertSuccess(response, true);
    const account = await this.verifyMutation(connection, username);
    this.assertExactAccount(
      account,
      username,
      input.domain,
      input.packageIdentifier,
    );
    return { account, created: true };
  }

  async getAccount(
    connection: HostingPanelConnection,
    reference: HostingAccountReference,
  ): Promise<HostingAccount> {
    const account = await this.lookupAccount(connection, {
      user: reference.username,
    });
    return (
      account ?? {
        externalAccountId: reference.externalAccountId,
        username: reference.username,
        domain: reference.domain,
        packageIdentifier: reference.packageIdentifier,
        state: 'MISSING',
      }
    );
  }

  async suspendAccount(
    connection: HostingPanelConnection,
    reference: HostingAccountReference,
    reason: string,
  ): Promise<HostingAccount> {
    await this.mutate(connection, 'suspendacct', {
      user: reference.username,
      reason: reason.slice(0, 255),
      disallowun: '0',
      'leave-ftp-accts-enabled': '0',
    });
    return this.verifyMutation(connection, reference.username);
  }

  async unsuspendAccount(
    connection: HostingPanelConnection,
    reference: HostingAccountReference,
  ): Promise<HostingAccount> {
    await this.mutate(connection, 'unsuspendacct', {
      user: reference.username,
      'retain-service-proxies': '0',
    });
    return this.verifyMutation(connection, reference.username);
  }

  async changePackage(
    connection: HostingPanelConnection,
    reference: HostingAccountReference,
    packageIdentifier: string,
  ): Promise<HostingAccount> {
    await this.mutate(connection, 'changepackage', {
      user: reference.username,
      pkg: packageIdentifier,
    });
    return this.verifyMutation(connection, reference.username);
  }

  async changePassword(
    connection: HostingPanelConnection,
    reference: HostingAccountReference,
    newPassword: string,
  ): Promise<HostingAccount> {
    await this.mutate(connection, 'passwd', {
      user: reference.username,
      password: newPassword,
      db_pass_update: '0',
    });
    return this.verifyMutation(connection, reference.username);
  }

  async generateLoginUrl(
    connection: HostingPanelConnection,
    reference: HostingAccountReference,
  ): Promise<HostingLoginResult> {
    const response = await this.http.call(
      connection,
      'create_user_session',
      {
        user: reference.username,
        service: 'cpaneld',
        preferred_domain: connection.hostname,
      },
      false,
    );
    this.assertSuccess(response, false);
    const parsed = loginDataSchema.safeParse(response.data);
    if (!parsed.success) throw this.invalidResponse(false);
    const data = parsed.data;
    const url = new URL(data.url);
    if (
      url.hostname.toLowerCase() !== connection.hostname.toLowerCase() ||
      url.protocol !== 'https:' ||
      !['', '443', '2083'].includes(url.port) ||
      url.username ||
      url.password
    ) {
      throw this.inconsistent(
        'cPanel/WHM returned a login URL for an unexpected hostname.',
      );
    }
    const expiresAt = new Date(Number(data.expires) * 1_000);
    if (!Number.isFinite(expiresAt.getTime())) {
      throw this.inconsistent(
        'cPanel/WHM returned an invalid login-session expiry.',
      );
    }
    return { url: data.url, expiresAt };
  }

  async terminateAccount(
    connection: HostingPanelConnection,
    reference: HostingAccountReference,
    reason: string,
  ): Promise<void> {
    void reason;
    await this.mutate(connection, 'removeacct', { user: reference.username });
    try {
      const remaining = await this.lookupAccount(connection, {
        user: reference.username,
      });
      if (remaining) {
        throw this.inconsistent(
          'cPanel/WHM still returns the account after termination.',
        );
      }
    } catch (error) {
      if (
        error instanceof HostingPanelProviderError &&
        error.kind === 'INCONSISTENT'
      ) {
        throw error;
      }
      throw this.inconsistent(
        'The cPanel/WHM termination result could not be verified.',
      );
    }
  }

  private async mutate(
    connection: HostingPanelConnection,
    functionName: string,
    parameters: Readonly<Record<string, string>>,
  ): Promise<void> {
    const response = await this.http.call(
      connection,
      functionName,
      parameters,
      true,
    );
    this.assertSuccess(response, true);
  }

  private async verifyMutation(
    connection: HostingPanelConnection,
    username: string,
  ): Promise<HostingAccount> {
    try {
      const account = await this.lookupAccount(connection, { user: username });
      if (!account) {
        throw this.inconsistent(
          'The cPanel account was not found after a successful mutation.',
        );
      }
      return account;
    } catch (error) {
      if (
        error instanceof HostingPanelProviderError &&
        error.kind === 'INCONSISTENT'
      ) {
        throw error;
      }
      throw this.inconsistent(
        'The cPanel/WHM mutation result could not be verified.',
      );
    }
  }

  private async lookupAccount(
    connection: HostingPanelConnection,
    query: { user: string } | { domain: string },
  ): Promise<HostingAccount | null> {
    const response = await this.http.call(
      connection,
      'accountsummary',
      query,
      false,
    );
    if (!this.isSuccess(response)) {
      const reason = response.metadata.reason ?? '';
      if (/account.*(?:does not exist|not found)|no account/i.test(reason)) {
        return null;
      }
      this.assertSuccess(response, false);
    }
    const parsed = accountSummaryDataSchema.safeParse(response.data);
    if (!parsed.success) {
      throw this.invalidResponse(false);
    }
    const account = parsed.data.acct[0];
    if (!account) return null;
    return {
      externalAccountId: account.user,
      username: account.user,
      domain: account.domain.toLowerCase(),
      packageIdentifier: account.plan,
      state: this.isSuspended(account.suspended) ? 'SUSPENDED' : 'ACTIVE',
    };
  }

  private assertSuccess(response: WhmApiEnvelope, mutation: boolean): void {
    if (this.isSuccess(response)) return;
    throw new HostingPanelProviderError(
      mutation ? 'PERMANENT' : 'TEMPORARY',
      'CPANEL_OPERATION_REJECTED',
      mutation
        ? 'cPanel/WHM rejected the requested account mutation.'
        : 'cPanel/WHM could not complete the requested query.',
    );
  }

  private isSuccess(response: WhmApiEnvelope): boolean {
    return response.metadata.result === 1 || response.metadata.result === '1';
  }

  private isSuspended(value: boolean | string | number | undefined): boolean {
    return value === true || value === 1 || value === '1';
  }

  private assertExactAccount(
    account: HostingAccount,
    username: string,
    domain: string,
    packageIdentifier: string,
  ): void {
    if (
      account.username !== username ||
      account.externalAccountId !== username ||
      account.domain !== domain.toLowerCase() ||
      account.packageIdentifier !== packageIdentifier
    ) {
      throw this.inconsistent(
        'The existing cPanel account does not match the requested service.',
      );
    }
  }

  private usernameFor(serviceReference: string): string {
    return `w${createHash('sha256').update(serviceReference).digest('hex').slice(0, 15)}`;
  }

  private inconsistent(message: string): HostingPanelProviderError {
    return new HostingPanelProviderError(
      'INCONSISTENT',
      'CPANEL_ACCOUNT_INCONSISTENT',
      message,
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
