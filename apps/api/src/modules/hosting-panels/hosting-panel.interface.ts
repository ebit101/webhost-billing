import type { HostingAccount } from '@webhost-billing/shared';

export interface HostingPanelConnection {
  serverId: string;
  hostname: string;
  port: number;
  useTls: boolean;
  apiUsername: string | null;
  credential: string | null;
}

export interface CreateHostingAccountInput {
  serviceReference: string;
  domain: string;
  packageIdentifier: string;
  contactEmail: string;
  idempotencyKey: string;
}

export interface HostingAccountReference {
  externalAccountId: string;
  username: string;
  domain: string;
  packageIdentifier: string;
}

export interface HostingPanelConnectionResult {
  providerVersion: string;
  capabilities: string[];
}

export interface HostingAccountResult {
  account: HostingAccount;
  created: boolean;
}

export interface HostingLoginResult {
  url: string;
  expiresAt: Date;
}

export interface HostingPanel {
  readonly key: string;
  readonly displayName: string;

  testConnection(
    connection: HostingPanelConnection,
  ): Promise<HostingPanelConnectionResult>;
  createAccount(
    connection: HostingPanelConnection,
    input: CreateHostingAccountInput,
  ): Promise<HostingAccountResult>;
  getAccount(
    connection: HostingPanelConnection,
    reference: HostingAccountReference,
  ): Promise<HostingAccount>;
  suspendAccount(
    connection: HostingPanelConnection,
    reference: HostingAccountReference,
    reason: string,
  ): Promise<HostingAccount>;
  unsuspendAccount(
    connection: HostingPanelConnection,
    reference: HostingAccountReference,
  ): Promise<HostingAccount>;
  changePackage(
    connection: HostingPanelConnection,
    reference: HostingAccountReference,
    packageIdentifier: string,
  ): Promise<HostingAccount>;
  changePassword(
    connection: HostingPanelConnection,
    reference: HostingAccountReference,
    newPassword: string,
  ): Promise<HostingAccount>;
  generateLoginUrl(
    connection: HostingPanelConnection,
    reference: HostingAccountReference,
  ): Promise<HostingLoginResult>;
  terminateAccount(
    connection: HostingPanelConnection,
    reference: HostingAccountReference,
    reason: string,
  ): Promise<void>;
}
