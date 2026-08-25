import { createHash, randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import {
  hostingAccountSchema,
  type HostingAccount,
  type HostingPanelErrorKind,
} from '@webhost-billing/shared';
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

interface FakeAccountRecord {
  serviceReference: string;
  account: HostingAccount;
}

@Injectable()
export class FakeHostingPanel implements HostingPanel {
  readonly key = 'fake-panel';
  readonly displayName = 'Fake cPanel/WHM';
  private readonly accounts = new Map<string, FakeAccountRecord>();
  private readonly creationKeys = new Map<string, string>();
  private readonly terminatedAccountIds = new Set<string>();
  private nextFailure:
    { kind: HostingPanelErrorKind; code: string; message: string } | undefined;
  private delayMilliseconds = 0;

  async testConnection(
    connection: HostingPanelConnection,
  ): Promise<HostingPanelConnectionResult> {
    await this.beforeOperation();
    if (!connection.hostname) this.permanent('PANEL_HOST_REQUIRED');
    return {
      providerVersion: 'fake-whm-1.0',
      capabilities: [
        'create-account',
        'account-status',
        'suspend',
        'unsuspend',
        'change-package',
        'change-password',
        'login-url',
        'terminate',
      ],
    };
  }

  async createAccount(
    _connection: HostingPanelConnection,
    input: CreateHostingAccountInput,
  ): Promise<HostingAccountResult> {
    await this.beforeOperation();
    const replayId = this.creationKeys.get(input.idempotencyKey);
    if (replayId) {
      const replay = this.accounts.get(replayId);
      if (!replay) this.inconsistent('PANEL_IDEMPOTENCY_INCONSISTENT');
      return { account: { ...replay.account }, created: false };
    }
    const existing = [...this.accounts.values()].find(
      ({ account }) => account.domain === input.domain,
    );
    if (existing) {
      if (existing.serviceReference !== input.serviceReference) {
        this.inconsistent('PANEL_DOMAIN_ALREADY_EXISTS');
      }
      this.creationKeys.set(
        input.idempotencyKey,
        existing.account.externalAccountId,
      );
      return { account: { ...existing.account }, created: false };
    }
    const suffix = this.hash(input.serviceReference).slice(0, 8);
    const usernameBase = input.domain.replace(/[^a-z0-9]/gi, '').toLowerCase();
    const account = hostingAccountSchema.parse({
      externalAccountId: `fake-whm-${this.hash(input.serviceReference).slice(0, 24)}`,
      username: `${usernameBase.slice(0, 8)}${suffix}`.slice(0, 16),
      domain: input.domain,
      packageIdentifier: input.packageIdentifier,
      state: 'ACTIVE',
    });
    this.accounts.set(account.externalAccountId, {
      serviceReference: input.serviceReference,
      account,
    });
    this.creationKeys.set(input.idempotencyKey, account.externalAccountId);
    return { account: { ...account }, created: true };
  }

  async getAccount(
    _connection: HostingPanelConnection,
    reference: HostingAccountReference,
  ): Promise<HostingAccount> {
    await this.beforeOperation();
    try {
      return { ...this.account(reference).account };
    } catch (error) {
      if (
        error instanceof HostingPanelProviderError &&
        error.code === 'PANEL_ACCOUNT_NOT_FOUND'
      ) {
        return hostingAccountSchema.parse({
          externalAccountId: reference.externalAccountId,
          username: reference.username,
          domain: reference.domain,
          packageIdentifier: reference.packageIdentifier,
          state: 'MISSING',
        });
      }
      throw error;
    }
  }

  async suspendAccount(
    _connection: HostingPanelConnection,
    reference: HostingAccountReference,
    reason: string,
  ): Promise<HostingAccount> {
    void reason;
    await this.beforeOperation();
    return this.updateState(reference, 'SUSPENDED');
  }

  async unsuspendAccount(
    _connection: HostingPanelConnection,
    reference: HostingAccountReference,
  ): Promise<HostingAccount> {
    await this.beforeOperation();
    return this.updateState(reference, 'ACTIVE');
  }

  async changePackage(
    _connection: HostingPanelConnection,
    reference: HostingAccountReference,
    packageIdentifier: string,
  ): Promise<HostingAccount> {
    await this.beforeOperation();
    const record = this.account(reference);
    record.account = { ...record.account, packageIdentifier };
    return { ...record.account };
  }

  async changePassword(
    _connection: HostingPanelConnection,
    reference: HostingAccountReference,
    newPassword: string,
  ): Promise<HostingAccount> {
    void newPassword;
    await this.beforeOperation();
    return { ...this.account(reference).account };
  }

  async generateLoginUrl(
    connection: HostingPanelConnection,
    reference: HostingAccountReference,
  ): Promise<HostingLoginResult> {
    await this.beforeOperation();
    this.account(reference);
    return {
      url: `https://${connection.hostname}/fake-login/${randomUUID()}`,
      expiresAt: new Date(Date.now() + 60_000),
    };
  }

  async terminateAccount(
    _connection: HostingPanelConnection,
    reference: HostingAccountReference,
    reason: string,
  ): Promise<void> {
    void reason;
    await this.beforeOperation();
    const record = this.account(reference);
    this.accounts.delete(record.account.externalAccountId);
    this.terminatedAccountIds.add(record.account.externalAccountId);
  }

  failNext(kind: HostingPanelErrorKind, code = 'FAKE_PANEL_FAILURE'): void {
    const messages: Record<HostingPanelErrorKind, string> = {
      TEMPORARY: 'The fake hosting panel is temporarily unavailable.',
      PERMANENT: 'The fake hosting panel rejected the request.',
      INCONSISTENT: 'The fake hosting panel returned an inconsistent result.',
    };
    this.nextFailure = { kind, code, message: messages[kind] };
  }

  setDelay(milliseconds: number): void {
    this.delayMilliseconds = milliseconds;
  }

  reset(): void {
    this.accounts.clear();
    this.creationKeys.clear();
    this.terminatedAccountIds.clear();
    this.nextFailure = undefined;
    this.delayMilliseconds = 0;
  }

  rememberAccount(serviceReference: string, account: HostingAccount): void {
    this.accounts.set(account.externalAccountId, {
      serviceReference,
      account: hostingAccountSchema.parse(account),
    });
  }

  private async beforeOperation(): Promise<void> {
    if (this.delayMilliseconds > 0) {
      await new Promise((resolve) =>
        setTimeout(resolve, this.delayMilliseconds),
      );
    }
    if (this.nextFailure) {
      const failure = this.nextFailure;
      this.nextFailure = undefined;
      throw new HostingPanelProviderError(
        failure.kind,
        failure.code,
        failure.message,
      );
    }
  }

  private account(reference: HostingAccountReference): FakeAccountRecord {
    let record = this.accounts.get(reference.externalAccountId);
    if (
      !record &&
      !this.terminatedAccountIds.has(reference.externalAccountId) &&
      (reference.externalAccountId.startsWith('fake-whm-') ||
        reference.externalAccountId.startsWith('fake-account-'))
    ) {
      record = {
        serviceReference: `restored:${reference.externalAccountId}`,
        account: hostingAccountSchema.parse({
          externalAccountId: reference.externalAccountId,
          username: reference.username,
          domain: reference.domain,
          packageIdentifier: reference.packageIdentifier,
          state: 'ACTIVE',
        }),
      };
      this.accounts.set(reference.externalAccountId, record);
    }
    if (!record || record.account.username !== reference.username) {
      this.permanent('PANEL_ACCOUNT_NOT_FOUND');
    }
    return record;
  }

  private updateState(
    reference: HostingAccountReference,
    state: 'ACTIVE' | 'SUSPENDED',
  ): HostingAccount {
    const record = this.account(reference);
    record.account = { ...record.account, state };
    return { ...record.account };
  }

  private hash(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  private permanent(code: string): never {
    throw new HostingPanelProviderError(
      'PERMANENT',
      code,
      'The fake hosting panel rejected the request.',
    );
  }

  private inconsistent(code: string): never {
    throw new HostingPanelProviderError(
      'INCONSISTENT',
      code,
      'The fake hosting panel returned an inconsistent account result.',
    );
  }
}
